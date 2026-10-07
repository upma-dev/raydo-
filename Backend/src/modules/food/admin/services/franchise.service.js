import FranchiseApplication from '../../admin/models/franchiseApplication.model.js';
import FranchiseFormConfig from '../../admin/models/franchiseFormConfig.model.js';

/**
 * Get all applications with filters
 */
export async function getApplications({ status, search, page = 1, limit = 20 }) {
    const query = {};
    if (status && status !== 'all') query.status = status;
    if (search) {
        const re = new RegExp(search, 'i');
        query.$or = [
            { applicantName: re },
            { phone: re },
            { email: re },
            { city: re },
            { applicationId: re },
        ];
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const [applications, total] = await Promise.all([
        FranchiseApplication.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(parseInt(limit))
            .lean(),
        FranchiseApplication.countDocuments(query),
    ]);

    return { applications, total, page: parseInt(page), limit: parseInt(limit), totalPages: Math.ceil(total / limit) };
}

/**
 * Get single application by ID
 */
export async function getApplicationById(id) {
    return FranchiseApplication.findById(id).lean();
}

/**
 * Update application status
 */
export async function updateApplicationStatus(id, { status, adminNote }, adminUserId) {
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new Error('Application not found');
    app.status = status;
    if (adminNote !== undefined) app.adminNote = adminNote;
    app.reviewedBy = adminUserId;
    app.reviewedAt = new Date();
    await app.save();
    return app;
}

/**
 * Delete application
 */
export async function deleteApplication(id) {
    return FranchiseApplication.findByIdAndDelete(id);
}

/**
 * Get status counts
 */
export async function getApplicationStats() {
    const stats = await FranchiseApplication.aggregate([
        { $group: { _id: '$status', count: { $sum: 1 } } },
    ]);
    const result = { total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 };
    stats.forEach(s => {
        result[s._id] = s.count;
        result.total += s.count;
    });
    return result;
}

/**
 * Update commission & financial settings for a franchise
 */
export async function updateCommissionSettings(id, { commissionRate, royaltyFeeRate, payoutCycle, minPayoutThreshold, paymentAccountInfo }) {
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new Error('Application not found');
    if (commissionRate !== undefined) app.commissionRate = Number(commissionRate);
    if (royaltyFeeRate !== undefined) app.royaltyFeeRate = Number(royaltyFeeRate);
    if (payoutCycle !== undefined) app.payoutCycle = payoutCycle;
    if (minPayoutThreshold !== undefined) app.minPayoutThreshold = Number(minPayoutThreshold);
    if (paymentAccountInfo !== undefined) app.paymentAccountInfo = { ...app.paymentAccountInfo, ...paymentAccountInfo };
    await app.save();
    return app;
}

/**
 * Get deep order analytics for a specific franchise (Admin view)
 */
export async function getFranchiseAnalytics(id) {
    const app = await FranchiseApplication.findById(id).lean();
    if (!app) throw new Error('Application not found');

    const mongoose = (await import('mongoose')).default;
    const FoodOrder = mongoose.models.FoodOrder;
    const FoodRestaurant = mongoose.models.FoodRestaurant;

    let orders = [];
    if (FoodOrder) {
        const cityRegex = new RegExp(`^${app.city}$`, 'i');
        const query = {
            $or: [
                { franchiseId: id },
                { 'deliveryAddress.city': cityRegex },
            ]
        };
        orders = await FoodOrder.find(query).sort({ createdAt: -1 }).limit(100).lean();
    }

    const totalOrders = orders.length;
    const deliveredOrders = orders.filter(o => o.orderStatus === 'delivered');
    const cancelledOrders = orders.filter(o => o.orderStatus?.startsWith('cancelled'));
    const totalGMV = deliveredOrders.reduce((sum, o) => sum + (o.pricing?.total || 0), 0);
    const commRate = app.commissionRate || 10;
    const royaltyRate = app.royaltyFeeRate || 2;
    const franchiseEarnings = (totalGMV * commRate) / 100;
    const royaltyFee = (totalGMV * royaltyRate) / 100;
    const adminNetRevenue = (totalGMV * (100 - commRate)) / 100;

    let activeOutletsCount = 0;
    if (FoodRestaurant) {
        const cityRegex = new RegExp(`^${app.city}$`, 'i');
        activeOutletsCount = await FoodRestaurant.countDocuments({
            $or: [
                { franchiseId: id },
                { 'address.city': cityRegex },
                { city: cityRegex }
            ]
        });
    }

    return {
        franchise: {
            id: app._id,
            applicationId: app.applicationId,
            applicantName: app.applicantName,
            companyName: app.companyName,
            city: app.city,
            state: app.state,
            pincode: app.pincode,
            status: app.status,
            commissionRate: commRate,
            royaltyFeeRate: royaltyRate,
            payoutCycle: app.payoutCycle,
            minPayoutThreshold: app.minPayoutThreshold,
            paymentAccountInfo: app.paymentAccountInfo,
        },
        analytics: {
            totalOrders,
            deliveredCount: deliveredOrders.length,
            cancelledCount: cancelledOrders.length,
            totalGMV,
            franchiseEarnings,
            royaltyFee,
            adminNetRevenue,
            activeOutletsCount,
            recentOrders: orders.slice(0, 10).map(o => ({
                id: o._id,
                orderId: o.order_id || o.orderId,
                customerName: o.customerName || 'Customer',
                total: o.pricing?.total || 0,
                status: o.orderStatus,
                date: o.createdAt,
            }))
        }
    };
}

/**
 * Get form config (admin)
 */
export async function getFormConfig() {
    return FranchiseFormConfig.getConfig();
}

/**
 * Update form config (admin)
 */
export async function updateFormConfig({ fields, requiredDocuments }, adminUserId) {
    let config = await FranchiseFormConfig.findOne();
    if (!config) {
        config = new FranchiseFormConfig();
    }
    if (fields !== undefined) config.fields = fields;
    if (requiredDocuments !== undefined) config.requiredDocuments = requiredDocuments;
    config.updatedBy = adminUserId;
    await config.save();
    return config;
}
