import { getTaxiOverview } from '../../admin/services/franchiseTaxi.service.js';
import mongoose from 'mongoose';
import FranchiseApplication from '../../admin/models/franchiseApplication.model.js';
import FranchiseFormConfig from '../../admin/models/franchiseFormConfig.model.js';
import FranchiseLedger from '../../admin/models/franchiseLedger.model.js';
import { createRazorpayCheckoutOrder, verifyPaymentSignature } from '../../orders/helpers/razorpay.helper.js';
import { syncFranchiseSubAdmin } from '../../admin/services/franchise.service.js';
import { availableBalance } from '../../admin/services/franchiseLedger.service.js';
import {
    normalizeModules, normalizeFees, normalizeCommissions, getFranchiseFee,
    getCommissionRate, roundMoney,
} from '../../admin/services/franchisePlan.js';

class PartnerError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

/**
 * Get the public form config for the apply page
 */
export async function getPublicFormConfig() {
    const config = await FranchiseFormConfig.getConfig();
    return {
        fields: config.fields
            .filter(f => f.enabled)
            .sort((a, b) => a.order - b.order),
        requiredDocuments: config.requiredDocuments
            .filter(d => d.enabled)
            .sort((a, b) => a.order - b.order),
        // Fees only (never commissions) so the apply page can show the price of food / taxi / both
        moduleFranchiseFees: normalizeFees(config.moduleFranchiseFees),
    };
}

/**
 * Submit a new franchise application
 */
export async function submitFranchiseApplication(data) {
    const {
        applicantName, email, phone, companyName, businessType,
        investmentRange, experience, additionalFields,
        state, city, area, pincode, coordinates, zoneId,
        documents, ipAddress, selectedModules,
    } = data;

    const config = await FranchiseFormConfig.getConfig();
    const modules = normalizeModules(selectedModules);
    const fees = normalizeFees(config.moduleFranchiseFees);
    const commissions = normalizeCommissions(config.moduleCommissions);

    // Status, fee and rates are always decided by the server, never by the form.
    const application = new FranchiseApplication({
        applicantName,
        email,
        phone,
        companyName,
        businessType,
        investmentRange,
        experience,
        additionalFields: additionalFields || {},
        state,
        city,
        area,
        pincode,
        coordinates: coordinates || {},
        zoneId: zoneId || null,
        documents: documents || [],
        ipAddress,
        selectedModules: modules,
        franchiseFee: getFranchiseFee(modules, fees),
        moduleFranchiseFees: fees,
        moduleCommissions: commissions,
    });

    await application.save();
    return application;
}

// ─── Lookups ────────────────────────────────────────────────────────────────

/** Exact applicationId + phone match (used only before the partner has a login). */
async function findByApplicationCredentials(applicationId, phone, { lean = false } = {}) {
    const id = String(applicationId || '').trim();
    const ph = String(phone || '').trim();
    if (!id || !ph) return null;
    const q = FranchiseApplication.findOne({ applicationId: id, phone: ph });
    return lean ? q.lean() : q;
}

/** The logged-in franchise (id comes from the verified token, never from the request body). */
async function findByFranchiseId(franchiseId, { lean = false } = {}) {
    if (!franchiseId || !mongoose.Types.ObjectId.isValid(String(franchiseId))) {
        throw new PartnerError('Franchise login required', 401);
    }
    const q = FranchiseApplication.findById(franchiseId);
    const app = await (lean ? q.lean() : q);
    if (!app) throw new PartnerError('Franchise account not found', 404);
    return app;
}

/**
 * Get application status by applicationId + phone (for applicant tracking)
 */
export async function getApplicationStatus(applicationId, phone) {
    const app = await findByApplicationCredentials(applicationId, phone, { lean: true });
    if (!app) return null;
    return {
        applicationId: app.applicationId,
        applicantName: app.applicantName,
        status: app.status,
        adminNote: app.adminNote,
        selectedModules: normalizeModules(app.selectedModules),
        franchiseFee: app.franchiseFee,
        franchiseFeeStatus: app.franchiseFeeStatus,
        franchiseFeePaidAt: app.franchiseFeePaidAt || null,
        hasLogin: Boolean(app.subAdminId),
        createdAt: app.createdAt,
        reviewedAt: app.reviewedAt,
    };
}

