import mongoose from 'mongoose';
import FranchiseApplication from '../models/franchiseApplication.model.js';
import FranchiseLedger from '../models/franchiseLedger.model.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import { getTaxiOverview } from './franchiseTaxi.service.js';
import {
    normalizeModules, normalizeCommissions, getCommissionRate, roundMoney,
} from './franchisePlan.js';

class FranchiseAdminError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const model = (name) => mongoose.models[name] || null;
const paging = ({ page = 1, limit = 20 } = {}) => {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return { page: p, limit: l, skip: (p - 1) * l };
};

async function mustFind(id) {
    if (!mongoose.Types.ObjectId.isValid(String(id))) throw new FranchiseAdminError('Invalid franchise id');
    const app = await FranchiseApplication.findById(id);
    if (!app) throw new FranchiseAdminError('Franchise not found', 404);
    return app;
}

/**
 * Everything an admin needs to see about one franchise on one screen:
 * account state, territory, restaurants, orders, money. All figures are matched by franchiseId only.
 */
export async function getFranchiseOverview(id) {
    const app = await mustFind(id);
    const fid = app._id;
    const FoodOrder = model('FoodOrder');
    const FoodRestaurant = model('FoodRestaurant');
    const FoodItem = model('FoodItem');

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const [restaurantByStatus, orderAgg, todayAgg, itemCount] = await Promise.all([
        FoodRestaurant
            ? FoodRestaurant.aggregate([
                { $match: { franchiseId: fid } },
                { $group: { _id: { $ifNull: ['$status', 'unknown'] }, count: { $sum: 1 }, active: { $sum: { $cond: [{ $ne: ['$isActive', false] }, 1, 0] } } } },
            ])
            : [],
        FoodOrder
            ? FoodOrder.aggregate([
                { $match: { franchiseId: fid } },
                { $group: {
                    _id: '$orderStatus',
                    count: { $sum: 1 },
                    gmv: { $sum: { $ifNull: ['$pricing.total', 0] } },
                } },
            ])
            : [],
        FoodOrder
            ? FoodOrder.aggregate([
                { $match: { franchiseId: fid, createdAt: { $gte: startOfToday } } },
                { $group: { _id: null, orders: { $sum: 1 }, gmv: { $sum: { $ifNull: ['$pricing.total', 0] } } } },
            ])
            : [],
        FoodItem && FoodRestaurant
            ? FoodRestaurant.find({ franchiseId: fid }).distinct('_id').then(ids => FoodItem.countDocuments({ restaurantId: { $in: ids }, isDeleted: { $ne: true } }))
            : 0,
    ]);

    const restaurants = { total: 0, active: 0, byStatus: {} };
    restaurantByStatus.forEach(r => {
        restaurants.byStatus[r._id] = r.count;
        restaurants.total += r.count;
        restaurants.active += r.active;
    });

    const orders = { total: 0, delivered: 0, cancelled: 0, inProgress: 0, deliveredGMV: 0, byStatus: {} };
    orderAgg.forEach(o => {
        const st = String(o._id || 'unknown');
        orders.byStatus[st] = o.count;
        orders.total += o.count;
        if (st === 'delivered') { orders.delivered += o.count; orders.deliveredGMV += o.gmv; }
        else if (st.startsWith('cancelled') || st === 'rejected') orders.cancelled += o.count;
        else orders.inProgress += o.count;
    });
    orders.deliveredGMV = roundMoney(orders.deliveredGMV);

    const [ledgerAgg] = await FranchiseLedger.aggregate([
        { $match: { franchiseId: fid } },
        { $group: {
            _id: null,
            earned: { $sum: { $cond: [{ $in: ['$type', ['credit', 'reversal']] }, '$amount', 0] } },
            paidOut: { $sum: { $cond: [{ $eq: ['$type', 'payout'] }, { $multiply: ['$amount', -1] }, 0] } },
        } },
    ]);

    const payouts = app.payoutRequests || [];
    const pendingPayoutAmount = payouts.filter(p => p.status === 'pending').reduce((s, p) => s + (Number(p.amount) || 0), 0);

    let login = null;
    if (app.subAdminId) {
        const admin = await FoodAdmin.findById(app.subAdminId).select('email name phone status active isActive updatedAt').lean();
        if (admin) {
            login = {
                id: admin._id, email: admin.email, name: admin.name, phone: admin.phone,
                active: admin.active !== false && admin.isActive !== false && admin.status !== 'inactive',
            };
        }
    }

    const modules = normalizeModules(app.selectedModules);

    let taxi = null;
    if (modules.includes('taxi')) {
        try {
            taxi = await getTaxiOverview(app._id);
        } catch (err) {
            taxi = null;
        }
    }
    return {
        taxi,
        franchise: {
            id: app._id,
            applicationId: app.applicationId,
            applicantName: app.applicantName,
            companyName: app.companyName || '',
            phone: app.phone,
            email: app.email,
            state: app.state, city: app.city, area: app.area, pincode: app.pincode,
            zoneId: app.zoneId,
            taxiZoneId: app.taxiZoneId || null,
            selectedModules: modules,
            status: app.status,
            accountStatus: app.accountStatus || 'active',
            suspendReason: app.suspendReason || '',
            suspendedAt: app.suspendedAt || null,
            archived: Boolean(app.archived),
            franchiseFee: app.franchiseFee,
            franchiseFeeStatus: app.franchiseFeeStatus,
            franchiseFeePaidAt: app.franchiseFeePaidAt,
            commissionRate: getCommissionRate(modules, app.moduleCommissions, 'food'),
            moduleCommissions: normalizeCommissions(app.moduleCommissions),
            createdAt: app.createdAt,
            approvedAt: app.reviewedAt,
        },
        login,
        restaurants: { ...restaurants, menuItems: itemCount },
        orders: { ...orders, today: todayAgg[0]?.orders || 0, todayGMV: roundMoney(todayAgg[0]?.gmv || 0) },
        money: {
            walletBalance: roundMoney(app.walletBalance || 0),
            totalEarned: roundMoney(ledgerAgg?.earned || 0),
            totalPaidOut: roundMoney(ledgerAgg?.paidOut || 0),
            pendingPayoutRequests: payouts.filter(p => p.status === 'pending').length,
            pendingPayoutAmount: roundMoney(pendingPayoutAmount),
        },
    };
}

