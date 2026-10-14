import mongoose from 'mongoose';

const foodCategorySchema = new mongoose.Schema(
    {
        name: { type: String, required: true, trim: true, index: true },
        image: { type: String, trim: true, default: '' },
        type: { type: String, trim: true, default: '' },
        foodTypeScope: { type: String, enum: ['Veg', 'Non-Veg', 'Both'], default: 'Both', index: true },
        /**
         * Category scope:
         * - When restaurantId is missing: category is admin/global and can be shared across restaurants.
         * - When restaurantId is set: category is private to that restaurant only.
         *
         * Approval remains available for admin moderation, but approval does not make a
         * restaurant-owned category globally reusable.
         *
         * Note: existing categories (created by admin historically) should be treated as approved.
         */
        restaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', index: true, default: undefined },
        createdByRestaurantId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodRestaurant', index: true, default: undefined },
        franchiseId: { type: mongoose.Schema.Types.ObjectId, ref: 'FranchiseApplication', index: true, default: undefined },
        approvalStatus: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'approved', index: true },
        isApproved: { type: Boolean, default: true, index: true },
        rejectionReason: { type: String, trim: true, default: '' },
        requestedAt: { type: Date },
        approvedAt: { type: Date },
        rejectedAt: { type: Date },
        globalizedAt: { type: Date },
        /**
         * Optional zone binding.
         * - When set: category is visible only for that zone.
         * - When null/undefined: category is global (visible for all zones).
         */
        zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', index: true, default: undefined },
        /** The zone's name, saved with the category so the admin always reads a name, never an id. Kept in sync automatically. */
        zoneName: { type: String, trim: true, default: '' },
        isActive: { type: Boolean, default: true, index: true },
        sortOrder: { type: Number, default: 0, index: true }
    },
    {
        collection: 'food_categories',
        timestamps: true
    }
);

foodCategorySchema.index({ isApproved: 1, createdAt: -1 });
foodCategorySchema.index({ restaurantId: 1, isApproved: 1, createdAt: -1 });
foodCategorySchema.index({ approvalStatus: 1, createdAt: -1 });
foodCategorySchema.index({ createdByRestaurantId: 1, createdAt: -1 });

// Every create / edit goes through save(): fill zoneName from the zone, or clear it for a global category
foodCategorySchema.pre('save', async function (next) {
    try {
        if (!this.zoneId) {
            this.zoneName = '';
        } else if (this.isNew || this.isModified('zoneId') || !this.zoneName) {
            const Zone = mongoose.models.FoodZone;
            const zone = Zone ? await Zone.findById(this.zoneId).select('name zoneName').lean() : null;
            this.zoneName = zone?.name || zone?.zoneName || this.zoneName || '';
        }
        next();
    } catch (err) {
        next(err);
    }
});

export const FoodCategory = mongoose.model('FoodCategory', foodCategorySchema);

