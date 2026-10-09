import mongoose from 'mongoose';

const { ObjectId } = mongoose.Schema.Types;

// ─── Sub-schemas ─────────────────────────────────────────────────────────────

const bankDetailsSchema = new mongoose.Schema({
    bankName: { type: String, default: '', trim: true },
    accountNumber: { type: String, default: '', trim: true },
    ifscCode: { type: String, default: '', trim: true },
    upiId: { type: String, default: '', trim: true },
    accountHolderName: { type: String, default: '', trim: true },
}, { _id: false });

const payoutRequestSchema = new mongoose.Schema({
    requestId: { type: String, default: () => new mongoose.Types.ObjectId().toString() },
    amount: { type: Number, required: true, min: 0 },
    payoutMethod: { type: String, enum: ['bank', 'upi'], default: 'bank' },
    status: { type: String, enum: ['pending', 'approved', 'rejected', 'paid'], default: 'pending' },
    requestedAt: { type: Date, default: Date.now },
    processedAt: { type: Date, default: null },
    adminNote: { type: String, default: '' },
    transactionId: { type: String, default: '' },
}, { _id: false });

const commissionLedgerSchema = new mongoose.Schema({
    rideId: { type: ObjectId, ref: 'TaxiRide', default: null },
    driverId: { type: ObjectId, ref: 'TaxiDriver', default: null },
    rideAmount: { type: Number, default: 0 },
    franchiseCommissionAmount: { type: Number, default: 0 }, // franchise earns this
    platformCommissionAmount: { type: Number, default: 0 },  // super admin earns this
    franchiseCommissionRate: { type: Number, default: 0 },   // % rate at time of ride
    platformCommissionRate: { type: Number, default: 0 },    // % rate at time of ride
    currency: { type: String, default: 'INR' },
    recordedAt: { type: Date, default: Date.now },
    note: { type: String, default: '' },
}, { _id: false });

// ─── Main schema ─────────────────────────────────────────────────────────────

const taxiFranchisePartnerSchema = new mongoose.Schema({
    // Identity
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, trim: true, lowercase: true },
    phone: { type: String, required: true, unique: true, trim: true },
    password: { type: String, required: true, select: false },
    partnerId: { type: String, unique: true, sparse: true }, // readable ID: TXFR-2024-0001

    // Zone restriction — this partner can ONLY operate in this zone
    zoneId: {
        type: ObjectId,
        ref: 'TaxiZone',
        required: true,
        index: true,
    },
    zoneName: { type: String, default: '', trim: true }, // denormalized for quick reads
    serviceLocationId: {
        type: ObjectId,
        ref: 'TaxiServiceLocation',
        default: null,
        index: true,
    },

    // Commission settings (set by super admin)
    franchiseCommissionRate: { type: Number, default: 10, min: 0, max: 100 }, // % of ride fare that goes to franchise partner
    platformCommissionRate: { type: Number, default: 5, min: 0, max: 100 },  // % of ride fare that goes to super admin from franchise rides

    // Settings the franchise partner can configure for their zone
    zoneSettings: {
        // Cancel / waiting time
        cancelWaitingTimeSeconds: { type: Number, default: 120 }, // free cancel window
        driverWaitingChargePerMin: { type: Number, default: 2 },  // after free wait
        freeWaitingMinutes: { type: Number, default: 3 },

        // App modules enabled for this zone
        enableRide: { type: Boolean, default: true },
        enableOutstation: { type: Boolean, default: false },
        enableDelivery: { type: Boolean, default: false },
        enablePooling: { type: Boolean, default: false },
        enableRental: { type: Boolean, default: false },

        // Vehicle type overrides (franchise can restrict which vehicle types operate in zone)
        allowedVehicleTypeIds: { type: [ObjectId], ref: 'TaxiVehicle', default: [] },
    },

    // Financial
    walletBalance: { type: Number, default: 0 },
    totalEarned: { type: Number, default: 0 },
    totalPaidOut: { type: Number, default: 0 },
    bankDetails: { type: bankDetailsSchema, default: () => ({}) },
    payoutRequests: { type: [payoutRequestSchema], default: [] },

    // Commission ledger (paginated at service layer, stored inline for MVP)
    commissionLedger: { type: [commissionLedgerSchema], default: [] },

    // Status
    status: {
        type: String,
        enum: ['pending', 'active', 'suspended', 'rejected'],
        default: 'pending',
        index: true,
    },
    isActive: { type: Boolean, default: false },
    adminNote: { type: String, default: '' },
    approvedAt: { type: Date, default: null },
    approvedBy: { type: ObjectId, ref: 'FoodAdmin', default: null },

    // Auth
    resetPasswordOtp: { type: String, select: false },
    resetPasswordExpires: { type: Date, select: false },
    lastLoginAt: { type: Date, default: null },
    fcmToken: { type: String, default: '' },

    // Franchise fee
    franchiseFee: { type: Number, default: 25000, min: 0 },
    franchiseFeeStatus: {
        type: String,
        enum: ['pending', 'paid', 'waived'],
        default: 'pending',
    },
    franchiseFeePaymentDetails: {
        transactionId: { type: String, default: '' },
        paidAmount: { type: Number, default: 0 },
        paidAt: { type: Date, default: null },
    },

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// ─── Auto-generate partnerId ──────────────────────────────────────────────────

taxiFranchisePartnerSchema.pre('save', async function (next) {
    if (!this.partnerId) {
        const count = await mongoose.model('TaxiFranchisePartner').countDocuments();
        this.partnerId = `TXFR-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    }
    next();
});

// ─── Indexes ─────────────────────────────────────────────────────────────────

taxiFranchisePartnerSchema.index({ status: 1, createdAt: -1 });
taxiFranchisePartnerSchema.index({ zoneId: 1, status: 1 });
taxiFranchisePartnerSchema.index({ partnerId: 1 });

export const TaxiFranchisePartner =
    mongoose.models.TaxiFranchisePartner ||
    mongoose.model('TaxiFranchisePartner', taxiFranchisePartnerSchema);
