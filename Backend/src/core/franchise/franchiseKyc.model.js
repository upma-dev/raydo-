import mongoose from 'mongoose';

const franchiseKycSchema = new mongoose.Schema(
    {
        franchiseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Franchise',
            required: true,
            index: true
        },
        documentType: {
            type: String,
            enum: ['PERSONAL_KYC', 'BUSINESS_KYC', 'BANK_PROOF', 'ADDRESS_PROOF', 'PAN', 'GST', 'BUSINESS_REGISTRATION'],
            required: true
        },
        fileUrl: {
            type: String,
            required: true
        },
        status: {
            type: String,
            enum: ['PENDING', 'UNDER_REVIEW', 'VERIFIED', 'REJECTED', 'EXPIRED'],
            default: 'PENDING'
        },
        rejectionReason: {
            type: String
        },
        verifiedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodAdmin'
        },
        verifiedAt: {
            type: Date
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed // for any OCR results or additional text inputs
        }
    },
    {
        timestamps: true
    }
);

franchiseKycSchema.index({ franchiseId: 1, status: 1 });

export const FranchiseKyc = mongoose.models.FranchiseKyc || mongoose.model('FranchiseKyc', franchiseKycSchema);
export default FranchiseKyc;
