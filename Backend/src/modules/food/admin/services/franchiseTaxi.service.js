import mongoose from 'mongoose';
import FranchiseApplication from '../models/franchiseApplication.model.js';
import FranchiseLedger from '../models/franchiseLedger.model.js';
import FranchiseFormConfig from '../models/franchiseFormConfig.model.js';
import { creditTaxiRide, creditBooking } from './franchiseLedger.service.js';
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
    services: Object.freeze({ ride: true, intercity: true, parcel: true, bus: true, pooling: false, rental: false }),
    serviceCommission: Object.freeze({ pooling: 10, rental: 10 }),
});
let settingsCache = { at: 0, value: null };
export const invalidateTaxiSettings = () => { settingsCache = { at: 0, value: null }; };

export async function getTaxiSettings() {
    if (settingsCache.value && Date.now() - settingsCache.at < 30000) return settingsCache.value;
    let value = {
        commissionBase: DEFAULT_TAXI_SETTINGS.commissionBase,
        services: { ...DEFAULT_TAXI_SETTINGS.services },
        serviceCommission: { ...DEFAULT_TAXI_SETTINGS.serviceCommission },
    };
    try {
        const cfg = await FranchiseFormConfig.findOne().select('taxiSettings').lean();
        const t = cfg?.taxiSettings;
        if (t) {
            if (['platform_commission', 'fare'].includes(t.commissionBase)) value.commissionBase = t.commissionBase;
            // pooling / rental are opt-in (default off); the others are opt-out (default on)
            Object.keys(value.services).forEach((k) => {
                if (t.services && t.services[k] !== undefined) value.services[k] = ['pooling', 'rental'].includes(k) ? t.services[k] === true : t.services[k] !== false;
            });
            Object.keys(value.serviceCommission).forEach((k) => {
                const n = Number(t.serviceCommission?.[k]);
                if (Number.isFinite(n) && n >= 0 && n <= 100) value.serviceCommission[k] = n;
            });
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
export const SERVICE_LABEL = { ride: 'City taxi', intercity: 'Outstation', parcel: 'Parcel', bus: 'Bus service', pooling: 'Pooling', rental: 'Rental' };

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
            { $match: { franchiseId: fid, module: 'taxi', refType: { $in: ['bus', 'pooling', 'rental'] } } },
            { $group: { _id: '$refType', bookings: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, 1, 0] } }, earned: { $sum: '$amount' } } },
        ]),
    ]);
    const bookingStat = (kind) => busAgg.find((r) => r._id === kind) || {};

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
        ...['bus', 'pooling', 'rental'].map((k) => ({
            key: k, label: SERVICE_LABEL[k], count: bookingStat(k).bookings || 0, value: 0, earned: roundMoney(bookingStat(k).earned || 0),
        })),
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
        earnedFromBus: roundMoney(bookingStat('bus').earned || 0),
        earnedFromPooling: roundMoney(bookingStat('pooling').earned || 0),
        earnedFromRental: roundMoney(bookingStat('rental').earned || 0),
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

const APP_FIELDS = 'selectedModules moduleCommissions status franchiseFeeStatus accountStatus archived franchiseFeePaidAt reviewedAt createdAt';

async function operatingFranchise(filter) {
    const app = await FranchiseApplication.findOne({ ...filter, selectedModules: { $in: ['taxi'] }, status: 'approved' }).select(APP_FIELDS).lean();
    return app && isOperating(app) ? app : null;
}

/** Franchise that owns the taxi zone a map point lies in (zones are polygons). */
async function franchiseForPoint(lat, lng) {
    const Zone = model('TaxiZone');
    const la = Number(lat);
    const lo = Number(lng);
    if (!Zone || !Number.isFinite(la) || !Number.isFinite(lo) || (la === 0 && lo === 0)) return null;
    const zone = await Zone.findOne({ geometry: { $geoIntersects: { $geometry: { type: 'Point', coordinates: [lo, la] } } } }).select('_id').lean();
    return zone ? operatingFranchise({ taxiZoneId: zone._id }) : null;
}

