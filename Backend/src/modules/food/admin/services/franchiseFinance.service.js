import mongoose from 'mongoose';
import FranchiseApplication from '../models/franchiseApplication.model.js';
import FranchiseLedger from '../models/franchiseLedger.model.js';
import FranchiseCharge from '../models/franchiseCharge.model.js';
import FranchiseTerritory from '../models/franchiseTerritory.model.js';
import FranchiseCommissionRule from '../models/franchiseCommissionRule.model.js';
import { normalizeModules } from './franchisePlan.js';
import { resolveRates, ratesToDto, effectiveRatesFor } from './commissionRules.service.js';
import { ensureLegacyCharges, chargeToDto } from './franchiseCharges.service.js';
import {
    creditFoodOrder, reverseFoodOrder, reconcileWallet, ledgerWalletPaise,
} from './franchiseLedger.service.js';
import { MoneyError, fromPaise, toPaise, rowPaise, parseDayRange, FINANCE_TZ, bpsToPercent } from './franchiseMoney.js';
import { writeAudit } from './franchiseAudit.service.js';

/**
 * FINANCE READ MODELS for the admin dashboard and the partner's own view.
 * Every number comes from ledger rows (never from the frontend, never from a recalculation of live rates).
 * Days are calendar days in IST, by the time the business event happened (delivery / ride completion / refund).
 */

const EARN_TYPES = ['earning', 'platform_commission', 'earning_reversal', 'commission_reversal'];
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const { outstandingOf, heldOf } = FranchiseCharge;

const emptyDay = (date) => ({
    date,
    foodEarning: 0, foodCommission: 0, foodCount: 0,
    taxiEarning: 0, taxiCommission: 0, taxiCount: 0,
    refunds: 0,
});

/** Group v2 earning rows into { [key]: { [day]: {...paise} } } */
async function aggregateEarnings(match, { start, end }, groupKey = null) {
    const rows = await FranchiseLedger.aggregate([
        { $match: { ...match, engineVersion: 2, type: { $in: EARN_TYPES } } },
        { $addFields: { at: { $ifNull: ['$eventAt', '$createdAt'] }, paise: { $ifNull: ['$amountPaise', { $round: [{ $multiply: ['$amount', 100] }, 0] }] } } },
        { $match: { at: { $gte: start, $lte: end } } },
        {
            $group: {
                _id: {
                    key: groupKey ? `$${groupKey}` : null,
                    day: { $dateToString: { format: '%Y-%m-%d', date: '$at', timezone: FINANCE_TZ } },
                    module: '$module',
                    type: '$type',
                },
                paise: { $sum: '$paise' },
                count: { $sum: 1 },
            },
        },
    ]);
    const out = new Map();
    rows.forEach(({ _id, paise, count }) => {
        const k = String(_id.key);
        if (!out.has(k)) out.set(k, new Map());
        const days = out.get(k);
        if (!days.has(_id.day)) days.set(_id.day, emptyDay(_id.day));
        const d = days.get(_id.day);
        const svc = _id.module === 'taxi' ? 'taxi' : 'food';
        if (_id.type === 'earning') { d[`${svc}Earning`] += paise; d[`${svc}Count`] += count; }
        if (_id.type === 'earning_reversal') { d[`${svc}Earning`] += paise; d.refunds += -paise; }
        if (_id.type === 'platform_commission') d[`${svc}Commission`] += -paise;
        if (_id.type === 'commission_reversal') d[`${svc}Commission`] -= paise;
    });
    return out;
}

