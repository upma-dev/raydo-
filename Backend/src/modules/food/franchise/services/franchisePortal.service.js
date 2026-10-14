import mongoose from 'mongoose';
import FranchiseApplication from '../../admin/models/franchiseApplication.model.js';
import { normalizeModules, roundMoney } from '../../admin/services/franchisePlan.js';
import { writeAudit } from '../../admin/services/franchiseAudit.service.js';

/**
 * FRANCHISE PORTAL: what a franchise partner manages itself, always limited to its own territory.
 *  - Food riders (delivery partners) of its zone: list, details, approve, reject
 *  - Taxi drivers of its taxi zone: details, approve, reject, block, unblock
 *  - Payments of its food orders (read-only)
 * The franchise id always comes from the verified login (req.user.franchiseId), never from the request.
 * A record outside the franchise answers 404 so ids of other franchises cannot be probed.
 */

export class PortalError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

const model = (name) => mongoose.models[name];
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const paging = ({ page = 1, limit = 20 } = {}) => {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
    return { page: p, limit: l, skip: (p - 1) * l };
};
const escapeRe = (s) => String(s || '').slice(0, 60).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const maskTail = (v, keep = 4) => {
    const s = String(v || '');
    return s.length > keep ? `${'•'.repeat(Math.min(8, s.length - keep))}${s.slice(-keep)}` : s;
};
const reasonOf = (r, min = 3) => {
    const s = String(r || '').trim();
    if (s.length < min) throw new PortalError('Please give a reason');
    return s.slice(0, 300);
};

/** The operating franchise of this login, holding `module`. */
async function franchiseFor(franchiseId, module) {
    if (!isId(franchiseId)) throw new PortalError('Franchise login required', 401);
    const app = await FranchiseApplication.findById(franchiseId)
        .select('applicantName selectedModules zoneId taxiZoneId accountStatus archived status').lean();
    // records created before accountStatus existed have no value: they are active
    if (!app || app.archived || (app.accountStatus || 'active') !== 'active' || app.status !== 'approved') {
        throw new PortalError('This franchise account is not active', 403);
    }
    if (module && !normalizeModules(app.selectedModules).includes(module)) {
        throw new PortalError(`Your franchise does not include the ${module === 'food' ? 'Food' : 'Taxi'} module`, 403);
    }
    return app;
}

const actorFor = (req) => ({ id: req.user?.userId || null, name: 'Franchise partner', email: '', level: 'franchise', ip: String(req.ip || '').slice(0, 64) });

/* ================================ FOOD RIDERS ================================ */

/** Riders of the franchise: stamped with its id, or registered in one of its zones. */
const riderScope = (app) => {
    const or = [{ franchiseId: app._id }];
    [app.zoneId, app.taxiZoneId].filter(Boolean).forEach((z) => or.push({ zoneId: z }));
    return { $or: or };
};

const riderRow = (r) => ({
    id: r._id,
    name: r.name || '-',
    phone: r.phone || '',
    email: r.email || '',
    city: r.city || '',
    zoneName: r.zoneName || '',
    vehicleType: r.vehicleType || '',
    vehicleName: r.vehicleName || '',
    vehicleNumber: r.vehicleNumber || '',
    status: r.status || 'pending',
    availability: r.availabilityStatus || 'offline',
    rating: r.rating || 0,
    totalRatings: r.totalRatings || 0,
    rejectionReason: r.rejectionReason || '',
    joinedAt: r.createdAt,
    approvedAt: r.approvedAt || null,
});

