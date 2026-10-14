import mongoose from 'mongoose';
import FranchiseApplication from '../models/franchiseApplication.model.js';
import FranchiseLedger from '../models/franchiseLedger.model.js';
import { normalizeModules, roundMoney } from './franchisePlan.js';
import { resolveRates } from './commissionRules.service.js';
import {
    toPaise, fromPaise, applyBps, proportion, rowPaise, bpsToPercent, MoneyError,
} from './franchiseMoney.js';
import { withTransaction, opts } from './franchiseTx.js';

/**
 * FRANCHISE COMMISSION ENGINE (v2)
 *
 * Business rule: the franchise "earns" what the platform earns on orders / rides in its territory. Of that, the platform
 * keeps a commission % (set by the client, separately for Food and Taxi, see commissionRules.service.js); the rest is
 * payable to the franchise and sits in its wallet.
 *
 * Eligible earning (the commission base) per transaction:
 *   Food order : FoodTransaction.amounts.platformNetProfit = platform fee + restaurant commission - platform-funded discount.
 *                Never the order total: tax, restaurant share, rider payout, delivery fee, tip and surge are excluded.
 *   Taxi ride  : ride.commissionAmount = the platform's commission from the driver (surge already excluded).
 *   Bus / pooling / rental : the platform's earning on the booking (see franchiseTaxi.service.js).
 * Only completed, payment-verified transactions are posted; refunds post proportional reversals.
 *
 * Every event posts its rows in ONE transaction together with the wallet update, and the unique
 * (franchiseId, type, refId) index makes retries and duplicate hooks harmless.
 * Old (v1) rows stay untouched; an order or ride that was already credited by v1 is never posted again by v2.
 */

/** Wallet = sum of 'wallet' account rows (legacy rows have no account field). */
const WALLET_ROW = { $or: [{ account: 'wallet' }, { account: { $exists: false } }, { account: null }] };

const walletPipeline = (deltaPaise) => [
    {
        $set: {
            walletBalancePaise: {
                $add: [
                    { $ifNull: ['$walletBalancePaise', { $round: [{ $multiply: [{ $ifNull: ['$walletBalance', 0] }, 100] }, 0] }] },
                    deltaPaise,
                ],
            },
            ledgerSeq: { $add: [{ $ifNull: ['$ledgerSeq', 0] }, 1] },
        },
    },
    { $set: { walletBalance: { $divide: ['$walletBalancePaise', 100] } } },
];

/**
 * Post rows atomically. `build(session)` runs INSIDE the transaction so any "how much is still un-reversed" read is
 * re-done if the transaction is retried. Bumping ledgerSeq on the franchise makes two concurrent postings for the same
 * franchise conflict, so one of them re-runs on fresh data instead of both acting on stale numbers.
 * `requireWalletAtLeast` (paise) makes the wallet update conditional (payouts / debits never go negative).
 * Returns the inserted rows, or null if there was nothing to post / it was already posted.
 */
/** Insert rows + move the wallet inside an existing session (for callers that combine it with other writes). */
export async function postRowsInSession(session, franchiseId, rows, { requireWalletAtLeast = null } = {}) {
    const inserted = await FranchiseLedger.insertMany(rows, { ...opts(session), ordered: true });
    const delta = rows.filter((r) => (r.account || 'wallet') === 'wallet').reduce((s, r) => s + r.amountPaise, 0);
    const filter = { _id: franchiseId };
    if (requireWalletAtLeast !== null) {
        filter.$expr = {
            $gte: [
                { $ifNull: ['$walletBalancePaise', { $round: [{ $multiply: [{ $ifNull: ['$walletBalance', 0] }, 100] }, 0] }] },
                requireWalletAtLeast,
            ],
        };
    }
    const res = await FranchiseApplication.updateOne(filter, walletPipeline(delta), opts(session));
    if (res.matchedCount === 0) {
        throw new MoneyError(requireWalletAtLeast !== null ? 'Insufficient wallet balance' : 'Franchise not found', requireWalletAtLeast !== null ? 400 : 404);
    }
    return inserted.map((d) => (d.toObject ? d.toObject() : d));
}

export async function postAtomic(franchiseId, build, { requireWalletAtLeast = null } = {}) {
    try {
        return await withTransaction(async (session) => {
            const rows = (await build(session)) || [];
            if (!rows.length) return null;
            return postRowsInSession(session, franchiseId, rows, { requireWalletAtLeast });
        });
    } catch (err) {
        if (err?.code === 11000) return null; // already posted (idempotent retry / duplicate hook)
        throw err;
    }
}