/** Paise day row -> rupee DTO with totals. */
function dayDto(d) {
    const totalEarning = d.foodEarning + d.taxiEarning;
    const totalCommission = d.foodCommission + d.taxiCommission;
    return {
        date: d.date,
        foodEarning: fromPaise(d.foodEarning),
        foodCommission: fromPaise(d.foodCommission),
        foodCount: d.foodCount,
        taxiEarning: fromPaise(d.taxiEarning),
        taxiCommission: fromPaise(d.taxiCommission),
        taxiCount: d.taxiCount,
        totalEarning: fromPaise(totalEarning),
        totalCommission: fromPaise(totalCommission),
        franchiseNet: fromPaise(totalEarning - totalCommission),
        refunds: fromPaise(d.refunds),
        // effective % actually applied (from the rows, so it is right even if the rate changed mid-day)
        foodRateApplied: d.foodEarning > 0 ? Math.round((d.foodCommission / d.foodEarning) * 10000) / 100 : null,
        taxiRateApplied: d.taxiEarning > 0 ? Math.round((d.taxiCommission / d.taxiEarning) * 10000) / 100 : null,
    };
}

function sumDays(days) {
    const t = emptyDay('total');
    days.forEach((d) => {
        ['foodEarning', 'foodCommission', 'foodCount', 'taxiEarning', 'taxiCommission', 'taxiCount', 'refunds'].forEach((k) => { t[k] += d[k]; });
    });
    return t;
}

/** Lifetime wallet figures of one franchise (paise). */
async function walletFigures(app) {
    const [agg] = await FranchiseLedger.aggregate([
        { $match: { franchiseId: app._id } },
        { $addFields: { paise: { $ifNull: ['$amountPaise', { $round: [{ $multiply: ['$amount', 100] }, 0] }] } } },
        {
            $group: {
                _id: null,
                credited: { $sum: { $cond: [{ $in: ['$type', [...EARN_TYPES, 'credit', 'reversal']] }, '$paise', 0] } },
                legacy: { $sum: { $cond: [{ $in: ['$type', ['credit', 'reversal']] }, '$paise', 0] } },
                paidOut: { $sum: { $cond: [{ $eq: ['$type', 'payout'] }, { $multiply: ['$paise', -1] }, 0] } },
                adjustments: { $sum: { $cond: [{ $eq: ['$type', 'adjustment'] }, '$paise', 0] } },
                commission: { $sum: { $cond: [{ $in: ['$type', ['platform_commission', 'commission_reversal']] }, { $multiply: ['$paise', -1] }, 0] } },
                earnings: { $sum: { $cond: [{ $in: ['$type', ['earning', 'earning_reversal']] }, '$paise', 0] } },
            },
        },
    ]);
    const pending = (app.payoutRequests || []).filter((p) => p.status === 'pending');
    const pendingPaise = pending.reduce((s, p) => s + toPaise(p.amount), 0);
    const balance = Number.isFinite(app.walletBalancePaise) ? app.walletBalancePaise : toPaise(app.walletBalance);
    return {
        balance: fromPaise(balance),
        lifetimeEarnings: fromPaise(agg?.earnings || 0),
        lifetimeCommission: fromPaise(agg?.commission || 0),
        creditedNet: fromPaise(agg?.credited || 0),
        legacyCredits: fromPaise(agg?.legacy || 0),
        paidOut: fromPaise(agg?.paidOut || 0),
        adjustments: fromPaise(agg?.adjustments || 0),
        pendingPayoutCount: pending.length,
        pendingPayoutAmount: fromPaise(pendingPaise),
        available: fromPaise(balance - pendingPaise),
    };
}

function chargeSummary(charges) {
    const joining = charges.find((c) => c.kind === 'joining_fee');
    const deposit = charges.find((c) => c.kind === 'security_deposit');
    const outstanding = charges.reduce((s, c) => s + outstandingOf(c), 0);
    return {
        joiningFee: joining ? { expected: fromPaise(joining.expectedPaise), paid: fromPaise(joining.paidPaise), outstanding: fromPaise(outstandingOf(joining)), status: joining.status } : null,
        deposit: deposit ? {
            expected: fromPaise(deposit.expectedPaise), received: fromPaise(deposit.paidPaise), held: fromPaise(heldOf(deposit)),
            refunded: fromPaise(deposit.refundedPaise), deducted: fromPaise(deposit.deductedPaise), outstanding: fromPaise(outstandingOf(deposit)), status: deposit.status,
        } : null,
        outstanding: fromPaise(outstanding),
        hasDues: outstanding > 0,
    };
}

