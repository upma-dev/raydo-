import mongoose from 'mongoose';

/**
 * Money a franchise owes the platform outside of daily commission: the one-time joining fee and the refundable
 * security deposit. One document per (franchise, kind).
 *
 *  - expectedPaise  : what the franchise must pay. Snapshot taken at creation from the territory price (or the admin's
 *                     override). Changing territory prices later never touches it.
 *  - paidPaise      : sum of CONFIRMED payments (Razorpay-verified or confirmed by a platform super admin with a reference)
 *  - waivedPaise    : outstanding amount the admin waived (with a reason)
 *  - refundedPaise / deductedPaise : deposit only - money returned to the partner, or kept by the platform (with reason)
 *
 * Joining fee = platform revenue once paid. Security deposit = a liability the platform holds; it is NEVER revenue and
 * never generates commission. It only becomes platform money through an explicit, reasoned deduction.
 */
const paymentSchema = new mongoose.Schema({
    reference: { type: String, required: true, trim: true, maxlength: 120 },
    amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    provider: { type: String, enum: ['razorpay', 'manual', 'legacy'], required: true },
    method: { type: String, trim: true, maxlength: 40, default: '' },
    paidAt: { type: Date, default: Date.now },
    note: { type: String, trim: true, maxlength: 500, default: '' },
    confirmedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    confirmedByName: { type: String, default: '' },
    confirmedAt: { type: Date, default: Date.now },
}, { _id: true });

const movementSchema = new mongoose.Schema({
    kind: { type: String, enum: ['refund', 'deduction', 'waiver'], required: true },
    amountPaise: { type: Number, required: true, min: 1, validate: Number.isSafeInteger },
    reference: { type: String, trim: true, maxlength: 120, default: '' },
    reason: { type: String, trim: true, maxlength: 500, required: true },
    at: { type: Date, default: Date.now },
    by: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    byName: { type: String, default: '' },
}, { _id: true });

const franchiseChargeSchema = new mongoose.Schema({
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseApplication', required: true, index: true },
    kind: { type: String, enum: ['joining_fee', 'security_deposit'], required: true },
    expectedPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    paidPaise: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    waivedPaise: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    refundedPaise: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    deductedPaise: { type: Number, default: 0, min: 0, validate: Number.isSafeInteger },
    status: {
        type: String,
        enum: ['not_required', 'pending', 'partially_paid', 'paid', 'waived'],
        default: 'pending',
        index: true,
    },
    source: {
        territoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseTerritory', default: null },
        territoryPaise: { type: Number, default: null },  // territory price at the time (for "override" display)
        overridden: { type: Boolean, default: false },
    },
    payments: { type: [paymentSchema], default: [] },
    movements: { type: [movementSchema], default: [] },
    dueDate: { type: Date, default: null },
    settledAt: { type: Date, default: null },
}, { collection: 'franchise_charges', timestamps: true });

franchiseChargeSchema.index({ franchiseId: 1, kind: 1 }, { unique: true });
// The same bank / gateway reference can never be counted twice, across all charges
franchiseChargeSchema.index(
    { 'payments.reference': 1 },
    { unique: true, partialFilterExpression: { 'payments.reference': { $exists: true } } },
);

/** Outstanding = expected - paid - waived (never negative). */
franchiseChargeSchema.statics.outstandingOf = (c) =>
    Math.max(0, (c?.expectedPaise || 0) - (c?.paidPaise || 0) - (c?.waivedPaise || 0));

/** Deposit money the platform still holds = paid - refunded - deducted. */
franchiseChargeSchema.statics.heldOf = (c) =>
    Math.max(0, (c?.paidPaise || 0) - (c?.refundedPaise || 0) - (c?.deductedPaise || 0));

/** Status derived from the numbers (single source of truth). */
franchiseChargeSchema.statics.statusOf = (c) => {
    const expected = c?.expectedPaise || 0;
    const paid = c?.paidPaise || 0;
    const waived = c?.waivedPaise || 0;
    if (expected === 0 && paid === 0) return 'not_required';
    if (paid >= expected) return 'paid';
    if (paid + waived >= expected) return paid > 0 ? 'paid' : 'waived';
    return paid > 0 ? 'partially_paid' : 'pending';
};

const FranchiseCharge = mongoose.models.FranchiseCharge || mongoose.model('FranchiseCharge', franchiseChargeSchema);
export default FranchiseCharge;
