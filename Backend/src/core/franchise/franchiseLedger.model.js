import mongoose from 'mongoose';

const franchiseLedgerSchema = new mongoose.Schema(
    {
        ledgerTransactionId: { type: String, required: true, unique: true },
        franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'Franchise', required: true, index: true },
        territoryId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseTerritory', required: true },
        
        transactionType: {
            type: String,
            enum: ['COMMISSION', 'REVERSAL', 'PAYOUT', 'ADJUSTMENT'],
            required: true
        },
        
        sourceType: {
            type: String,
            enum: ['FOOD_ORDER', 'TAXI_RIDE', 'MANUAL', 'SYSTEM'],
            required: true
        },
        sourceId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },

        commissionRuleId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseCommissionRule', default: null },
        commissionRuleVersion: { type: Number, default: null },

        // Breakdown (Append Only)
        grossAmount: { type: Number, required: true, default: 0 },
        commissionableAmount: { type: Number, required: true, default: 0 },
        partnerShare: { type: Number, required: true, default: 0 },
        franchiseShare: { type: Number, required: true, default: 0 },
        companyShare: { type: Number, required: true, default: 0 },

        // Ledger Movement
        credit: { type: Number, default: 0 },
        debit: { type: Number, default: 0 },
        balanceAfter: { type: Number, required: true },

        status: {
            type: String,
            enum: ['POSTED', 'REVERSED', 'FAILED'],
            default: 'POSTED'
        },

        createdBy: { type: String, default: 'SYSTEM' } // e.g., Admin ID for manual adjustments
    },
    { timestamps: true }
);

// CRITICAL IDEMPOTENCY KEY: 
// A given sourceId (e.g., FoodOrder _id) can only have ONE transaction of a specific type (e.g. COMMISSION)
franchiseLedgerSchema.index({ sourceId: 1, transactionType: 1 }, { unique: true });

franchiseLedgerSchema.pre('save', async function (next) {
    if (this.isNew && !this.ledgerTransactionId) {
        const timestamp = Date.now().toString().slice(-6);
        const random = Math.floor(1000 + Math.random() * 9000);
        this.ledgerTransactionId = `FL-${timestamp}${random}`;
    }
    next();
});

export const FranchiseLedger = mongoose.models.FranchiseLedger || mongoose.model('FranchiseLedger', franchiseLedgerSchema);
