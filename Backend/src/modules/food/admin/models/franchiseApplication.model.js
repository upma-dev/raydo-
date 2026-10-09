import mongoose from 'mongoose';
import { normalizeModules, DEFAULT_FEES, DEFAULT_COMMISSIONS } from '../services/franchisePlan.js';

const documentSchema = new mongoose.Schema({
    key: { type: String, required: true },
    label: { type: String, required: true },
    url: { type: String, required: true },
}, { _id: false });

const franchiseApplicationSchema = new mongoose.Schema({
    // Step 1 — Business Details (dynamic fields from admin config)
    applicantName: { type: String, required: true, trim: true },
    email: { type: String, required: true, trim: true, lowercase: true },
    phone: { type: String, required: true, trim: true },
    companyName: { type: String, trim: true },
    businessType: { type: String, trim: true },       // proprietorship, pvt ltd, etc.
    investmentRange: { type: String, trim: true },    // e.g. "5-10 Lakhs"
    experience: { type: String, trim: true },
    additionalFields: { type: Map, of: String, default: {} }, // extra dynamic fields

    // Step 2 — Location (map-driven)
    state: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    area: { type: String, trim: true },
    pincode: { type: String, trim: true },
    coordinates: {
        lat: { type: Number },
        lng: { type: Number },
    },
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodZone', default: null },
    // The TAXI zone this franchise owns (only for franchises that hold the taxi module)
    taxiZoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'TaxiZone', default: null, index: true },
    subAdminId: { type: mongoose.Schema.Types.ObjectId, ref: 'FoodAdmin', default: null },

    // 'food' and/or 'taxi' (legacy taxiDriver/taxiFleet/... values are normalized to 'taxi' on save)
    selectedModules: { type: [String], default: ['food'] },

    // Step 3 — Documents
    documents: [documentSchema],

    // Financial & Commission Settings
    commissionRate: { type: Number, default: 10, min: 0, max: 100 },
    royaltyFeeRate: { type: Number, default: 2, min: 0, max: 100 },
    payoutCycle: { type: String, enum: ['weekly', 'biweekly', 'monthly'], default: 'weekly' },
    minPayoutThreshold: { type: Number, default: 5000, min: 0 },
    franchiseFee: { type: Number, default: DEFAULT_FEES.food, min: 0 },
    franchiseFeeStatus: {
        type: String,
        enum: ['pending', 'paid', 'waived', 'refund_due', 'refunded'],
        default: 'pending',
        index: true,
    },
    franchiseFeePaidAt: { type: Date, default: null },
    franchiseFeePaymentDetails: {
        transactionId: { type: String, trim: true, default: '' },
        razorpayOrderId: { type: String, trim: true, default: '' },
        paymentMethod: { type: String, trim: true, default: '' },
        receiptUrl: { type: String, trim: true, default: '' },
        paidAmount: { type: Number, default: 0 },
        submittedAt: { type: Date, default: null },
        notes: { type: String, trim: true, default: '' },
    },
    // Three keys only: food-only, taxi-only, or both (combined). See services/franchisePlan.js
    moduleCommissions: {
        food: { type: Number, default: DEFAULT_COMMISSIONS.food, min: 0, max: 100 },
        taxi: { type: Number, default: DEFAULT_COMMISSIONS.taxi, min: 0, max: 100 },
        both: { type: Number, default: DEFAULT_COMMISSIONS.both, min: 0, max: 100 },
    },
    moduleFranchiseFees: {
        food: { type: Number, default: DEFAULT_FEES.food, min: 0 },
        taxi: { type: Number, default: DEFAULT_FEES.taxi, min: 0 },
        both: { type: Number, default: DEFAULT_FEES.both, min: 0 },
    },
    paymentAccountInfo: {
        bankName: { type: String, default: '', trim: true },
        accountNumber: { type: String, default: '', trim: true },
        ifscCode: { type: String, default: '', trim: true },
        upiId: { type: String, default: '', trim: true },
        accountHolderName: { type: String, default: '', trim: true },
    },

    // Wallet & Payout System
    walletBalance: { type: Number, default: 0 },
    payoutRequests: [{
        requestId: { type: String },
        amount: { type: Number, required: true },
        payoutMethod: { type: String, enum: ['bank', 'upi'], default: 'bank' },
        accountDetails: {
            bankName: { type: String, default: '' },
            accountNumber: { type: String, default: '' },
            ifscCode: { type: String, default: '' },
            upiId: { type: String, default: '' },
            accountHolderName: { type: String, default: '' },
        },
        status: { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
        requestedAt: { type: Date, default: Date.now },
        processedAt: { type: Date, default: null },
        adminNote: { type: String, default: '' },
        transactionId: { type: String, default: '' },
    }],

    // Restaurant / Order Refund Requests
    refundRequests: [{
        id: { type: String },
        orderId: { type: String, required: true },
        customerName: { type: String, default: '' },
        customerPhone: { type: String, default: '' },
        merchantName: { type: String, default: '' },
        amount: { type: Number, required: true },
        reason: { type: String, default: '' },
        method: { type: String, default: 'UPI / Original Account' },
        status: { type: String, enum: ['pending', 'claimed_from_admin', 'approved_by_admin', 'processed', 'rejected'], default: 'pending' },
        claimReason: { type: String, default: '' },
        claimedAt: { type: Date, default: null },
        requestedTime: { type: Date, default: Date.now },
        processedAt: { type: Date, default: null },
    }],

    // Account control (admin): suspended = login blocked; archived = soft-deleted (kept for history)
    accountStatus: { type: String, enum: ['active', 'suspended'], default: 'active', index: true },
    suspendReason: { type: String, default: '' },
    suspendedAt: { type: Date, default: null },
    archived: { type: Boolean, default: false, index: true },
    archivedAt: { type: Date, default: null },

    // Status & Admin Review
    status: {
        type: String,
        enum: ['pending', 'under_review', 'approved', 'rejected'],
        default: 'pending',
        index: true,
    },
    adminNote: { type: String, trim: true },
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt: { type: Date, default: null },

    // Support & Inquiries
    supportMessages: [{
        messageId: { type: String },
        subject: { type: String, default: 'General Inquiry' },
        message: { type: String, required: true },
        priority: { type: String, enum: ['low', 'medium', 'normal', 'high', 'urgent'], default: 'normal' },
        sender: { type: String, enum: ['partner', 'admin'], default: 'partner' },
        status: { type: String, enum: ['open', 'pending', 'in_progress', 'replied', 'resolved'], default: 'pending' },
        reply: { type: String, default: '' },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now }
    }],

    // Tracking
    applicationId: { type: String, unique: true, sparse: true }, // readable ID like FRN-2024-0001
    ipAddress: { type: String },

}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Keep modules clean ('food' | 'taxi')
franchiseApplicationSchema.pre('validate', function (next) {
    this.selectedModules = normalizeModules(this.selectedModules);
    next();
});

