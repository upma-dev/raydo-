import mongoose from 'mongoose';
import FranchiseApplication from '../models/franchiseApplication.model.js';
import FranchiseLedger from '../models/franchiseLedger.model.js';
import FranchiseFormConfig from '../models/franchiseFormConfig.model.js';
import { creditTaxiRide, creditBusBooking } from './franchiseLedger.service.js';
import { getCommissionRate, normalizeModules, roundMoney } from './franchisePlan.js';

/**
 * TAXI SIDE OF A FRANCHISE
 * A franchise that holds the 'taxi' module owns ONE taxi zone (application.taxiZoneId).
 *  - Drivers belong to it through driver.zoneId
 *  - Rides belong to it through ride.franchiseApplicationId (stamped when the ride is credited)
 *  - Money goes into the same FranchiseLedger / wallet as food, tagged module:'taxi'
 * Everything here matches by that id only, so a franchise can never see another franchise's taxi data.
 */

const model = (name) => mongoose.models[name] || null;

/**
 * Taxi earning rules chosen by the admin (Franchise > Module Fees). Cached for a short while so that
 * crediting a ride does not read the config every time; saving the rules clears the cache at once.
 */
export const DEFAULT_TAXI_SETTINGS = Object.freeze({
    commissionBase: 'platform_commission',
    services: Object.freeze({ ride: true, intercity: true, parcel: true, bus: true }),
});
let settingsCache = { at: 0, value: null };
export const invalidateTaxiSettings = () => { settingsCache = { at: 0, value: null }; };

export async function getTaxiSettings() {
    if (settingsCache.value && Date.now() - settingsCache.at < 30000) return settingsCache.value;
    let value = { commissionBase: DEFAULT_TAXI_SETTINGS.commissionBase, services: { ...DEFAULT_TAXI_SETTINGS.services } };
    try {
        const cfg = await FranchiseFormConfig.findOne().select('taxiSettings').lean();
        const t = cfg?.taxiSettings;
        if (t) {
            if (['platform_commission', 'fare'].includes(t.commissionBase)) value.commissionBase = t.commissionBase;
            Object.keys(value.services).forEach((k) => { if (t.services && t.services[k] !== undefined) value.services[k] = t.services[k] !== false; });
        }
    } catch {
        // config unreadable: keep the safe defaults
    }
    settingsCache = { at: Date.now(), value };
    return value;
}
const paging = ({ page = 1, limit = 15 } = {}) => {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 15));
    return { page: p, limit: l, skip: (p - 1) * l };
};

export class FranchiseTaxiError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

export const holdsTaxi = (app) => normalizeModules(app?.selectedModules).includes('taxi');

async function mustFindTaxiFranchise(franchiseId) {
    if (!mongoose.Types.ObjectId.isValid(String(franchiseId))) throw new FranchiseTaxiError('Invalid franchise id');
    const app = await FranchiseApplication.findById(franchiseId).lean();
    if (!app) throw new FranchiseTaxiError('Franchise not found', 404);
    if (!holdsTaxi(app)) throw new FranchiseTaxiError('This franchise does not hold the Taxi module', 403);
    return app;
}

/** Names an admin / partner understands. `serviceType` on a ride: ride = city taxi, intercity = outstation, parcel = parcel. */
export const SERVICE_LABEL = { ride: 'City taxi', intercity: 'Outstation', parcel: 'Parcel', bus: 'Bus service' };

/** Is this application allowed to earn / operate right now? (approved, fee settled, not suspended, not archived) */
const isOperating = (app) =>
    app.status === 'approved' &&
    ['paid', 'waived'].includes(app.franchiseFeeStatus) &&
    app.accountStatus !== 'suspended' &&
    !app.archived;

/**
 * Credit the franchise that owns the driver's taxi zone for a completed (and wallet-settled) ride.
 * Idempotent (ledger row is unique per ride). Never throws into the ride flow.
 */
