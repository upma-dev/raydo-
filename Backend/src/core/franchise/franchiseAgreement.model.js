import mongoose from 'mongoose';

const franchiseAgreementSchema = new mongoose.Schema(
    {
        agreementRef: {
            type: String,
            unique: true,
            sparse: true
        },
        franchiseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Franchise',
            required: true,
            index: true
        },
        version: {
            type: String,
            default: '1.0'
        },
        terms: {
            type: String, // Rich text or link to terms document
            required: true
        },
        territory: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FranchiseTerritory'
        },
        services: [{
            type: String,
            enum: ['taxi', 'food', 'delivery', 'airport', 'outstation', 'bus']
        }],
        commercialTerms: {
            type: mongoose.Schema.Types.Mixed // Snapshot of financials when signed
        },
        startDate: {
            type: Date
        },
        endDate: {
            type: Date
        },
        document: {
            type: String // PDF URL
        },
        status: {
            type: String,
            enum: ['DRAFT', 'SENT', 'VIEWED', 'SIGNED', 'EXPIRED', 'CANCELLED'],
            default: 'DRAFT'
        },
        signedByFranchiseAt: {
            type: Date
        },
        signedBySuperAdminAt: {
            type: Date
        },
        superAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodAdmin'
        }
    },
    {
        timestamps: true
    }
);

franchiseAgreementSchema.index({ franchiseId: 1, status: 1 });

franchiseAgreementSchema.pre('save', async function (next) {
    if (this.isNew && !this.agreementRef) {
        const count = await mongoose.models.FranchiseAgreement.countDocuments();
        this.agreementRef = `AGR-${String(count + 1).padStart(6, '0')}`;
    }
    next();
});

export const FranchiseAgreement = mongoose.models.FranchiseAgreement || mongoose.model('FranchiseAgreement', franchiseAgreementSchema);
export default FranchiseAgreement;