// Readable applicationId from an atomic counter (no duplicates under load, none reused after deletes)
const franchiseCounterSchema = new mongoose.Schema({ _id: String, seq: { type: Number, default: 0 } }, { collection: 'franchise_counters' });
const FranchiseCounter = mongoose.models.FranchiseCounter || mongoose.model('FranchiseCounter', franchiseCounterSchema);

franchiseApplicationSchema.pre('save', async function (next) {
    if (!this.applicationId) {
        const year = new Date().getFullYear();
        const key = `FRN-${year}`;
        // First use of the year: start after the highest id already issued (covers applications created before the counter existed)
        if (!(await FranchiseCounter.exists({ _id: key }))) {
            const last = await mongoose.model('FranchiseApplication')
                .findOne({ applicationId: new RegExp(`^${key}-`) }).sort({ applicationId: -1 }).select('applicationId').lean();
            const start = last ? parseInt(String(last.applicationId).split('-')[2], 10) || 0 : 0;
            await FranchiseCounter.updateOne({ _id: key }, { $setOnInsert: { seq: start } }, { upsert: true }).catch(() => {});
        }
        const counter = await FranchiseCounter.findOneAndUpdate({ _id: key }, { $inc: { seq: 1 } }, { new: true });
        this.applicationId = `FRN-${year}-${String(counter.seq).padStart(4, '0')}`;
    }
    next();
});

franchiseApplicationSchema.index({ status: 1, createdAt: -1 });
franchiseApplicationSchema.index({ phone: 1 });

const FranchiseApplication = mongoose.model('FranchiseApplication', franchiseApplicationSchema);
export default FranchiseApplication;