/** Franchise that owns a taxi zone of this service location. */
async function franchiseForServiceLocation(serviceLocationId) {
    const Zone = model('TaxiZone');
    if (!Zone || !serviceLocationId || !mongoose.Types.ObjectId.isValid(String(serviceLocationId))) return null;
    const zoneIds = await Zone.find({ service_location_id: serviceLocationId }).distinct('_id');
    return zoneIds.length ? operatingFranchise({ taxiZoneId: { $in: zoneIds } }) : null;
}

/**
 * Which franchise owns a bus?
 *  1) the franchise the admin pinned on the bus (busService.franchiseId). If that franchise is not operating, nobody earns:
 *     the admin chose it explicitly, so we never silently give the money to someone else.
 *  2) otherwise the franchise that owns a taxi zone of the operator's service location.
 * Buses with neither earn nobody.
 */
async function franchiseForBusService(busService) {
    if (busService?.franchiseId) return operatingFranchise({ _id: busService.franchiseId });
    const Owner = model('TaxiOwner');
    if (!Owner || !busService?.ownerId) return null;
    const owner = await Owner.findById(busService.ownerId).select('service_location_id').lean();
    return franchiseForServiceLocation(owner?.service_location_id);
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
                const svc = await BusService.findById(b.busServiceId).select('ownerId franchiseId').lean();
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
                const row = await creditBooking({ franchiseId: app._id, kind: 'bus', bookingId: b._id, base, rate });
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

/* --------------------------- POOLING + RENTAL --------------------------- */

const sinceOf = (app) => new Date(app?.franchiseFeePaidAt || app?.reviewedAt || app?.createdAt || 0);

/**
 * Amount the franchise rate is applied on.
 *  - base "fare"                : what the customer paid
 *  - base "platform_commission" : Raydo's commission % for this service (admin-set) of what the customer paid
 */
const bookingBase = (settings, kind, total) =>
    roundMoney(settings.commissionBase === 'fare' ? total : (total * (Number(settings.serviceCommission?.[kind]) || 0)) / 100);

/**
 * Pooling: credited when the booking is COMPLETED and PAID. The franchise is the one whose taxi zone contains the pickup stop.
 * Rental : credited when the rental is COMPLETED and PAID. Franchise = the zone of the rental's service location.
 * Both are stamped once and the ledger row is unique per booking, so running this again never pays twice.
 * Bookings made before the franchise started earn nothing (no back-dated money).
 */
export async function creditFranchiseForPoolingAndRental(limit = 100) {
    const settings = await getTaxiSettings();
    let credited = 0;

    if (settings.services.pooling) {
        const Booking = model('TaxiPoolingBooking');
        const Route = model('TaxiPoolingRoute');
        if (Booking && Route) {
            const rows = await Booking.find({ bookingStatus: 'completed', paymentStatus: 'paid', franchiseCreditCheckedAt: null })
                .select('route pickupStopId fare createdAt').limit(limit).lean();
            const routeCache = new Map();
            for (const b of rows) {
                try {
                    const key = String(b.route);
                    if (!routeCache.has(key)) routeCache.set(key, await Route.findById(b.route).select('stops').lean());
                    const stop = (routeCache.get(key)?.stops || []).find((x) => String(x.id) === String(b.pickupStopId));
                    const app = stop ? await franchiseForPoint(stop.latitude, stop.longitude) : null;
                    if (app && new Date(b.createdAt) >= sinceOf(app)) {
                        const rate = getCommissionRate(app.selectedModules, app.moduleCommissions, 'taxi');
                        const row = await creditBooking({ franchiseId: app._id, kind: 'pooling', bookingId: b._id, base: bookingBase(settings, 'pooling', Number(b.fare) || 0), rate });
                        if (row) { credited += 1; await Booking.updateOne({ _id: b._id }, { $set: { franchiseApplicationId: app._id } }); }
                    }
                    await Booking.updateOne({ _id: b._id }, { $set: { franchiseCreditCheckedAt: new Date() } });
                } catch (err) {
                    console.error('[Franchise] pooling credit failed for', String(b._id), err?.message || err);
                }
            }
        }
    }

    if (settings.services.rental) {
        const Rental = model('TaxiRentalBookingRequest');
        if (Rental) {
            const rows = await Rental.find({ status: 'completed', paymentStatus: 'paid', franchiseCreditCheckedAt: null })
                .select('serviceLocation totalCost createdAt').limit(limit).lean();
            for (const r of rows) {
                try {
                    const loc = r.serviceLocation || {};
                    const app = (await franchiseForPoint(loc.latitude, loc.longitude)) || (await franchiseForServiceLocation(loc.locationId));
                    if (app && new Date(r.createdAt) >= sinceOf(app)) {
                        const rate = getCommissionRate(app.selectedModules, app.moduleCommissions, 'taxi');
                        const row = await creditBooking({ franchiseId: app._id, kind: 'rental', bookingId: r._id, base: bookingBase(settings, 'rental', Number(r.totalCost) || 0), rate });
                        if (row) { credited += 1; await Rental.updateOne({ _id: r._id }, { $set: { franchiseApplicationId: app._id } }); }
                    }
                    await Rental.updateOne({ _id: r._id }, { $set: { franchiseCreditCheckedAt: new Date() } });
                } catch (err) {
                    console.error('[Franchise] rental credit failed for', String(r._id), err?.message || err);
                }
            }
        }
    }
    return credited;
}

/** Bookings of one sub-service (bus / pooling / rental) credited to this franchise, in one common shape. */
export async function listTaxiBookings(franchiseId, query = {}) {
    const service = ['pooling', 'rental'].includes(query.service) ? query.service : 'bus';
    if (service === 'bus') return listTaxiBusBookings(franchiseId, query);

    const app = await mustFindTaxiFranchise(franchiseId);
    const { page, limit, skip } = paging(query);
    const Model = model(service === 'pooling' ? 'TaxiPoolingBooking' : 'TaxiRentalBookingRequest');
    if (!Model) return { items: [], total: 0, page, limit };
    const match = { franchiseApplicationId: app._id };

    const select = service === 'pooling'
        ? 'bookingId travelDate seatsBooked fare pickupLabel dropLabel bookingStatus'
        : 'vehicleName pickupDateTime requestedHours totalCost serviceLocation status';
    const [rows, total] = await Promise.all([
        Model.find(match).sort({ createdAt: -1 }).skip(skip).limit(limit).select(select).lean(),
        Model.countDocuments(match),
    ]);
    const credits = await FranchiseLedger.find({ franchiseId: app._id, refType: service, refId: { $in: rows.map((r) => String(r._id)) } })
        .select('refId amount base').lean();
    const byId = new Map(credits.map((c) => [c.refId, c]));
    const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : '-');

    return {
        items: rows.map((r) => {
            const c = byId.get(String(r._id)) || {};
            return service === 'pooling'
                ? {
                    id: r._id, bookingCode: r.bookingId, route: `${r.pickupLabel || '-'} → ${r.dropLabel || '-'}`, operator: 'Pooling',
                    travelDate: day(r.travelDate), seats: String(r.seatsBooked || 1), amount: roundMoney(r.fare), platformEarning: roundMoney(c.base),
                    franchiseEarned: roundMoney(c.amount), status: r.bookingStatus,
                }
                : {
                    id: r._id, bookingCode: `RENT_${String(r._id).slice(-8).toUpperCase()}`, route: r.serviceLocation?.name || r.serviceLocation?.city || '-',
                    operator: r.vehicleName || 'Rental', travelDate: day(r.pickupDateTime), seats: `${r.requestedHours || 0} h`, amount: roundMoney(r.totalCost),
                    platformEarning: roundMoney(c.base), franchiseEarned: roundMoney(c.amount), status: r.status,
                };
        }),
        total, page, limit,
    };
}