// ─── Dashboard ──────────────────────────────────────────────────────────────

/**
 * Partner dashboard.
 *  - Logged in as this franchise  -> full data (money, orders, outlets, bank, ...)
 *  - Only applicationId + phone   -> onboarding view (fee + payment options), nothing sensitive
 */
export async function getPartnerDashboardData(applicationId, phone, { franchiseId = null } = {}) {
    let app = null;
    let full = false;

    if (franchiseId) {
        app = await findByFranchiseId(franchiseId, { lean: true });
        full = true;
    } else {
        app = await findByApplicationCredentials(applicationId, phone, { lean: true });
    }
    if (!app) return null;

    const formConfig = await FranchiseFormConfig.getConfig();
    const modules = normalizeModules(app.selectedModules);
    const fees = normalizeFees(app.moduleFranchiseFees);
    const commissions = normalizeCommissions(app.moduleCommissions);

    const base = {
        limited: !full,
        partnerInfo: {
            applicationId: app.applicationId,
            applicantName: app.applicantName,
            companyName: app.companyName,
            phone: app.phone,
            email: app.email,
            status: app.status,
            createdAt: app.createdAt,
            selectedModules: modules,
        },
        territoryInfo: {
            state: app.state,
            city: app.city,
            area: app.area,
            pincode: app.pincode,
            coordinates: app.coordinates,
        },
        financialSettings: {
            franchiseFee: app.franchiseFee,
            franchiseFeeStatus: app.franchiseFeeStatus || 'pending',
            franchiseFeePaidAt: app.franchiseFeePaidAt || null,
            moduleFranchiseFees: fees,
            adminPaymentOptions: {
                upiId: formConfig?.paymentDetails?.upiId || '',
                qrCodeUrl: formConfig?.paymentDetails?.qrCodeUrl || '',
                bankName: formConfig?.paymentDetails?.bankName || '',
                accountNumber: formConfig?.paymentDetails?.accountNumber || '',
                ifscCode: formConfig?.paymentDetails?.ifscCode || '',
                accountHolderName: formConfig?.paymentDetails?.accountHolderName || '',
            },
        },
    };

    if (!full) {
        return {
            ...base,
            territoryMetrics: { totalOrders: 0, deliveredOrders: 0, totalGMV: 0, franchiseEarnings: 0, activeOutletsCount: 0, walletBalance: 0 },
            payoutRequests: [], refundRequests: [], territoryOrders: [], territoryOutlets: [],
            categoriesList: [], foodItemsList: [], territoryDrivers: [], supportMessages: [], ledger: [],
        };
    }

    // A franchise sees ONLY the modules it holds: a taxi-only franchise gets no food data and vice versa
    const hasFood = modules.includes('food');
    const hasTaxi = modules.includes('taxi');
    const FoodOrder = hasFood ? mongoose.models.FoodOrder : null;
    const FoodRestaurant = hasFood ? mongoose.models.FoodRestaurant : null;
    const FoodCategory = hasFood ? mongoose.models.FoodCategory : null;
    const FoodItem = hasFood ? mongoose.models.FoodItem : null;
    const Driver = null; // taxi drivers are served by /franchise/taxi/drivers (scoped by taxi zone)
    const fid = app._id;

    // Orders / outlets belong to a franchise ONLY through franchiseId (stamped at order creation)
    let orders = [];
    let totals = { totalOrders: 0, deliveredOrders: 0, totalGMV: 0 };
    if (FoodOrder) {
        orders = await FoodOrder.find({ franchiseId: fid }).sort({ createdAt: -1 }).limit(50).lean();
        const [agg] = await FoodOrder.aggregate([
            { $match: { franchiseId: fid } },
            { $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                deliveredOrders: { $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] } },
                totalGMV: { $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $ifNull: ['$pricing.total', 0] }, 0] } },
            } },
        ]);
        if (agg) totals = agg;
    }

    let activeOutletsCount = 0;
    let outletsList = [];
    if (FoodRestaurant) {
        activeOutletsCount = await FoodRestaurant.countDocuments({ franchiseId: fid });
        outletsList = await FoodRestaurant.find({ franchiseId: fid }).sort({ createdAt: -1 }).limit(50).lean();
    }

    const categoriesList = FoodCategory
        ? await FoodCategory.find({ franchiseId: fid, isDeleted: { $ne: true } }).lean()
        : [];

    let foodItemsList = [];
    if (FoodItem && outletsList.length > 0) {
        foodItemsList = await FoodItem.find({
            restaurantId: { $in: outletsList.map(o => o._id) },
            isDeleted: { $ne: true },
        }).limit(50).lean();
    }

    const driversList = Driver ? await Driver.find({ franchiseId: fid }).limit(30).lean() : [];

    const [ledgerAgg] = await FranchiseLedger.aggregate([
        { $match: { franchiseId: fid, type: { $in: ['credit', 'reversal'] } } },
        { $group: { _id: null, earned: { $sum: '$amount' } } },
    ]);
    const ledger = await FranchiseLedger.find({ franchiseId: fid }).sort({ createdAt: -1 }).limit(50).lean();
    const byModule = await FranchiseLedger.aggregate([
        { $match: { franchiseId: fid, type: { $in: ['credit', 'reversal'] } } },
        { $group: { _id: '$module', earned: { $sum: '$amount' } } },
    ]);
    const earningsByModule = { food: 0, taxi: 0 };
    byModule.forEach((r) => { if (r._id in earningsByModule) earningsByModule[r._id] = roundMoney(r.earned); });

    let taxi = null;
    if (hasTaxi) {
        try {
            taxi = await getTaxiOverview(fid);
        } catch (err) {
            taxi = null;
        }
    }

    const payoutRequests = app.payoutRequests || [];
    const wallet = roundMoney(app.walletBalance || 0);

    return {
        ...base,
        financialSettings: {
            ...base.financialSettings,
            commissionRate: getCommissionRate(modules, commissions, 'food'),
            moduleCommissions: commissions,
            payoutCycle: app.payoutCycle || 'weekly',
            minPayoutThreshold: app.minPayoutThreshold || 0,
            walletBalance: wallet,
            availableBalance: availableBalance(app),
            paymentAccountInfo: app.paymentAccountInfo || {},
            franchiseFeePaymentDetails: app.franchiseFeePaymentDetails || {},
        },
        taxi,
        earningsByModule,
        territoryMetrics: {
            totalOrders: totals.totalOrders,
            deliveredOrders: totals.deliveredOrders,
            totalGMV: roundMoney(totals.totalGMV),
            franchiseEarnings: roundMoney(ledgerAgg?.earned || 0),
            activeOutletsCount,
            walletBalance: wallet,
        },
        payoutRequests: [...payoutRequests].sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)),
        refundRequests: [...(app.refundRequests || [])].sort((a, b) => new Date(b.requestedTime) - new Date(a.requestedTime)),
        ledger,
        territoryOrders: orders.map(o => ({
            id: o._id,
            orderId: o.order_id || o.orderId || String(o._id).slice(-8),
            customerName: o.customerName || o.deliveryAddress?.name || 'Customer',
            customerPhone: o.customerPhone || o.deliveryAddress?.phone || '',
            restaurantName: o.restaurantName || o.restaurant?.name || 'Partner Outlet',
            total: o.pricing?.total || o.totalAmount || 0,
            orderStatus: o.orderStatus || 'pending',
            createdAt: o.createdAt,
            city: o.deliveryAddress?.city || app.city,
        })),
        territoryOutlets: outletsList.map(r => ({
            id: r._id,
            name: r.restaurantName || r.name,
            phone: r.phone,
            email: r.email,
            address: r.address?.street || r.address?.area || r.city || app.city,
            isActive: r.isActive !== false,
            rating: r.ratings?.overall || 0,
            createdAt: r.createdAt,
        })),
        categoriesList: categoriesList.map(c => ({
            id: c._id,
            name: c.name,
            itemsCount: c.itemCount || 0,
            status: c.isActive ? 'Active' : 'Disabled',
        })),
        foodItemsList: foodItemsList.map(f => ({
            id: f._id,
            name: f.name,
            price: f.price,
            categoryName: f.categoryName || 'General',
            restaurantId: f.restaurantId,
            isVeg: f.isVeg !== false,
            status: f.approvalStatus || 'approved',
        })),
        territoryDrivers: driversList.map(d => ({
            id: d._id,
            name: d.name || `${d.firstName || ''} ${d.lastName || ''}`.trim() || 'Driver Partner',
            phone: d.phone,
            vehicleType: d.vehicleType || 'auto_bike',
            vehicleNumber: d.vehicleNumber || d.vehicle_number || '',
            licenseNumber: d.licenseNumber || d.license_number || '',
            status: d.status || 'verified',
            dutyStatus: d.isOnline ? 'Online' : 'Offline',
            rating: d.rating || 0,
        })),
        supportMessages: [...(app.supportMessages || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
    };
}

