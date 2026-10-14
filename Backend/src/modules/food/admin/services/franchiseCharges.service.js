import mongoose from 'mongoose';
import FranchiseCharge from '../models/franchiseCharge.model.js';
import FranchiseApplication from '../models/franchiseApplication.model.js';
import FranchiseLedger from '../models/franchiseLedger.model.js';
import FranchiseTerritory from '../models/franchiseTerritory.model.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { MoneyError, parseRupeesInput, fromPaise, toPaise } from './franchiseMoney.js';
import { writeAudit } from './franchiseAudit.service.js';
import { withTransaction, opts } from './franchiseTx.js';

/**
 * JOINING FEE + SECURITY DEPOSIT
 *
 * Money is "received" only through:
 *  - a Razorpay payment whose signature the server verified (provider 'razorpay'), or
 *  - a platform super admin confirming a payment with a bank/UPI reference and a note (provider 'manual').
 * A reference can be used once across all franchises. Every change writes an audit row in the same transaction.
 *
 * Deposit rules:
 *  - suspension   : deposit stays held
 *  - termination  : deposit can be refunded (minus explicit deductions with reasons)
 *  - transfer     : refund to the old partner, the new franchise pays its own deposit (never silently carried over)
 *  - refund / deduction is only possible while the franchise is suspended, terminated or archived, so the platform
 *    always holds the deposit of an operating franchise.
 */

const KINDS = ['joining_fee', 'security_deposit'];
const LABEL = { joining_fee: 'Joining fee', security_deposit: 'Security deposit' };
const { outstandingOf, heldOf, statusOf } = FranchiseCharge;

export const chargeToDto = (c) => (c ? {
    id: c._id,
    kind: c.kind,
    label: LABEL[c.kind],
    expected: fromPaise(c.expectedPaise),
    paid: fromPaise(c.paidPaise),
    waived: fromPaise(c.waivedPaise),
    outstanding: fromPaise(outstandingOf(c)),
    refunded: fromPaise(c.refundedPaise),
    deducted: fromPaise(c.deductedPaise),
    held: c.kind === 'security_deposit' ? fromPaise(heldOf(c)) : 0,
    status: c.status,
    overridden: Boolean(c.source?.overridden),
    territoryPrice: c.source?.territoryPaise === null || c.source?.territoryPaise === undefined ? null : fromPaise(c.source.territoryPaise),
    dueDate: c.dueDate,
    settledAt: c.settledAt,
    payments: (c.payments || []).map((p) => ({
        id: p._id, reference: p.reference, amount: fromPaise(p.amountPaise), provider: p.provider, method: p.method,
        paidAt: p.paidAt, note: p.note, confirmedByName: p.confirmedByName, confirmedAt: p.confirmedAt,
    })).sort((a, b) => new Date(b.paidAt) - new Date(a.paidAt)),
    movements: (c.movements || []).map((m) => ({
        id: m._id, kind: m.kind, amount: fromPaise(m.amountPaise), reference: m.reference, reason: m.reason, at: m.at, byName: m.byName,
    })).sort((a, b) => new Date(b.at) - new Date(a.at)),
    updatedAt: c.updatedAt,
} : null);

/** Both charges settled (paid, waived or not required) = the franchise may operate. */
export const chargesSettled = (charges = []) =>
    KINDS.every((k) => {
        const c = charges.find((x) => x.kind === k);
        return !c || ['paid', 'waived', 'not_required'].includes(c.status);
    });

/**
 * Keep the legacy single-fee fields (used by the application flow, login lock and order assignment) in step with the
 * charges, then lock / unlock the franchise login accordingly. Called after every charge change.
 */