export async function creditFranchiseForRide(rideId) {
    try {
        const Ride = model('TaxiRide');
        const Driver = model('TaxiDriver');
        if (!Ride || !Driver) return null;

        const ride = await Ride.findById(rideId).select('driverId commissionAmount fare serviceType walletSettledAt status franchiseApplicationId').lean();
        if (!ride || ride.status !== 'completed' || !ride.walletSettledAt || ride.franchiseApplicationId) return null;

        const settings = await getTaxiSettings();
        if (settings.services[ride.serviceType || 'ride'] === false) return null; // admin switched this service off for franchises

        const driver = await Driver.findById(ride.driverId).select('zoneId').lean();
        if (!driver?.zoneId) return null;

        // The older zone-partner system pays this zone already: never pay the same ride twice
        const Partner = model('TaxiFranchisePartner');
        if (Partner && await Partner.exists({ zoneId: driver.zoneId, status: 'active' })) return null;

        const app = await FranchiseApplication.findOne({
            taxiZoneId: driver.zoneId,
            selectedModules: { $in: ['taxi'] },
            status: 'approved',
        }).select('selectedModules moduleCommissions status franchiseFeeStatus accountStatus archived').lean();
        if (!app || !isOperating(app)) return null;

        // Base chosen by the admin: what the PLATFORM earned on the ride (default, same idea as food) or the fare itself
        const base = roundMoney(settings.commissionBase === 'fare' ? ride.fare : ride.commissionAmount);
        const rate = getCommissionRate(app.selectedModules, app.moduleCommissions, 'taxi');
        const row = await creditTaxiRide({ franchiseId: app._id, rideId: ride._id, base, rate });
        if (row) await Ride.updateOne({ _id: ride._id }, { $set: { franchiseApplicationId: app._id } });
        return row;
    } catch (err) {
        console.error('[Franchise] taxi ride credit failed:', err?.message || err);
        return null;
    }
}