export async function listRiders(franchiseId, query = {}) {
    const app = await franchiseFor(franchiseId, 'food');
    const Rider = model('FoodDeliveryPartner');
    const { page, limit, skip } = paging(query);
    const filter = { ...riderScope(app) };
    if (['pending', 'approved', 'rejected'].includes(query.status)) filter.status = query.status;
    if (query.search) {
        const re = new RegExp(escapeRe(query.search), 'i');
        filter.$and = [{ $or: [{ name: re }, { phone: re }, { vehicleNumber: re }] }];
    }
    const [rows, total, counts] = await Promise.all([
        Rider.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
            .select('name phone email city zoneName vehicleType vehicleName vehicleNumber status availabilityStatus rating totalRatings rejectionReason createdAt approvedAt').lean(),
        Rider.countDocuments(filter),
        Rider.aggregate([{ $match: riderScope(app) }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    ]);
    const byStatus = Object.fromEntries(counts.map((c) => [c._id || 'pending', c.n]));
    return { items: rows.map(riderRow), total, page, limit, counts: { pending: byStatus.pending || 0, approved: byStatus.approved || 0, rejected: byStatus.rejected || 0 } };
}

async function mustOwnRider(app, riderId) {
    if (!isId(riderId)) throw new PortalError('Rider not found', 404);
    const rider = await model('FoodDeliveryPartner').findOne({ _id: oid(riderId), ...riderScope(app) }).lean();
    if (!rider) throw new PortalError('Rider not found', 404);
    return rider;
}

/** Rider details incl. the KYC images the partner needs to verify (bank details and full ids are masked). */
export async function getRider(franchiseId, riderId) {
    const app = await franchiseFor(franchiseId, 'food');
    const r = await mustOwnRider(app, riderId);
    return {
        ...riderRow(r),
        address: r.address || '',
        state: r.state || '',
        aadharNumber: maskTail(r.aadharNumber),
        panNumber: maskTail(r.panNumber),
        drivingLicenseNumber: r.drivingLicenseNumber || '',
        documents: {
            profilePhoto: r.profilePhoto || '',
            aadharFront: r.aadharPhoto || '',
            aadharBack: r.aadharPhotoBack || '',
            panFront: r.panPhoto || '',
            panBack: r.panPhotoBack || '',
            drivingLicenseFront: r.drivingLicensePhoto || '',
            drivingLicenseBack: r.drivingLicensePhotoBack || '',
        },
    };
}

export async function decideRider(req, riderId, { action, reason } = {}) {
    const app = await franchiseFor(req.user?.franchiseId, 'food');
    const rider = await mustOwnRider(app, riderId);
    const adminService = await import('../../admin/services/admin.service.js');
    let result;
    if (action === 'approve') {
        if (rider.status === 'approved') throw new PortalError('Rider is already approved', 409);
        result = await adminService.approveDeliveryPartner(rider._id);
        await model('FoodDeliveryPartner').updateOne({ _id: rider._id, franchiseId: null }, { $set: { franchiseId: app._id } });
    } else if (action === 'reject') {
        const why = reasonOf(reason);
        result = await adminService.rejectDeliveryPartner(rider._id, why);
    } else {
        throw new PortalError('Action must be approve or reject');
    }
    await writeAudit({
        actor: actorFor(req), franchiseId: app._id, entity: 'rider', entityId: rider._id, action: `rider.${action}`,
        before: { status: rider.status }, after: { status: action === 'approve' ? 'approved' : 'rejected' }, reason: reason || '',
    });
    return result ? getRider(app._id, rider._id) : null;
}

/* ================================ TAXI DRIVERS ================================ */

async function mustOwnDriver(app, driverId) {
    if (!app.taxiZoneId) throw new PortalError('No taxi zone is assigned to your franchise yet', 400);
    if (!isId(driverId)) throw new PortalError('Driver not found', 404);
    const d = await model('TaxiDriver').findOne({ _id: oid(driverId), zoneId: app.taxiZoneId, deletedAt: null }).lean();
    if (!d) throw new PortalError('Driver not found', 404);
    return d;
}

const driverState = (d) => {
    const st = String(d.status || '').toLowerCase();
    if (st === 'blocked') return 'blocked';
    if (st === 'rejected') return 'rejected';
    if (d.approve === false || st === 'pending') return 'pending';
    return 'approved';
};

/** Driver details incl. documents (uploaded files only; ids masked). */
export async function getTaxiDriver(franchiseId, driverId) {
    const app = await franchiseFor(franchiseId, 'taxi');
    const d = await mustOwnDriver(app, driverId);
    const docs = d.documents && typeof d.documents === 'object' ? d.documents : {};
    const files = {};
    if (d.profile_picture || d.profileImage) files.profilePhoto = d.profile_picture || d.profileImage;
    if (d.vehicleImage) files.vehicle = d.vehicleImage;
    Object.entries(docs).forEach(([k, v]) => {
        const url = typeof v === 'string' ? v : v?.url || v?.image || v?.file || '';
        if (url && /^https?:\/\//.test(url)) files[k] = url;
    });
    return {
        id: d._id,
        name: d.name || '-',
        phone: d.phone || '',
        email: d.email || '',
        state: driverState(d),
        status: d.status || '',
        online: d.isOnline === true,
        onRide: d.isOnRide === true,
        vehicleType: d.vehicleType || '',
        vehicleNumber: d.vehicleNumber || '',
        vehicleMake: d.vehicleMake || '',
        vehicleModel: d.vehicleModel || '',
        vehicleColor: d.vehicleColor || '',
        city: d.city || '',
        rating: d.rating || 0,
        ratingCount: d.ratingCount || 0,
        joinedAt: d.createdAt,
        blockReason: d.blockReason || d.rejectReason || '',
        documents: files,
    };
}

export async function decideTaxiDriver(req, driverId, { action, reason } = {}) {
    const app = await franchiseFor(req.user?.franchiseId, 'taxi');
    const d = await mustOwnDriver(app, driverId);
    const before = { state: driverState(d), approve: d.approve, status: d.status };
    let set;
    if (action === 'approve' || action === 'unblock') {
        set = { approve: true, status: 'approved', blockReason: '', rejectReason: '' };
    } else if (action === 'reject') {
        set = { approve: false, status: 'rejected', rejectReason: reasonOf(reason), isOnline: false };
    } else if (action === 'block') {
        if (d.isOnRide) throw new PortalError('The driver is on a ride now. Block after the ride ends.', 409);
        set = { approve: false, status: 'blocked', blockReason: reasonOf(reason), isOnline: false };
    } else {
        throw new PortalError('Action must be approve, reject, block or unblock');
    }
    // strict:false so the reason fields are kept even if the driver schema does not declare them
    await model('TaxiDriver').updateOne({ _id: d._id, zoneId: app.taxiZoneId }, { $set: set }, { strict: false });
    await writeAudit({
        actor: actorFor(req), franchiseId: app._id, entity: 'taxi_driver', entityId: d._id, action: `driver.${action}`,
        before, after: { state: driverState({ ...d, ...set }) }, reason: reason || '',
    });
    return getTaxiDriver(app._id, d._id);
}

/* ================================ FOOD PAYMENTS ================================ */

/**
 * Payments of the franchise's food orders: how each order was paid and how the money was split.
 * Read-only; amounts come from the order's FoodTransaction.
 */
export async function listFoodPayments(franchiseId, query = {}) {
    const app = await franchiseFor(franchiseId, 'food');
    const FoodOrder = model('FoodOrder');
    const FoodTransaction = model('FoodTransaction');
    const { page, limit, skip } = paging(query);
    const filter = { franchiseId: app._id };
    if (['cash', 'razorpay', 'razorpay_qr', 'wallet'].includes(query.method)) filter['payment.method'] = query.method;
    if (['paid', 'cod_pending', 'failed', 'refunded', 'created', 'authorized', 'pending_qr'].includes(query.status)) filter['payment.status'] = query.status;
    if (query.refund === 'yes') filter['payment.refund.status'] = { $in: ['pending', 'processed'] };
    const day = (v, end) => (/^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? new Date(`${v}T${end ? '23:59:59.999' : '00:00:00.000'}+05:30`) : null);
    const from = day(query.from, false);
    const to = day(query.to, true);
    if (from || to) filter.createdAt = { ...(from ? { $gte: from } : {}), ...(to ? { $lte: to } : {}) };

    const [orders, total, sums] = await Promise.all([
        FoodOrder.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit)
            .select('order_id orderId restaurantId orderStatus pricing.total payment.method payment.status payment.refund createdAt').lean(),
        FoodOrder.countDocuments(filter),
        FoodOrder.aggregate([
            { $match: filter },
            { $group: {
                _id: '$payment.method',
                orders: { $sum: 1 },
                amount: { $sum: { $ifNull: ['$pricing.total', 0] } },
                refunded: { $sum: { $cond: [{ $eq: ['$payment.refund.status', 'processed'] }, { $ifNull: ['$payment.refund.amount', 0] }, 0] } },
            } },
        ]),
    ]);
    const txs = FoodTransaction && orders.length
        ? await FoodTransaction.find({ orderId: { $in: orders.map((o) => o._id) } }).select('orderId amounts status settlement').lean()
        : [];
    const txBy = new Map(txs.map((t) => [String(t.orderId), t]));
    const Restaurant = model('FoodRestaurant');
    const rests = Restaurant && orders.length
        ? await Restaurant.find({ _id: { $in: [...new Set(orders.map((o) => String(o.restaurantId)))] } }).select('restaurantName').lean()
        : [];
    const restName = new Map(rests.map((r) => [String(r._id), r.restaurantName]));

    const byMethod = {};
    sums.forEach((s) => { byMethod[s._id || 'unknown'] = { orders: s.orders, amount: roundMoney(s.amount), refunded: roundMoney(s.refunded) }; });

    return {
        items: orders.map((o) => {
            const t = txBy.get(String(o._id));
            return {
                id: o._id,
                orderId: o.order_id || o.orderId || String(o._id).slice(-8),
                restaurantName: restName.get(String(o.restaurantId)) || '-',
                orderStatus: o.orderStatus,
                total: roundMoney(o.pricing?.total),
                method: o.payment?.method || '',
                paymentStatus: o.payment?.status || '',
                refundStatus: o.payment?.refund?.status || 'none',
                refundAmount: roundMoney(o.payment?.refund?.amount),
                restaurantShare: roundMoney(t?.amounts?.restaurantShare),
                riderShare: roundMoney(t?.amounts?.riderShare),
                platformEarning: roundMoney(t?.amounts?.platformNetProfit),
                tax: roundMoney(t?.amounts?.taxAmount),
                restaurantSettled: Boolean(t?.settlement?.isRestaurantSettled),
                createdAt: o.createdAt,
            };
        }),
        total, page, limit,
        summary: {
            byMethod,
            totalOrders: sums.reduce((s, x) => s + x.orders, 0),
            totalAmount: roundMoney(sums.reduce((s, x) => s + x.amount, 0)),
            totalRefunded: roundMoney(sums.reduce((s, x) => s + x.refunded, 0)),
        },
    };
}

/* ============================= FOOD DELIVERY FEES ============================= */

const slabDto = (r) => ({
    id: r._id,
    name: r.name || '',
    minDistance: r.minDistance,
    maxDistance: r.maxDistance ?? null,
    basePayout: r.basePayout,
    commissionPerKm: r.commissionPerKm,
    status: r.status !== false,
});

/**
 * Delivery fee of the franchise's food zone. The fee is distance based: base fee of the first slab + per-km
 * charge. It goes 100% to the rider, so it never changes platform commission or franchise earnings.
 * No zone slabs = the platform-wide slabs apply.
 */
export async function getDeliveryFees(franchiseId) {
    const app = await franchiseFor(franchiseId, 'food');
    if (!app.zoneId) throw new PortalError('No food zone is assigned to your franchise yet', 400);
    const Rule = model('FoodDeliveryCommissionRule');
    const [zoneRules, platformRules, zone] = await Promise.all([
        Rule.find({ zoneId: app.zoneId }).sort({ minDistance: 1 }).lean(),
        Rule.find({ zoneId: null, status: { $ne: false } }).sort({ minDistance: 1 }).lean(),
        model('FoodZone').findById(app.zoneId).select('name zoneName').lean(),
    ]);
    return {
        zone: { id: app.zoneId, name: zone?.name || zone?.zoneName || '' },
        usingZoneFees: zoneRules.some((r) => r.status !== false),
        zoneSlabs: zoneRules.map(slabDto),
        platformSlabs: platformRules.map(slabDto),
        limits: SLAB_LIMITS,
    };
}

const SLAB_LIMITS = { maxSlabs: 10, maxKm: 100, maxBasePayout: 1000, maxPerKm: 200 };

function cleanSlabs(input) {
    if (!Array.isArray(input) || !input.length) throw new PortalError('Add at least one distance slab');
    if (input.length > SLAB_LIMITS.maxSlabs) throw new PortalError(`At most ${SLAB_LIMITS.maxSlabs} slabs`);
    const num = (v, field, { max, allowNull = false } = {}) => {
        if (allowNull && (v === null || v === undefined || v === '')) return null;
        const n = Number(v);
        if (!Number.isFinite(n) || n < 0) throw new PortalError(`${field} must be 0 or more`);
        if (max !== undefined && n > max) throw new PortalError(`${field} can be at most ${max}`);
        return Math.round(n * 100) / 100;
    };
    const slabs = input.map((s, i) => ({
        name: String(s?.name || `Slab ${i + 1}`).trim().slice(0, 60),
        minDistance: num(s?.minDistance, `Slab ${i + 1}: from (km)`, { max: SLAB_LIMITS.maxKm }),
        maxDistance: num(s?.maxDistance, `Slab ${i + 1}: to (km)`, { max: SLAB_LIMITS.maxKm, allowNull: true }),
        basePayout: num(s?.basePayout, `Slab ${i + 1}: base fee`, { max: SLAB_LIMITS.maxBasePayout }),
        commissionPerKm: num(s?.commissionPerKm, `Slab ${i + 1}: per-km fee`, { max: SLAB_LIMITS.maxPerKm }),
        status: s?.status !== false,
    })).sort((a, b) => a.minDistance - b.minDistance);
    if (slabs[0].minDistance !== 0) throw new PortalError('The first slab must start at 0 km');
    return slabs;
}

/** Replace the zone's slabs (all or nothing, audited). */
export async function saveDeliveryFees(req, body = {}) {
    const app = await franchiseFor(req.user?.franchiseId, 'food');
    if (!app.zoneId) throw new PortalError('No food zone is assigned to your franchise yet', 400);
    const slabs = cleanSlabs(body.slabs);
    const { validateCommissionRuleSet } = await import('../../admin/services/admin.service.js');
    try {
        validateCommissionRuleSet(slabs);
    } catch (err) {
        throw new PortalError(err.message);
    }
    const Rule = model('FoodDeliveryCommissionRule');
    const { withTransaction, opts } = await import('../../admin/services/franchiseTx.js');
    const before = (await Rule.find({ zoneId: app.zoneId }).lean()).map(slabDto);
    await withTransaction(async (session) => {
        await Rule.deleteMany({ zoneId: app.zoneId }, opts(session));
        await Rule.insertMany(slabs.map((s) => ({
            ...s, userDeliveryFee: s.commissionPerKm, zoneId: app.zoneId, franchiseId: app._id, updatedBy: req.user?.userId || null,
        })), opts(session));
    });
    await writeAudit({
        actor: actorFor(req), franchiseId: app._id, entity: 'delivery_fee', entityId: app.zoneId, action: 'delivery_fee.update',
        before, after: slabs, reason: String(body.reason || '').slice(0, 300),
    });
    return getDeliveryFees(app._id);
}

/** Remove the zone's own slabs: the platform delivery fee applies again. */
export async function resetDeliveryFees(req) {
    const app = await franchiseFor(req.user?.franchiseId, 'food');
    const Rule = model('FoodDeliveryCommissionRule');
    const before = (await Rule.find({ zoneId: app.zoneId }).lean()).map(slabDto);
    if (!before.length) throw new PortalError('Your zone already uses the platform delivery fee');
    await Rule.deleteMany({ zoneId: app.zoneId });
    await writeAudit({
        actor: actorFor(req), franchiseId: app._id, entity: 'delivery_fee', entityId: app.zoneId, action: 'delivery_fee.reset',
        before, after: null, reason: 'Back to platform delivery fee',
    });
    return getDeliveryFees(app._id);
}