// ─── Fee payment (before the partner has a login) ───────────────────────────

/**
 * Submit fee payment details by Franchise Partner (Manual Transfer).
 * This only records the claim; the admin marks the fee paid after checking the bank.
 */
export async function submitPaymentDetails(applicationId, phone, paymentData) {
    const app = await findByApplicationCredentials(applicationId, phone);
    if (!app) throw new PartnerError('Franchise application not found', 404);
    if (app.status === 'rejected') throw new PartnerError('This application was rejected, so payment is closed');
    if (app.franchiseFeeStatus !== 'pending') throw new PartnerError('Franchise fee is already settled');

    const { transactionId, paymentMethod, receiptUrl, notes } = paymentData;
    app.franchiseFeePaymentDetails = {
        ...(app.franchiseFeePaymentDetails?.toObject?.() || {}),
        transactionId: transactionId || '',
        paymentMethod: paymentMethod || 'upi',
        receiptUrl: receiptUrl || '',
        paidAmount: app.franchiseFee,          // amount is fixed by the plan, not by the partner
        submittedAt: new Date(),
        notes: notes || '',
    };

    await app.save();
    return getPartnerDashboardData(applicationId, phone);
}

/**
 * Create a Razorpay checkout order for the Franchise Onboarding Fee (amount decided by the server)
 */
