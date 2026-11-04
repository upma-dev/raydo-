import mongoose from 'mongoose';

/**
 * A subscription pass bought by (or granted to) a delivery partner.
 * Plans are TaxiSubscriptionPlan rows with audience "delivery"; their fields are copied here so editing or hiding a
 * plan later never changes a pass that was already sold.
 *
 * One pass unlocks ONE kind of work (service): food orders, two-wheeler rides ("ride") or parcels ("parcel").
 * A pass is live when startedAt <= now < expiresAt and it is not cancelled. A renewal bought while a pass of the same
 * service is still running starts when that pass ends, so no days are lost.
 */
const deliveryPartnerSubscriptionSchema = new mongoose.Schema(
    {
        partnerId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodDeliveryPartner', required: true, index: true },
        planId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiSubscriptionPlan', required: true },
        service: { type: String, enum: ['food', 'ride', 'parcel'], required: true, index: true },
        name: { type: String, default: '', trim: true },
        description: { type: String, default: '', trim: true },
        amount: { type: Number, required: true, min: 0 },
        durationDays: { type: Number, required: true, min: 1 },
        status: { type: String, enum: ['active', 'cancelled'], default: 'active', index: true },
        // pocket = paid from the partner's Pocket balance, razorpay = paid online (UPI / Google Pay / card), admin = given free by an admin.
        // Only "pocket" passes are taken out of the Pocket balance.
        purchaseSource: { type: String, enum: ['pocket', 'razorpay', 'admin'], default: 'pocket' },
        razorpayOrderId: { type: String, default: undefined },
        razorpayPaymentId: { type: String, default: undefined },
        grantedBy: { type: mongoose.Schema.Types.ObjectId, default: null },
        purchasedAt: { type: Date, default: Date.now },
        startedAt: { type: Date, required: true },
        expiresAt: { type: Date, required: true, index: true },
        cancelledAt: { type: Date, default: null },
        cancelReason: { type: String, default: '' },
    },
    { collection: 'food_delivery_partner_subscriptions', timestamps: true },
);

deliveryPartnerSubscriptionSchema.index({ partnerId: 1, service: 1, expiresAt: -1 });
// One online payment can only ever buy one pass (also guards app verify + webhook arriving together)
deliveryPartnerSubscriptionSchema.index(
    { razorpayPaymentId: 1 },
    { unique: true, partialFilterExpression: { razorpayPaymentId: { $type: 'string' } } },
);

export const FoodDeliveryPartnerSubscription =
    mongoose.models.FoodDeliveryPartnerSubscription ||
    mongoose.model('FoodDeliveryPartnerSubscription', deliveryPartnerSubscriptionSchema);
