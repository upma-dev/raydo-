import mongoose from 'mongoose';

/**
 * Money moved between a hybrid partner's taxi wallet and the delivery Pocket.
 *  - taxi_to_food: ride / parcel earnings swept into the Pocket (Pocket goes up, taxi wallet goes down)
 *  - food_to_taxi: cash-ride commission dues recovered from the Pocket (Pocket goes down, taxi wallet goes up)
 * The Pocket balance is an aggregate, so these rows are part of it (see deliveryFinance.service.js).
 */
const hybridWalletTransferSchema = new mongoose.Schema(
    {
        deliveryPartnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', required: true, index: true },
        taxiDriverId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDriver', required: true, index: true },
        direction: { type: String, enum: ['taxi_to_food', 'food_to_taxi'], required: true },
        amount: { type: Number, required: true, min: 0.01 },
        taxiWalletTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'WalletTransaction', default: null },
        reason: { type: String, default: '' }
    },
    { collection: 'food_hybrid_wallet_transfers', timestamps: true }
);

hybridWalletTransferSchema.index({ deliveryPartnerId: 1, createdAt: -1 });

export const HybridWalletTransfer =
    mongoose.models.HybridWalletTransfer || mongoose.model('HybridWalletTransfer', hybridWalletTransferSchema);
