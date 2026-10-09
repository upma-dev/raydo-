import FranchiseApplication from '../../admin/models/franchiseApplication.model.js';
import FranchiseFormConfig from '../../admin/models/franchiseFormConfig.model.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { FoodZone } from '../models/zone.model.js';
import FranchiseLedger from '../models/franchiseLedger.model.js';
import crypto from 'crypto';
import {
    normalizeModules, normalizeFees, normalizeCommissions, getFranchiseFee,
    getCommissionRate, roundMoney,
} from './franchisePlan.js';
import { debitPayout, reverseFoodOrder } from './franchiseLedger.service.js';
import { invalidateTaxiSettings } from './franchiseTaxi.service.js';

const generatePassword = () => `Fr@${crypto.randomBytes(5).toString('hex')}`;

const FOOD_PERMISSIONS = ['orders', 'restaurants', 'categories', 'foods', 'earnings', 'dashboard', 'delivery-partners', 'reports'];
const TAXI_PERMISSIONS = ['dashboard', 'earnings', 'reports'];

/** What the franchise login may use = exactly the modules the franchise bought (food, taxi or both). */
const accessFor = (app) => {
    const modules = normalizeModules(app.selectedModules);
    const permissions = [...new Set([
        ...(modules.includes('food') ? FOOD_PERMISSIONS : []),
        ...(modules.includes('taxi') ? TAXI_PERMISSIONS : []),
    ])];
    return { modules, servicesAccess: modules, module: modules.includes('food') ? 'food' : 'taxi', permissions };
};

/** One taxi zone belongs to one franchise, otherwise two franchises would fight over the same rides. */
async function assertTaxiZoneFree(taxiZoneId, franchiseId) {
    const other = await FranchiseApplication.findOne({ taxiZoneId, _id: { $ne: franchiseId }, archived: { $ne: true } }).select('applicantName').lean();
    if (other) throw new Error(`This taxi zone already belongs to ${other.applicantName}'s franchise.`);
}

/** Push the franchise's current plan onto its login account (idempotent). */
async function applyAccessToLogin(app) {
    if (!app?.subAdminId) return;
    const { servicesAccess, module } = accessFor(app);
    await FoodAdmin.updateOne({ _id: app.subAdminId }, { $set: { servicesAccess, module } });
}

/** One-time / startup repair: every existing franchise login gets the modules its franchise really holds. */
export async function backfillFranchiseAccess() {
    const apps = await FranchiseApplication.find({ subAdminId: { $ne: null } }).select('selectedModules subAdminId').lean();
    let fixed = 0;
    for (const app of apps) {
        const { servicesAccess, module } = accessFor(app);
        const res = await FoodAdmin.updateOne(
            { _id: app.subAdminId, $or: [{ servicesAccess: { $ne: servicesAccess } }, { module: { $ne: module } }] },
            { $set: { servicesAccess, module } },
        );
        fixed += res.modifiedCount || 0;
    }
    return fixed;
}

/**
 * Get all applications with filters
 */
