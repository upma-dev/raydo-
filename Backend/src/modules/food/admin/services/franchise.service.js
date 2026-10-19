import FranchiseApplication from '../../admin/models/franchiseApplication.model.js';
import FranchiseFormConfig from '../../admin/models/franchiseFormConfig.model.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { FoodZone } from '../models/zone.model.js';
import FranchiseLedger from '../models/franchiseLedger.model.js';
import crypto from 'crypto';
import mongoose from 'mongoose';
import {
    normalizeModules, normalizeFees, normalizeCommissions, getFranchiseFee, roundMoney,
} from './franchisePlan.js';
import { reverseFoodOrder, postRowsInSession, reimburseFranchiseRefund } from './franchiseLedger.service.js';
import { invalidateTaxiSettings } from './franchiseTaxi.service.js';
import FranchiseTerritory from '../models/franchiseTerritory.model.js';
import { ensureCharges, ensureLegacyCharges, syncLegacyFeeFields } from './franchiseCharges.service.js';
import { createRuleVersion, resolveRates } from './commissionRules.service.js';
import { MoneyError, parseRupeesInput, toPaise, fromPaise, bpsToPercent } from './franchiseMoney.js';
import { writeAudit } from './franchiseAudit.service.js';
import { withTransaction, opts } from './franchiseTx.js';

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
    const other = await FranchiseApplication.findOne({ taxiZoneId, _id: { $ne: franchiseId }, archived: { $ne: true }, accountStatus: { $ne: 'terminated' } }).select('applicantName').lean();
    if (other) throw new MoneyError(`This taxi zone already belongs to ${other.applicantName}'s franchise.`, 409);
}

/** Same rule for food: two franchises on one food zone would make order ownership a coin toss. */
async function assertFoodZoneFree(zoneId, franchiseId) {
    const other = await FranchiseApplication.findOne({
        zoneId, _id: { $ne: franchiseId }, archived: { $ne: true }, accountStatus: { $ne: 'terminated' },
        status: { $ne: 'rejected' }, selectedModules: 'food',
    }).select('applicantName').lean();
    if (other) throw new MoneyError(`This food zone already belongs to ${other.applicantName}'s franchise.`, 409);
}