/**
 * Everything about one franchise's money for the date range.
 * `forPartner` hides admin-only details (audit refs, rule ids).
 */
export async function getFranchiseFinance(franchiseId, query = {}, { forPartner = false } = {}) {
    if (!mongoose.Types.ObjectId.isValid(String(franchiseId))) throw new MoneyError('Invalid franchise id');
    const app = await FranchiseApplication.findById(franchiseId)
        .select('applicantName companyName applicationId selectedModules territoryId zoneId taxiZoneId status accountStatus archived walletBalance walletBalancePaise payoutRequests payoutCycle minPayoutThreshold franchiseFee franchiseFeeStatus franchiseFeePaidAt franchiseFeePaymentDetails updatedAt')
        .lean();
    if (!app) throw new MoneyError('Franchise not found', 404);
    const range = parseDayRange(query);

    const [byKey, legacyRange, charges, territory, rates] = await Promise.all([
        aggregateEarnings({ franchiseId: app._id }, range),
        FranchiseLedger.aggregate([
            { $match: { franchiseId: app._id, type: { $in: ['credit', 'reversal'] }, createdAt: { $gte: range.start, $lte: range.end } } },
            { $group: { _id: null, paise: { $sum: { $ifNull: ['$amountPaise', { $round: [{ $multiply: ['$amount', 100] }, 0] }] } } } },
        ]),
        ensureLegacyCharges(app),
        app.territoryId ? FranchiseTerritory.findById(app.territoryId).select('name code city').lean() : null,
        forPartner ? resolveRates(app).then(ratesToDto) : effectiveRatesFor(app._id),
    ]);
    const days = [...(byKey.get('null')?.values() || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
    const totals = dayDto(sumDays(days));
    delete totals.date;

    const payouts = [...(app.payoutRequests || [])]
        .sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt))
        .slice(0, 50)
        .map((p) => ({
            requestId: p.requestId, amount: p.amount, status: p.status, payoutMethod: p.payoutMethod,
            requestedAt: p.requestedAt, processedAt: p.processedAt, transactionId: p.transactionId, adminNote: p.adminNote,
        }));

    const result = {
        franchise: {
            id: app._id,
            applicationId: app.applicationId,
            name: app.applicantName,
            companyName: app.companyName || '',
            services: normalizeModules(app.selectedModules),
            territory: territory ? { id: territory._id, name: territory.name, code: territory.code, city: territory.city } : null,
            status: app.status,
            accountStatus: app.accountStatus || 'active',
            archived: Boolean(app.archived),
            payoutCycle: app.payoutCycle,
            minPayoutThreshold: app.minPayoutThreshold,
        },
        range: { from: range.from, to: range.to },
        rates,
        daily: days.map(dayDto),
        totals,
        legacyCreditsInRange: fromPaise(legacyRange[0]?.paise || 0),
        wallet: await walletFigures(app),
        charges: charges.map(chargeToDto),
        dues: chargeSummary(charges),
        payouts,
    };
    if (forPartner) {
        result.charges = result.charges.map((c) => ({ ...c, payments: c.payments.map(({ confirmedByName, ...p }) => p) }));
        delete result.rates.ruleId;
    }
    return result;
}

const TYPE_LABEL = {
    earning: 'Earning', platform_commission: 'Platform commission', earning_reversal: 'Earning reversed (refund)',
    commission_reversal: 'Commission returned (refund)', payout: 'Payout', adjustment: 'Adjustment',
    credit: 'Credit (old system)', reversal: 'Reversal (old system)', fee_payment: 'Joining fee received',
    deposit_received: 'Deposit received', deposit_refund: 'Deposit refunded', deposit_deduction: 'Deposit deducted',
};