export async function listFranchiseRestaurants(id, query = {}) {
    const app = await mustFind(id);
    const FoodRestaurant = model('FoodRestaurant');
    const FoodOrder = model('FoodOrder');
    const { page, limit, skip } = paging(query);
    if (!FoodRestaurant) return { items: [], total: 0, page, limit };

    const filter = { franchiseId: app._id };
    if (query.status) filter.status = query.status;
    if (query.search) filter.restaurantName = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

    const [rows, total] = await Promise.all([
        FoodRestaurant.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
            .select('restaurantName name ownerName ownerPhone primaryContactNumber ownerEmail status isActive isAcceptingOrders createdAt address city').lean(),
        FoodRestaurant.countDocuments(filter),
    ]);

    // per-restaurant order numbers for this page only
    const stats = FoodOrder && rows.length
        ? await FoodOrder.aggregate([
            { $match: { franchiseId: app._id, restaurantId: { $in: rows.map(r => r._id) } } },
            { $group: {
                _id: '$restaurantId',
                orders: { $sum: 1 },
                delivered: { $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, 1, 0] } },
                gmv: { $sum: { $cond: [{ $eq: ['$orderStatus', 'delivered'] }, { $ifNull: ['$pricing.total', 0] }, 0] } },
            } },
        ])
        : [];
    const byId = new Map(stats.map(s => [String(s._id), s]));

    return {
        items: rows.map(r => {
            const s = byId.get(String(r._id));
            return {
                id: r._id,
                name: r.restaurantName || r.name || 'Unnamed',
                ownerName: r.ownerName || '',
                phone: r.ownerPhone || r.primaryContactNumber || '',
                email: r.ownerEmail || '',
                status: r.status || '',
                isActive: r.isActive !== false,
                acceptingOrders: r.isAcceptingOrders !== false,
                city: r.address?.city || r.city || '',
                createdAt: r.createdAt,
                orders: s?.orders || 0,
                delivered: s?.delivered || 0,
                gmv: roundMoney(s?.gmv || 0),
            };
        }),
        total, page, limit,
    };
}

