import mongoose from 'mongoose';

/**
 * Who changed what in franchise money / configuration. Write-once: the model refuses every update and delete,
 * so the app itself can never rewrite history (database-level protection is an ops concern: restrict the DB user).
 */
const franchiseAuditLogSchema = new mongoose.Schema({
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseApplication', default: null, index: true },
    entity: { type: String, required: true },          // franchise | territory | commission_rule | charge | payout | ledger
    entityId: { type: String, default: '' },
    action: { type: String, required: true },          // e.g. franchise.create, charge.confirm_payment, rule.new_version
    before: { type: mongoose.Schema.Types.Mixed, default: null },
    after: { type: mongoose.Schema.Types.Mixed, default: null },
    reason: { type: String, trim: true, maxlength: 500, default: '' },
    actor: {
        id: { type: mongoose.Schema.Types.ObjectId, default: null },
        name: { type: String, default: '' },
        email: { type: String, default: '' },
        level: { type: String, default: '' },
    },
    ip: { type: String, default: '' },
}, { collection: 'franchise_audit_logs', timestamps: { createdAt: true, updatedAt: false } });

franchiseAuditLogSchema.index({ entity: 1, entityId: 1, createdAt: -1 });
franchiseAuditLogSchema.index({ createdAt: -1 });

const refuse = function (next) {
    next(new Error('Audit records cannot be modified or deleted'));
};
franchiseAuditLogSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], refuse);
franchiseAuditLogSchema.pre('save', function (next) {
    if (!this.isNew) return next(new Error('Audit records cannot be modified or deleted'));
    next();
});

const FranchiseAuditLog = mongoose.models.FranchiseAuditLog || mongoose.model('FranchiseAuditLog', franchiseAuditLogSchema);
export default FranchiseAuditLog;