/** Transaction-level drill-down for the finance tab (paged). */
export async function getFinanceEntries(franchiseId, query = {}) {
    if (!mongoose.Types.ObjectId.isValid(String(franchiseId))) throw new MoneyError('Invalid franchise id');
    const range = parseDayRange(query, { defaultDays: 30 });
    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(query.limit, 10) || 25));
    const match = { franchiseId: oid(franchiseId), createdAt: { $gte: range.start, $lte: range.end } };
    if (['food', 'taxi'].includes(query.service)) match.module = query.service;
    const groups = {
        earnings: EARN_TYPES,
        payouts: ['payout', 'adjustment'],
        fees: ['fee_payment', 'deposit_received', 'deposit_refund', 'deposit_deduction'],
        legacy: ['credit', 'reversal'],
    };
    if (groups[query.group]) match.type = { $in: groups[query.group] };

    const [rows, total] = await Promise.all([
        FranchiseLedger.find(match).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
        FranchiseLedger.countDocuments(match),
    ]);
    return {
        items: rows.map((r) => ({
            id: r._id,
            at: r.createdAt,
            eventAt: r.eventAt || r.createdAt,
            type: r.type,
            typeLabel: TYPE_LABEL[r.type] || r.type,
            account: r.account || 'wallet',
            service: r.module,
            refType: r.refType,
            sourceId: r.sourceId || r.refId,
            base: Number.isFinite(r.basePaise) ? fromPaise(r.basePaise) : r.base || 0,
            rate: Number.isFinite(r.rateBps) ? bpsToPercent(r.rateBps) : r.rate || 0,
            ruleVersion: r.ruleVersion,
            ruleScope: r.ruleScope || '',
            amount: fromPaise(rowPaise(r)),
            note: r.note,
        })),
        total, page, limit,
        range: { from: range.from, to: range.to },
    };
}

/**
 * All franchises with their numbers for the range (admin finance dashboard).
 * Filters: territoryId, franchiseId, service (food|taxi), status (active|suspended|terminated|dues|clear), search.
 */
