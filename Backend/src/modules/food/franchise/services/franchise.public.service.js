import FranchiseApplication from '../../admin/models/franchiseApplication.model.js';
import FranchiseFormConfig from '../../admin/models/franchiseFormConfig.model.js';

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
    };
}

/**
 * Submit a new franchise application
 */
export async function submitFranchiseApplication(data) {
    const {
        applicantName, email, phone, companyName, businessType,
        investmentRange, experience, additionalFields,
        state, city, area, pincode, coordinates,
        documents, ipAddress,
    } = data;

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
        documents: documents || [],
        ipAddress,
    });

    await application.save();
    return application;
}

/**
 * Get application status by applicationId + phone (for applicant tracking)
 */
export async function getApplicationStatus(applicationId, phone) {
    const app = await FranchiseApplication.findOne({ applicationId, phone });
    if (!app) return null;
    return {
        applicationId: app.applicationId,
        status: app.status,
        adminNote: app.adminNote,
        createdAt: app.createdAt,
        reviewedAt: app.reviewedAt,
    };
}

/**
 * Get Franchise Partner Dashboard summary by applicationId + phone
 */
export async function getPartnerDashboardData(applicationId, phone) {
    const app = await FranchiseApplication.findOne({ applicationId, phone }).lean();
    if (!app) return null;

    const mongoose = (await import('mongoose')).default;
    const FoodOrder = mongoose.models.FoodOrder;
    const FoodRestaurant = mongoose.models.FoodRestaurant;

    let orders = [];
    if (FoodOrder) {
        const cityRegex = new RegExp(`^${app.city}$`, 'i');
        orders = await FoodOrder.find({
            $or: [
                { franchiseId: app._id },
                { 'deliveryAddress.city': cityRegex },
            ]
        }).lean();
    }

    const deliveredOrders = orders.filter(o => o.orderStatus === 'delivered');
    const totalGMV = deliveredOrders.reduce((sum, o) => sum + (o.pricing?.total || 0), 0);
    const commRate = app.commissionRate || 10;
    const franchiseEarnings = (totalGMV * commRate) / 100;

    let activeOutletsCount = 0;
    if (FoodRestaurant) {
        const cityRegex = new RegExp(`^${app.city}$`, 'i');
        activeOutletsCount = await FoodRestaurant.countDocuments({
            $or: [
                { franchiseId: app._id },
                { 'address.city': cityRegex },
                { city: cityRegex }
            ]
        });
    }

    return {
        partnerInfo: {
            applicationId: app.applicationId,
            applicantName: app.applicantName,
            companyName: app.companyName,
            phone: app.phone,
            email: app.email,
            status: app.status,
            createdAt: app.createdAt,
        },
        territoryInfo: {
            state: app.state,
            city: app.city,
            area: app.area,
            pincode: app.pincode,
            coordinates: app.coordinates,
        },
        financialSettings: {
            commissionRate: commRate,
            royaltyFeeRate: app.royaltyFeeRate || 2,
            payoutCycle: app.payoutCycle || 'weekly',
            minPayoutThreshold: app.minPayoutThreshold || 5000,
            paymentAccountInfo: app.paymentAccountInfo || {},
        },
        territoryMetrics: {
            totalOrders: orders.length,
            deliveredOrders: deliveredOrders.length,
            totalGMV,
            franchiseEarnings,
            activeOutletsCount,
        }
    };
}
