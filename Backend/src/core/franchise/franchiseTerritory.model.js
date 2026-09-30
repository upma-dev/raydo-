import mongoose from 'mongoose';

const franchiseTerritorySchema = new mongoose.Schema(
    {
        territoryId: {
            type: String,
            unique: true,
            sparse: true
        },
        name: {
            type: String,
            required: true,
            trim: true
        },
        state: { type: String, required: true },
        city: { type: String, required: true },
        zone: { type: String }, // specific zone identifier
        pincodes: [{ type: String }],
        services: [{
            type: String,
            enum: ['taxi', 'food', 'delivery', 'airport', 'outstation', 'bus']
        }],
        status: {
            type: String,
            enum: ['AVAILABLE', 'RESERVED', 'ASSIGNED', 'SUSPENDED'],
            default: 'AVAILABLE'
        },
        boundaries: {
            type: {
                type: String,
                enum: ['Polygon', 'MultiPolygon'],
                default: 'Polygon'
            },
            coordinates: {
                type: Array, // Array of arrays of arrays of numbers for GeoJSON
            }
        },
        assignedToFranchiseId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Franchise',
            default: null
        },
        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodAdmin'
        }
    },
    {
        timestamps: true
    }
);

// Prevent duplicate exclusive territory assignment by ensuring a franchise can only be assigned once? 
// Or ensure pincode/zone overlap doesn't happen. For now, unique index on assignedToFranchiseId if it's 1:1.
franchiseTerritorySchema.index({ assignedToFranchiseId: 1 });
franchiseTerritorySchema.index({ state: 1, city: 1 });
franchiseTerritorySchema.index({ status: 1 });
franchiseTerritorySchema.index({ boundaries: '2dsphere' });

franchiseTerritorySchema.pre('save', async function (next) {
    if (this.isNew && !this.territoryId) {
        const count = await mongoose.models.FranchiseTerritory.countDocuments();
        this.territoryId = `TER-${String(count + 1).padStart(5, '0')}`;
    }
    next();
});

export const FranchiseTerritory = mongoose.models.FranchiseTerritory || mongoose.model('FranchiseTerritory', franchiseTerritorySchema);
export default FranchiseTerritory;
