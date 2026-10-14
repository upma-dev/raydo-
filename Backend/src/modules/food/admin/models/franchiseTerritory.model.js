import mongoose from 'mongoose';

/**
 * A franchise territory = the unit the client prices franchises by ("zone" in business language).
 * It groups the Food zone and/or the Taxi zone of one area, because those are two separate zone collections.
 * Default joining fee and refundable security deposit live here; commission % lives in FranchiseCommissionRule
 * (scope 'territory') so it can be versioned. A franchise can override both.
 *
 * Restaurants / orders / drivers already reference 'FranchiseTerritory' by territoryId; this is that model.
 */
const franchiseTerritorySchema = new mongoose.Schema({
    name: { type: String, required: true, trim: true, maxlength: 120 },
    code: { type: String, trim: true, uppercase: true, maxlength: 30, default: '' },
    city: { type: String, trim: true, maxlength: 120, default: '' },
    foodZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null },
    taxiZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiZone', default: null },

    // Default pricing for franchises in this territory (integer paise)
    joiningFeePaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },
    securityDepositPaise: { type: Number, required: true, min: 0, validate: Number.isSafeInteger },

    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, trim: true, maxlength: 500, default: '' },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },
}, { collection: 'franchise_territories', timestamps: true });

// A zone belongs to at most one territory, otherwise its price would be ambiguous
franchiseTerritorySchema.index({ foodZoneId: 1 }, { unique: true, partialFilterExpression: { foodZoneId: { $type: 'objectId' } } });
franchiseTerritorySchema.index({ taxiZoneId: 1 }, { unique: true, partialFilterExpression: { taxiZoneId: { $type: 'objectId' } } });
franchiseTerritorySchema.index({ name: 1 });

franchiseTerritorySchema.pre('validate', function (next) {
    if (!this.foodZoneId && !this.taxiZoneId) return next(new Error('A territory needs a Food zone, a Taxi zone, or both'));
    next();
});

const FranchiseTerritory = mongoose.models.FranchiseTerritory || mongoose.model('FranchiseTerritory', franchiseTerritorySchema);
export default FranchiseTerritory;
