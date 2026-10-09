import mongoose from 'mongoose';
import { FoodOrder, FoodSettings } from '../models/order.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { logger } from '../../../../utils/logger.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { initiateRazorpayRefund } from '../helpers/razorpay.helper.js';
import * as userWalletService from '../../user/services/userWallet.service.js';
import * as foodTransactionService from './foodTransaction.service.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import {
  enqueueOrderEvent,
  notifyOwnersSafely,
  normalizeOrderForClient,
} from './order.helpers.js';

/**
 * ONE cancellation engine for the whole Food module.
 * User cancel, restaurant reject, admin cancel and the "restaurant did not accept in time" auto-cancel
 * all go through cancelOrderCore(), so every cancellation does the same complete job:
 *   claim the order (race-safe) -> refund the customer -> undo wallet credits -> put stock back ->
 *   give the coupon use back -> free the rider -> tell user / restaurant / rider -> sync finance record.
 */

// ---- statuses ------------------------------------------------------------------------------------
export const BEFORE_ACCEPT_STATUSES = ['pending_payment', 'created', 'placed', 'pending'];
const WAITING_FOR_RESTAURANT = ['created', 'placed', 'pending'];       // restaurant has been told, has not answered
const ACCEPTED_STATUSES = ['confirmed', 'preparing'];
const RESTAURANT_CAN_CANCEL = [...BEFORE_ACCEPT_STATUSES, ...ACCEPTED_STATUSES, 'ready_for_pickup', 'handover_requested'];
const TERMINAL = ['delivered', 'cancelled_by_user', 'cancelled_by_restaurant', 'cancelled_by_admin'];
const ADMIN_CAN_CANCEL = [...BEFORE_ACCEPT_STATUSES, ...ACCEPTED_STATUSES, 'ready_for_pickup', 'reached_pickup', 'picked_up', 'reached_drop', 'handover_requested'];

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const inr = (n) => `₹${round2(n)}`;

// ---- admin-controlled rules ------------------------------------------------------------------------
export const DEFAULT_CANCELLATION_RULES = {
  /** Cancel an order automatically when the restaurant has not accepted it in time (customer is refunded). */
  autoCancelEnabled: true,
  /** Minutes the restaurant has to accept a new order. */
  restaurantAcceptTimeoutMinutes: 5,
  /** Customer may cancel while the restaurant has not accepted yet. */
  allowUserCancelBeforeAccept: true,
  /** Extra seconds after the restaurant accepts during which the customer may still cancel (0 = not allowed). */
  freeCancelWindowSecondsAfterAccept: 0,
};

