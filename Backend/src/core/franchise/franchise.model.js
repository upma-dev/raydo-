import mongoose from 'mongoose';

const franchiseSchema = new mongoose.Schema(
    {
        applicationId: {
            type: String,
            unique: true,
            sparse: true
        },
        franchiseId: {
            type: String,
            unique: true,
            sparse: true
        },
        name: { // This acts as displayName / internal name
            type: String,
            required: true,
            trim: true
        },
        legalName: {
            type: String,
            required: true,
            trim: true
        },
        displayName: {
            type: String,
            trim: true
        },
        ownerAdminId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FoodAdmin',
            index: true
        },
        email: {
            type: String,
            required: true,
            lowercase: true,
            trim: true
        },
        phone: {
            type: String,
            required: true,
            trim: true
        },
        businessType: {
            type: String,
            trim: true
        },
        businessRegistrationDetails: {
            registrationNumber: String,
            taxId: String,
            registeredDate: Date
        },
        franchiseType: {
            type: String,
            enum: ['master', 'unit', 'multi-unit', 'area-developer'],
            default: 'unit'
        },
        services: [{
            type: String,
            enum: ['taxi', 'food', 'delivery', 'airport', 'outstation', 'bus']
        }],
        operatingStatus: {
            type: String,
            enum: ['operational', 'closed_temporarily', 'closed_permanently', 'setup_phase'],
            default: 'setup_phase'
        },
        territoryId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FranchiseTerritory'
        },
        state: String,
        city: String,
        zones: [String],
        pincodes: [String],
        logo: {
            type: String,
            default: ''
        },
        businessAddress: {
            street: String,
            city: String,
            state: String,
            country: String,
            zipCode: String,
        },
        // Commercial
        commercials: {
            franchiseFee: { type: Number, default: 0 },
            technologyFee: { type: Number, default: 0 },
            renewalFee: { type: Number, default: 0 },
            securityDeposit: { type: Number, default: 0 },
            marketingFee: { type: Number, default: 0 },
            companyShare: { type: Number, default: 0 },
            franchiseShare: { type: Number, default: 0 },
            partnerShare: { type: Number, default: 0 },
            commissionRules: [{
                service: { type: String }, // taxi, food, etc
                type: { type: String, enum: ['percentage', 'fixed'] },
                value: { type: Number }
            }]
        },
        status: {
            type: String,
            enum: [
                'DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'DOCUMENTS_REQUIRED',
                'DOCUMENTS_VERIFIED', 'INTERVIEW_PENDING', 'COMMERCIAL_REVIEW',
                'APPROVED', 'AGREEMENT_PENDING', 'PAYMENT_PENDING',
                'ACTIVATION_PENDING', 'ACTIVE', 'REJECTED', 'SUSPENDED', 'TERMINATED'
            ],
            default: 'DRAFT'
        },
        walletBalance: {
            type: Number,
            default: 0
        },
        settings: {
            allowDeliveryManagement: { type: Boolean, default: true },
            allowRestaurantManagement: { type: Boolean, default: true },
            allowTaxiManagement: { type: Boolean, default: true },
        }
    },
    {
        timestamps: true
    }
);

franchiseSchema.index({ status: 1 });
franchiseSchema.index({ territoryId: 1 });

// Generate Application ID on pre-save if missing and submitted
franchiseSchema.pre('save', async function (next) {
    if (this.isNew && !this.applicationId) {
        // Simple sequential ID generator simulation (in prod, use a counter model)
        const count = await mongoose.models.Franchise.countDocuments();
        this.applicationId = `FR-APP-${String(count + 1).padStart(6, '0')}`;
    }
    next();
});

export const Franchise = mongoose.models.Franchise || mongoose.model('Franchise', franchiseSchema);
export default Franchise;