export async function createRazorpayOrderForFranchise(applicationId, phone) {
    const app = await findByApplicationCredentials(applicationId, phone);
    if (!app) throw new PartnerError('Franchise application not found', 404);
    if (app.status === 'rejected') throw new PartnerError('This application was rejected, so payment is closed');
    if (app.franchiseFeeStatus !== 'pending') throw new PartnerError('Franchise fee is already settled');

    const amountInPaise = Math.round((Number(app.franchiseFee) || 0) * 100);
    const razorpayOrder = await createRazorpayCheckoutOrder(amountInPaise, 'INR', `FRN-${app.applicationId}`);

    // Remember the order so verification can prove the payment belongs to THIS application
    app.set('franchiseFeePaymentDetails.razorpayOrderId', razorpayOrder.orderId);
    await app.save();

    return {
        ...razorpayOrder,
        applicationId: app.applicationId,
        applicantName: app.applicantName,
        email: app.email,
        phone: app.phone,
        companyName: app.companyName,
    };
}

/**
 * Verify Razorpay payment signature & activate the franchise login.
 * The new login password is returned ONCE in `newCredentials`.
 */
export async function verifyRazorpayPaymentForFranchise(applicationId, phone, paymentData) {
    const app = await findByApplicationCredentials(applicationId, phone);
    if (!app) throw new PartnerError('Franchise application not found', 404);

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = paymentData;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw new PartnerError('Razorpay order id, payment id and signature are all required');
    }

    // Already settled -> idempotent, never grant twice
    if (app.franchiseFeeStatus === 'paid') {
        return { ...(await getPartnerDashboardData(applicationId, phone)), newCredentials: null };
    }

    if (!app.franchiseFeePaymentDetails?.razorpayOrderId || app.franchiseFeePaymentDetails.razorpayOrderId !== razorpay_order_id) {
        throw new PartnerError('This payment does not belong to this application');
    }
    if (!verifyPaymentSignature(razorpay_order_id, razorpay_payment_id, razorpay_signature)) {
        throw new PartnerError('Invalid Razorpay payment signature');
    }

    app.franchiseFeeStatus = 'paid';
    app.franchiseFeePaidAt = new Date();
    app.franchiseFeePaymentDetails = {
        transactionId: razorpay_payment_id,
        razorpayOrderId: razorpay_order_id,
        paymentMethod: 'razorpay',
        paidAmount: app.franchiseFee,
        submittedAt: new Date(),
        notes: `Razorpay Online Order ID: ${razorpay_order_id}`,
    };
    await app.save();

    // The fee can be paid while the application is still under review. Paying never approves it:
    //  - already approved  -> activate the login now (password shown once)
    //  - still in review   -> login is created and activated later, when the admin approves
    let newCredentials = null;
    if (app.status === 'approved') {
        try {
            const result = await syncFranchiseSubAdmin(app._id, { overrideFeeCheck: true });
            if (result?.credentialsInfo?.password) newCredentials = result.credentialsInfo;
        } catch (err) {
            console.error('Failed to sync SubAdmin after Razorpay fee payment:', err);
        }
    }

    return { ...(await getPartnerDashboardData(applicationId, phone)), newCredentials };
}