/** Overview of the franchise's taxi business: rides, drivers, money. */
export async function getTaxiOverview(franchiseId) {
    const app = await mustFindTaxiFranchise(franchiseId);
    const fid = app._id;
    const Ride = model('TaxiRide');
    const Driver = model('TaxiDriver');
    const Zone = model('TaxiZone');

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const zone = app.taxiZoneId && Zone ? await Zone.findById(app.taxiZoneId).select('name').lean() : null;

    const [rideAgg, todayAgg, driverAgg, ledgerAgg, rideByService, busAgg] = await Promise.all([
        Ride
            ? Ride.aggregate([
                { $match: { franchiseApplicationId: fid } },
                { $group: { _id: null, rides: { $sum: 1 }, gmv: { $sum: { $ifNull: ['$fare', 0] } } } },
            ])
            : [],
        Ride
            ? Ride.aggregate([
                { $match: { franchiseApplicationId: fid, completedAt: { $gte: startOfToday } } },
                { $group: { _id: null, rides: { $sum: 1 }, gmv: { $sum: { $ifNull: ['$fare', 0] } } } },
            ])
            : [],
        Driver && app.taxiZoneId
            ? Driver.aggregate([
                { $match: { zoneId: app.taxiZoneId, deletedAt: null } },
                { $group: {
                    _id: null,
                    total: { $sum: 1 },
                    approved: { $sum: { $cond: [{ $eq: ['$approve', true] }, 1, 0] } },
                    online: { $sum: { $cond: [{ $eq: ['$isOnline', true] }, 1, 0] } },
                } },
            ])
            : [],
        FranchiseLedger.aggregate([
            { $match: { franchiseId: fid, module: 'taxi' } },
            { $group: { _id: null, earned: { $sum: '$amount' } } },
        ]),
        Ride
            ? Ride.aggregate([
                { $match: { franchiseApplicationId: fid } },
                { $group: { _id: '$serviceType', rides: { $sum: 1 }, gmv: { $sum: { $ifNull: ['$fare', 0] } } } },
            ])
            : [],
        FranchiseLedger.aggregate([
            { $match: { franchiseId: fid, module: 'taxi', refType: 'bus' } },
            { $group: { _id: null, bookings: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, 1, 0] } }, earned: { $sum: '$amount' } } },
        ]),
    ]);

    // Earnings per sub-service so nothing is hidden inside one "taxi" number
    const rideLedger = await FranchiseLedger.aggregate([
        { $match: { franchiseId: fid, module: 'taxi', refType: 'ride' } },
        { $group: { _id: null, earned: { $sum: '$amount' } } },
    ]);
    const services = [
        ...['ride', 'intercity', 'parcel'].map((k) => {
            const row = rideByService.find((r) => r._id === k) || {};
            return { key: k, label: SERVICE_LABEL[k], count: row.rides || 0, value: roundMoney(row.gmv || 0) };
        }),
        { key: 'bus', label: SERVICE_LABEL.bus, count: busAgg[0]?.bookings || 0, value: 0 },
    ];

    return {
        zone: zone ? { id: zone._id, name: zone.name } : null,
        taxiZoneId: app.taxiZoneId || null,
        commissionRate: getCommissionRate(app.selectedModules, app.moduleCommissions, 'taxi'),
        rides: {
            completed: rideAgg[0]?.rides || 0,
            gmv: roundMoney(rideAgg[0]?.gmv || 0),
            today: todayAgg[0]?.rides || 0,
            todayGMV: roundMoney(todayAgg[0]?.gmv || 0),
        },
        drivers: {
            total: driverAgg[0]?.total || 0,
            approved: driverAgg[0]?.approved || 0,
            online: driverAgg[0]?.online || 0,
        },
        earned: roundMoney(ledgerAgg[0]?.earned || 0),
        rules: await getTaxiSettings(),
        earnedFromRides: roundMoney(rideLedger[0]?.earned || 0),
        earnedFromBus: roundMoney(busAgg[0]?.earned || 0),
        services,
        walletBalance: roundMoney(app.walletBalance || 0),
    };
}

export async function listTaxiRides(franchiseId, query = {}) {
    const app = await mustFindTaxiFranchise(franchiseId);
    const Ride = model('TaxiRide');
    if (!Ride) return { items: [], total: 0, page: 1, limit: 15 };
    const { page, limit, skip } = paging(query);
    const match = { franchiseApplicationId: app._id };
    if (['ride', 'intercity', 'parcel'].includes(query.service)) match.serviceType = query.service;

    const [rows, total] = await Promise.all([
        Ride.find(match).sort({ completedAt: -1, createdAt: -1 }).skip(skip).limit(limit)
            .populate('userId', 'name phone').populate('driverId', 'name phone')
            .select('userId driverId fare paymentMethod commissionAmount completedAt createdAt status serviceType pickupLocation dropLocation adminRefund')
            .lean(),
        Ride.countDocuments(match),
    ]);

    const credits = await FranchiseLedger.find({ franchiseId: app._id, refType: 'ride', refId: { $in: rows.map((r) => String(r._id)) } })
        .select('refId amount type').lean();
    const earnedByRide = new Map();
    credits.forEach((c) => earnedByRide.set(c.refId, (earnedByRide.get(c.refId) || 0) + c.amount));

    return {
        items: rows.map((r) => ({
            id: r._id,
            rideCode: `RIDE_${String(r._id).slice(-8).toUpperCase()}`,
            service: r.serviceType || 'ride',
            serviceLabel: SERVICE_LABEL[r.serviceType || 'ride'] || 'City taxi',
            riderName: r.userId?.name || '-',
            riderPhone: r.userId?.phone || '',
            driverName: r.driverId?.name || '-',
            fare: roundMoney(r.fare),
            paymentMethod: r.paymentMethod,
            status: r.adminRefund?.status === 'processed' ? 'refunded' : r.status,
            franchiseEarned: roundMoney(earnedByRide.get(String(r._id)) || 0),
            completedAt: r.completedAt || r.createdAt,
        })),
        total, page, limit,
    };
}