export async function listFranchiseOrders(id, query = {}) {
    const app = await mustFind(id);
    const FoodOrder = model('FoodOrder');
    const { page, limit, skip } = paging(query);
    if (!FoodOrder) return { items: [], total: 0, page, limit };

    const filter = { franchiseId: app._id };
    if (query.status === 'cancelled') filter.orderStatus = /^cancelled/;
    else if (query.status) filter.orderStatus = query.status;
    if (query.restaurantId && mongoose.Types.ObjectId.isValid(String(query.restaurantId))) filter.restaurantId = oid(query.restaurantId);
    if (query.from || query.to) {
        filter.createdAt = {};
        if (query.from) filter.createdAt.$gte = new Date(query.from);
        if (query.to) filter.createdAt.$lte = new Date(query.to);
    }

    const [rows, total] = await Promise.all([
        FoodOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
            .select('order_id orderId customerName customerPhone restaurantId orderStatus pricing.total pricing.restaurantCommission pricing.platformFee payment.method payment.status createdAt').lean(),
        FoodOrder.countDocuments(filter),
    ]);

    const FoodRestaurant = model('FoodRestaurant');
    const rests = FoodRestaurant && rows.length
        ? await FoodRestaurant.find({ _id: { $in: [...new Set(rows.map(r => String(r.restaurantId)))] } }).select('restaurantName name').lean()
        : [];
    const nameById = new Map(rests.map(r => [String(r._id), r.restaurantName || r.name]));

    // which of these orders already earned the franchise money
    const credits = rows.length
        ? await FranchiseLedger.find({ franchiseId: app._id, refType: 'order', refId: { $in: rows.map(r => String(r._id)) } }).select('refId type amount').lean()
        : [];
    const earned = new Map();
    credits.forEach(c => earned.set(c.refId, (earned.get(c.refId) || 0) + c.amount));

    return {
        items: rows.map(o => ({
            id: o._id,
            orderId: o.order_id || o.orderId || String(o._id).slice(-8),
            customerName: o.customerName || 'Customer',
            customerPhone: o.customerPhone || '',
            restaurantName: nameById.get(String(o.restaurantId)) || '',
            status: o.orderStatus,
            total: o.pricing?.total || 0,
            paymentMethod: o.payment?.method || '',
            paymentStatus: o.payment?.status || '',
            franchiseEarned: roundMoney(earned.get(String(o._id)) || 0),
            createdAt: o.createdAt,
        })),
        total, page, limit,
    };
}

export async function listFranchiseLedger(id, query = {}) {
    const app = await mustFind(id);
    const { page, limit, skip } = paging(query);
    const [items, total] = await Promise.all([
        FranchiseLedger.find({ franchiseId: app._id }).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        FranchiseLedger.countDocuments({ franchiseId: app._id }),
    ]);
    return {
        items, total, page, limit,
        payouts: [...(app.payoutRequests || [])].sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)).slice(0, 50),
    };
}

// ─── Account control ────────────────────────────────────────────────────────

/** Suspend = franchise login stops working immediately; data and money stay untouched. */
export async function suspendFranchise(id, reason) {
    const app = await mustFind(id);
    app.accountStatus = 'suspended';
    app.suspendReason = String(reason || '').trim();
    app.suspendedAt = new Date();
    await app.save();
    if (app.subAdminId) {
        await FoodAdmin.findByIdAndUpdate(app.subAdminId, { active: false, isActive: false, status: 'inactive' });
    }
    return getFranchiseOverview(id);
}