export async function getFinanceSummary(query = {}) {
    const range = parseDayRange(query);
    const filter = { status: 'approved' };
    if (query.archived !== 'true') filter.archived = { $ne: true };
    if (query.territoryId && mongoose.Types.ObjectId.isValid(String(query.territoryId))) filter.territoryId = oid(query.territoryId);
    if (query.franchiseId && mongoose.Types.ObjectId.isValid(String(query.franchiseId))) filter._id = oid(query.franchiseId);
    if (['food', 'taxi'].includes(query.service)) filter.selectedModules = query.service;
    if (['active', 'suspended', 'terminated'].includes(query.status)) filter.accountStatus = query.status === 'active' ? { $in: ['active', null] } : query.status;
    if (query.search) {
        const re = new RegExp(String(query.search).slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        filter.$or = [{ applicantName: re }, { companyName: re }, { applicationId: re }, { city: re }];
    }

    const apps = await FranchiseApplication.find(filter)
        .select('applicantName companyName applicationId city selectedModules territoryId accountStatus archived walletBalance walletBalancePaise payoutRequests franchiseFeeStatus')
        .sort({ applicantName: 1 }).limit(1000).lean();
    const ids = apps.map((a) => a._id);

    const [byFranchise, charges, territories] = await Promise.all([
        aggregateEarnings({ franchiseId: { $in: ids } }, range, 'franchiseId'),
        FranchiseCharge.find({ franchiseId: { $in: ids } }).lean(),
        FranchiseTerritory.find({}).select('name code').lean(),
    ]);
    const chargesBy = new Map();
    charges.forEach((c) => {
        const k = String(c.franchiseId);
        if (!chargesBy.has(k)) chargesBy.set(k, []);
        chargesBy.get(k).push(c);
    });
    const territoryName = new Map(territories.map((t) => [String(t._id), t.name]));

    let rows = apps.map((a) => {
        const days = [...(byFranchise.get(String(a._id))?.values() || [])];
        const t = dayDto(sumDays(days));
        const dues = chargeSummary(chargesBy.get(String(a._id)) || []);
        const pending = (a.payoutRequests || []).filter((p) => p.status === 'pending');
        const balance = Number.isFinite(a.walletBalancePaise) ? a.walletBalancePaise : toPaise(a.walletBalance);
        return {
            id: a._id,
            applicationId: a.applicationId,
            name: a.applicantName,
            companyName: a.companyName || '',
            city: a.city || '',
            territory: a.territoryId ? { id: a.territoryId, name: territoryName.get(String(a.territoryId)) || '-' } : null,
            services: normalizeModules(a.selectedModules),
            accountStatus: a.accountStatus || 'active',
            foodEarning: t.foodEarning, foodCommission: t.foodCommission, foodRateApplied: t.foodRateApplied,
            taxiEarning: t.taxiEarning, taxiCommission: t.taxiCommission, taxiRateApplied: t.taxiRateApplied,
            totalEarning: t.totalEarning, totalCommission: t.totalCommission, franchiseNet: t.franchiseNet, refunds: t.refunds,
            walletBalance: fromPaise(balance),
            pendingPayoutAmount: fromPaise(pending.reduce((s, p) => s + toPaise(p.amount), 0)),
            joiningFee: dues.joiningFee,
            deposit: dues.deposit,
            outstanding: dues.outstanding,
            hasDues: dues.hasDues || ['pending'].includes(a.franchiseFeeStatus),
        };
    });
    if (query.status === 'dues') rows = rows.filter((r) => r.hasDues);
    if (query.status === 'clear') rows = rows.filter((r) => !r.hasDues);

    const sum = (k) => fromPaise(rows.reduce((s, r) => s + toPaise(r[k]), 0));
    const totals = {
        franchises: rows.length,
        foodEarning: sum('foodEarning'), foodCommission: sum('foodCommission'),
        taxiEarning: sum('taxiEarning'), taxiCommission: sum('taxiCommission'),
        totalEarning: sum('totalEarning'), totalCommission: sum('totalCommission'), franchiseNet: sum('franchiseNet'),
        walletBalance: sum('walletBalance'), pendingPayoutAmount: sum('pendingPayoutAmount'), outstanding: sum('outstanding'),
        depositHeld: fromPaise(rows.reduce((s, r) => s + toPaise(r.deposit?.held || 0), 0)),
    };

    const page = Math.max(1, parseInt(query.page, 10) || 1);
    const limit = Math.min(200, Math.max(1, parseInt(query.limit, 10) || 25));
    const pageRows = rows.slice((page - 1) * limit, page * limit);

    // Current rates only for the visible rows (each needs up to 3 small lookups)
    await Promise.all(pageRows.map(async (r) => {
        const app = apps.find((a) => String(a._id) === String(r.id));
        r.currentRates = ratesToDto(await resolveRates(app));
        delete r.currentRates.ruleId;
    }));

    return { items: pageRows, total: rows.length, page, limit, totals, range: { from: range.from, to: range.to } };
}

/* ---------------------------- RECONCILIATION ---------------------------- */

async function engineStartedAt() {
    const first = await FranchiseCommissionRule.findOne({ scope: 'global', version: 1 }).select('createdAt').lean();
    return first?.createdAt || new Date();
}

/**
 * Compare source transactions, ledger rows and the cached wallet for one franchise.
 * Read-only. `fix` (below) repairs what can be repaired safely and idempotently.
 */
export async function reconcileFranchise(franchiseId) {
    if (!mongoose.Types.ObjectId.isValid(String(franchiseId))) throw new MoneyError('Invalid franchise id');
    const app = await FranchiseApplication.findById(franchiseId).select('walletBalance walletBalancePaise selectedModules applicantName').lean();
    if (!app) throw new MoneyError('Franchise not found', 404);
    const since = await engineStartedAt();
    const FoodOrder = mongoose.models.FoodOrder;

    const ledgerPaise = await ledgerWalletPaise(app._id);
    const cachedPaise = Number.isFinite(app.walletBalancePaise) ? app.walletBalancePaise : toPaise(app.walletBalance);

    let missingFood = [];
    let unreversedRefunds = [];
    if (FoodOrder && normalizeModules(app.selectedModules).includes('food')) {
        const delivered = await FoodOrder.find({ franchiseId: app._id, orderStatus: 'delivered', updatedAt: { $gte: since } })
            .select('_id order_id pricing.total payment.refund payment.status').limit(5000).lean();
        const ids = delivered.map((o) => String(o._id));
        const posted = await FranchiseLedger.find({
            franchiseId: app._id, refType: 'order', $or: [{ sourceId: { $in: ids } }, { refId: { $in: ids } }],
        }).select('sourceId refId type').lean();
        const has = new Set(posted.map((p) => p.sourceId || p.refId));
        const reversed = new Set(posted.filter((p) => ['earning_reversal', 'reversal'].includes(p.type)).map((p) => p.sourceId || p.refId));
        missingFood = delivered.filter((o) => !has.has(String(o._id)) && !['failed', 'refunded'].includes(o.payment?.status)).map((o) => ({ id: o._id, orderId: o.order_id }));
        unreversedRefunds = delivered
            .filter((o) => o.payment?.refund?.status === 'processed' && has.has(String(o._id)) && !reversed.has(String(o._id)))
            .map((o) => ({ id: o._id, orderId: o.order_id, refunded: o.payment.refund.amount, total: o.pricing?.total }));
    }

    const byType = await FranchiseLedger.aggregate([
        { $match: { franchiseId: app._id } },
        { $group: { _id: { type: '$type', account: { $ifNull: ['$account', 'wallet'] } }, paise: { $sum: { $ifNull: ['$amountPaise', { $round: [{ $multiply: ['$amount', 100] }, 0] }] } }, rows: { $sum: 1 } } },
    ]);

    return {
        franchiseId: app._id,
        checkedAt: new Date(),
        engineStartedAt: since,
        wallet: {
            cached: fromPaise(cachedPaise),
            ledger: fromPaise(ledgerPaise),
            drift: fromPaise(cachedPaise - ledgerPaise),
            ok: cachedPaise === ledgerPaise,
        },
        missingFoodEarnings: { count: missingFood.length, sample: missingFood.slice(0, 20) },
        unreversedRefunds: { count: unreversedRefunds.length, sample: unreversedRefunds.slice(0, 20) },
        ledgerByType: byType.map((r) => ({ type: r._id.type, account: r._id.account, amount: fromPaise(r.paise), rows: r.rows })),
        ok: cachedPaise === ledgerPaise && missingFood.length === 0 && unreversedRefunds.length === 0,
    };
}

/** Repair: post missing earnings, post missing refund reversals, then rebuild the wallet cache from the ledger. */
export async function fixReconciliation(franchiseId, actor, reason) {
    const why = String(reason || '').trim();
    if (why.length < 3) throw new MoneyError('A reason is required');
    const before = await reconcileFranchise(franchiseId);
    const FoodOrder = mongoose.models.FoodOrder;
    let posted = 0;
    let reversedCount = 0;
    if (FoodOrder) {
        for (const m of before.missingFoodEarnings.sample.length ? (await FoodOrder.find({ _id: { $in: before.missingFoodEarnings.sample.map((x) => x.id) } }).lean()) : []) {
            if (await creditFoodOrder(m)) posted += 1;
        }
        for (const r of before.unreversedRefunds.sample) {
            if (await reverseFoodOrder(r.id, { refundAmount: r.refunded, orderTotal: r.total, note: 'Refund reversal (reconciliation)' })) reversedCount += 1;
        }
    }
    const walletAfter = await reconcileWallet(franchiseId);
    const after = await reconcileFranchise(franchiseId);
    await writeAudit({
        actor, franchiseId, entity: 'ledger', entityId: String(franchiseId), action: 'reconcile.fix',
        before: { wallet: before.wallet, missing: before.missingFoodEarnings.count, unreversed: before.unreversedRefunds.count },
        after: { wallet: after.wallet, posted, reversed: reversedCount, walletAfter },
        reason: why,
    });
    return { before, after, posted, reversed: reversedCount };
}