export async function listTaxiDrivers(franchiseId, query = {}) {
    const app = await mustFindTaxiFranchise(franchiseId);
    const Driver = model('TaxiDriver');
    if (!Driver || !app.taxiZoneId) return { items: [], total: 0, page: 1, limit: 15 };
    const { page, limit, skip } = paging(query);
    const match = { zoneId: app.taxiZoneId, deletedAt: null };
    if (query.search) {
        const re = new RegExp(String(query.search).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
        match.$or = [{ name: re }, { phone: re }];
    }

    const [rows, total] = await Promise.all([
        Driver.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit)
            .select('name phone approve status isOnline vehicleType vehicleNumber rating createdAt').lean(),
        Driver.countDocuments(match),
    ]);

    return {
        items: rows.map((d) => ({
            id: d._id,
            name: d.name || '-',
            phone: d.phone || '',
            approved: d.approve === true,
            status: d.status || '',
            online: d.isOnline === true,
            vehicleType: d.vehicleType || '',
            vehicleNumber: d.vehicleNumber || '',
            rating: d.rating || 0,
            joinedAt: d.createdAt,
        })),
        total, page, limit,
    };
}

/** Taxi zones an admin can give to a franchise. A zone already owned by ANOTHER franchise is marked taken. */
export async function listTaxiZonesForFranchise(franchiseId = null) {
    const Zone = model('TaxiZone');
    if (!Zone) return [];
    const [zones, owners] = await Promise.all([
        Zone.find({}).select('name service_location_name').sort({ name: 1 }).lean(),
        FranchiseApplication.find({ taxiZoneId: { $ne: null }, archived: { $ne: true } }).select('taxiZoneId applicantName').lean(),
    ]);
    const ownerOf = new Map(owners.map((o) => [String(o.taxiZoneId), o]));
    return zones.map((z) => {
        const owner = ownerOf.get(String(z._id));
        const takenByOther = Boolean(owner) && String(owner._id) !== String(franchiseId);
        return { id: z._id, name: z.name || z.service_location_name || 'Zone', takenBy: takenByOther ? owner.applicantName : null };
    });
}

/* ------------------------------ BUS SERVICE ------------------------------ */

/**
 * Which franchise owns a bus booking? The operator (Owner) works in a service location; the franchise that owns a taxi zone
 * of that same service location earns on it. Buses without an operator / location earn nobody.
 */
async function franchiseForBusService(busService) {
    const Owner = model('TaxiOwner');
    const Zone = model('TaxiZone');
    if (!Owner || !Zone || !busService?.ownerId) return null;
    const owner = await Owner.findById(busService.ownerId).select('service_location_id').lean();
    if (!owner?.service_location_id) return null;
    const zoneIds = await Zone.find({ service_location_id: owner.service_location_id }).distinct('_id');
    if (!zoneIds.length) return null;
    const app = await FranchiseApplication.findOne({
        taxiZoneId: { $in: zoneIds },
        selectedModules: { $in: ['taxi'] },
        status: 'approved',
    }).select('selectedModules moduleCommissions status franchiseFeeStatus accountStatus archived franchiseFeePaidAt reviewedAt createdAt').lean();
    return app && isOperating(app) ? app : null;
}

const todayKey = () => new Date().toISOString().slice(0, 10);

/**
 * Credit franchises for bus trips that are over (travel date before today). Idempotent: a booking is stamped once, and the
 * ledger row is unique per booking. Cancelled / failed bookings earn nothing; a part-refund scales the platform earning down.
 */