export async function getApplications({ status, search, page = 1, limit = 20, archived }) {
    const query = archived === 'true' || archived === true ? { archived: true } : { archived: { $ne: true } };
    if (status && status !== 'all') query.status = status;
    if (search) {
        const re = new RegExp(String(search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
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
            .populate('zoneId', 'name zoneName serviceLocation')
            .populate('subAdminId', 'name email phone active status food_zone_ids permissions')
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
    return FranchiseApplication.findById(id)
        .populate('zoneId', 'name zoneName serviceLocation coordinates')
        .populate('subAdminId', 'name email phone active status food_zone_ids permissions')
        .lean();
}

/**
 * Create or Sync SubAdmin Account for a Franchise Partner
 */
export async function syncFranchiseSubAdmin(id, { password, permissions, zoneId, taxiZoneId, overrideFeeCheck = false }) {
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new Error('Application not found');

    const access = accessFor(app);
    const targetZoneId = access.modules.includes('food') ? (zoneId || app.zoneId) : null;
    if (access.modules.includes('food') && zoneId && String(zoneId) !== String(app.zoneId)) {
        app.zoneId = zoneId;
    }
    if (access.modules.includes('taxi') && taxiZoneId) {
        await assertTaxiZoneFree(taxiZoneId, app._id);
        app.taxiZoneId = taxiZoneId;
    }

    const subAdminPermissions = permissions && permissions.length > 0 ? permissions : access.permissions;

    let subAdmin = null;
    let isNewAccount = false;
    if (app.subAdminId) {
        subAdmin = await FoodAdmin.findById(app.subAdminId);
    }
    if (!subAdmin) {
        subAdmin = await FoodAdmin.findOne({ email: app.email.toLowerCase() });
    }
    if (!subAdmin) {
        subAdmin = await FoodAdmin.findOne({ franchiseId: app._id });
    }

    // Random one-time password (shown to the admin once in the response). Never a shared default.
    const plainPassword = password || generatePassword();
    let passwordIssued = Boolean(password);
    const shouldBeActive = overrideFeeCheck || app.franchiseFeeStatus === 'paid' || app.franchiseFeeStatus === 'waived';

    if (subAdmin) {
        subAdmin.name = app.applicantName || subAdmin.name;
        subAdmin.phone = app.phone || subAdmin.phone;
        subAdmin.role = 'franchise';
        subAdmin.adminLevel = 'franchise_admin';
        subAdmin.admin_type = 'franchise';
        subAdmin.module = access.module;
        subAdmin.servicesAccess = access.servicesAccess;
        subAdmin.franchiseId = app._id;

        if (targetZoneId) {
            const currentZones = (subAdmin.food_zone_ids || []).map(z => String(z));
            if (!currentZones.includes(String(targetZoneId))) {
                subAdmin.food_zone_ids.push(targetZoneId);
            }
        }
        if (subAdminPermissions.length > 0) {
            subAdmin.permissions = subAdminPermissions;
        }
        if (password) {
            subAdmin.password = password; // pre-save hook will hash it
        }
        subAdmin.active = shouldBeActive;
        subAdmin.isActive = shouldBeActive;
        subAdmin.status = shouldBeActive ? 'active' : 'inactive';
        await subAdmin.save();
    } else {
        isNewAccount = true;
        subAdmin = new FoodAdmin({
            name: app.applicantName,
            email: app.email.toLowerCase(),
            phone: app.phone,
            password: plainPassword,
            role: 'franchise',
            adminLevel: 'franchise_admin',
            admin_type: 'franchise',
            module: access.module,
            permissions: subAdminPermissions,
            food_zone_ids: targetZoneId ? [targetZoneId] : [],
            franchiseId: app._id,
            active: shouldBeActive,
            isActive: shouldBeActive,
            status: shouldBeActive ? 'active' : 'inactive',
            servicesAccess: access.servicesAccess,
        });
        await subAdmin.save();
    }

    app.subAdminId = subAdmin._id;
    if (app.status === 'pending') {
        app.status = 'approved';
    }
    await app.save();

    return {
        app: await getApplicationById(app._id),
        subAdmin: {
            _id: subAdmin._id,
            name: subAdmin.name,
            email: subAdmin.email,
            phone: subAdmin.phone,
            role: subAdmin.role,
            admin_type: subAdmin.admin_type,
            food_zone_ids: subAdmin.food_zone_ids,
            permissions: subAdmin.permissions,
            active: subAdmin.active,
        },
        // Existing accounts keep their password unless a new one was passed in.
        credentialsInfo: {
            email: app.email,
            password: (isNewAccount || passwordIssued) ? plainPassword : null,
        }
    };
}

/**
 * Update application status
 */
export async function updateApplicationStatus(id, { status, adminNote, autoCreateSubAdmin = true }, adminUserId) {
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new Error('Application not found');
    app.status = status;
    if (adminNote !== undefined) app.adminNote = adminNote;
    // Applicant paid up front but is rejected: the fee must go back. Lock the login and flag it for refund.
    if (status === 'rejected' && app.franchiseFeeStatus === 'paid') {
        app.franchiseFeeStatus = 'refund_due';
        if (app.subAdminId) {
            await FoodAdmin.findByIdAndUpdate(app.subAdminId, { active: false, isActive: false, status: 'inactive' });
        }
    }
    app.reviewedBy = adminUserId;
    app.reviewedAt = new Date();
    await app.save();

    let subAdminResult = null;
    if (status === 'approved' && autoCreateSubAdmin && !app.subAdminId) {
        try {
            subAdminResult = await syncFranchiseSubAdmin(id, {});
        } catch (err) {
            console.error('Failed to auto-create SubAdmin on franchise approval:', err);
        }
    }

    const updatedApp = await getApplicationById(id);
    return { application: updatedApp, subAdminResult };
}

/**
 * Delete application
 */
export async function deleteApplication(id) {
    const app = await FranchiseApplication.findById(id).select('subAdminId walletBalance').lean();
    if (!app) throw new Error('Application not found');
    const hasLedger = await FranchiseLedger.exists({ franchiseId: id });
    if (app.subAdminId || hasLedger || Number(app.walletBalance) !== 0) {
        throw new Error('This franchise has an account or money history and cannot be deleted. Reject or deactivate it instead.');
    }
    return FranchiseApplication.findByIdAndDelete(id);
}

/**
 * Get status counts
 */
export async function getApplicationStats() {
    const stats = await FranchiseApplication.aggregate([
        { $match: { archived: { $ne: true } } },
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
 * (rates / fees use the three plan keys: food, taxi, both)
 */
export async function updateCommissionSettings(id, {
    payoutCycle, minPayoutThreshold, paymentAccountInfo, zoneId, selectedModules,
    franchiseFee, franchiseFeeStatus, moduleCommissions, moduleFranchiseFees, taxiZoneId
}) {
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new Error('Application not found');
    if (payoutCycle !== undefined) app.payoutCycle = payoutCycle;
    if (minPayoutThreshold !== undefined) app.minPayoutThreshold = Number(minPayoutThreshold);
    if (paymentAccountInfo !== undefined) app.paymentAccountInfo = { ...app.paymentAccountInfo, ...paymentAccountInfo };
    if (moduleCommissions !== undefined) app.moduleCommissions = normalizeCommissions({ ...normalizeCommissions(app.moduleCommissions), ...moduleCommissions });
    if (moduleFranchiseFees !== undefined) app.moduleFranchiseFees = normalizeFees({ ...normalizeFees(app.moduleFranchiseFees), ...moduleFranchiseFees });

    if (selectedModules !== undefined) app.selectedModules = normalizeModules(selectedModules);

    const feeSettled = app.franchiseFeeStatus === 'paid';
    if (franchiseFee !== undefined) {
        if (feeSettled && Number(franchiseFee) !== Number(app.franchiseFee)) {
            throw new Error('The franchise fee is already paid, so the amount cannot be changed. Refund it first if it must change.');
        }
        app.franchiseFee = Number(franchiseFee);
    } else if ((selectedModules !== undefined || moduleFranchiseFees !== undefined) && app.franchiseFeeStatus === 'pending') {
        // Fee not paid yet -> keep it in sync with the plan
        app.franchiseFee = getFranchiseFee(app.selectedModules, app.moduleFranchiseFees);
    }

    if (franchiseFeeStatus !== undefined) {
        app.franchiseFeeStatus = franchiseFeeStatus;
        if (franchiseFeeStatus === 'paid' || franchiseFeeStatus === 'waived') {
            app.franchiseFeePaidAt = new Date();
            // Unlock SubAdmin account if exists
            if (app.subAdminId) {
                await FoodAdmin.findByIdAndUpdate(app.subAdminId, { active: true, isActive: true, status: 'active' });
            }
        } else {
            if (app.subAdminId) {
                await FoodAdmin.findByIdAndUpdate(app.subAdminId, { active: false, isActive: false, status: 'inactive' });
            }
        }
    }

    if (taxiZoneId !== undefined) {
        if (taxiZoneId) await assertTaxiZoneFree(taxiZoneId, app._id);
        app.taxiZoneId = taxiZoneId || null;
    }

    if (zoneId !== undefined) {
        app.zoneId = zoneId || null;
        if (app.subAdminId && zoneId) {
            await FoodAdmin.findByIdAndUpdate(app.subAdminId, { $addToSet: { food_zone_ids: zoneId } });
        }
    }
    await app.save();
    await applyAccessToLogin(app); // a changed plan changes what the login may use
    return getApplicationById(id);
}

/**
 * Franchise analytics (admin view). Orders/restaurants are matched ONLY by franchiseId -
 * no city/zone guessing, so two franchises can never see each other's data.
 */
export async function getFranchiseAnalytics(id) {
    const app = await FranchiseApplication.findById(id)
        .populate('zoneId', 'name zoneName serviceLocation')
        .populate('subAdminId', 'name email phone active status food_zone_ids permissions')
        .lean();
    if (!app) throw new Error('Application not found');

    const mongoose = (await import('mongoose')).default;
    const FoodOrder = mongoose.models.FoodOrder;
    const FoodRestaurant = mongoose.models.FoodRestaurant;
    const FoodCategory = mongoose.models.FoodCategory;
    const fid = app._id;

    let orders = [];
    let totals = { totalOrders: 0, deliveredCount: 0, cancelledCount: 0, totalGMV: 0, platformRevenue: 0 };
    if (FoodOrder) {
        orders = await FoodOrder.find({ franchiseId: fid }).sort({ createdAt: -1 }).limit(10).lean();
        const [agg] = await FoodOrder.aggregate([
            { $match: { franchiseId: fid } },
            { $group: {
                _id: null,
                totalOrders: { $sum: 1 },
                deliveredCount: { $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] } },
                cancelledCount: { $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ['$orderStatus', ''] }, regex: '^cancelled' } }, 1, 0] } },
                totalGMV: { $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $ifNull: ['$pricing.total', 0] }, 0] } },
                platformRevenue: { $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $add: [{ $ifNull: ['$pricing.restaurantCommission', 0] }, { $ifNull: ['$pricing.platformFee', 0] }] }, 0] } },
            } },
        ]);
        if (agg) totals = agg;
    }

    const [ledgerAgg] = await FranchiseLedger.aggregate([
        { $match: { franchiseId: fid } },
        { $group: {
            _id: null,
            earned: { $sum: { $cond: [{ $in: ['$type', ['credit', 'reversal']] }, '$amount', 0] } },
            paidOut: { $sum: { $cond: [{ $eq: ['$type', 'payout'] }, { $multiply: ['$amount', -1] }, 0] } },
        } },
    ]);
    const franchiseEarnings = roundMoney(ledgerAgg?.earned || 0);

    let restaurantsList = [];
    if (FoodRestaurant) {
        const found = await FoodRestaurant.find({ franchiseId: fid }).lean();
        restaurantsList = found.map(r => ({
            id: r._id,
            name: r.restaurantName || r.name || 'Unnamed Restaurant',
            ownerName: r.ownerName || 'N/A',
            ownerPhone: r.ownerPhone || r.primaryContactNumber || 'N/A',
            ownerEmail: r.ownerEmail || 'N/A',
            status: r.status || (r.isActive !== false ? 'active' : 'inactive'),
            isActive: r.isActive !== false,
            createdAt: r.createdAt
        }));
    }

    let categoriesList = [];
    if (FoodCategory) {
        const cats = await FoodCategory.find({ franchiseId: fid }).lean();
        categoriesList = cats.map(c => ({
            id: c._id,
            name: c.name,
            image: c.image || '',
            foodTypeScope: c.foodTypeScope || 'Both',
            isActive: c.isActive !== false,
            createdAt: c.createdAt
        }));
    }

    const foodRate = getCommissionRate(app.selectedModules, app.moduleCommissions, 'food');

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
            zone: app.zoneId || null,
            subAdmin: app.subAdminId || null,
            selectedModules: normalizeModules(app.selectedModules),
            commissionRate: foodRate,
            moduleCommissions: normalizeCommissions(app.moduleCommissions),
            payoutCycle: app.payoutCycle,
            minPayoutThreshold: app.minPayoutThreshold,
            paymentAccountInfo: app.paymentAccountInfo,
        },
        analytics: {
            totalOrders: totals.totalOrders,
            deliveredCount: totals.deliveredCount,
            cancelledCount: totals.cancelledCount,
            totalGMV: roundMoney(totals.totalGMV),
            platformRevenue: roundMoney(totals.platformRevenue),   // what HIJM earns on these orders
            franchiseEarnings,                                      // ledger: credits - reversals
            adminNetRevenue: roundMoney(totals.platformRevenue - franchiseEarnings),
            paidOut: roundMoney(ledgerAgg?.paidOut || 0),
            walletBalance: roundMoney(app.walletBalance || 0),
            activeOutletsCount: restaurantsList.length,
            restaurants: restaurantsList,
            categories: categoriesList,
            recentOrders: orders.map(o => ({
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
export async function updateFormConfig({ fields, requiredDocuments, moduleFranchiseFees, moduleCommissions, paymentDetails, taxiSettings }, adminUserId) {
    let config = await FranchiseFormConfig.findOne();
    if (!config) {
        config = new FranchiseFormConfig();
    }
    if (fields !== undefined) config.fields = fields;
    if (requiredDocuments !== undefined) config.requiredDocuments = requiredDocuments;
    if (moduleFranchiseFees !== undefined) config.moduleFranchiseFees = normalizeFees({ ...normalizeFees(config.moduleFranchiseFees), ...moduleFranchiseFees });
    if (moduleCommissions !== undefined) config.moduleCommissions = normalizeCommissions({ ...normalizeCommissions(config.moduleCommissions), ...moduleCommissions });
    if (paymentDetails !== undefined) config.paymentDetails = { ...config.paymentDetails, ...paymentDetails };
    if (taxiSettings !== undefined) {
        const cur = config.taxiSettings?.toObject ? config.taxiSettings.toObject() : (config.taxiSettings || {});
        const base = taxiSettings.commissionBase;
        if (base !== undefined && !['platform_commission', 'fare'].includes(base)) throw new Error('Commission base must be "platform_commission" or "fare"');
        const services = { ...(cur.services || {}) };
        ['ride', 'intercity', 'parcel', 'bus', 'pooling', 'rental'].forEach((k) => {
            if (taxiSettings.services && taxiSettings.services[k] !== undefined) services[k] = Boolean(taxiSettings.services[k]);
        });
        const serviceCommission = { ...(cur.serviceCommission || {}) };
        ['pooling', 'rental'].forEach((k) => {
            const v = taxiSettings.serviceCommission?.[k];
            if (v === undefined) return;
            const n = Number(v);
            if (!Number.isFinite(n) || n < 0 || n > 100) throw new Error(`Raydo commission for ${k} must be between 0 and 100`);
            serviceCommission[k] = n;
        });
        config.taxiSettings = { commissionBase: base || cur.commissionBase || 'platform_commission', services, serviceCommission };
        config.markModified('taxiSettings');
        invalidateTaxiSettings();
    }
    config.updatedBy = adminUserId;
    await config.save();
    return config;
}

/**
 * Manually create a Franchise Application by Admin
 */
export async function createApplication(data, adminUserId) {
    const config = await FranchiseFormConfig.getConfig();
    const fees = normalizeFees(config.moduleFranchiseFees);
    const comms = normalizeCommissions(config.moduleCommissions);
    const selectedModules = normalizeModules(data.selectedModules);

    const app = new FranchiseApplication({
        applicantName: data.applicantName,
        phone: data.phone,
        email: data.email,
        companyName: data.companyName,
        businessType: data.businessType || 'Proprietorship',
        investmentRange: data.investmentRange || '10-25 Lakhs',
        experience: data.experience || 'Fresher',
        state: data.state,
        city: data.city,
        area: data.area,
        pincode: data.pincode,
        zoneId: data.zoneId || null,
        selectedModules,
        franchiseFee: (data.franchiseFee !== undefined && data.franchiseFee !== '' && data.franchiseFee !== null) ? Number(data.franchiseFee) : getFranchiseFee(selectedModules, fees),
        franchiseFeeStatus: data.franchiseFeeStatus || 'pending',
        status: data.status || 'approved',
        adminNote: data.adminNote || 'Registered directly by Admin',
        reviewedBy: adminUserId || null,
        reviewedAt: new Date(),
        moduleFranchiseFees: fees,
        moduleCommissions: comms,
    });

    await app.save();

    let subAdminResult = null;
    if (data.createSubAdmin) {
        subAdminResult = await syncFranchiseSubAdmin(app._id, {
            password: data.subAdminPassword || undefined,
            zoneId: app.zoneId,
        });
    }

    return subAdminResult ? { ...app.toObject(), credentialsInfo: subAdminResult.credentialsInfo } : app;
}

export async function replyToSupportMessage(id, messageId, { reply, status = 'replied' }) {
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new Error('Application not found');

    const msg = (app.supportMessages || []).find(m => m.messageId === messageId || String(m._id) === String(messageId));
    if (!msg) throw new Error('Support message not found');

    msg.reply = reply;
    msg.status = status;
    msg.repliedAt = new Date();

    await app.save();
    return getApplicationById(id);
}

export async function updatePayoutRequestStatus(id, requestId, { status, adminNote, transactionId }) {
    if (!['approved', 'rejected'].includes(status)) throw new Error('Status must be approved or rejected');

    const app = await FranchiseApplication.findById(id);
    if (!app) throw new Error('Application not found');

    const reqItem = (app.payoutRequests || []).find(p => p.requestId === requestId || String(p._id) === String(requestId));
    if (!reqItem) throw new Error('Payout request not found');
    if (reqItem.status !== 'pending') throw new Error(`Payout request is already ${reqItem.status}`);

    if (status === 'approved') {
        // Pending requests are already reserved, so only the wallet itself has to cover this one.
        if ((Number(app.walletBalance) || 0) < reqItem.amount) throw new Error('Insufficient wallet balance for this payout');
        await debitPayout(app._id, reqItem.requestId || String(reqItem._id), reqItem.amount);
        if (transactionId) reqItem.transactionId = transactionId;
    }

    reqItem.status = status;
    reqItem.processedAt = new Date();
    if (adminNote) reqItem.adminNote = adminNote;

    await app.save();
    return getApplicationById(id);
}

export async function updateRefundClaimStatus(id, refundId, { status, adminNote }) {
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new Error('Application not found');

    const refundItem = (app.refundRequests || []).find(r => r.id === refundId || String(r._id) === String(refundId));
    if (!refundItem) throw new Error('Refund claim not found');

    const allowed = ['approved_by_admin', 'rejected'];
    if (!allowed.includes(status)) throw new Error(`Status must be one of: ${allowed.join(', ')}`);
    if (refundItem.status !== 'claimed_from_admin') throw new Error(`Refund claim is already ${refundItem.status}`);

    refundItem.status = status;
    refundItem.processedAt = status === 'rejected' ? new Date() : null;
    if (adminNote) refundItem.claimReason = `${refundItem.claimReason || ''} | Admin: ${adminNote}`.trim();

    // A refunded order earns the franchise nothing: take its commission back (no-op if never credited).
    if (status === 'approved_by_admin') {
        const mongoose = (await import('mongoose')).default;
        const FoodOrder = mongoose.models.FoodOrder;
        const orderRef = refundItem.orderId;
        const order = FoodOrder && await FoodOrder.findOne(
            mongoose.Types.ObjectId.isValid(String(orderRef)) ? { _id: orderRef, franchiseId: app._id } : { order_id: orderRef, franchiseId: app._id }
        ).select('_id').lean();
        if (order) await reverseFoodOrder(order._id);
    }

    await app.save();
    return getApplicationById(id);
}



