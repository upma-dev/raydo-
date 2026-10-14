import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodDeliveryCashDeposit } from '../models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryCashLimit } from '../../admin/models/deliveryCashLimit.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

/**
 * ONE place that answers "how much COD cash does this rider hold, and may he take another COD order?".
 * Dispatch (who gets the offer), accept, switch-to-cash, the rider's wallet screen and the admin list all use it,
 * so they can never disagree.
 *
 *   cashInHand  = COD money of DELIVERED cash orders - cash the rider already deposited (never below 0)
 *   activeCod   = COD orders the rider has already accepted but not delivered yet (that cash is about to come in)
 *   limit       = admin's "delivery cash limit"; 0 means no limit
 *   A rider may take a COD order only while  cashInHand + activeCod + this order  <=  limit.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/** Accepted but not delivered, not cancelled */
export const ACTIVE_ORDER_STATUSES = ['created', 'confirmed', 'preparing', 'ready_for_pickup', 'reached_pickup', 'picked_up', 'reached_drop', 'handover_requested'];

export async function getCashLimit() {
  const doc = await FoodDeliveryCashLimit.findOne({ isActive: true }).sort({ createdAt: -1 }).lean();
  return Math.max(0, Number(doc?.deliveryCashLimit) || 0);
}

const toIds = (ids) => ids
  .filter((id) => mongoose.Types.ObjectId.isValid(String(id)))
  .map((id) => new mongoose.Types.ObjectId(String(id)));

/** Map(partnerId -> { cashCollected, deposited, cashInHand, activeCod }) */
export async function getRiderCashPositions(partnerIds = [], { excludeOrderId = null } = {}) {
  const ids = toIds(partnerIds);
  const out = new Map(ids.map((id) => [String(id), { cashCollected: 0, deposited: 0, cashInHand: 0, activeCod: 0 }]));
  if (!ids.length) return out;

  const activeMatch = {
    'dispatch.deliveryPartnerId': { $in: ids },
    orderStatus: { $in: ACTIVE_ORDER_STATUSES },
    'payment.method': 'cash',
  };
  if (excludeOrderId && mongoose.Types.ObjectId.isValid(String(excludeOrderId))) {
    activeMatch._id = { $ne: new mongoose.Types.ObjectId(String(excludeOrderId)) };
  }

  const [collected, deposits, active] = await Promise.all([
    FoodOrder.aggregate([
      { $match: { 'dispatch.deliveryPartnerId': { $in: ids }, orderStatus: 'delivered', 'payment.method': 'cash' } },
      { $group: { _id: '$dispatch.deliveryPartnerId', total: { $sum: { $ifNull: ['$pricing.total', 0] } } } },
    ]),
    FoodDeliveryCashDeposit.aggregate([
      { $match: { deliveryPartnerId: { $in: ids }, status: 'Completed' } },
      { $group: { _id: '$deliveryPartnerId', total: { $sum: { $ifNull: ['$amount', 0] } } } },
    ]),
    FoodOrder.aggregate([
      { $match: activeMatch },
      { $group: { _id: '$dispatch.deliveryPartnerId', total: { $sum: { $ifNull: ['$pricing.total', 0] } } } },
    ]),
  ]);

  collected.forEach((r) => { const p = out.get(String(r._id)); if (p) p.cashCollected = round2(r.total); });
  deposits.forEach((r) => { const p = out.get(String(r._id)); if (p) p.deposited = round2(r.total); });
  active.forEach((r) => { const p = out.get(String(r._id)); if (p) p.activeCod = round2(r.total); });
  out.forEach((p) => { p.cashInHand = Math.max(0, round2(p.cashCollected - p.deposited)); });
  return out;
}

export async function getRiderCashPosition(partnerId, opts = {}) {
  const map = await getRiderCashPositions([partnerId], opts);
  return map.get(String(partnerId)) || { cashCollected: 0, deposited: 0, cashInHand: 0, activeCod: 0 };
}

/**
 * Throws if taking this COD order would push the rider above the admin's cash limit.
 * `order` needs _id, payment.method and pricing.total. Non-COD orders are always fine.
 */
export async function assertRiderCanTakeCod(partnerId, order) {
  if (String(order?.payment?.method || '').toLowerCase() !== 'cash') return;
  const limit = await getCashLimit();
  if (limit <= 0) return;
  const pos = await getRiderCashPosition(partnerId, { excludeOrderId: order._id });
  const orderCash = Math.max(0, Number(order?.pricing?.total) || 0);
  const projected = round2(pos.cashInHand + pos.activeCod + orderCash);
  if (projected > limit) {
    throw new ValidationError(
      `Cash limit reached. You hold ₹${pos.cashInHand} and have ₹${pos.activeCod} of COD orders on the way; this order is ₹${orderCash} and your limit is ₹${limit}. Deposit your cash first.`,
    );
  }
}
