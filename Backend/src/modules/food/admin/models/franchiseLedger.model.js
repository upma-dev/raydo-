import mongoose from 'mongoose';

/**
 * Append-only money ledger for franchises. `amount` is signed rupees (+ credit, - debit); `amountPaise` is the exact
 * integer value (rows written before engine v2 only have `amount`).
 * FranchiseApplication.walletBalance(Paise) is the running sum of the rows in the 'wallet' account (rows without an
 * account are legacy wallet rows).
 *
 * Engine v1 (legacy, kept for history): type 'credit' = franchise share of platform revenue, 'reversal' takes it back.
 * Engine v2 (current), one financial event -> rows that are posted together in one DB transaction:
 *   earning              + eligible earnings of the franchise from an order / ride / booking   (wallet)
 *   platform_commission  - platform's % of that earning                                        (wallet)
 *   earning_reversal     - part of an earning taken back after a refund                          (wallet)
 *   commission_reversal  + matching part of the platform commission given back                   (wallet)
 *   payout               - money paid out to the partner                                         (wallet)
 *   adjustment           +/- explicit, reasoned correction                                       (wallet)
 *   refund_reimbursement + money the franchise paid a customer out of its own pocket, paid back by the platform (wallet)
 *   fee_payment          + joining fee received (platform revenue, not partner money)            (fees)
 *   deposit_received     + security deposit received (liability held for the partner)           (deposit)
 *   deposit_refund       - deposit returned to the partner                                       (deposit)
 *   deposit_deduction    - deposit kept by the platform (penalty / dues), with reason            (deposit)
 * The unique (franchiseId, type, refId) index makes every posting idempotent.
 */
const franchiseLedgerSchema = new mongoose.Schema({
    franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseApplication', required: true, index: true },
    module: { type: String, enum: ['food', 'taxi', null], default: null },
    type: {
        type: String,
        enum: [
            'credit', 'reversal', 'payout', 'adjustment',
            'earning', 'platform_commission', 'earning_reversal', 'commission_reversal',
            'refund_reimbursement', 'fee_payment', 'deposit_received', 'deposit_refund', 'deposit_deduction',
        ],
        required: true,
    },
    account: { type: String, enum: ['wallet', 'fees', 'deposit'], default: 'wallet' },
    amount: { type: Number, required: true },
    amountPaise: { type: Number, default: undefined },
    base: { type: Number, default: 0 },          // rupees the rate was applied on
    basePaise: { type: Number, default: undefined },
    rate: { type: Number, default: 0 },          // % snapshot
    rateBps: { type: Number, default: undefined },
    ruleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseCommissionRule', default: null },
    ruleVersion: { type: Number, default: null },
    ruleScope: { type: String, default: '' },
    refType: { type: String, enum: ['order', 'ride', 'bus', 'pooling', 'rental', 'payout', 'manual', 'charge'], default: 'manual' },
    refId: { type: String, default: '' },
    sourceId: { type: String, default: '' },     // the order / ride / booking this row belongs to (same for its reversals)
    eventAt: { type: Date, default: null },      // when the business event happened (delivery / ride completion)
    engineVersion: { type: Number, default: 1 },
    note: { type: String, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
}, { timestamps: { createdAt: true, updatedAt: false }, collection: 'franchise_ledger' });

franchiseLedgerSchema.index(
    { franchiseId: 1, type: 1, refId: 1 },
    { unique: true, partialFilterExpression: { refId: { $type: 'string', $gt: '' } } }
);
franchiseLedgerSchema.index({ franchiseId: 1, createdAt: -1 });
franchiseLedgerSchema.index({ franchiseId: 1, sourceId: 1 });
franchiseLedgerSchema.index({ sourceId: 1, refType: 1, type: 1 });
franchiseLedgerSchema.index({ refType: 1, refId: 1, type: 1 });
franchiseLedgerSchema.index({ createdAt: -1, type: 1 });

// Posted rows are immutable: corrections are new rows, never edits
const refuse = function (next) {
    next(new Error('Ledger entries are immutable. Post a reversal or adjustment instead.'));
};
franchiseLedgerSchema.pre(['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'], refuse);
franchiseLedgerSchema.pre('save', function (next) {
    if (!this.isNew) return next(new Error('Ledger entries are immutable. Post a reversal or adjustment instead.'));
    next();
});

const FranchiseLedger = mongoose.models.FranchiseLedger || mongoose.model('FranchiseLedger', franchiseLedgerSchema);
export default FranchiseLedger;
