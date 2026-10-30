import mongoose from 'mongoose';

/**
 * A subscription plan bought by a driver (plans themselves are TaxiSubscriptionPlan rows with audience "driver").
 * The plan fields are copied here so changing or hiding a plan later never changes a pass that was already sold.
 *
 * A pass is live when startedAt <= now < expiresAt and it is not cancelled. A renewal bought while a pass is still
 * running starts when that pass ends, so no days are lost.
 */
const driverSubscriptionSchema = new mongoose.Schema(
  {
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiDriver', required: true, index: true },
    planId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiSubscriptionPlan', required: true },
    name: { type: String, default: '', trim: true },
    description: { type: String, default: '', trim: true },
    amount: { type: Number, required: true, min: 0 },
    durationDays: { type: Number, required: true, min: 1 },
    transport_type: { type: String, default: '', trim: true },
    vehicle_type_id: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiVehicle', default: null },
    status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
    purchaseSource: { type: String, enum: ['wallet', 'admin'], default: 'wallet' },
    purchasedAt: { type: Date, default: Date.now },
    startedAt: { type: Date, required: true },
    expiresAt: { type: Date, required: true, index: true },
    walletTransactionId: { type: mongoose.Schema.Types.ObjectId, default: null },
  },
  { timestamps: true },
);

driverSubscriptionSchema.index({ driverId: 1, expiresAt: -1 });

export const DriverSubscription =
  mongoose.models.TaxiDriverSubscription || mongoose.model('TaxiDriverSubscription', driverSubscriptionSchema);