/** Permissions a franchise login may hold: only those of its own modules (never '*', never admin management). */
function allowedPermissions(access, requested) {
    if (!Array.isArray(requested) || requested.length === 0) return access.permissions;
    const allowed = new Set(access.permissions);
    const clean = requested
        .map((p) => String(p || '').trim())
        .filter((p) => {
            const base = p.replace(/\.(read|write|view|manage)$/, '');
            return allowed.has(base);
        });
    return clean.length ? [...new Set(clean)] : access.permissions;
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
export async function syncFranchiseSubAdmin(id, { password, permissions, zoneId, taxiZoneId, overrideFeeCheck = false, regeneratePassword = false }) {
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new Error('Application not found');

    const access = accessFor(app);
    const targetZoneId = access.modules.includes('food') ? (zoneId || app.zoneId) : null;
    if (access.modules.includes('food') && zoneId && String(zoneId) !== String(app.zoneId)) {
        await assertFoodZoneFree(zoneId, app._id);
        app.zoneId = zoneId;
    }
    if (access.modules.includes('taxi') && taxiZoneId) {
        await assertTaxiZoneFree(taxiZoneId, app._id);
        app.taxiZoneId = taxiZoneId;
    }

    const subAdminPermissions = allowedPermissions(access, permissions);
    if (password !== undefined && password !== null && password !== '' && String(password).length < 8) {
        throw new MoneyError('Login password must be at least 8 characters');
    }

    let subAdmin = null;
    let isNewAccount = false;
    if (app.subAdminId) {
        subAdmin = await FoodAdmin.findById(app.subAdminId);
    }
    if (!subAdmin) {
        subAdmin = await FoodAdmin.findOne({ email: app.email.toLowerCase() });
        // Never turn an existing platform admin (or another franchise's login) into this franchise's login
        if (subAdmin) {
            const linkedElsewhere = subAdmin.franchiseId && String(subAdmin.franchiseId) !== String(app._id);
            const isFranchiseLogin = ['franchise', 'franchise_partner'].includes(String(subAdmin.admin_type || '').toLowerCase());
            if (linkedElsewhere || !isFranchiseLogin) {
                throw new MoneyError('This email already belongs to another admin account. Use a different email for the franchise login.', 409);
            }
        }
    }
    if (!subAdmin) {
        subAdmin = await FoodAdmin.findOne({ franchiseId: app._id });
    }

    // Random one-time password (shown to the admin once in the response). Never a shared default.
    const plainPassword = password || generatePassword();
    // An existing login keeps its password unless one is typed in or the admin explicitly asks for a new random one.
    let passwordIssued = Boolean(password) || regeneratePassword === true;
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
        if (passwordIssued) {
            subAdmin.password = plainPassword; // pre-save hook will hash it
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

    if (status === 'approved') {
        await ensureLegacyCharges(app.toObject());
    }

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
 * Update payout terms, zones and modules of a franchise.
 * Fees, deposit and commission are NOT edited here any more: they have their own audited endpoints
 * (charges / commission rules), so this route can never mark a fee as paid or change a rate.
 */
export async function updateCommissionSettings(id, body = {}, actor = {}) {
    const blocked = ['franchiseFee', 'franchiseFeeStatus', 'moduleCommissions', 'moduleFranchiseFees', 'commissionRate', 'walletBalance'];
    const sent = blocked.filter((k) => body[k] !== undefined);
    if (sent.length) {
        throw new MoneyError(`${sent.join(', ')} cannot be changed here. Use the Fees & deposit or Commission section (every change there is verified and audited).`);
    }
    const { payoutCycle, minPayoutThreshold, paymentAccountInfo, zoneId, selectedModules, taxiZoneId } = body;
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new MoneyError('Application not found', 404);
    const before = {
        payoutCycle: app.payoutCycle, minPayoutThreshold: app.minPayoutThreshold, zoneId: app.zoneId, taxiZoneId: app.taxiZoneId,
        selectedModules: normalizeModules(app.selectedModules),
    };

    if (payoutCycle !== undefined) {
        if (!['weekly', 'biweekly', 'monthly'].includes(payoutCycle)) throw new MoneyError('Invalid payout cycle');
        app.payoutCycle = payoutCycle;
    }
    if (minPayoutThreshold !== undefined) app.minPayoutThreshold = fromPaise(parseRupeesInput(minPayoutThreshold, { field: 'Minimum payout' }));
    if (paymentAccountInfo !== undefined && paymentAccountInfo && typeof paymentAccountInfo === 'object') {
        const cur = app.paymentAccountInfo || {};
        const pick = (k, max) => String(paymentAccountInfo[k] ?? cur[k] ?? '').trim().slice(0, max);
        app.paymentAccountInfo = {
            bankName: pick('bankName', 80), accountNumber: pick('accountNumber', 34), ifscCode: pick('ifscCode', 11).toUpperCase(),
            upiId: pick('upiId', 80), accountHolderName: pick('accountHolderName', 120),
        };
    }
    if (selectedModules !== undefined) {
        const mods = normalizeModules(selectedModules);
        if (!Array.isArray(selectedModules) || !selectedModules.length) throw new MoneyError('Choose at least one service');
        app.selectedModules = mods;
    }

    if (taxiZoneId !== undefined) {
        if (taxiZoneId) await assertTaxiZoneFree(taxiZoneId, app._id);
        app.taxiZoneId = taxiZoneId || null;
    }

    if (zoneId !== undefined) {
        if (zoneId) await assertFoodZoneFree(zoneId, app._id);
        app.zoneId = zoneId || null;
        if (app.subAdminId && zoneId) {
            await FoodAdmin.findByIdAndUpdate(app.subAdminId, { $addToSet: { food_zone_ids: zoneId } });
        }
    }
    await app.save();
    await applyAccessToLogin(app); // a changed plan changes what the login may use
    await writeAudit({
        actor, franchiseId: app._id, entity: 'franchise', entityId: app._id, action: 'franchise.update_terms',
        before, after: {
            payoutCycle: app.payoutCycle, minPayoutThreshold: app.minPayoutThreshold, zoneId: app.zoneId, taxiZoneId: app.taxiZoneId,
            selectedModules: normalizeModules(app.selectedModules), bankDetailsChanged: paymentAccountInfo !== undefined,
        },
        reason: String(body.reason || '').slice(0, 500),
    });
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

    const foodRate = bpsToPercent((await resolveRates(app)).food.rateBps);

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
export async function updateFormConfig({ fields, requiredDocuments, moduleFranchiseFees, moduleCommissions, paymentDetails, taxiSettings, applicationSettings }, adminUserId) {
    let config = await FranchiseFormConfig.findOne();
    if (!config) {
        config = new FranchiseFormConfig();
    }
    if (fields !== undefined) config.fields = fields;
    if (requiredDocuments !== undefined) config.requiredDocuments = requiredDocuments;
    if (moduleFranchiseFees !== undefined) config.moduleFranchiseFees = normalizeFees({ ...normalizeFees(config.moduleFranchiseFees), ...moduleFranchiseFees });
    if (moduleCommissions !== undefined) config.moduleCommissions = normalizeCommissions({ ...normalizeCommissions(config.moduleCommissions), ...moduleCommissions });
    if (paymentDetails !== undefined) config.paymentDetails = { ...config.paymentDetails, ...paymentDetails };
    if (applicationSettings !== undefined) {
        const cur = config.applicationSettings?.toObject ? config.applicationSettings.toObject() : (config.applicationSettings || {});
        const next = { ...cur };
        if (applicationSettings.automaticFormEnabled !== undefined) next.automaticFormEnabled = Boolean(applicationSettings.automaticFormEnabled);
        if (applicationSettings.closedTitle !== undefined) next.closedTitle = String(applicationSettings.closedTitle).trim().slice(0, 120);
        if (applicationSettings.closedMessage !== undefined) next.closedMessage = String(applicationSettings.closedMessage).trim().slice(0, 1000);
        if (next.automaticFormEnabled === false && !next.closedMessage) throw new Error('Enter the message users should see while the form is off');
        config.applicationSettings = next;
        config.markModified('applicationSettings');
    }
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

const PHONE_RE = /^\+?\d{10,15}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PIN_RE = /^\d{6}$/;
const txt = (v, max, field, required = false) => {
    const s = String(v ?? '').trim();
    if (required && !s) throw new MoneyError(`${field} is required`);
    if (s.length > max) throw new MoneyError(`${field} is too long`);
    return s;
};

/**
 * Manual franchise creation by a platform super admin (the main way franchises are created now).
 * Only whitelisted fields are read (no mass assignment): status is always "approved", the fee is never "paid" here.
 * Pricing comes from the territory unless the admin types an override. Optional commission override = a franchise
 * rule version. Everything financial is created in one transaction with its audit rows.
 */
const cleanAdditionalFields = (obj) => {
    const out = {};
    if (!obj || typeof obj !== 'object') return out;
    Object.entries(obj).slice(0, 30).forEach(([k, v]) => {
        const key = String(k).slice(0, 60);
        const val = String(v ?? '').trim().slice(0, 1000);
        if (key && val) out[key] = val;
    });
    return out;
};

const cleanDocuments = (docs) => (Array.isArray(docs) ? docs : []).slice(0, 20)
    .map((d) => ({ key: String(d?.key || '').slice(0, 60), label: String(d?.label || '').slice(0, 120), url: String(d?.url || '').slice(0, 1000) }))
    .filter((d) => d.key && /^https?:\/\//i.test(d.url));

export async function createApplication(data = {}, actor = {}) {
    const applicantName = txt(data.applicantName, 120, 'Partner name', true);
    const phone = txt(data.phone, 16, 'Phone', true).replace(/[\s-]/g, '');
    if (!PHONE_RE.test(phone)) throw new MoneyError('Phone must be 10-15 digits');
    const email = txt(data.email, 160, 'Email', true).toLowerCase();
    if (!EMAIL_RE.test(email)) throw new MoneyError('Invalid email');
    const pincode = txt(data.pincode, 6, 'Pincode');
    if (pincode && !PIN_RE.test(pincode)) throw new MoneyError('Pincode must be 6 digits');

    const services = Array.isArray(data.selectedModules) ? data.selectedModules.filter((m) => ['food', 'taxi'].includes(m)) : [];
    if (!services.length) throw new MoneyError('Choose Food, Taxi or both');
    const selectedModules = normalizeModules(services);

    if (!mongoose.Types.ObjectId.isValid(String(data.territoryId || ''))) throw new MoneyError('Choose the territory (zone) of this franchise');
    const territory = await FranchiseTerritory.findById(data.territoryId).lean();
    if (!territory) throw new MoneyError('Territory not found', 404);
    if (territory.isActive === false) throw new MoneyError('This territory is inactive');
    const zoneId = selectedModules.includes('food') ? territory.foodZoneId : null;
    const taxiZoneId = selectedModules.includes('taxi') ? territory.taxiZoneId : null;
    if (selectedModules.includes('food') && !zoneId) throw new MoneyError('This territory has no Food zone. Add one to the territory or untick Food.');
    if (selectedModules.includes('taxi') && !taxiZoneId) throw new MoneyError('This territory has no Taxi zone. Add one to the territory or untick Taxi.');
    const has = (v) => v !== undefined && v !== null && v !== '';
    const joiningFeePaise = has(data.joiningFee) ? parseRupeesInput(data.joiningFee, { field: 'Joining fee' }) : territory.joiningFeePaise;
    const securityDepositPaise = has(data.securityDeposit) ? parseRupeesInput(data.securityDeposit, { field: 'Security deposit' }) : territory.securityDepositPaise;
    const overridden = joiningFeePaise !== territory.joiningFeePaise || securityDepositPaise !== territory.securityDepositPaise;
    const overrideReason = String(data.overrideReason || '').trim();
    if (overridden && overrideReason.length < 3) throw new MoneyError('A reason is required when the fee or deposit differs from the territory price');

    const payoutCycle = ['weekly', 'biweekly', 'monthly'].includes(data.payoutCycle) ? data.payoutCycle : 'weekly';
    const minPayoutThreshold = has(data.minPayoutThreshold) ? fromPaise(parseRupeesInput(data.minPayoutThreshold, { field: 'Minimum payout' })) : 5000;
    const commissionOverride = data.commission && data.commission.useDefault !== true ? data.commission : null;

    // Input errors first (400), then ownership conflicts (409)
    if (zoneId) await assertFoodZoneFree(zoneId, null);
    if (taxiZoneId) await assertTaxiZoneFree(taxiZoneId, null);

    if (data.createSubAdmin) {
        const clash = await FoodAdmin.findOne({ email }).select('_id').lean();
        if (clash) throw new MoneyError('An admin account with this email already exists. Use another email for the franchise login.', 409);
        if (has(data.subAdminPassword) && String(data.subAdminPassword).length < 8) throw new MoneyError('Login password must be at least 8 characters');
    }

    const appId = await withTransaction(async (session) => {
        const [app] = await FranchiseApplication.create([{
            applicantName, phone, email,
            companyName: txt(data.companyName, 160, 'Company'),
            businessType: txt(data.businessType, 60, 'Business type') || 'Proprietorship',
            investmentRange: txt(data.investmentRange, 60, 'Investment range'),
            experience: txt(data.experience, 60, 'Experience'),
            additionalFields: cleanAdditionalFields(data.additionalFields),
            documents: cleanDocuments(data.documents),
            state: txt(data.state, 80, 'State', true),
            city: txt(data.city, 80, 'City', true),
            area: txt(data.area, 120, 'Area'),
            pincode,
            zoneId, taxiZoneId,
            territoryId: territory._id,
            origin: 'admin',
            selectedModules,
            franchiseFee: fromPaise(joiningFeePaise),
            franchiseFeeStatus: 'pending',
            payoutCycle, minPayoutThreshold,
            status: 'approved',
            adminNote: txt(data.adminNote, 500, 'Note') || 'Created by admin',
            reviewedBy: actor?.id || null,
            reviewedAt: new Date(),
        }], opts(session));

        await ensureCharges(app._id, { joiningFeePaise, securityDepositPaise, territory }, { session });
        await writeAudit({
            actor, franchiseId: app._id, entity: 'franchise', entityId: app._id, action: 'franchise.create',
            after: {
                applicationId: app.applicationId, name: applicantName, email, phone, territory: territory.name, services: selectedModules,
                joiningFee: fromPaise(joiningFeePaise), securityDeposit: fromPaise(securityDepositPaise), overridden,
            },
            reason: overridden ? overrideReason : 'Franchise created by admin',
        }, { session });
        return app._id;
    });

    // Make the legacy fee fields match (e.g. both amounts 0 -> nothing to pay)
    await syncLegacyFeeFields(appId);

    let commission = null;
    if (commissionOverride) {
        commission = await createRuleVersion({
            scope: 'franchise', scopeId: appId,
            body: { ...commissionOverride, reason: commissionOverride.reason || 'Commission set when the franchise was created' },
        }, actor);
    }

    let credentialsInfo = null;
    if (data.createSubAdmin) {
        const res = await syncFranchiseSubAdmin(appId, { password: data.subAdminPassword || undefined, zoneId });
        credentialsInfo = res.credentialsInfo;
        await syncLegacyFeeFields(appId); // lock/unlock the new login by the payment state
    }

    const app = await getApplicationById(appId);
    return { ...app, commission, credentialsInfo };
}

/** Move a franchise to another territory. Only future transactions use the new territory's rates and zones. */
export async function changeTerritory(id, { territoryId, reason } = {}, actor = {}) {
    const why = String(reason || '').trim();
    if (why.length < 3) throw new MoneyError('A reason is required');
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new MoneyError('Franchise not found', 404);
    if (!mongoose.Types.ObjectId.isValid(String(territoryId || ''))) throw new MoneyError('Choose a territory');
    const territory = await FranchiseTerritory.findById(territoryId).lean();
    if (!territory) throw new MoneyError('Territory not found', 404);
    if (String(app.territoryId || '') === String(territory._id)) throw new MoneyError('The franchise is already in this territory');

    const mods = normalizeModules(app.selectedModules);
    const zoneId = mods.includes('food') ? territory.foodZoneId : null;
    const taxiZoneId = mods.includes('taxi') ? territory.taxiZoneId : null;
    if (mods.includes('food') && !zoneId) throw new MoneyError('The new territory has no Food zone');
    if (mods.includes('taxi') && !taxiZoneId) throw new MoneyError('The new territory has no Taxi zone');
    if (zoneId) await assertFoodZoneFree(zoneId, app._id);
    if (taxiZoneId) await assertTaxiZoneFree(taxiZoneId, app._id);

    const before = { territoryId: app.territoryId, zoneId: app.zoneId, taxiZoneId: app.taxiZoneId };
    app.territoryId = territory._id;
    app.zoneId = zoneId || null;
    app.taxiZoneId = taxiZoneId || null;
    await app.save();
    if (app.subAdminId && zoneId) await FoodAdmin.findByIdAndUpdate(app.subAdminId, { $addToSet: { food_zone_ids: zoneId } });
    await writeAudit({
        actor, franchiseId: app._id, entity: 'franchise', entityId: app._id, action: 'franchise.change_territory',
        before, after: { territoryId: territory._id, territory: territory.name, zoneId, taxiZoneId }, reason: why,
    });
    return getApplicationById(id);
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

/**
 * Approve (= paid out) or reject a partner's payout request.
 * Approving needs the bank/UPI reference of the transfer. The request is claimed and the wallet debited in ONE
 * transaction, so two admins (or a double click) can never pay twice or approve-and-reject the same request.
 */
export async function updatePayoutRequestStatus(id, requestId, { status, adminNote, transactionId } = {}, actor = {}) {
    if (!['approved', 'rejected'].includes(status)) throw new MoneyError('Status must be approved or rejected');
    const note = String(adminNote || '').trim().slice(0, 500);
    const ref = String(transactionId || '').trim();
    if (status === 'approved' && (ref.length < 4 || ref.length > 120)) {
        throw new MoneyError('Enter the bank / UPI transaction reference of the payout (4-120 characters)');
    }

    const app = await FranchiseApplication.findById(id).select('payoutRequests').lean();
    if (!app) throw new MoneyError('Application not found', 404);
    const reqItem = (app.payoutRequests || []).find((p) => p.requestId === requestId || String(p._id) === String(requestId));
    if (!reqItem) throw new MoneyError('Payout request not found', 404);
    if (reqItem.status !== 'pending') throw new MoneyError(`Payout request is already ${reqItem.status}`, 409);
    const key = reqItem.requestId || String(reqItem._id);

    await withTransaction(async (session) => {
        const claim = await FranchiseApplication.updateOne(
            { _id: app._id, payoutRequests: { $elemMatch: { _id: reqItem._id, status: 'pending' } } },
            { $set: {
                'payoutRequests.$.status': status,
                'payoutRequests.$.processedAt': new Date(),
                'payoutRequests.$.adminNote': note,
                ...(status === 'approved' ? { 'payoutRequests.$.transactionId': ref } : {}),
            } },
            opts(session),
        );
        if (claim.modifiedCount === 0) throw new MoneyError('This payout request was already processed', 409);
        if (status === 'approved') {
            const paise = toPaise(reqItem.amount);
            await postRowsInSession(session, app._id, [{
                franchiseId: app._id, module: null, account: 'wallet', type: 'payout', amountPaise: -paise, amount: -fromPaise(paise),
                refType: 'payout', refId: key, sourceId: key, engineVersion: 2, createdBy: actor?.id || null,
                note: `Payout ${key} (ref ${ref})`,
            }], { requireWalletAtLeast: paise });
        }
        await writeAudit({
            actor, franchiseId: app._id, entity: 'payout', entityId: key, action: `payout.${status}`,
            before: { status: 'pending', amount: reqItem.amount }, after: { status, amount: reqItem.amount, reference: ref }, reason: note,
        }, { session });
    });
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

    if (status === 'approved_by_admin') {
        const FoodOrder = mongoose.models.FoodOrder;
        const orderRef = refundItem.orderId;
        const order = FoodOrder && await FoodOrder.findOne(
            mongoose.Types.ObjectId.isValid(String(orderRef)) ? { _id: orderRef, franchiseId: app._id } : { order_id: orderRef, franchiseId: app._id }
        ).select('_id pricing.total payment.refund').lean();
        if (!order) throw new Error('The order of this claim was not found in the franchise territory');
        // The franchise can only be paid back for money it REALLY paid out, never more than that
        const paid = order.payment?.refund;
        if (paid?.status !== 'processed' || paid?.paidBy !== 'franchise') {
            throw new Error('This refund was not recorded as paid by the franchise, so it cannot be reimbursed.');
        }
        const claimAmount = Math.min(Number(refundItem.amount) || 0, Number(paid.amount) || 0);
        if (claimAmount <= 0) throw new Error('Nothing to reimburse for this claim.');

        // 1. Pay the franchise back (idempotent per claim)
        await reimburseFranchiseRefund(app._id, refundItem.id || String(refundItem._id), claimAmount, { orderId: order._id });

        // 2. A refunded order earns the franchise nothing. The refund itself already took the commission back
        //    (order-cancel.service > applyRefundBooks); only do it here if that never happened.
        const alreadyReversed = await FranchiseLedger.exists({ sourceId: String(order._id), type: { $in: ['earning_reversal', 'reversal'] } });
        if (!alreadyReversed) {
            await reverseFoodOrder(order._id, {
                refundAmount: claimAmount, orderTotal: Number(order.pricing?.total || 0),
                refundKey: `claim:${refundItem.id || refundItem._id}`, note: 'Refund claim approved',
            });
        }
    }

    await app.save();
    return getApplicationById(id);
}



