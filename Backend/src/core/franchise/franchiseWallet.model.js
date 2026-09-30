import mongoose from 'mongoose';

const franchiseWalletSchema = new mongoose.Schema(
    {
        franchiseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Franchise',
            required: true,
            unique: true
        },
        balance: { type: Number, default: 0 },
        lockedAmount: { type: Number, default: 0 },
        totalCredits: { type: Number, default: 0 },
        totalDebits: { type: Number, default: 0 },
        currency: { type: String, default: 'INR' }
    },
    { timestamps: true }
);

export const FranchiseWallet = mongoose.models.FranchiseWallet || mongoose.model('FranchiseWallet', franchiseWalletSchema);