export async function creditFranchiseForBusBookings(limit = 100) {
    const BusBooking = model('TaxiBusBooking');
    const BusService = model('TaxiBusService');
    if (!BusBooking || !BusService) return 0;

    const settings = await getTaxiSettings();
    if (settings.services.bus === false) return 0; // bus is switched off for franchises: leave bookings unchecked

    const bookings = await BusBooking.find({
        status: { $in: ['confirmed', 'boarded', 'completed', 'partially_cancelled'] },
        travelDate: { $lt: todayKey() },
        franchiseCreditCheckedAt: null,
    }).select('busServiceId amount financialSnapshot createdAt').limit(limit).lean();

    let credited = 0;
    const serviceCache = new Map();
    for (const b of bookings) {
        try {
            const key = String(b.busServiceId);
            if (!serviceCache.has(key)) {
                const svc = await BusService.findById(b.busServiceId).select('ownerId').lean();
                serviceCache.set(key, svc ? await franchiseForBusService(svc) : null);
            }
            const app = serviceCache.get(key);
            // Only bookings made while the franchise was active earn for it (no back-dated money for old bookings)
            const since = new Date(app?.franchiseFeePaidAt || app?.reviewedAt || app?.createdAt || 0);
            if (app && new Date(b.createdAt) >= since) {
                const total = Number(b.amount) || 0;
                const kept = total > 0 ? Math.max(0, total - (Number(b.financialSnapshot?.refundedAmount) || 0)) / total : 1;
                const full = settings.commissionBase === 'fare' ? total : (Number(b.financialSnapshot?.calculatedPlatformEarning) || 0);
                const base = roundMoney(full * kept);
                const rate = getCommissionRate(app.selectedModules, app.moduleCommissions, 'taxi');
                const row = await creditBusBooking({ franchiseId: app._id, bookingId: b._id, base, rate });
                if (row) {
                    credited += 1;
                    await BusBooking.updateOne({ _id: b._id }, { $set: { franchiseApplicationId: app._id } });
                }
            }
            await BusBooking.updateOne({ _id: b._id }, { $set: { franchiseCreditCheckedAt: new Date() } });
        } catch (err) {
            console.error('[Franchise] bus credit failed for', String(b._id), err?.message || err);
        }
    }
    return credited;
}

export async function listTaxiBusBookings(franchiseId, query = {}) {
    const app = await mustFindTaxiFranchise(franchiseId);
    const BusBooking = model('TaxiBusBooking');
    if (!BusBooking) return { items: [], total: 0, page: 1, limit: 15 };
    const { page, limit, skip } = paging(query);
    const match = { franchiseApplicationId: app._id };

    const [rows, total] = await Promise.all([
        BusBooking.find(match).sort({ travelDate: -1, createdAt: -1 }).skip(skip).limit(limit)
            .select('bookingCode travelDate seatLabels amount passenger routeSnapshot financialSnapshot status').lean(),
        BusBooking.countDocuments(match),
    ]);
    const credits = await FranchiseLedger.find({ franchiseId: app._id, refType: 'bus', refId: { $in: rows.map((r) => String(r._id)) } })
        .select('refId amount').lean();
    const earned = new Map(credits.map((c) => [c.refId, c.amount]));

    return {
        items: rows.map((r) => ({
            id: r._id,
            bookingCode: r.bookingCode,
            route: `${r.routeSnapshot?.originCity || '-'} → ${r.routeSnapshot?.destinationCity || '-'}`,
            operator: r.routeSnapshot?.operatorName || r.routeSnapshot?.busName || '-',
            travelDate: r.travelDate,
            seats: (r.seatLabels || []).join(', '),
            passengerName: r.passenger?.name || '-',
            amount: roundMoney(r.amount),
            platformEarning: roundMoney(r.financialSnapshot?.calculatedPlatformEarning),
            franchiseEarned: roundMoney(earned.get(String(r._id)) || 0),
            status: r.status,
        })),
        total, page, limit,
    };
}
