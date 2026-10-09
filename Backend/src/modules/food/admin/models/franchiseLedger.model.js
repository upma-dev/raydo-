import mongoose from 'mongoose';

/**
 * Append-only money ledger for franchises. `amount` is signed (+ credit, - debit).
 * FranchiseApplication.walletBalance is the running sum of this ledger.
 * The unique (franchiseId, type, refId) index makes every credit/reversal/payout idempotent.
 */
const franchiseLedgerSchema = new mongoose.Schema({
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseApplication', required: true, index: true },
    module: { type: String, enum: ['food', 'taxi', null], default: null },
    type: { type: String, enum: ['credit', 'reversal', 'payout', 'adjustment'], required: true },
    amount: { type: Number, required: true },
    base: { type: Number, default: 0 },          // amount the rate was applied on
    rate: { type: Number, default: 0 },          // commission % snapshot
    refType: { type: String, enum: ['order', 'ride', 'bus', 'payout', 'manual'], default: 'manual' },
    refId: { type: String, default: '' },
    note: { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'franchise_ledger' });

franchiseLedgerSchema.index(
    { franchiseId: 1, type: 1, refId: 1 },
    { unique: true, partialFilterExpression: { refId: { $type: 'string', $gt: '' } } }
);
franchiseLedgerSchema.index({ franchiseId: 1, createdAt: -1 });

const FranchiseLedger = mongoose.models.FranchiseLedger || mongoose.model('FranchiseLedger', franchiseLedgerSchema);
export default FranchiseLedger;