const holds = (app, service) => normalizeModules(app?.selectedModules).includes(service);

/**
 * Post the earning of one transaction and the platform commission on it.
 * `app` needs _id, selectedModules, territoryId.
 */
async function postEarning({ app, service, refType, refId, basePaise, eventAt, note }) {
    if (!app?._id || !holds(app, service)) return null;           // service not held -> no rows at all
    if (!Number.isSafeInteger(basePaise) || basePaise <= 0) return null;
    const sourceId = String(refId);

    // Already credited by the old engine: never count the same order/ride twice
    if (await FranchiseLedger.exists({ franchiseId: app._id, type: 'credit', refId: sourceId })) return null;

    const at = eventAt ? new Date(eventAt) : new Date();
    const rates = await resolveRates(app, at);
    const r = rates[service];
    const commissionPaise = r.enabled ? applyBps(basePaise, r.rateBps) : 0;
    const common = {
        franchiseId: app._id, module: service, account: 'wallet', refType, sourceId, eventAt: at, engineVersion: 2,
        ruleId: rates.ruleId, ruleVersion: rates.version, ruleScope: rates.scope,
        rateBps: r.rateBps, rate: bpsToPercent(r.rateBps), basePaise, base: fromPaise(basePaise),
    };

    return postAtomic(app._id, async () => {
        const rows = [{ ...common, type: 'earning', refId: sourceId, amountPaise: basePaise, amount: fromPaise(basePaise), note }];
        if (commissionPaise > 0) {
            rows.push({
                ...common, type: 'platform_commission', refId: sourceId, amountPaise: -commissionPaise, amount: -fromPaise(commissionPaise),
                note: `Platform commission ${bpsToPercent(r.rateBps)}% - ${note}`,
            });
        }
        return rows;
    });
}

/**
 * Reverse (part of) the earning of one transaction after a refund.
 *  refundPaise / totalPaise = share refunded (>= total means full). `refundKey` makes each refund idempotent.
 * Cumulative reversals never exceed what was originally posted.
 */
async function reverseSource({ refType, sourceId, refundPaise = null, totalPaise = null, refundKey = 'refund', note }) {
    const sid = String(sourceId);
    const full = refundPaise === null || totalPaise === null || refundPaise >= totalPaise;

    const earning = await FranchiseLedger.findOne({ type: 'earning', refType, sourceId: sid }).lean();
    if (!earning) {
        // Legacy v1 credit: one reversal per order/ride, proportional if partial
        const credit = await FranchiseLedger.findOne({ type: 'credit', refType, refId: sid }).lean();
        if (!credit) return null;
        const creditPaise = rowPaise(credit);
        const amt = full ? creditPaise : proportion(creditPaise, refundPaise, totalPaise);
        if (amt <= 0) return null;
        return postAtomic(credit.franchiseId, async () => [{
            franchiseId: credit.franchiseId, module: credit.module, account: 'wallet', type: 'reversal',
            amountPaise: -amt, amount: -fromPaise(amt), base: credit.base, rate: credit.rate,
            refType, refId: sid, sourceId: sid, engineVersion: 1, note: note || 'Refunded / cancelled',
        }]);
    }

    const fid = earning.franchiseId;
    const refId = `${sid}:${refundKey}`;
    return postAtomic(fid, async (session) => {
        const rows = await FranchiseLedger.find({ franchiseId: fid, refType, sourceId: sid }).session(session || null).lean();
        const sum = (type) => rows.filter((x) => x.type === type).reduce((s, x) => s + rowPaise(x), 0);
        const earnPaise = sum('earning');
        const commPaise = -sum('platform_commission');
        const earnLeft = earnPaise + sum('earning_reversal');       // reversal rows are negative
        const commLeft = commPaise - sum('commission_reversal');    // commission reversal rows are positive
        const earnRev = Math.min(earnLeft, full ? earnLeft : proportion(earnPaise, refundPaise, totalPaise));
        const commRev = Math.min(commLeft, full ? commLeft : proportion(commPaise, refundPaise, totalPaise));
        const commission = rows.find((x) => x.type === 'platform_commission') || earning;
        const common = {
            franchiseId: fid, module: earning.module, account: 'wallet', refType, refId, sourceId: sid, engineVersion: 2,
            eventAt: new Date(), ruleId: earning.ruleId, ruleVersion: earning.ruleVersion, ruleScope: earning.ruleScope,
            rateBps: commission.rateBps, rate: commission.rate, basePaise: earning.basePaise, base: earning.base,
        };
        const out = [];
        if (earnRev > 0) out.push({ ...common, type: 'earning_reversal', amountPaise: -earnRev, amount: -fromPaise(earnRev), note: note || 'Refund' });
        if (commRev > 0) out.push({ ...common, type: 'commission_reversal', amountPaise: commRev, amount: fromPaise(commRev), note: `Commission returned - ${note || 'Refund'}` });
        return out;
    });
}

