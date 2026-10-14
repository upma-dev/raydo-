import mongoose from 'mongoose';

/**
 * Platform commission rules, versioned and append-only.
 *
 * One document = one version of the rule for one scope:
 *   scope 'global'    (scopeId null)        - default for every franchise
 *   scope 'territory' (scopeId territory)   - default for franchises in that territory
 *   scope 'franchise' (scopeId franchise)   - override for one franchise
 * The rule in force for a scope at time T is the version with the latest effectiveFrom <= T.
 * Resolution order: franchise -> territory -> global (see commissionRules.service.js).
 * A version with inherit:true means "no override from this moment on" (falls through to the next scope).
 *
 * mode 'separate': food and taxi each use their own rate.
 * mode 'combined': one rate on food + taxi earnings together. Rows are still posted per service with that same rate,
 *                  which is mathematically identical to applying it to the total and keeps refunds exact.
 * enabled:false on a service = the platform takes 0% on that service under this rule.
 *
 * Rules are never edited or deleted: every change is a new version, so every ledger row can point at the exact
 * rule (ruleId + version) that produced it.
 */
const serviceRateSchema = new mongoose.Schema({
    enabled: { type: Boolean, default: true },
    rateBps: { type: Number, default: 0, min: 0, max: 10000, validate: Number.isInteger },
}, { _id: false });

const franchiseCommissionRuleSchema = new mongoose.Schema({
    scope: { type: String, enum: ['global', 'territory', 'franchise'], required: true },
    scopeId: { type: mongoose.Schema.Types.ObjectId, default: null },
    version: { type: Number, required: true, min: 1 },
    inherit: { type: Boolean, default: false },
    mode: { type: String, enum: ['separate', 'combined'], default: 'separate' },
    food: { type: serviceRateSchema, default: () => ({}) },
    taxi: { type: serviceRateSchema, default: () => ({}) },
    combinedRateBps: { type: Number, default: 0, min: 0, max: 10000, validate: Number.isInteger },
    effectiveFrom: { type: Date, required: true },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    createdByName: { type: String, default: '' },
}, { collection: 'franchise_commission_rules', timestamps: { createdAt: true, updatedAt: false } });

franchiseCommissionRuleSchema.index({ scope: 1, scopeId: 1, version: 1 }, { unique: true });
franchiseCommissionRuleSchema.index({ scope: 1, scopeId: 1, effectiveFrom: -1, version: -1 });

const immutable = function (next) {
    next(new Error('Commission rules are append-only. Create a new version instead.'));
};
franchiseCommissionRuleSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], immutable);
franchiseCommissionRuleSchema.pre('save', function (next) {
    if (!this.isNew) return next(new Error('Commission rules are append-only. Create a new version instead.'));
    next();
});

const FranchiseCommissionRule = mongoose.models.FranchiseCommissionRule
    || mongoose.model('FranchiseCommissionRule', franchiseCommissionRuleSchema);
export default FranchiseCommissionRule;