// ─── Logged-in partner actions (franchiseId comes from the token) ───────────

export async function submitPartnerSupportMessage(franchiseId, messageData) {
    const app = await findByFranchiseId(franchiseId);

    const { subject, message, priority } = messageData;
    if (!message || !message.trim()) throw new PartnerError('Message content is required');

    app.supportMessages.push({
        messageId: `MSG-${Date.now().toString(36).toUpperCase()}`,
        subject: subject || 'Franchise Support Inquiry',
        message: message.trim(),
        priority: priority || 'normal',
        sender: 'partner',
        status: 'pending',
        createdAt: new Date(),
        updatedAt: new Date(),
    });
    await app.save();
    return getPartnerDashboardData(null, null, { franchiseId });
}

/**
 * Withdrawal request from the wallet. Money is only debited when the admin approves it,
 * but pending requests are reserved so the same balance cannot be requested twice.
 */
export async function submitPartnerPayoutRequest(franchiseId, payoutData) {
    const app = await findByFranchiseId(franchiseId);
    if (app.franchiseFeeStatus === 'pending') throw new PartnerError('Pay the franchise fee before requesting payouts');

    const amount = roundMoney(payoutData.amount);
    if (!amount || amount <= 0) throw new PartnerError('Valid withdrawal amount is required');
    if (amount < (Number(app.minPayoutThreshold) || 0)) {
        throw new PartnerError(`Minimum payout is ₹${app.minPayoutThreshold}`);
    }
    if (amount > availableBalance(app)) {
        throw new PartnerError(`Insufficient balance. Available: ₹${availableBalance(app)}`);
    }

    const saved = app.paymentAccountInfo || {};
    const accountDetails = {
        bankName: payoutData.bankName || saved.bankName || '',
        accountNumber: payoutData.accountNumber || saved.accountNumber || '',
        ifscCode: String(payoutData.ifscCode || saved.ifscCode || '').toUpperCase(),
        upiId: payoutData.upiId || saved.upiId || '',
        accountHolderName: payoutData.accountHolderName || saved.accountHolderName || app.applicantName,
    };
    const payoutMethod = payoutData.payoutMethod === 'upi' ? 'upi' : 'bank';
    if (payoutMethod === 'upi' ? !accountDetails.upiId : !(accountDetails.accountNumber && accountDetails.ifscCode)) {
        throw new PartnerError('Add your bank / UPI details before requesting a payout');
    }

    app.payoutRequests.push({
        requestId: `PAY-${Date.now().toString(36).toUpperCase()}`,
        amount,
        payoutMethod,
        accountDetails,
        status: 'pending',
        requestedAt: new Date(),
        adminNote: payoutData.notes || '',
    });
    await app.save();
    return getPartnerDashboardData(null, null, { franchiseId });
}