const clampInt = (v, min, max, fallback) => {
  const n = Math.round(Number(v));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export function sanitizeRules(raw = {}) {
  return {
    autoCancelEnabled: raw.autoCancelEnabled === undefined ? DEFAULT_CANCELLATION_RULES.autoCancelEnabled : Boolean(raw.autoCancelEnabled),
    restaurantAcceptTimeoutMinutes: clampInt(raw.restaurantAcceptTimeoutMinutes, 1, 120, DEFAULT_CANCELLATION_RULES.restaurantAcceptTimeoutMinutes),
    allowUserCancelBeforeAccept: raw.allowUserCancelBeforeAccept === undefined ? DEFAULT_CANCELLATION_RULES.allowUserCancelBeforeAccept : Boolean(raw.allowUserCancelBeforeAccept),
    freeCancelWindowSecondsAfterAccept: clampInt(raw.freeCancelWindowSecondsAfterAccept, 0, 600, DEFAULT_CANCELLATION_RULES.freeCancelWindowSecondsAfterAccept),
  };
}

export async function getOrderCancellationRules() {
  const doc = await FoodSettings.findOne({ key: 'order_cancellation' }).lean();
  return sanitizeRules(doc?.rules || {});
}

export async function updateOrderCancellationRules(body = {}, adminId = null) {
  const rules = sanitizeRules({ ...(await getOrderCancellationRules()), ...body });
  await FoodSettings.findOneAndUpdate(
    { key: 'order_cancellation' },
    { $set: { rules, updatedBy: { role: 'ADMIN', adminId, at: new Date() } } },
    { upsert: true, new: true },
  );
  return rules;
}

/** What the customer's app needs: may I cancel right now, and when will the restaurant timer run out? */
export function computeCancellationState(order, rules, now = new Date()) {
  const status = String(order?.orderStatus || '');
  const nowMs = now.getTime();

  if (TERMINAL.includes(status)) {
    return { canCancel: false, reason: status === 'delivered' ? 'This order is already delivered.' : 'This order is already cancelled.', autoCancelAt: null, windowEndsAt: null };
  }

  let autoCancelAt = null;
  if (rules.autoCancelEnabled && WAITING_FOR_RESTAURANT.includes(status) && order.restaurantNotifiedAt) {
    autoCancelAt = new Date(new Date(order.restaurantNotifiedAt).getTime() + rules.restaurantAcceptTimeoutMinutes * 60000);
  }

  if (BEFORE_ACCEPT_STATUSES.includes(status)) {
    return rules.allowUserCancelBeforeAccept
      ? { canCancel: true, reason: '', autoCancelAt, windowEndsAt: null }
      : { canCancel: false, reason: 'Cancellation is not available for this order.', autoCancelAt, windowEndsAt: null };
  }

  if (ACCEPTED_STATUSES.includes(status) && rules.freeCancelWindowSecondsAfterAccept > 0) {
    const acceptedEntry = [...(order.statusHistory || [])].reverse().find((h) => ACCEPTED_STATUSES.includes(h.to));
    const acceptedAt = acceptedEntry?.at ? new Date(acceptedEntry.at).getTime() : null;
    if (acceptedAt) {
      const windowEnds = acceptedAt + rules.freeCancelWindowSecondsAfterAccept * 1000;
      return nowMs < windowEnds
        ? { canCancel: true, reason: '', autoCancelAt: null, windowEndsAt: new Date(windowEnds) }
        : { canCancel: false, reason: 'The cancellation window has ended because the restaurant is already preparing your order.', autoCancelAt: null, windowEndsAt: new Date(windowEnds) };
    }
  }

  return { canCancel: false, reason: 'The restaurant has already accepted your order, so it can no longer be cancelled.', autoCancelAt: null, windowEndsAt: null };
}

// ---- refund ------------------------------------------------------------------------------------
/**
 * Refund what the customer paid for this order. Safe to call twice: the order is CLAIMED
 * (refund.status 'pending') before any money moves, so two callers can never refund twice.
 * Returns { status: 'processed' | 'failed' | 'not_required' | 'already_refunded', amount, method, refundId?, error? }.
 */
export async function refundOrderPayment(orderId, { amount = null, retry = false, reasonText = 'Order cancelled' } = {}) {
  const order = await FoodOrder.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');

  const method = String(order.payment?.method || 'cash').toLowerCase();
  const payStatus = String(order.payment?.status || '').toLowerCase();
  const total = round2(order.pricing?.total);
  const refundAmount = amount === null || amount === undefined ? total : round2(amount);

  if (refundAmount <= 0 || refundAmount > total) {
    throw new ValidationError(`Refund amount must be between ${inr(0.01)} and ${inr(total)}`);
  }

  const paymentId = order.payment?.razorpay?.paymentId;
  const viaGateway = (method === 'razorpay' || method === 'razorpay_qr') && Boolean(paymentId);
  const viaWallet = method === 'wallet';

  if (payStatus === 'refunded' && order.payment?.refund?.status === 'processed') {
    return { status: 'already_refunded', amount: round2(order.payment.refund.amount), method };
  }
  if (payStatus !== 'paid' || !(viaGateway || viaWallet)) {
    return { status: 'not_required', amount: 0, method };   // COD / unpaid: the customer paid nothing online
  }

  // Claim: only one caller can move refund.status to 'pending'
  const blocked = retry ? ['processed'] : ['processed', 'pending'];
  const claim = await FoodOrder.updateOne(
    { _id: order._id, 'payment.status': 'paid', 'payment.refund.status': { $nin: blocked } },
    { $set: { 'payment.refund.status': 'pending', 'payment.refund.amount': refundAmount } },
  );
  if (!claim.modifiedCount) {
    return { status: 'already_refunded', amount: refundAmount, method };
  }

  const isFull = refundAmount >= total;
  try {
    if (viaGateway) {
      const result = await initiateRazorpayRefund(paymentId, refundAmount);
      if (!result.success) throw new Error(result.error || 'Razorpay refund failed');
      await FoodOrder.updateOne({ _id: order._id }, {
        $set: {
          ...(isFull ? { 'payment.status': 'refunded' } : {}),
          'payment.refund': { status: 'processed', amount: refundAmount, refundId: result.refundId || '', processedAt: new Date() },
        },
      });
      return { status: 'processed', amount: refundAmount, method, refundId: result.refundId };
    }

    await userWalletService.refundWalletBalance(order.userId, refundAmount, `Refund for order #${order.order_id || order._id}: ${reasonText}`, { orderId: order._id });
    await FoodOrder.updateOne({ _id: order._id }, {
      $set: {
        ...(isFull ? { 'payment.status': 'refunded' } : {}),
        'payment.refund': { status: 'processed', amount: refundAmount, refundId: '', processedAt: new Date() },
      },
    });
    return { status: 'processed', amount: refundAmount, method };
  } catch (err) {
    logger.error(`[Refund] Order ${order._id} refund failed: ${err?.message || err}`);
    await FoodOrder.updateOne({ _id: order._id }, { $set: { 'payment.refund': { status: 'failed', amount: refundAmount, refundId: '' } } });
    return { status: 'failed', amount: refundAmount, method, error: err?.message || 'Refund failed' };
  }
}

// ---- side effects ---------------------------------------------------------------------------------
async function restoreStock(order) {
  for (const line of order.items || []) {
    try {
      const qty = Math.max(1, Number(line.quantity) || 1);
      const food = await FoodItem.findById(line.itemId);
      if (food && typeof food.stockQuantity === 'number') {
        const before = food.stockQuantity;
        food.stockQuantity = before + qty;
        if (before <= 0) food.isAvailable = true;   // it was switched off automatically when stock hit 0
        await food.save();
      }
    } catch (err) {
      logger.warn(`[Cancel] Could not restore stock for item ${line?.itemId}: ${err?.message || err}`);
    }
  }
}

async function giveCouponBack(order) {
  const code = String(order.pricing?.couponCode || '').trim().toUpperCase();
  if (!code) return;
  try {
    const offer = await FoodOffer.findOne({ couponCode: code }).lean();
    if (!offer) return;
    await FoodOffer.updateOne({ _id: offer._id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    await FoodOfferUsage.updateOne({ offerId: offer._id, userId: order.userId, count: { $gt: 0 } }, { $inc: { count: -1 } });
  } catch (err) {
    logger.warn(`[Cancel] Could not give coupon back for order ${order._id}: ${err?.message || err}`);
  }
}

function buildMessages({ by, order, refund, reason }) {
  const id = order.order_id || order._id;
  let refundLine = '';
  if (refund.status === 'processed' || refund.status === 'already_refunded') {
    refundLine = refund.method === 'wallet'
      ? ` ${inr(refund.amount)} has been refunded to your Raydo wallet.`
      : ` Your refund of ${inr(refund.amount)} has been started and will reach your original payment method in 5-7 working days.`;
  } else if (refund.status === 'failed') {
    refundLine = ' We could not send your refund automatically; our team has been alerted and will refund you shortly.';
  }

  const who = {
    USER: { title: 'Order Cancelled', body: `You cancelled order #${id}.` },
    RESTAURANT: { title: 'Order Cancelled by Restaurant', body: reason || `The restaurant could not accept order #${id}.` },
    SYSTEM: { title: 'Order Cancelled', body: `The restaurant did not accept order #${id} in time, so it was cancelled automatically.` },
    ADMIN: { title: 'Order Cancelled', body: reason || `Order #${id} was cancelled by our support team.` },
  }[by] || { title: 'Order Cancelled', body: `Order #${id} was cancelled.` };

  return { userTitle: `${who.title} ❌`, userBody: `${who.body}${refundLine}`, restaurantBody: `Order #${id} was cancelled (${by === 'USER' ? 'by customer' : by === 'SYSTEM' ? 'not accepted in time' : by === 'ADMIN' ? 'by admin' : 'by restaurant'}).` };
}

function emitCancelled(order, { by, message }) {
  try {
    const io = getIO();
    if (!io) return;
    const payload = {
      orderMongoId: order._id.toString(),
      orderId: order.order_id || order._id.toString(),
      displayId: order.order_id || order._id.toString(),
      orderStatus: order.orderStatus,
      status: order.orderStatus,
      cancelledBy: String(by || '').toLowerCase(),
      message,
    };
    const targets = [rooms.user(order.userId), rooms.tracking(order._id)];
    if (order.order_id) targets.push(rooms.tracking(order.order_id));
    if (order.restaurantId) targets.push(rooms.restaurant(order.restaurantId));
    if (order.dispatch?.deliveryPartnerId) targets.push(rooms.delivery(order.dispatch.deliveryPartnerId));
    targets.forEach((room) => {
      io.to(room).emit('order_status_update', payload);
      io.to(room).emit('order_cancelled', payload);
    });
    io.to('delivery_partners').emit('order_cancelled', payload);   // stop any ringing offer popup
  } catch (err) {
    logger.warn(`[Cancel] Socket emit failed: ${err?.message || err}`);
  }
}

// ---- the engine ---------------------------------------------------------------------------------
/**
 * Cancel an order. `by` is USER | RESTAURANT | ADMIN | SYSTEM.
 * `allowedFrom` limits which current statuses may be cancelled; if the order has moved on
 * (for example the restaurant just accepted it) nothing happens and a ValidationError is thrown.
 */
export async function cancelOrderCore(orderId, { by, byId = null, reason = '', comment = '', allowedFrom, ownerUserId = null } = {}) {
  const target = by === 'USER' ? 'cancelled_by_user' : by === 'ADMIN' ? 'cancelled_by_admin' : 'cancelled_by_restaurant';
  const allowed = allowedFrom || (by === 'ADMIN' ? ADMIN_CAN_CANCEL : by === 'RESTAURANT' ? RESTAURANT_CAN_CANCEL : BEFORE_ACCEPT_STATUSES);
  const cleanReason = String(reason || '').trim();
  const cleanComment = String(comment || '').trim();
  const now = new Date();

  // 1. CLAIM. Atomic: only one cancel (or one "accept") can win a given order.
  const filter = { _id: orderId, orderStatus: { $in: allowed } };
  if (ownerUserId) filter.userId = new mongoose.Types.ObjectId(String(ownerUserId));
  const before = await FoodOrder.findOneAndUpdate(
    filter,
    { $set: { orderStatus: target, cancellationReason: cleanReason, cancellationComment: cleanComment, cancelledAt: now, cancelledBy: by, 'dispatch.status': 'cancelled' } },
    { new: false },
  );
  if (!before) {
    const current = await FoodOrder.findById(orderId).select('orderStatus').lean();
    if (!current) throw new NotFoundError('Order not found');
    if (TERMINAL.includes(current.orderStatus)) throw new ValidationError('This order is already finished or cancelled.');
    throw new ValidationError('This order has moved ahead and can no longer be cancelled.');
  }

  await FoodOrder.updateOne({ _id: before._id }, {
    $push: { statusHistory: { at: now, byRole: by, byId: byId || undefined, from: before.orderStatus, to: target, note: cleanReason || cleanComment || '' } },
  });

  const order = await FoodOrder.findById(before._id);

  // 2. Refund the customer (card/UPI -> original method, wallet -> wallet; COD = nothing paid)
  const refund = await refundOrderPayment(order._id, { reasonText: cleanReason || 'Order cancelled' });
  const refreshed = await FoodOrder.findById(order._id);

  // 3. Money books: finance record + any wallet credit already given to restaurant / rider
  try {
    const paidOnline = String(refreshed.payment?.status || '') === 'paid' || String(refreshed.payment?.status || '') === 'refunded';
    await foodTransactionService.updateTransactionStatus(refreshed._id, `cancelled_by_${String(by).toLowerCase()}`, {
      status: paidOnline ? 'refunded' : 'failed',
      note: `Order cancelled (${by})${cleanReason ? `: ${cleanReason}` : ''}. Refund: ${refund.status}`,
      recordedByRole: by === 'SYSTEM' ? 'SYSTEM' : by,
      recordedById: byId || undefined,
    });
    await foodTransactionService.reverseWalletsForOrder(refreshed._id);
  } catch (err) {
    logger.warn(`[Cancel] Finance sync failed for order ${refreshed._id}: ${err?.message || err}`);
  }

  // 4. Put things back
  await restoreStock(refreshed);
  await giveCouponBack(refreshed);

  // 5. Tell everyone
  const msg = buildMessages({ by, order: refreshed, refund, reason: cleanReason || cleanComment });
  const link = `/food/user/orders/${refreshed._id.toString()}`;
  const data = { type: 'order_cancelled', orderId: String(refreshed.order_id || refreshed._id), orderMongoId: String(refreshed._id), link };
  const targets = [{ ownerType: 'USER', ownerId: refreshed.userId }];
  if (refreshed.restaurantId && by !== 'RESTAURANT') targets.push({ ownerType: 'RESTAURANT', ownerId: refreshed.restaurantId });
  if (refreshed.dispatch?.deliveryPartnerId) targets.push({ ownerType: 'DELIVERY_PARTNER', ownerId: refreshed.dispatch.deliveryPartnerId });

  await notifyOwnersSafely([targets[0]], { title: msg.userTitle, body: msg.userBody, data });
  if (targets.length > 1) {
    await notifyOwnersSafely(targets.slice(1), { title: 'Order Cancelled ❌', body: msg.restaurantBody, data });
  }
  emitCancelled(refreshed, { by, message: msg.userBody });

  enqueueOrderEvent(`order_cancelled_by_${String(by).toLowerCase()}`, {
    orderMongoId: refreshed._id.toString(),
    orderId: refreshed._id.toString(),
    userId: String(refreshed.userId),
    reason: cleanReason || cleanComment,
    refundStatus: refund.status,
  });

  return { order: normalizeOrderForClient(refreshed), refund };
}

// ---- entry points ---------------------------------------------------------------------------------
/** Customer cancels. Allowed before the restaurant accepts, or inside the admin-set grace window after it. */
export async function cancelOrderByUser(orderId, userId, payload = {}) {
  const order = await FoodOrder.findOne({ _id: orderId, userId: new mongoose.Types.ObjectId(String(userId)) }).lean();
  if (!order) throw new NotFoundError('Order not found');

  const rules = await getOrderCancellationRules();
  const state = computeCancellationState(order, rules);
  if (!state.canCancel) throw new ValidationError(state.reason || 'This order cannot be cancelled.');

  const reason = typeof payload === 'string' ? payload : (payload.cancellationReason || payload.reason || '');
  const comment = typeof payload === 'object' ? (payload.cancellationComment || '') : '';
  const display = reason === 'Other' && comment ? comment : (reason || comment || 'No reason provided');

  return cancelOrderCore(order._id, {
    by: 'USER', byId: userId, reason: display, comment, ownerUserId: userId,
    allowedFrom: ACCEPTED_STATUSES.includes(order.orderStatus) ? ACCEPTED_STATUSES : BEFORE_ACCEPT_STATUSES,
  });
}

export const cancelOrderByRestaurant = (orderId, restaurantId, note = '') =>
  cancelOrderCore(orderId, { by: 'RESTAURANT', byId: restaurantId, reason: note || 'Cancelled by restaurant' });

export const cancelOrderByAdmin = (orderId, adminId, reason = '') =>
  cancelOrderCore(orderId, { by: 'ADMIN', byId: adminId, reason: reason || 'Cancelled by admin' });

/**
 * Runs every minute (server.js). Cancels orders the restaurant did not accept within the admin-set time.
 * The customer is refunded automatically. Only orders the restaurant was actually told about are touched.
 */
export async function autoCancelUnacceptedOrders() {
  const rules = await getOrderCancellationRules();
  if (!rules.autoCancelEnabled) return { cancelled: 0 };

  const cutoff = new Date(Date.now() - rules.restaurantAcceptTimeoutMinutes * 60000);
  const stale = await FoodOrder.find({
    orderStatus: { $in: WAITING_FOR_RESTAURANT },
    restaurantNotifiedAt: { $ne: null, $lte: cutoff },
  }).select('_id').limit(50).lean();

  let cancelled = 0;
  for (const row of stale) {
    try {
      await cancelOrderCore(row._id, {
        by: 'SYSTEM',
        reason: `Restaurant did not accept within ${rules.restaurantAcceptTimeoutMinutes} minute(s)`,
        allowedFrom: WAITING_FOR_RESTAURANT,
      });
      cancelled += 1;
    } catch (err) {
      // "moved ahead" just means the restaurant accepted at the same moment: that is fine
      if (!(err instanceof ValidationError)) logger.error(`[AutoCancel] Order ${row._id}: ${err?.message || err}`);
    }
  }
  if (cancelled) logger.info(`[AutoCancel] Cancelled ${cancelled} order(s) not accepted within ${rules.restaurantAcceptTimeoutMinutes} min`);
  return { cancelled };
}
