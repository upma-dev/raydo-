import mongoose from 'mongoose';

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
    zoneId: { type: mongoose.Schema.Types.ObjectId, ref: 'Zone', default: null },

    // Step 3 — Documents
    documents: [documentSchema],

    // Financial & Commission Settings
    commissionRate: { type: Number, default: 10, min: 0, max: 100 },
    royaltyFeeRate: { type: Number, default: 2, min: 0, max: 100 },
    payoutCycle: { type: String, enum: ['weekly', 'biweekly', 'monthly'], default: 'weekly' },
    minPayoutThreshold: { type: Number, default: 5000, min: 0 },
    paymentAccountInfo: {
        bankName: { type: String, default: '', trim: true },
        accountNumber: { type: String, default: '', trim: true },
        ifscCode: { type: String, default: '', trim: true },
        upiId: { type: String, default: '', trim: true },
        accountHolderName: { type: String, default: '', trim: true },
    },

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

    // Tracking
    applicationId: { type: String, unique: true, sparse: true }, // readable ID like FRN-2024-0001
    ipAddress: { type: String },
}, {
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
});

// Auto-generate readable applicationId before save
franchiseApplicationSchema.pre('save', async function (next) {
    if (!this.applicationId) {
        const count = await mongoose.model('FranchiseApplication').countDocuments();
        this.applicationId = `FRN-${new Date().getFullYear()}-${String(count + 1).padStart(4, '0')}`;
    }
    next();
});

franchiseApplicationSchema.index({ status: 1, createdAt: -1 });
franchiseApplicationSchema.index({ phone: 1 });
franchiseApplicationSchema.index({ applicationId: 1 });

const FranchiseApplication = mongoose.model('FranchiseApplication', franchiseApplicationSchema);
export default FranchiseApplication;
