import mongoose from 'mongoose';

const deliveryCommissionRuleSchema = new mongoose.Schema(
    {
        name: { type: String, trim: true, default: '' },
        minDistance: { type: Number, required: true, min: 0 },
        maxDistance: { type: Number, default: null },
        userDeliveryFee: { type: Number, required: true, min: 0, default: 0 },
        commissionPerKm: { type: Number, required: true, min: 0 },
        basePayout: { type: Number, required: true, min: 0 },
        status: { type: Boolean, default: true, index: true },
        // null = platform-wide slab (admin). Set = slab for one food zone, managed by the franchise owning it;
        // orders from a restaurant in that zone use the zone's slabs instead of the platform ones.
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null, index: true },
        franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseApplication', default: null },
        updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null }
    },
    { collection: 'food_delivery_commission_rules', timestamps: true }
);

deliveryCommissionRuleSchema.index({ createdAt: -1 });

export const FoodDeliveryCommissionRule = mongoose.model('FoodDeliveryCommissionRule', deliveryCommissionRuleSchema);