/* ------------------------------- FOOD ------------------------------- */

/**
 * Eligible Food earning of an order, in paise. Source of truth: the order's FoodTransaction split
 * (platformNetProfit). Orders without a transaction fall back to platform fee + restaurant commission.
 */
export async function foodEarningPaise(order) {
    const FoodTransaction = mongoose.models.FoodTransaction;
    const tx = FoodTransaction
        ? await FoodTransaction.findOne({ orderId: order._id }).select('amounts.platformNetProfit status').lean()
        : null;
    if (tx && Number.isFinite(Number(tx.amounts?.platformNetProfit))) return { paise: toPaise(tx.amounts.platformNetProfit), tx };
    return { paise: toPaise((Number(order?.pricing?.restaurantCommission) || 0) + (Number(order?.pricing?.platformFee) || 0)), tx };
}

/** Kept for callers that show the base in rupees. */
export const foodCommissionBase = (order) =>
    roundMoney((Number(order?.pricing?.restaurantCommission) || 0) + (Number(order?.pricing?.platformFee) || 0));

const FAILED_PAYMENT = new Set(['failed', 'refunded']);

/** Post the earning + platform commission of a delivered, paid food order. Safe to call any number of times. */
export async function creditFoodOrder(order) {
    if (!order?.franchiseId || !order?._id) return null;
    if (String(order.orderStatus) !== 'delivered') return null;
    const payStatus = String(order.payment?.status || '').toLowerCase();
    if (FAILED_PAYMENT.has(payStatus)) return null;

    const app = await FranchiseApplication.findById(order.franchiseId).select('selectedModules territoryId status').lean();
    if (!app || app.status !== 'approved') return null;

    const { paise, tx } = await foodEarningPaise(order);
    // Verified money only: online orders must be paid/captured; cash is captured by the rider at delivery
    const method = String(order.payment?.method || 'cash').toLowerCase();
    const captured = tx?.status === 'captured' || payStatus === 'paid' || method === 'cash';
    if (!captured) return null;

    const deliveredAt = order.deliveryState?.deliveredAt || order.updatedAt || new Date();
    return postEarning({
        app, service: 'food', refType: 'order', refId: order._id, basePaise: paise, eventAt: deliveredAt,
        note: `Order ${order.order_id || order._id}`,
    });
}

/**
 * Take back an order's earning after a refund.
 * Without amounts = full reversal (cancel after delivery / full refund). With amounts = proportional.
 */
export async function reverseFoodOrder(orderId, { refundAmount = null, orderTotal = null, refundKey = 'refund', note } = {}) {
    return reverseSource({
        refType: 'order', sourceId: orderId,
        refundPaise: refundAmount === null ? null : toPaise(refundAmount),
        totalPaise: orderTotal === null ? null : toPaise(orderTotal),
        refundKey, note: note || 'Order refunded',
    });
}

/* ------------------------------- TAXI ------------------------------- */

async function taxiApp(franchiseId) {
    if (!franchiseId) return null;
    return FranchiseApplication.findById(franchiseId).select('selectedModules territoryId status').lean();
}

/** Post earning + platform commission for a completed, settled taxi ride. `base` = eligible earning in rupees. */
export async function creditTaxiRide({ franchiseId, rideId, base, at = null }) {
    const app = await taxiApp(franchiseId);
    return postEarning({ app, service: 'taxi', refType: 'ride', refId: rideId, basePaise: toPaise(base), eventAt: at, note: `Ride ${rideId}` });
}

const BOOKING_NOTE = { bus: 'Bus booking', pooling: 'Pooling booking', rental: 'Rental booking' };

/** Bus / pooling / rental booking. `base` = the platform's earning on it in rupees. */
export async function creditBooking({ franchiseId, kind, bookingId, base, at = null }) {
    if (!BOOKING_NOTE[kind]) return null;
    const app = await taxiApp(franchiseId);
    return postEarning({ app, service: 'taxi', refType: kind, refId: bookingId, basePaise: toPaise(base), eventAt: at, note: `${BOOKING_NOTE[kind]} ${bookingId}` });
}

