import mongoose from 'mongoose';
import { FoodOrder, FoodSettings } from '../models/order.model.js';
import { FoodItem } from '../../admin/models/food.model.js';
import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { logger } from '../../../../utils/logger.js';
import { getIO, rooms } from '../../../../config/socket.js';
import { initiateRazorpayRefund, fetchRazorpayRefund, isRazorpayConfigured } from '../helpers/razorpay.helper.js';
import { FoodTransaction } from '../models/foodTransaction.model.js';
import * as userWalletService from '../../user/services/userWallet.service.js';
import * as foodTransactionService from './foodTransaction.service.js';
import { ValidationError, NotFoundError } from '../../../../core/auth/errors.js';
import {
  enqueueOrderEvent,
  notifyOwnersSafely,
  notifyAdminsSafely,
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
  /**
   * How card / UPI (Razorpay) refunds are done:
   *  'manual' = the order is cancelled, the admin refunds from the Razorpay dashboard (we open the payment for them)
   *             and then marks it as refunded here.
   *  'auto'   = our server calls the Razorpay refund API by itself.
   * Wallet refunds are always automatic (the money stays inside Raydo).
   */
  refundMode: 'manual',
  /** Rupees taken from the restaurant's wallet when it cancels an order AFTER accepting it (0 = no penalty). */
  restaurantCancelPenalty: 0,
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
    restaurantCancelPenalty: clampInt(raw.restaurantCancelPenalty, 0, 5000, DEFAULT_CANCELLATION_RULES.restaurantCancelPenalty),
    refundMode: raw.refundMode === 'auto' ? 'auto' : raw.refundMode === 'manual' ? 'manual' : DEFAULT_CANCELLATION_RULES.refundMode,
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
/** What was already refunded on this order (sum of processed refunds; old orders only have refund.amount). */
const refundedSoFar = (order) => {
  const r = order.payment?.refund || {};
  return round2(r.refundedTotal || (r.status === 'processed' ? r.amount : 0));
};

/**
 * Refund what the customer paid for this order (the whole order, or a part of it; several partial refunds are fine
 * as long as the total never goes above what the customer paid). Safe to call twice: the order is CLAIMED
 * (refund.status 'pending') before any money moves.
 *  - Razorpay (card/UPI/QR): back through Razorpay (or parked for a manual refund, see refundMode)
 *  - wallet: back to the wallet
 *  - COD that was already delivered: the customer paid cash, so the refund goes to the Raydo wallet
 * Returns { status: 'processed' | 'manual_pending' | 'failed' | 'not_required' | 'already_refunded', amount, refundedTotal, method, refundId?, error? }.
 */
export async function refundOrderPayment(orderId, { amount = null, retry = false, reasonText = 'Order cancelled', forceAuto = false, deductFromRestaurant = false } = {}) {
  const order = await FoodOrder.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');

  const method = String(order.payment?.method || 'cash').toLowerCase();
  const payStatus = String(order.payment?.status || '').toLowerCase();
  const total = round2(order.pricing?.total);
  const already = refundedSoFar(order);
  const remaining = round2(total - already);

  if (payStatus === 'refunded' || (already > 0 && remaining <= 0)) {
    return { status: 'already_refunded', amount: already, refundedTotal: already, method };
  }

  const refundAmount = amount === null || amount === undefined ? remaining : round2(amount);
  if (refundAmount <= 0 || refundAmount > remaining) {
    throw new ValidationError(`Refund amount must be between ${inr(0.01)} and ${inr(remaining)}`);
  }

  const paymentId = order.payment?.razorpay?.paymentId;
  const viaGateway = (method === 'razorpay' || method === 'razorpay_qr') && Boolean(paymentId);
  const codDelivered = method === 'cash' && String(order.orderStatus) === 'delivered' && ['paid', 'cod_pending'].includes(payStatus);
  const viaWallet = method === 'wallet' || codDelivered;
  const payableStatuses = codDelivered ? ['paid', 'cod_pending'] : ['paid'];

  // Paid through Razorpay but we have no payment id to refund against: never say "nothing to refund" - alert the admin instead
  if (payStatus === 'paid' && (method === 'razorpay' || method === 'razorpay_qr') && !paymentId) {
    logger.error(`[Refund] Order ${order._id} is paid via ${method} but has no Razorpay payment id. Refund it manually from the Razorpay dashboard.`);
    await FoodOrder.updateOne({ _id: order._id }, { $set: { 'payment.refund.status': 'failed', 'payment.refund.amount': refundAmount } });
    return { status: 'failed', amount: refundAmount, refundedTotal: already, method, error: 'Razorpay payment id missing - refund manually from the Razorpay dashboard' };
  }
  if (!payableStatuses.includes(payStatus) || !(viaGateway || viaWallet)) {
    return { status: 'not_required', amount: 0, refundedTotal: already, method };   // unpaid / COD not delivered: the customer paid nothing online
  }

  // MANUAL mode: do not touch Razorpay. Park the refund for the admin, who refunds from the Razorpay dashboard.
  if (viaGateway && !forceAuto) {
    const { refundMode } = await getOrderCancellationRules();
    if (refundMode === 'manual') {
      await FoodOrder.updateOne(
        { _id: order._id },
        { $set: { 'payment.refund.status': 'manual_pending', 'payment.refund.amount': refundAmount, 'payment.refund.refundId': '', 'payment.refund.deductFromRestaurant': Boolean(deductFromRestaurant) } },
      );
      return { status: 'manual_pending', amount: refundAmount, refundedTotal: already, method, paymentId };
    }
  }

  // Claim: only one caller can move refund.status to 'pending'
  const claim = await FoodOrder.updateOne(
    { _id: order._id, 'payment.status': { $in: payableStatuses }, 'payment.refund.status': { $nin: retry ? [] : ['pending'] } },
    { $set: { 'payment.refund.status': 'pending', 'payment.refund.amount': refundAmount } },
  );
  if (!claim.modifiedCount) {
    return { status: 'already_refunded', amount: refundAmount, refundedTotal: already, method };
  }

  const newTotal = round2(already + refundAmount);
  const isFull = newTotal >= total;
  const markDone = (refundId) => FoodOrder.updateOne({ _id: order._id }, {
    $set: {
      ...(isFull ? { 'payment.status': 'refunded' } : {}),
      'payment.refund.status': 'processed',
      'payment.refund.amount': refundAmount,
      'payment.refund.refundedTotal': newTotal,
      'payment.refund.refundId': refundId || '',
      'payment.refund.processedAt': new Date(),
      'payment.refund.deductFromRestaurant': Boolean(deductFromRestaurant),
    },
    // every Razorpay refund id of this order, so a late/duplicate webhook for ANY earlier refund is recognised
    ...(refundId ? { $addToSet: { 'payment.refund.refundIds': refundId } } : {}),
  });
  try {
    if (viaGateway) {
      const result = await initiateRazorpayRefund(paymentId, refundAmount);
      if (!result.success) throw new Error(result.error || 'Razorpay refund failed');
      await markDone(result.refundId);
      return { status: 'processed', amount: refundAmount, refundedTotal: newTotal, method, refundId: result.refundId };
    }

    await userWalletService.refundWalletBalance(order.userId, refundAmount, `Refund for order #${order.order_id || order._id}: ${reasonText}`, { orderId: order._id });
    await markDone('');
    return { status: 'processed', amount: refundAmount, refundedTotal: newTotal, method: codDelivered ? 'wallet' : method };
  } catch (err) {
    logger.error(`[Refund] Order ${order._id} refund failed: ${err?.message || err}`);
    await FoodOrder.updateOne({ _id: order._id }, { $set: { 'payment.refund.status': 'failed', 'payment.refund.amount': refundAmount } });
    return { status: 'failed', amount: refundAmount, refundedTotal: already, method, error: err?.message || 'Refund failed' };
  }
}

/**
 * The money side of a refund that REALLY happened (never call it for a parked / failed refund):
 *  - cancelled order: the finance record is closed as refunded (wallets were already settled at cancel time)
 *  - delivered order, restaurant bears it (full refund only): the restaurant's share is taken back, the rider keeps theirs
 *  - delivered order otherwise: the platform bears it, so the franchise earning + platform commission are reversed pro rata
 * Every step is idempotent, so running it twice (admin button + webhook + manual-done) is harmless.
 */
export async function applyRefundBooks(orderId, { refundAmount, refundedTotal, deductFromRestaurant = false } = {}) {
  const order = await FoodOrder.findById(orderId).lean();
  if (!order) return;
  const total = round2(order.pricing?.total);
  const full = round2(refundedTotal) >= total;
  const status = String(order.orderStatus);

  if (status.startsWith('cancelled')) {
    if (!full) return;
    const tx = await FoodTransaction.findOne({ orderId: order._id }).select('status').lean();
    if (tx && tx.status !== 'refunded') {
      await foodTransactionService.updateTransactionStatus(order._id, 'refunded', { status: 'refunded', note: 'Refund completed', recordedByRole: 'ADMIN' }).catch(() => null);
    }
    return;   // the restaurant / rider wallets were already settled by cancelOrderCore
  }

  if (!['delivered', 'completed'].includes(status)) return;

  if (deductFromRestaurant && full) {
    await FoodOrder.updateOne({ _id: order._id }, { $set: { payoutReversed: true } });
    await FoodTransaction.updateOne(
      { orderId: order._id },
      { $set: { payoutReversed: true }, $push: { history: { kind: 'restaurant_payout_reversed', amount: total, at: new Date(), note: 'Restaurant share taken back after a refund of a delivered order', recordedBy: { role: 'ADMIN' } } } },
    );
    await foodTransactionService.reverseWalletsForOrder(order._id, { onlyRestaurant: true }).catch(() => null);
    // No return here: the customer got everything back, so the platform earned nothing on this order and the franchise
    // must lose its share of that earning too (below). The rider keeps their payout.
  }

  if (order.franchiseId) {
    try {
      const { reverseFoodOrder } = await import('../../admin/services/franchiseLedger.service.js');
      await reverseFoodOrder(order._id, {
        refundAmount, orderTotal: total, refundKey: `refund:${Math.round(round2(refundedTotal) * 100)}`, note: 'Order refunded',
      });
    } catch (err) {
      logger.error(`[Refund] Franchise earning reversal failed for order ${order._id}: ${err?.message || err}`);
    }
  }
}

/** A hand-entered Razorpay refund id must be a real refund of THIS order's payment, and may not be used for another order. */
async function verifyManualRefundReference(order, ref, amount) {
  const clash = await FoodOrder.exists({ _id: { $ne: order._id }, 'payment.refund.refundId': ref });
  if (clash) throw new ValidationError('This refund reference is already recorded on another order.');
  if (!/^rfnd_/i.test(ref) || !isRazorpayConfigured()) return;       // a bank / UPI reference cannot be checked with Razorpay
  let rz;
  try {
    rz = await fetchRazorpayRefund(ref);
  } catch (err) {
    throw new ValidationError(`Razorpay does not know this refund id (${err?.message || 'lookup failed'}). Check the id and try again.`);
  }
  const paymentId = order.payment?.razorpay?.paymentId;
  if (paymentId && rz.payment_id !== paymentId) throw new ValidationError('This Razorpay refund belongs to a different payment.');
  if (Number(rz.amount) / 100 + 0.009 < amount) throw new ValidationError(`This Razorpay refund is only ${inr(Number(rz.amount) / 100)}, less than ${inr(amount)}.`);
}

/**
 * The admin (or the franchise of this order) refunded the customer by hand. Record it (with the refund id) and tell the customer.
 */
export async function markRefundDoneManually(orderId, { referenceId = '', note = '' } = {}, adminId = null, { paidBy = 'admin', franchiseId = null } = {}) {
  const order = await FoodOrder.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  const state = String(order.payment?.refund?.status || '');
  if (!['manual_pending', 'failed'].includes(state)) {
    throw new ValidationError(state === 'processed' ? 'This order is already refunded.' : 'There is no refund waiting for this order.');
  }
  const ref = String(referenceId || '').trim();
  if (ref.length < 4 || ref.length > 120) throw new ValidationError('Enter the Razorpay refund id (rfnd_...) or the refund reference (4-120 characters)');

  const total = round2(order.pricing?.total);
  const already = refundedSoFar(order);
  const amount = round2(order.payment?.refund?.amount || (total - already));
  await verifyManualRefundReference(order, ref, amount);

  const newTotal = round2(already + amount);
  const isFull = newTotal >= total;
  const deduct = Boolean(order.payment?.refund?.deductFromRestaurant);
  // Race-safe: only the caller that still sees the refund waiting can finish it
  const done = await FoodOrder.updateOne({ _id: order._id, 'payment.refund.status': { $in: ['manual_pending', 'failed'] } }, {
    $set: {
      ...(isFull ? { 'payment.status': 'refunded' } : {}),
      'payment.refund.status': 'processed',
      'payment.refund.amount': amount,
      'payment.refund.refundedTotal': newTotal,
      'payment.refund.refundId': ref,
      'payment.refund.processedAt': new Date(),
      'payment.refund.paidBy': paidBy,
      ...(franchiseId ? { 'payment.refund.franchiseId': franchiseId } : {}),
    },
    $addToSet: { 'payment.refund.refundIds': ref },
  });
  if (!done.modifiedCount) throw new ValidationError('This refund was just recorded by someone else.');
  await FoodOrder.updateOne({ _id: order._id }, {
    $push: { statusHistory: { at: new Date(), byRole: 'ADMIN', byId: adminId || undefined, from: order.orderStatus, to: order.orderStatus, note: `Refund of ${inr(amount)} done manually by ${paidBy === 'franchise' ? 'the franchise partner' : 'admin'} (ref ${ref})${note ? `: ${note}` : ''}` } },
  });

  // The refund is real now: close the books (franchise earning / restaurant share / finance record)
  await applyRefundBooks(order._id, { refundAmount: amount, refundedTotal: newTotal, deductFromRestaurant: deduct });

  if (paidBy === 'franchise') {
    // Transparency for the platform: the franchise paid the customer from its own pocket. It can claim the money back (franchise > refund claim).
    try {
      const { notifyAdminsSafely } = await import('../../../../core/notifications/firebase.service.js');
      await notifyAdminsSafely({
        title: 'Franchise refunded a customer manually',
        body: `Order #${order.order_id || order._id}: ${inr(amount)} refunded by the franchise partner (ref ${ref}).`,
        data: { type: 'franchise_manual_refund', orderMongoId: String(order._id) },
      });
    } catch (err) {
      logger.warn(`[Refund] Admin notice for franchise refund failed: ${err?.message || err}`);
    }
  }
  await notifyOwnersSafely([{ ownerType: 'USER', ownerId: order.userId }], {
    title: 'Refund Processed! 💸',
    body: `Your refund of ${inr(amount)} for order #${order.order_id || order._id} has been sent to your original payment method. It can take 5-7 working days to show.`,
    data: { type: 'refund_processed', orderId: String(order.order_id || order._id), orderMongoId: String(order._id) },
  });
  return { status: 'processed', amount, refundedTotal: newTotal, refundId: ref };
}

/** Admin chose "refund automatically through the API" for an order that was parked for a manual refund (or whose refund failed). */
export async function refundViaApiNow(orderId) {
  const order = await FoodOrder.findById(orderId).select('payment.refund.deductFromRestaurant').lean();
  const result = await refundOrderPayment(orderId, {
    retry: true, forceAuto: true, reasonText: 'Refund requested by admin',
    deductFromRestaurant: Boolean(order?.payment?.refund?.deductFromRestaurant),
  });
  if (result.status === 'processed') {
    await applyRefundBooks(orderId, { refundAmount: result.amount, refundedTotal: result.refundedTotal, deductFromRestaurant: Boolean(order?.payment?.refund?.deductFromRestaurant) });
  }
  return result;
}

// ---- refund requests from restaurant / delivery partner -----------------------------------------------
/**
 * The "refund" button of the restaurant and of the delivery partner.
 *  - Restaurant, order not yet on its way: it is cancelled and the customer is refunded AUTOMATICALLY.
 *  - Anything else (a delivered order, or the rider's request): a request is raised for the admin, who approves or rejects it
 *    (admin.service > decideRefundRequest). Nothing moves until the admin decides.
 */
export async function requestOrderRefund(orderId, { byRole, byId, reason = '', amount = null } = {}) {
  const order = await FoodOrder.findById(orderId);
  if (!order) throw new NotFoundError('Order not found');
  const mine = byRole === 'RESTAURANT'
    ? String(order.restaurantId) === String(byId)
    : byRole === 'DELIVERY_PARTNER' && String(order.dispatch?.deliveryPartnerId || '') === String(byId);
  if (!mine) throw new NotFoundError('Order not found');

  const cleanReason = String(reason || '').trim();
  if (cleanReason.length < 3) throw new ValidationError('Please give a reason for the refund');

  if (byRole === 'RESTAURANT' && RESTAURANT_CAN_CANCEL.includes(order.orderStatus)) {
    const { order: cancelled, refund } = await cancelOrderByRestaurant(order._id, byId, cleanReason);
    return { mode: 'cancelled_and_refunded', order: cancelled, refund };
  }

  const total = round2(order.pricing?.total);
  const asked = amount === null || amount === undefined || amount === '' ? total - refundedSoFar(order) : round2(amount);
  if (!(asked > 0) || asked > total - refundedSoFar(order)) throw new ValidationError(`Refund amount must be between ${inr(0.01)} and ${inr(total - refundedSoFar(order))}`);
  if (TERMINAL.includes(order.orderStatus) && order.orderStatus !== 'delivered') throw new ValidationError('This order is already cancelled.');
  if (String(order.payment?.refund?.status) === 'processed' && String(order.payment?.status) === 'refunded') throw new ValidationError('This order is already fully refunded.');

  const claimed = await FoodOrder.updateOne(
    { _id: order._id, 'refundRequest.status': { $ne: 'requested' } },
    { $set: { refundRequest: { status: 'requested', byRole, byId, reason: cleanReason, amount: asked, requestedAt: new Date() } },
      $push: { statusHistory: { at: new Date(), byRole, byId, from: order.orderStatus, to: order.orderStatus, note: `Refund requested (${inr(asked)}): ${cleanReason}` } } },
  );
  if (!claimed.modifiedCount) throw new ValidationError('A refund request for this order is already waiting for the admin.');

  await notifyAdminsSafely({
    title: 'Refund requested',
    body: `Order #${order.order_id || order._id}: ${inr(asked)} requested by the ${byRole === 'RESTAURANT' ? 'restaurant' : 'delivery partner'} - ${cleanReason}`,
    data: { type: 'refund_requested', orderMongoId: String(order._id) },
  });
  return { mode: 'requested', amount: asked };
}

// ---- side effects ---------------------------------------------------------------------------------
async function restoreStock(order) {
  for (const line of order.items || []) {
    try {
      const qty = Math.max(1, Number(line.quantity) || 1);
      // Atomic: the old read-then-save lost other orders' stock changes happening at the same moment
      const before = await FoodItem.findOneAndUpdate(
        { _id: line.itemId, stockQuantity: { $type: 'number' } },
        { $inc: { stockQuantity: qty } },
        { new: false },
      ).lean();
      if (before && before.stockQuantity <= 0) {
        await FoodItem.updateOne({ _id: line.itemId, stockQuantity: { $gt: 0 } }, { $set: { isAvailable: true } });   // it was switched off automatically when stock hit 0
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
  if (refund.status === 'manual_pending') {
    refundLine = ` Your refund of ${inr(refund.amount)} has been queued. We will send it to your original payment method shortly and notify you as soon as it is sent.`;
  } else if (refund.status === 'processed' || refund.status === 'already_refunded') {
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

  // 3. Money books: finance record + any wallet credit already given to restaurant / rider.
  // A rider who already PICKED UP the order did the work, so a cancel after pickup keeps the rider's payout.
  const riderDidTheWork = ['picked_up', 'reached_drop'].includes(String(before.orderStatus));
  try {
    const paidOnline = String(refreshed.payment?.status || '') === 'paid' || String(refreshed.payment?.status || '') === 'refunded';
    await foodTransactionService.updateTransactionStatus(refreshed._id, `cancelled_by_${String(by).toLowerCase()}`, {
      status: paidOnline ? 'refunded' : 'failed',
      note: `Order cancelled (${by})${cleanReason ? `: ${cleanReason}` : ''}. Refund: ${refund.status}`,
      recordedByRole: by === 'SYSTEM' ? 'SYSTEM' : by,
      recordedById: byId || undefined,
    });
    await foodTransactionService.reverseWalletsForOrder(refreshed._id, { keepRider: riderDidTheWork });
    if (riderDidTheWork) await foodTransactionService.creditRiderForCancelledOrder(refreshed._id);
    // Restaurant cancelled an order it had already accepted: admin-set penalty
    if (by === 'RESTAURANT' && !BEFORE_ACCEPT_STATUSES.includes(String(before.orderStatus))) {
      const { restaurantCancelPenalty } = await getOrderCancellationRules();
      await foodTransactionService.chargeRestaurantCancelPenalty(refreshed._id, refreshed.restaurantId, restaurantCancelPenalty);
    }
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
  // The clock starts when the restaurant was told. Orders that have no "told at" time (older orders, or the stamp failed)
  // fall back to the time they were placed, so they can never wait forever. Only orders the restaurant can actually see
  // (cash / wallet / paid online) and that are not scheduled for later are touched.
  const visibleToRestaurant = [
    { 'payment.method': { $in: ['cash', 'wallet'] } },
    { 'payment.status': { $in: ['paid', 'authorized', 'captured', 'settled'] } },
  ];
  const stale = await FoodOrder.find({
    orderStatus: { $in: WAITING_FOR_RESTAURANT },
    $and: [
      { $or: [
        { restaurantNotifiedAt: { $ne: null, $lte: cutoff } },
        { restaurantNotifiedAt: null, createdAt: { $lte: cutoff } },
      ] },
      { $or: visibleToRestaurant },
      { $or: [{ scheduledAt: null }, { scheduledAt: { $exists: false } }, { scheduledAt: { $lte: new Date() } }] },
    ],
  }).select('_id').limit(50).lean();

  // Online orders that were started but never paid stay in "pending_payment": clean them up after 30 minutes (nothing to refund)
  const unpaidCutoff = new Date(Date.now() - 30 * 60000);
  const unpaid = await FoodOrder.find({ orderStatus: 'pending_payment', createdAt: { $lte: unpaidCutoff } }).select('_id').limit(50).lean();
  for (const row of unpaid) {
    try {
      await cancelOrderCore(row._id, { by: 'SYSTEM', reason: 'Payment was not completed', allowedFrom: ['pending_payment'] });
    } catch (err) {
      if (!(err instanceof ValidationError)) logger.error(`[AutoCancel] Unpaid order ${row._id}: ${err?.message || err}`);
    }
  }

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
