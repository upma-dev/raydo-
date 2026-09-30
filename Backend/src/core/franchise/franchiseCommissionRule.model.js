import mongoose from 'mongoose';

const franchiseCommissionRuleSchema = new mongoose.Schema(
    {
        ruleId: { type: String, required: true, unique: true },
        version: { type: Number, required: true, default: 1 },
        serviceType: {
            type: String,
            enum: ['FOOD', 'TAXI', 'DELIVERY', 'AIRPORT', 'OUTSTATION', 'BUS'],
            required: true
        },
        franchiseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Franchise',
            default: null // null implies a global fallback rule
        },
        effectiveFrom: { type: Date, required: true, default: Date.now },
        effectiveTo: { type: Date, default: null },
        status: {
            type: String,
            enum: ['ACTIVE', 'INACTIVE', 'EXPIRED'],
            default: 'ACTIVE'
        },
        calculationType: {
            type: String,
            enum: ['PERCENTAGE', 'FIXED'],
            default: 'PERCENTAGE'
        },
        franchiseShare: { type: Number, required: true, min: 0 },
        companyShare: { type: Number, required: true, min: 0 },
        createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', required: true }
    },
    { timestamps: true }
);

// A franchise can only have one active rule per service type at a time
franchiseCommissionRuleSchema.index({ franchiseId: 1, serviceType: 1, status: 1 });

// Ensure we don't duplicate versions for the same logical rule
franchiseCommissionRuleSchema.index({ ruleId: 1, version: 1 }, { unique: true });

export const FranchiseCommissionRule = mongoose.models.FranchiseCommissionRule || mongoose.model('FranchiseCommissionRule', franchiseCommissionRuleSchema);