export async function syncLegacyFeeFields(franchiseId, { session } = {}) {
    const app = await FranchiseApplication.findById(franchiseId).session(session || null);
    if (!app) return;
    const charges = await FranchiseCharge.find({ franchiseId }).session(session || null).lean();
    if (!charges.length) return;
    const joining = charges.find((c) => c.kind === 'joining_fee');
    const settled = chargesSettled(charges);
    const allWaivedOrFree = charges.every((c) => ['waived', 'not_required'].includes(c.status));

    if (joining) app.franchiseFee = fromPaise(joining.expectedPaise);
    if (!['refund_due', 'refunded'].includes(app.franchiseFeeStatus)) {
        const wasSettled = ['paid', 'waived'].includes(app.franchiseFeeStatus);
        if (settled) {
            if (!wasSettled) app.franchiseFeePaidAt = new Date();
            app.franchiseFeeStatus = allWaivedOrFree ? 'waived' : 'paid';
        } else if (!wasSettled) {
            app.franchiseFeeStatus = 'pending';
        }
        // A franchise that already completed onboarding keeps operating when new dues appear (e.g. the admin raised the
        // deposit): the dues show as outstanding. Stopping a running franchise is an explicit "Suspend", never a side effect.
        const totalPaid = charges.reduce((s, c) => s + (c.paidPaise || 0), 0);
        app.set('franchiseFeePaymentDetails.paidAmount', fromPaise(totalPaid));
    }
    await app.save(opts(session));

    if (app.subAdminId) {
        const canLogin = app.franchiseFeeStatus === 'paid' || app.franchiseFeeStatus === 'waived';
        const operating = canLogin && app.status === 'approved' && (app.accountStatus || 'active') === 'active' && !app.archived;
        await FoodAdmin.updateOne(
            { _id: app.subAdminId },
            { $set: { active: operating, isActive: operating, status: operating ? 'active' : 'inactive' } },
            opts(session),
        );
    }
}

/**
 * Create the two charges of a franchise if missing. Amounts in paise. `territory` (optional) is recorded as the
 * price source so the UI can show "overridden" when the admin typed a different amount.
 */
export async function ensureCharges(franchiseId, { joiningFeePaise, securityDepositPaise, territory = null, dueDate = null, payments = {} }, { session } = {}) {
    const docs = [];
    for (const kind of KINDS) {
        const exists = await FranchiseCharge.exists({ franchiseId, kind }).session(session || null);
        if (exists) continue;
        const expectedPaise = kind === 'joining_fee' ? joiningFeePaise : securityDepositPaise;
        const territoryPaise = territory ? (kind === 'joining_fee' ? territory.joiningFeePaise : territory.securityDepositPaise) : null;
        const pay = payments[kind] || null; // legacy migration only
        const doc = {
            franchiseId, kind, expectedPaise,
            paidPaise: pay ? pay.amountPaise : 0,
            payments: pay ? [pay] : [],
            source: { territoryId: territory?._id || null, territoryPaise, overridden: territoryPaise !== null && territoryPaise !== expectedPaise },
            dueDate,
        };
        doc.status = statusOf(doc);
        if (['paid', 'not_required'].includes(doc.status) && pay) doc.settledAt = pay.paidAt || new Date();
        docs.push(doc);
    }
    if (docs.length) await FranchiseCharge.insertMany(docs, opts(session));
    return FranchiseCharge.find({ franchiseId }).session(session || null).lean();
}

/**
 * Legacy franchises (created before charges existed): joining fee = the old franchiseFee with its old status,
 * deposit = not required. Nothing changes for them until an admin edits the amounts.
 */
export async function ensureLegacyCharges(app) {
    if (await FranchiseCharge.exists({ franchiseId: app._id })) return FranchiseCharge.find({ franchiseId: app._id }).lean();
    const feePaise = toPaise(app.franchiseFee);
    const payments = {};
    let waived = false;
    if (app.franchiseFeeStatus === 'paid' && feePaise > 0) {
        payments.joining_fee = {
            reference: `LEGACY-${app.applicationId || app._id}`,
            amountPaise: feePaise,
            provider: 'legacy',
            method: app.franchiseFeePaymentDetails?.paymentMethod || '',
            paidAt: app.franchiseFeePaidAt || app.updatedAt || new Date(),
            note: `Recorded as paid before the fee/deposit system. Txn: ${app.franchiseFeePaymentDetails?.transactionId || '-'}`,
        };
    } else if (app.franchiseFeeStatus === 'waived') {
        waived = true;
    }
    try {
        await ensureCharges(app._id, { joiningFeePaise: feePaise, securityDepositPaise: 0, payments });
    } catch (err) {
        if (err?.code !== 11000) throw err;
    }
    if (waived && feePaise > 0) {
        await FranchiseCharge.updateOne(
            { franchiseId: app._id, kind: 'joining_fee', paidPaise: 0 },
            { $set: { waivedPaise: feePaise, status: 'waived', settledAt: app.franchiseFeePaidAt || new Date() },
              $push: { movements: { kind: 'waiver', amountPaise: feePaise, reason: 'Waived before the fee/deposit system', byName: 'system' } } },
        );
    }
    return FranchiseCharge.find({ franchiseId: app._id }).lean();
}

