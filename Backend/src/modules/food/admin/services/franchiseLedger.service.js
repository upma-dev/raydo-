import mongoose from 'mongoose';
import FranchiseApplication from '../models/franchiseApplication.model.js';
import FranchiseLedger from '../models/franchiseLedger.model.js';
import { getCommissionRate, normalizeModules, roundMoney } from './franchisePlan.js';

/**
 * Commission base for food orders = what the PLATFORM earns on the order
 * (restaurant commission + platform fee). The franchise gets `rate %` of that.
 * Change ONLY this function to change the base for every food credit.
 */
export const foodCommissionBase = (order) =>
    roundMoney((Number(order?.pricing?.restaurantCommission) || 0) + (Number(order?.pricing?.platformFee) || 0));

/** Insert one ledger row (idempotent) and move walletBalance by the same amount. Returns the row, or null if it already existed. */
async function postEntry(entry) {
    let row;
    try {
        row = await FranchiseLedger.create(entry);
    } catch (err) {
        if (err?.code === 11000) return null; // already posted
        throw err;
    }
    await FranchiseApplication.updateOne({ _id: entry.franchiseId }, { $inc: { walletBalance: entry.amount } });
    return row;
}

/** Credit the franchise for a delivered food order. Safe to call more than once per order. */
export async function creditFoodOrder(order) {
    if (!order?.franchiseId) return null;
    const app = await FranchiseApplication.findById(order.franchiseId)
        .select('selectedModules moduleCommissions status').lean();
    if (!app || app.status !== 'approved') return null;
    if (!normalizeModules(app.selectedModules).includes('food')) return null;

    const base = foodCommissionBase(order);
    const rate = getCommissionRate(app.selectedModules, app.moduleCommissions, 'food');
    const amount = roundMoney((base * rate) / 100);
    if (amount <= 0) return null;

    return postEntry({
        franchiseId: order.franchiseId, module: 'food', type: 'credit', amount, base, rate,
        refType: 'order', refId: String(order._id), note: `Order ${order.order_id || order._id}`,
    });
}

/** Take back a previously credited order (cancel after delivery / full refund). */
export async function reverseFoodOrder(orderId) {
    const credit = await FranchiseLedger.findOne({ type: 'credit', refType: 'order', refId: String(orderId) }).lean();
    if (!credit) return null;
    return postEntry({
        franchiseId: credit.franchiseId, module: 'food', type: 'reversal', amount: -credit.amount,
        base: credit.base, rate: credit.rate, refType: 'order', refId: String(orderId), note: 'Order refunded / cancelled',
    });
}

/** Credit the franchise for a completed taxi ride. `rate` is the partner's snapshot commission %. */
export async function creditTaxiRide({ franchiseId, rideId, base, rate }) {
    const amount = roundMoney((Number(base) * Number(rate)) / 100);
    if (!franchiseId || amount <= 0) return null;
    return postEntry({
        franchiseId, module: 'taxi', type: 'credit', amount, base: Number(base), rate: Number(rate),
        refType: 'ride', refId: String(rideId), note: `Ride ${rideId}`,
    });
}

const BOOKING_NOTE = { bus: 'Bus booking', pooling: 'Pooling booking', rental: 'Rental booking' };

/** Credit the franchise for a finished bus / pooling / rental booking. `base` = the amount the rate is applied on. */
export async function creditBooking({ franchiseId, kind, bookingId, base, rate }) {
    const amount = roundMoney((Number(base) * Number(rate)) / 100);
    if (!franchiseId || !BOOKING_NOTE[kind] || amount <= 0) return null;
    return postEntry({
        franchiseId, module: 'taxi', type: 'credit', amount, base: Number(base), rate: Number(rate),
        refType: kind, refId: String(bookingId), note: `${BOOKING_NOTE[kind]} ${bookingId}`,
    });
}

export const creditBusBooking = ({ franchiseId, bookingId, base, rate }) =>
    creditBooking({ franchiseId, kind: 'bus', bookingId, base, rate });

/** A fully refunded ride must not keep paying the franchise. Idempotent. */
export async function reverseTaxiRide(rideId) {
    const credit = await FranchiseLedger.findOne({ type: 'credit', refType: 'ride', refId: String(rideId) }).lean();
    if (!credit) return null;
    return postEntry({
        franchiseId: credit.franchiseId, module: 'taxi', type: 'reversal', amount: -credit.amount,
        base: credit.base, rate: credit.rate, refType: 'ride', refId: String(rideId), note: 'Ride refunded',
    });
}

/** Debit the wallet when a payout is approved. Idempotent per payout request. */
export async function debitPayout(franchiseId, requestId, amount) {
    return postEntry({
        franchiseId, module: null, type: 'payout', amount: -roundMoney(amount),
        refType: 'payout', refId: String(requestId), note: `Payout ${requestId}`,
    });
}

/** Wallet minus money already promised to pending payout requests. */
export function availableBalance(app) {
    const pending = (app.payoutRequests || [])
        .filter((p) => p.status === 'pending')
        .reduce((s, p) => s + (Number(p.amount) || 0), 0);
    return roundMoney((Number(app.walletBalance) || 0) - pending);
}

/** Rebuild walletBalance from the ledger (use if the two ever drift). */
export async function reconcileWallet(franchiseId) {
    const [row] = await FranchiseLedger.aggregate([
        { $match: { franchiseId: new mongoose.Types.ObjectId(String(franchiseId)) } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const total = roundMoney(row?.total || 0);
    await FranchiseApplication.updateOne({ _id: franchiseId }, { $set: { walletBalance: total } });
    return total;
}

export async function getLedger(franchiseId, { limit = 50 } = {}) {
    return FranchiseLedger.find({ franchiseId }).sort({ createdAt: -1 }).limit(limit).lean();
}

/**
 * Which franchise owns this zone for `module`? (approved, fee settled, holds the module)
 * Used to stamp franchiseId on restaurants' orders that were not created by a franchise user.
 */
export async function findFranchiseForZone(zoneId, module = 'food') {
    if (!zoneId || !mongoose.Types.ObjectId.isValid(String(zoneId))) return null;
    const app = await FranchiseApplication.findOne({
        zoneId,
        status: 'approved',
        franchiseFeeStatus: { $in: ['paid', 'waived'] },
        selectedModules: module,
    }).select('_id').lean();
    return app?._id || null;
}