/**
 * Claim money from the platform for a refund the franchise's outlet has to pay.
 * Only creates a claim; the admin approves or rejects it.
 */
export async function claimRefundFromSuperAdmin(franchiseId, refundData) {
    const app = await findByFranchiseId(franchiseId);

    const { refundId, orderId, merchantName, amount, claimReason } = refundData;
    if (!orderId) throw new PartnerError('orderId is required');

    // The order must really belong to this franchise
    const FoodOrder = mongoose.models.FoodOrder;
    const orderFilter = mongoose.Types.ObjectId.isValid(String(orderId))
        ? { _id: orderId, franchiseId: app._id }
        : { order_id: orderId, franchiseId: app._id };
    if (FoodOrder && !(await FoodOrder.exists(orderFilter))) {
        throw new PartnerError('Order not found in your territory', 404);
    }

    let refundItem = app.refundRequests.find(r => (refundId && r.id === refundId) || r.orderId === orderId);
    if (refundItem) {
        if (refundItem.status !== 'pending') throw new PartnerError(`Refund is already ${refundItem.status}`);
        refundItem.status = 'claimed_from_admin';
        refundItem.claimReason = claimReason || 'Franchise requested refund money disbursement from SuperAdmin';
        refundItem.claimedAt = new Date();
    } else {
        app.refundRequests.push({
            id: refundId || `REF-${Date.now().toString(36).toUpperCase()}`,
            orderId,
            customerName: refundData.customerName || 'Customer',
            customerPhone: refundData.customerPhone || '',
            merchantName: merchantName || 'Restaurant Outlet',
            amount: roundMoney(amount),
            reason: refundData.reason || 'Customer / Restaurant Order Refund Request',
            method: 'UPI / Bank Transfer',
            status: 'claimed_from_admin',
            claimReason: claimReason || 'Franchise requested refund money disbursement from SuperAdmin',
            claimedAt: new Date(),
            requestedTime: new Date(),
        });
    }

    await app.save();
    return getPartnerDashboardData(null, null, { franchiseId });
}

/**
 * Mark a refund as paid to the customer. Allowed only AFTER the admin approved the claim.
 */
export async function processRestaurantRefund(franchiseId, refundId) {
    const app = await findByFranchiseId(franchiseId);

    const refundItem = app.refundRequests.find(r => r.id === refundId);
    if (!refundItem) throw new PartnerError('Refund request not found', 404);
    if (refundItem.status !== 'approved_by_admin') {
        throw new PartnerError('The admin has not approved this refund claim yet');
    }

    refundItem.status = 'processed';
    refundItem.processedAt = new Date();
    await app.save();
    return getPartnerDashboardData(null, null, { franchiseId });
}

/**
 * Save / Update Franchise Partner Bank Account Info
 */
export async function updatePartnerBankDetails(franchiseId, bankData) {
    const app = await findByFranchiseId(franchiseId);

    const { bankName, accountNumber, ifscCode, upiId, accountHolderName } = bankData;
    const cur = app.paymentAccountInfo || {};

    app.paymentAccountInfo = {
        bankName: String(bankName ?? cur.bankName ?? '').trim(),
        accountNumber: String(accountNumber ?? cur.accountNumber ?? '').trim(),
        ifscCode: String(ifscCode ?? cur.ifscCode ?? '').trim().toUpperCase(),
        upiId: String(upiId ?? cur.upiId ?? '').trim(),
        accountHolderName: String(accountHolderName ?? cur.accountHolderName ?? app.applicantName).trim(),
    };

    await app.save();
    return getPartnerDashboardData(null, null, { franchiseId });
}