async function mustCharge(chargeId, session) {
    if (!mongoose.Types.ObjectId.isValid(String(chargeId))) throw new MoneyError('Invalid charge id');
    const c = await FranchiseCharge.findById(chargeId).session(session || null).lean();
    if (!c) throw new MoneyError('Charge not found', 404);
    return c;
}

const cleanRef = (ref) => {
    const r = String(ref || '').trim();
    if (r.length < 4 || r.length > 120) throw new MoneyError('Payment reference (UTR / transaction id) must be 4-120 characters');
    if (!/^[\w\-./:#@ ]+$/.test(r)) throw new MoneyError('Payment reference contains invalid characters');
    return r;
};
const cleanReason = (reason, field = 'Reason') => {
    const r = String(reason || '').trim();
    if (r.length < 3) throw new MoneyError(`${field} is required`);
    if (r.length > 500) throw new MoneyError(`${field} is too long`);
    return r;
};

/**
 * Record a payment against a charge (manual confirmation by a platform super admin, or a verified Razorpay payment).
 * Atomic: the update only matches if the reference is new for this charge and the amount fits the outstanding balance.
 */
export async function confirmPayment(chargeId, { amount, reference, method = '', paidAt, note = '', provider = 'manual' }, actor) {
    const amountPaise = parseRupeesInput(amount, { field: 'Amount', allowZero: false });
    const ref = cleanRef(reference);
    const notes = provider === 'manual' ? cleanReason(note, 'Note (how the payment was verified)') : String(note || '').slice(0, 500);
    let when = new Date();
    if (paidAt) {
        when = new Date(paidAt);
        if (Number.isNaN(when.getTime()) || when.getTime() > Date.now() + 5 * 60000) throw new MoneyError('Invalid payment date');
    }
    const cleanMethod = String(method || '').trim().slice(0, 40);

    try {
        return await withTransaction(async (session) => {
            const before = await mustCharge(chargeId, session);
            if ((before.payments || []).some((x) => x.reference === ref)) throw new MoneyError('This payment was already recorded', 409);
            if (before.status === 'waived') throw new MoneyError(`${LABEL[before.kind]} was waived; nothing to pay`);
            if (amountPaise > outstandingOf(before)) {
                throw new MoneyError(`Amount is more than the outstanding ${LABEL[before.kind].toLowerCase()} (₹${fromPaise(outstandingOf(before))})`);
            }
            const res = await FranchiseCharge.updateOne(
                {
                    _id: before._id,
                    'payments.reference': { $ne: ref },
                    $expr: { $lte: [{ $add: ['$paidPaise', '$waivedPaise', amountPaise] }, '$expectedPaise'] },
                },
                {
                    $inc: { paidPaise: amountPaise },
                    $push: { payments: {
                        reference: ref, amountPaise, provider, method: cleanMethod, paidAt: when, note: notes,
                        confirmedBy: actor?.id || null, confirmedByName: actor?.name || actor?.email || (provider === 'razorpay' ? 'Razorpay' : ''),
                        confirmedAt: new Date(),
                    } },
                },
                opts(session),
            );
            if (res.modifiedCount === 0) throw new MoneyError('This payment was already recorded, or the amount exceeds the outstanding balance', 409);

            const after = await FranchiseCharge.findById(before._id).session(session || null);
            after.status = statusOf(after);
            if (['paid', 'waived'].includes(after.status) && !after.settledAt) after.settledAt = new Date();
            await after.save(opts(session));

            const isDeposit = before.kind === 'security_deposit';
            await FranchiseLedger.create([{
                franchiseId: before.franchiseId, module: null,
                account: isDeposit ? 'deposit' : 'fees',
                type: isDeposit ? 'deposit_received' : 'fee_payment',
                amountPaise, amount: fromPaise(amountPaise),
                refType: 'charge', refId: `pay:${ref}`, sourceId: String(before._id), engineVersion: 2,
                createdBy: actor?.id || null,
                note: `${LABEL[before.kind]} received (${provider}${cleanMethod ? `/${cleanMethod}` : ''}) ref ${ref}`,
            }], opts(session));

            await writeAudit({
                actor, franchiseId: before.franchiseId, entity: 'charge', entityId: before._id,
                action: provider === 'manual' ? 'charge.confirm_payment' : `charge.${provider}_payment`,
                before: { paid: fromPaise(before.paidPaise), status: before.status },
                after: { paid: fromPaise(after.paidPaise), status: after.status, reference: ref, amount: fromPaise(amountPaise) },
                reason: notes,
            }, { session });

            await syncLegacyFeeFields(before.franchiseId, { session });
            return chargeToDto(after.toObject());
        });
    } catch (err) {
        if (err?.code === 11000) throw new MoneyError('This payment reference is already recorded (possibly on another franchise)', 409);
        throw err;
    }
}

/** Waive whatever is still outstanding on a charge. */
export async function waiveCharge(chargeId, { reason }, actor) {
    const why = cleanReason(reason);
    return withTransaction(async (session) => {
        const before = await mustCharge(chargeId, session);
        const amountPaise = outstandingOf(before);
        if (amountPaise <= 0) throw new MoneyError('Nothing outstanding to waive');
        const res = await FranchiseCharge.updateOne(
            { _id: before._id, paidPaise: before.paidPaise, waivedPaise: before.waivedPaise },
            { $inc: { waivedPaise: amountPaise }, $push: { movements: { kind: 'waiver', amountPaise, reason: why, by: actor?.id || null, byName: actor?.name || actor?.email || '' } } },
            opts(session),
        );
        if (res.modifiedCount === 0) throw new MoneyError('The charge changed meanwhile, please reload', 409);
        const after = await FranchiseCharge.findById(before._id).session(session || null);
        after.status = statusOf(after);
        after.settledAt = after.settledAt || new Date();
        await after.save(opts(session));
        await writeAudit({
            actor, franchiseId: before.franchiseId, entity: 'charge', entityId: before._id, action: 'charge.waive',
            before: { outstanding: fromPaise(amountPaise), status: before.status }, after: { waived: fromPaise(after.waivedPaise), status: after.status }, reason: why,
        }, { session });
        await syncLegacyFeeFields(before.franchiseId, { session });
        return chargeToDto(after.toObject());
    });
}

/** Change the expected amount (franchise-level override). Never below what was already paid + waived. */
export async function updateExpected(chargeId, { amount, reason }, actor) {
    const expectedPaise = parseRupeesInput(amount, { field: 'Amount' });
    const why = cleanReason(reason);
    return withTransaction(async (session) => {
        const before = await mustCharge(chargeId, session);
        if (expectedPaise === before.expectedPaise) throw new MoneyError('The amount did not change');
        if (expectedPaise < before.paidPaise + before.waivedPaise) {
            throw new MoneyError(`Cannot set below the amount already paid/waived (₹${fromPaise(before.paidPaise + before.waivedPaise)})`);
        }
        const after = await FranchiseCharge.findById(before._id).session(session || null);
        after.expectedPaise = expectedPaise;
        after.source.overridden = after.source?.territoryPaise === null || after.source?.territoryPaise === undefined
            ? true : after.source.territoryPaise !== expectedPaise;
        after.status = statusOf(after);
        after.settledAt = ['paid', 'waived', 'not_required'].includes(after.status) ? (after.settledAt || new Date()) : null;
        await after.save(opts(session));
        await writeAudit({
            actor, franchiseId: before.franchiseId, entity: 'charge', entityId: before._id, action: 'charge.update_amount',
            before: { expected: fromPaise(before.expectedPaise), status: before.status }, after: { expected: fromPaise(expectedPaise), status: after.status }, reason: why,
        }, { session });
        await syncLegacyFeeFields(before.franchiseId, { session });
        return chargeToDto(after.toObject());
    });
}

async function assertDepositReleasable(franchiseId, session) {
    const app = await FranchiseApplication.findById(franchiseId).select('accountStatus archived').session(session || null).lean();
    if (!app) throw new MoneyError('Franchise not found', 404);
    if ((app.accountStatus || 'active') === 'active' && !app.archived) {
        throw new MoneyError('The deposit is held while the franchise is active. Suspend or terminate the franchise first.');
    }
}

/** Return (part of) the held security deposit to the partner, or keep it as a deduction. */
async function moveDeposit(kind, chargeId, { amount, reference = '', reason }, actor) {
    const amountPaise = parseRupeesInput(amount, { field: 'Amount', allowZero: false });
    const why = cleanReason(reason);
    const ref = kind === 'refund' ? cleanRef(reference) : String(reference || '').trim().slice(0, 120);
    try {
        return await withTransaction(async (session) => {
            const before = await mustCharge(chargeId, session);
            if (before.kind !== 'security_deposit') throw new MoneyError('Only the security deposit can be refunded or deducted');
            await assertDepositReleasable(before.franchiseId, session);
            const held = heldOf(before);
            if (amountPaise > held) throw new MoneyError(`Only ₹${fromPaise(held)} of the deposit is held`);
            const field = kind === 'refund' ? 'refundedPaise' : 'deductedPaise';
            const res = await FranchiseCharge.updateOne(
                { _id: before._id, $expr: { $gte: [{ $subtract: ['$paidPaise', { $add: ['$refundedPaise', '$deductedPaise'] }] }, amountPaise] } },
                { $inc: { [field]: amountPaise }, $push: { movements: { kind: kind === 'refund' ? 'refund' : 'deduction', amountPaise, reference: ref, reason: why, by: actor?.id || null, byName: actor?.name || actor?.email || '' } } },
                opts(session),
            );
            if (res.modifiedCount === 0) throw new MoneyError('The deposit changed meanwhile, please reload', 409);
            const after = await FranchiseCharge.findById(before._id).session(session || null).lean();
            await FranchiseLedger.create([{
                franchiseId: before.franchiseId, module: null, account: 'deposit',
                type: kind === 'refund' ? 'deposit_refund' : 'deposit_deduction',
                amountPaise: -amountPaise, amount: -fromPaise(amountPaise),
                refType: 'charge', refId: `${kind}:${before._id}:${(after.movements || []).length}`, sourceId: String(before._id), engineVersion: 2,
                createdBy: actor?.id || null,
                note: `${kind === 'refund' ? 'Deposit refunded' : 'Deposit deducted'}${ref ? ` ref ${ref}` : ''} - ${why}`,
            }], opts(session));
            await writeAudit({
                actor, franchiseId: before.franchiseId, entity: 'charge', entityId: before._id, action: `deposit.${kind}`,
                before: { held: fromPaise(held) }, after: { held: fromPaise(heldOf(after)), amount: fromPaise(amountPaise), reference: ref }, reason: why,
            }, { session });
            return chargeToDto(after);
        });
    } catch (err) {
        if (err?.code === 11000) throw new MoneyError('This deposit movement was already recorded', 409);
        throw err;
    }
}

export const refundDeposit = (chargeId, body, actor) => moveDeposit('refund', chargeId, body, actor);
export const deductDeposit = (chargeId, body, actor) => moveDeposit('deduction', chargeId, body, actor);

export async function listCharges(franchiseId) {
    const app = await FranchiseApplication.findById(franchiseId).lean();
    if (!app) throw new MoneyError('Franchise not found', 404);
    const charges = await ensureLegacyCharges(app);
    return charges.map(chargeToDto).sort((a, b) => KINDS.indexOf(a.kind) - KINDS.indexOf(b.kind));
}

/** Amount still due for onboarding (joining fee + deposit), in paise. Used by the Razorpay onboarding flow. */
export async function onboardingDuePaise(app) {
    const charges = await ensureLegacyCharges(app);
    return charges.reduce((s, c) => s + outstandingOf(c), 0);
}

/**
 * A verified Razorpay onboarding payment: split over the joining fee first, then the deposit.
 * Idempotent per Razorpay payment id (reference uniqueness).
 */
export async function recordRazorpayOnboardingPayment(app, { paymentId, amountPaise }) {
    const charges = await ensureLegacyCharges(app);
    let left = amountPaise;
    for (const kind of KINDS) {
        const c = charges.find((x) => x.kind === kind);
        if (!c || left <= 0) continue;
        const take = Math.min(left, outstandingOf(c));
        if (take <= 0) continue;
        try {
            await confirmPayment(c._id, {
                amount: (take / 100).toFixed(2), reference: `${paymentId}${kind === 'security_deposit' ? '#deposit' : ''}`,
                method: 'razorpay', provider: 'razorpay', note: 'Verified Razorpay checkout payment',
            }, { name: 'Razorpay' });
        } catch (err) {
            if (err?.statusCode !== 409) throw err; // 409 = already recorded (retry)
        }
        left -= take;
    }
}

/** Default price for a franchise from its territory (paise). */
export async function territoryPrice(territoryId) {
    if (!territoryId) return null;
    return FranchiseTerritory.findById(territoryId).lean();
}