export const creditBusBooking = ({ franchiseId, bookingId, base, at }) =>
    creditBooking({ franchiseId, kind: 'bus', bookingId, base, at });

/** Reverse a ride's earning (full by default, proportional for a partial refund). Idempotent per refundKey. */
export async function reverseTaxiRide(rideId, { refundAmount = null, fare = null, refundKey = 'refund' } = {}) {
    return reverseSource({
        refType: 'ride', sourceId: rideId,
        refundPaise: refundAmount === null ? null : toPaise(refundAmount),
        totalPaise: fare === null ? null : toPaise(fare),
        refundKey, note: 'Ride refunded',
    });
}

/**
 * The franchise paid a customer's refund out of its own pocket and the admin approved its claim: pay the money back into
 * the franchise wallet. Idempotent per claim (a second approval of the same claim posts nothing).
 */
export async function reimburseFranchiseRefund(franchiseId, claimId, amount, { orderId = null, actorId = null } = {}) {
    const paise = toPaise(amount);
    if (paise <= 0) throw new MoneyError('Invalid reimbursement amount');
    return postAtomic(franchiseId, async () => [{
        franchiseId, module: 'food', account: 'wallet', type: 'refund_reimbursement', amountPaise: paise, amount: fromPaise(paise),
        refType: 'manual', refId: `refund-claim:${claimId}`, sourceId: orderId ? String(orderId) : '', engineVersion: 2, createdBy: actorId,
        note: `Refund paid to a customer by the franchise${orderId ? ` (order ${orderId})` : ''} - reimbursed`,
    }]);
}

/* ----------------------------- PAYOUTS ------------------------------ */

/** Debit the wallet when a payout is approved. Idempotent per request; never lets the wallet go negative. */
export async function debitPayout(franchiseId, requestId, amount, { reference = '', actorId = null } = {}) {
    const paise = toPaise(amount);
    if (paise <= 0) throw new MoneyError('Invalid payout amount');
    return postAtomic(franchiseId, async () => [{
        franchiseId, module: null, account: 'wallet', type: 'payout', amountPaise: -paise, amount: -fromPaise(paise),
        refType: 'payout', refId: String(requestId), sourceId: String(requestId), engineVersion: 2, createdBy: actorId,
        note: `Payout ${requestId}${reference ? ` (ref ${reference})` : ''}`,
    }], { requireWalletAtLeast: paise });
}

/** Wallet minus money already promised to pending payout requests (paise-exact, returned in rupees). */
export function availableBalance(app) {
    const pending = (app.payoutRequests || [])
        .filter((p) => p.status === 'pending')
        .reduce((s, p) => s + toPaise(p.amount), 0);
    const wallet = Number.isFinite(app.walletBalancePaise) ? app.walletBalancePaise : toPaise(app.walletBalance);
    return fromPaise(wallet - pending);
}

/** Sum of the wallet rows of a franchise, in paise. */
export async function ledgerWalletPaise(franchiseId) {
    const rows = await FranchiseLedger.find({ franchiseId, ...WALLET_ROW }).select('amount amountPaise').lean();
    return rows.reduce((s, r) => s + rowPaise(r), 0);
}

/** Rebuild walletBalance from the ledger (use if the two ever drift). */
export async function reconcileWallet(franchiseId) {
    const total = await ledgerWalletPaise(franchiseId);
    await FranchiseApplication.updateOne({ _id: franchiseId }, { $set: { walletBalancePaise: total, walletBalance: fromPaise(total) } });
    return fromPaise(total);
}

export async function getLedger(franchiseId, { limit = 50 } = {}) {
    return FranchiseLedger.find({ franchiseId }).sort({ createdAt: -1 }).limit(limit).lean();
}

/**
 * Which franchise owns this zone for `module`? (approved, fee settled, holds the module, not archived / terminated)
 * Used to stamp franchiseId on restaurants' orders that were not created by a franchise user.
 */
export async function findFranchiseForZone(zoneId, module = 'food') {
    if (!zoneId || !mongoose.Types.ObjectId.isValid(String(zoneId))) return null;
    const app = await FranchiseApplication.findOne({
        zoneId,
        status: 'approved',
        franchiseFeeStatus: { $in: ['paid', 'waived'] },
        selectedModules: module,
        archived: { $ne: true },
        accountStatus: { $ne: 'terminated' },
    }).sort({ createdAt: 1 }).select('_id').lean();
    return app?._id || null;
}