/** Activate = login works again, but only if the franchise is approved and its fee is settled. */
export async function activateFranchise(id) {
    const app = await mustFind(id);
    if (app.archived) throw new FranchiseAdminError('This franchise is archived. Restore it first.');
    app.accountStatus = 'active';
    app.suspendReason = '';
    app.suspendedAt = null;
    await app.save();

    const eligible = app.status === 'approved' && ['paid', 'waived'].includes(app.franchiseFeeStatus);
    if (app.subAdminId && eligible) {
        await FoodAdmin.findByIdAndUpdate(app.subAdminId, { active: true, isActive: true, status: 'active' });
    }
    const overview = await getFranchiseOverview(id);
    overview.note = eligible || !app.subAdminId ? '' : 'Account marked active, but the login stays locked until the application is approved and the fee is paid or waived.';
    return overview;
}

const EDITABLE = ['applicantName', 'phone', 'email', 'companyName', 'state', 'city', 'area', 'pincode'];

/** Edit franchise details; name / phone / email are mirrored to the franchise login. */
export async function updateFranchiseProfile(id, body = {}) {
    const app = await mustFind(id);

    EDITABLE.forEach((key) => {
        if (body[key] !== undefined) app[key] = typeof body[key] === 'string' ? body[key].trim() : body[key];
    });
    if (body.zoneId !== undefined) {
        app.zoneId = body.zoneId || null;
    }
    if (body.selectedModules !== undefined) {
        app.selectedModules = normalizeModules(body.selectedModules);
    }
    if (!app.applicantName || !app.phone || !app.email) throw new FranchiseAdminError('Name, phone and email are required');

    if (body.email !== undefined && app.subAdminId) {
        const clash = await FoodAdmin.findOne({ email: String(app.email).toLowerCase(), _id: { $ne: app.subAdminId } }).select('_id').lean();
        if (clash) throw new FranchiseAdminError('Another account already uses this email');
    }

    await app.save();

    if (app.subAdminId) {
        const patch = { name: app.applicantName, phone: app.phone, email: String(app.email).toLowerCase() };
        if (app.zoneId) patch.$addToSet = { food_zone_ids: app.zoneId };
        await FoodAdmin.findByIdAndUpdate(app.subAdminId, patch);
    }
    return getFranchiseOverview(id);
}

/**
 * Delete a franchise.
 *  - No orders, no ledger, no money -> permanently deleted together with its login.
 *  - Otherwise -> archived (hidden, login locked) so order / money history is never lost.
 */
export async function removeFranchise(id) {
    const app = await mustFind(id);
    const FoodOrder = model('FoodOrder');
    const FoodRestaurant = model('FoodRestaurant');

    const [hasLedger, hasOrders, hasRestaurants] = await Promise.all([
        FranchiseLedger.exists({ franchiseId: app._id }),
        FoodOrder ? FoodOrder.exists({ franchiseId: app._id }) : null,
        FoodRestaurant ? FoodRestaurant.exists({ franchiseId: app._id }) : null,
    ]);
    const hasMoney = Number(app.walletBalance) !== 0 || (app.payoutRequests || []).some(p => p.status === 'pending')
        || app.franchiseFeeStatus === 'paid' || app.franchiseFeeStatus === 'refund_due';

    if (!hasLedger && !hasOrders && !hasRestaurants && !hasMoney) {
        if (app.subAdminId) await FoodAdmin.findByIdAndDelete(app.subAdminId);
        await FranchiseApplication.findByIdAndDelete(app._id);
        return { deleted: true, archived: false };
    }

    app.archived = true;
    app.archivedAt = new Date();
    app.accountStatus = 'suspended';
    app.suspendReason = app.suspendReason || 'Archived by admin';
    app.suspendedAt = app.suspendedAt || new Date();
    await app.save();
    if (app.subAdminId) {
        await FoodAdmin.findByIdAndUpdate(app.subAdminId, { active: false, isActive: false, status: 'inactive' });
    }
    return {
        deleted: false,
        archived: true,
        reason: 'This franchise has orders, restaurants or money history, so it was archived instead of deleted. Its login is locked and its records are kept.',
    };
}

export async function restoreFranchise(id) {
    const app = await mustFind(id);
    app.archived = false;
    app.archivedAt = null;
    await app.save();
    return getFranchiseOverview(id);
}
