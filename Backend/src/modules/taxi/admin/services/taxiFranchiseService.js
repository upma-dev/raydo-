import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { TaxiFranchisePartner } from '../models/TaxiFranchisePartner.js';
import { Driver } from '../../driver/models/Driver.js';
import { Vehicle } from '../models/Vehicle.js';
import { SetPrice } from '../models/SetPrice.js';
import { Zone } from '../../driver/models/Zone.js';
import { Ride } from '../../user/models/Ride.js';
import { signAccessToken } from '../../services/tokenService.js';
import FranchiseFormConfig from '../../../food/admin/models/franchiseFormConfig.model.js';
import { normalizeFees, normalizeCommissions } from '../../../food/admin/services/franchisePlan.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

const toObjectId = (value) => {
    if (!value) return null;
    const s = String(value).trim();
    return mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null;
};

// ─── Auth ─────────────────────────────────────────────────────────────────────

/**
 * Super Admin creates a franchise partner for a specific zone
 */
export async function createTaxiFranchisePartner(payload = {}) {
    const {
        name, email, phone, password,
        zoneId, commissionRate, platformCommissionRate,
        franchiseFee, adminNote,
    } = payload;

    if (!name || !email || !phone || !password || !zoneId) {
        throw new ApiError(400, 'name, email, phone, password and zoneId are required');
    }

    const zone = await Zone.findById(zoneId).lean();
    if (!zone) throw new ApiError(404, 'Zone not found');

    const existing = await TaxiFranchisePartner.findOne({
        $or: [{ email }, { phone }],
    }).lean();
    if (existing) throw new ApiError(409, 'A partner with this email or phone already exists');

    // Defaults = the one taxi fee / taxi commission set by the super admin in Franchise Settings
    const planConfig = await FranchiseFormConfig.getConfig();
    const taxiFee = normalizeFees(planConfig.moduleFranchiseFees).taxi;
    const taxiCommission = normalizeCommissions(planConfig.moduleCommissions).taxi;

    const hashed = await bcrypt.hash(password, 12);

    const partner = await TaxiFranchisePartner.create({
        name,
        email,
        phone,
        password: hashed,
        zoneId: toObjectId(zoneId),
        zoneName: zone.name || '',
        serviceLocationId: zone.service_location_id ? toObjectId(zone.service_location_id) : null,
        franchiseCommissionRate: Number(commissionRate ?? taxiCommission),
        platformCommissionRate: Number(platformCommissionRate ?? 5),
        franchiseFee: Number(franchiseFee ?? taxiFee),
        adminNote: adminNote || '',
        status: 'active',
        isActive: true,
        approvedAt: new Date(),
    });

    return serializePartner(partner);
}

/**
 * Login for Taxi Franchise Partner
 */
export async function loginTaxiFranchisePartner({ email, password }) {
    if (!email || !password) throw new ApiError(400, 'email and password are required');

    const partner = await TaxiFranchisePartner.findOne({ email }).select('+password').lean();
    if (!partner) throw new ApiError(401, 'Invalid credentials');
    if (!partner.isActive || partner.status !== 'active') {
        throw new ApiError(403, 'Account is not active. Contact admin.');
    }

    const match = await bcrypt.compare(password, partner.password);
    if (!match) throw new ApiError(401, 'Invalid credentials');

    await TaxiFranchisePartner.findByIdAndUpdate(partner._id, { lastLoginAt: new Date() });

    const token = signAccessToken({ id: partner._id, role: 'taxi_franchise', zoneId: partner.zoneId });

    return {
        token,
        partner: serializePartner(partner),
    };
}

// ─── Super Admin: List & Manage ───────────────────────────────────────────────

export async function listTaxiFranchisePartners({ status, zoneId, page = 1, limit = 20 } = {}) {
    const query = {};
    if (status) query.status = status;
    if (zoneId) query.zoneId = toObjectId(zoneId);

    const skip = (Number(page) - 1) * Number(limit);
    const [partners, total] = await Promise.all([
        TaxiFranchisePartner.find(query)
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean(),
        TaxiFranchisePartner.countDocuments(query),
    ]);

    return {
        results: partners.map(serializePartner),
        paginator: {
            current_page: Number(page),
            per_page: Number(limit),
            total,
            last_page: Math.max(1, Math.ceil(total / Number(limit))),
        },
    };
}

export async function getTaxiFranchisePartnerById(id) {
    const partner = await TaxiFranchisePartner.findById(id).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');
    return serializePartner(partner, true);
}

export async function updateTaxiFranchisePartner(id, payload = {}) {
    const allowed = [
        'name', 'phone', 'status', 'isActive',
        'franchiseCommissionRate', 'platformCommissionRate',
        'franchiseFee', 'franchiseFeeStatus', 'adminNote',
    ];
    const update = {};
    for (const key of allowed) {
        if (payload[key] !== undefined) update[key] = payload[key];
    }
    if (payload.status === 'active') {
        update.isActive = true;
        update.approvedAt = update.approvedAt || new Date();
    }
    if (payload.status === 'suspended' || payload.status === 'rejected') {
        update.isActive = false;
    }

    const partner = await TaxiFranchisePartner.findByIdAndUpdate(id, update, { new: true }).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');
    return serializePartner(partner);
}

export async function deleteTaxiFranchisePartner(id) {
    const partner = await TaxiFranchisePartner.findByIdAndDelete(id).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');
    return { success: true };
}

// ─── Franchise Partner: Driver Management (zone-scoped) ───────────────────────

/**
 * Franchise partner registers a driver — forced into their zone
 */
export async function franchiseRegisterDriver(partnerId, payload = {}) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner || partner.status !== 'active') {
        throw new ApiError(403, 'Franchise partner account is not active');
    }

    const {
        name, phone, email, password,
        vehicleType, vehicleTypeId,
        vehicleMake, vehicleModel, vehicleNumber, vehicleColor,
    } = payload;

    if (!name || !phone || !password) {
        throw new ApiError(400, 'name, phone and password are required');
    }

    const existing = await Driver.findOne({ phone }).lean();
    if (existing) throw new ApiError(409, 'Driver with this phone already registered');

    const hashed = await bcrypt.hash(password, 12);

    const driver = await Driver.create({
        name,
        phone,
        email: email || '',
        password: hashed,
        vehicleType: vehicleType || 'car',
        vehicleTypeId: toObjectId(vehicleTypeId),
        vehicleMake: vehicleMake || '',
        vehicleModel: vehicleModel || '',
        vehicleNumber: vehicleNumber || '',
        vehicleColor: vehicleColor || '',
        // Zone restriction: auto-assign to franchise partner's zone
        zoneId: partner.zoneId,
        service_location_id: partner.serviceLocationId || null,
        franchiseId: partner._id,  // tag driver with franchise
        registerFor: 'taxi',
        status: 'approved',
        approve: true,
    });

    return {
        success: true,
        driver: {
            _id: driver._id,
            name: driver.name,
            phone: driver.phone,
            zoneId: driver.zoneId,
            franchiseId: driver.franchiseId,
        },
    };
}

/**
 * List drivers registered by this franchise partner in their zone
 */
export async function franchiseListDrivers(partnerId, { page = 1, limit = 20, status } = {}) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');

    const query = {
        franchiseId: partner._id,
        zoneId: partner.zoneId,
        deletedAt: null,
    };
    if (status) query.status = status;

    const skip = (Number(page) - 1) * Number(limit);
    const [drivers, total] = await Promise.all([
        Driver.find(query)
            .select('name phone email vehicleType vehicleTypeId vehicleMake vehicleModel vehicleNumber vehicleColor status approve zoneId wallet createdAt')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(Number(limit))
            .lean(),
        Driver.countDocuments(query),
    ]);

    return {
        results: drivers,
        paginator: {
            current_page: Number(page),
            per_page: Number(limit),
            total,
            last_page: Math.max(1, Math.ceil(total / Number(limit))),
        },
    };
}

/**
 * Toggle driver active/suspend status (within franchise zone)
 */
export async function franchiseUpdateDriverStatus(partnerId, driverId, { status, approve }) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');

    const driver = await Driver.findOne({ _id: driverId, franchiseId: partner._id }).lean();
    if (!driver) throw new ApiError(404, 'Driver not found in your zone');

    const update = {};
    if (status !== undefined) update.status = status;
    if (approve !== undefined) update.approve = approve;

    await Driver.findByIdAndUpdate(driverId, update);
    return { success: true };
}

// ─── Franchise Partner: Zone Settings ────────────────────────────────────────

/**
 * Get/update zone settings for franchise partner's zone
 * (cancel time, waiting charges, enabled modules, allowed vehicle types)
 */
export async function franchiseGetZoneSettings(partnerId) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');

    const zone = await Zone.findById(partner.zoneId).lean();

    return {
        partnerId: String(partner._id),
        zoneId: String(partner.zoneId),
        zoneName: partner.zoneName || zone?.name || '',
        zoneSettings: partner.zoneSettings || {},
        franchiseCommissionRate: partner.franchiseCommissionRate,
    };
}

export async function franchiseUpdateZoneSettings(partnerId, payload = {}) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner || partner.status !== 'active') {
        throw new ApiError(403, 'Franchise partner account is not active');
    }

    // Only allow updating specific fields
    const allowedSettings = [
        'cancelWaitingTimeSeconds', 'driverWaitingChargePerMin', 'freeWaitingMinutes',
        'enableRide', 'enableOutstation', 'enableDelivery', 'enablePooling', 'enableRental',
        'allowedVehicleTypeIds',
    ];

    const zoneSettings = { ...(partner.zoneSettings || {}) };
    for (const key of allowedSettings) {
        if (payload[key] !== undefined) {
            zoneSettings[key] = payload[key];
        }
    }

    const updated = await TaxiFranchisePartner.findByIdAndUpdate(
        partnerId,
        { zoneSettings },
        { new: true }
    ).lean();

    return { success: true, zoneSettings: updated.zoneSettings };
}

// ─── Franchise Partner: Pricing (zone SetPrices) ──────────────────────────────

/**
 * Get pricing for franchise partner's zone
 */
export async function franchiseGetZonePrices(partnerId) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');

    const prices = await SetPrice.find({ zone_id: partner.zoneId, active: 1 })
        .populate('vehicle_type', 'name icon_types transport_type')
        .lean();

    return { prices, zoneId: partner.zoneId };
}

/**
 * Update a set price for franchise partner's zone
 * Franchise partner can set prices but admin commission rates are read-only for them
 */
export async function franchiseUpdateSetPrice(partnerId, priceId, payload = {}) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner || partner.status !== 'active') {
        throw new ApiError(403, 'Franchise partner account is not active');
    }

    const price = await SetPrice.findOne({ _id: priceId, zone_id: partner.zoneId }).lean();
    if (!price) throw new ApiError(404, 'Price config not found in your zone');

    // Franchise partner can update pricing but NOT admin_commision fields
    const allowedFields = [
        'base_price', 'base_distance', 'price_per_distance', 'time_price',
        'waiting_charge', 'free_waiting_before', 'free_waiting_after',
        'user_cancellation_fee', 'driver_cancellation_fee',
        'cancellation_policy',
    ];

    const update = {};
    for (const field of allowedFields) {
        if (payload[field] !== undefined) update[field] = payload[field];
    }

    const updated = await SetPrice.findByIdAndUpdate(priceId, update, { new: true }).lean();
    return { success: true, price: updated };
}

// ─── Franchise Partner: Vehicle Types (read-only catalog for their zone) ──────

export async function franchiseGetVehicleTypes(partnerId) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');

    const query = partner.zoneSettings?.allowedVehicleTypeIds?.length > 0
        ? { _id: { $in: partner.zoneSettings.allowedVehicleTypeIds }, active: true }
        : { active: true };

    const vehicles = await Vehicle.find(query).lean();
    return { vehicles };
}

// ─── Franchise Partner: Commission / Earnings ─────────────────────────────────

export async function franchiseGetEarnings(partnerId, { startDate, endDate, page = 1, limit = 20 } = {}) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');

    // Summary stats
    const ridesInZone = await Ride.countDocuments({
        zoneId: partner.zoneId,
        status: { $in: ['completed', 'dropped'] },
        ...(startDate || endDate ? {
            createdAt: {
                ...(startDate ? { $gte: new Date(startDate) } : {}),
                ...(endDate ? { $lte: new Date(endDate) } : {}),
            },
        } : {}),
    });

    const ledger = partner.commissionLedger || [];
    const totalFranchiseEarned = ledger.reduce((s, r) => s + (r.franchiseCommissionAmount || 0), 0);
    const totalPlatformEarned = ledger.reduce((s, r) => s + (r.platformCommissionAmount || 0), 0);

    // Paginate ledger
    const start = (Number(page) - 1) * Number(limit);
    const paginatedLedger = ledger.slice().reverse().slice(start, start + Number(limit));

    return {
        summary: {
            walletBalance: partner.walletBalance || 0,
            totalEarned: partner.totalEarned || 0,
            totalPaidOut: partner.totalPaidOut || 0,
            franchiseCommissionRate: partner.franchiseCommissionRate,
            platformCommissionRate: partner.platformCommissionRate,
            ridesInZone,
            totalFranchiseEarned,
            totalPlatformEarned,
        },
        ledger: {
            results: paginatedLedger,
            paginator: {
                current_page: Number(page),
                per_page: Number(limit),
                total: ledger.length,
                last_page: Math.max(1, Math.ceil(ledger.length / Number(limit))),
            },
        },
    };
}

// ─── Payout ──────────────────────────────────────────────────────────────────

export async function franchiseRequestPayout(partnerId, { amount, payoutMethod }) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');
    const value = Math.round(Number(amount) * 100) / 100;
    if (!value || value <= 0) throw new ApiError(400, 'Invalid amount');

    // Pending requests are already promised to the partner, so they are not available again
    const reserved = (partner.payoutRequests || [])
        .filter((r) => r.status === 'pending')
        .reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
    if ((partner.walletBalance || 0) - reserved < value) {
        throw new ApiError(400, 'Insufficient wallet balance');
    }

    const payoutRequest = {
        requestId: new mongoose.Types.ObjectId().toString(),
        amount: value,
        payoutMethod: payoutMethod || 'bank',
        status: 'pending',
        requestedAt: new Date(),
    };

    await TaxiFranchisePartner.findByIdAndUpdate(partnerId, {
        $push: { payoutRequests: payoutRequest },
    });

    return { success: true, payoutRequest };
}

export async function franchiseUpdateBankDetails(partnerId, bankDetails = {}) {
    const partner = await TaxiFranchisePartner.findByIdAndUpdate(
        partnerId,
        { bankDetails },
        { new: true }
    ).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');
    return { success: true, bankDetails: partner.bankDetails };
}

// ─── Super Admin: Process payout requests ────────────────────────────────────

export async function adminProcessFranchisePayout(partnerId, requestId, { status, adminNote, transactionId }) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');

    const reqIndex = partner.payoutRequests.findIndex(r => r.requestId === requestId);
    if (reqIndex === -1) throw new ApiError(404, 'Payout request not found');

    const req = partner.payoutRequests[reqIndex];
    if (req.status !== 'pending') throw new ApiError(409, `Payout request is already ${req.status}`);
    if (['paid', 'approved'].includes(status) && (partner.walletBalance || 0) < req.amount) {
        throw new ApiError(400, 'Insufficient wallet balance for this payout');
    }
    const update = { $set: {} };

    update.$set[`payoutRequests.${reqIndex}.status`] = status;
    update.$set[`payoutRequests.${reqIndex}.processedAt`] = new Date();
    update.$set[`payoutRequests.${reqIndex}.adminNote`] = adminNote || '';
    update.$set[`payoutRequests.${reqIndex}.transactionId`] = transactionId || '';

    if (status === 'paid' || status === 'approved') {
        update.$inc = {
            walletBalance: -req.amount,
            totalPaidOut: req.amount,
        };
    }

    await TaxiFranchisePartner.findByIdAndUpdate(partnerId, update);
    return { success: true };
}

// ─── Commission credit (called after ride completes) ─────────────────────────

/**
 * Called from ride completion flow to credit franchise partner commission
 * if the ride's zone is assigned to a franchise partner
 */
export async function creditFranchiseCommission({ zoneId, rideId, driverId, rideAmount }) {
    if (!zoneId || !rideId || !(Number(rideAmount) > 0)) return;

    const partner = await TaxiFranchisePartner.findOne({
        zoneId: toObjectId(zoneId),
        status: 'active',
    }).lean();

    if (!partner) return; // no franchise in this zone

    const round2 = (n) => Math.round(n * 100) / 100;
    const franchiseEarning = round2((rideAmount * partner.franchiseCommissionRate) / 100);
    const platformEarning = round2((rideAmount * partner.platformCommissionRate) / 100);

    const ledgerEntry = {
        rideId: toObjectId(rideId),
        driverId: toObjectId(driverId),
        rideAmount,
        franchiseCommissionAmount: franchiseEarning,
        platformCommissionAmount: platformEarning,
        franchiseCommissionRate: partner.franchiseCommissionRate,
        platformCommissionRate: partner.platformCommissionRate,
        recordedAt: new Date(),
    };

    // The filter makes this idempotent: a ride that is already in the ledger is never credited twice.
    await TaxiFranchisePartner.updateOne(
        { _id: partner._id, 'commissionLedger.rideId': { $ne: toObjectId(rideId) } },
        {
            $push: { commissionLedger: ledgerEntry },
            $inc: { walletBalance: franchiseEarning, totalEarned: franchiseEarning },
        }
    );
}

/**
 * A fully refunded ride must not keep paying the franchise. Removes the ride's commission entry and takes the money back.
 * Idempotent: if the ride has no entry (already reversed / never credited) nothing happens.
 */
export async function reverseFranchiseCommission({ rideId }) {
    if (!rideId) return;
    const id = toObjectId(rideId);
    const partner = await TaxiFranchisePartner.findOne({ 'commissionLedger.rideId': id }).select('commissionLedger').lean();
    if (!partner) return;
    const entry = (partner.commissionLedger || []).find((e) => String(e.rideId) === String(id));
    const amount = Number(entry?.franchiseCommissionAmount) || 0;

    await TaxiFranchisePartner.updateOne(
        { _id: partner._id, 'commissionLedger.rideId': id },
        {
            $pull: { commissionLedger: { rideId: id } },
            $inc: { walletBalance: -amount, totalEarned: -amount },
        }
    );
}

// ─── Dashboard stats ─────────────────────────────────────────────────────────

export async function franchiseDashboardStats(partnerId) {
    const partner = await TaxiFranchisePartner.findById(partnerId).lean();
    if (!partner) throw new ApiError(404, 'Franchise partner not found');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
        totalDrivers,
        activeDrivers,
        todayRides,
        totalRides,
    ] = await Promise.all([
        Driver.countDocuments({ franchiseId: partner._id, deletedAt: null }),
        Driver.countDocuments({ franchiseId: partner._id, deletedAt: null, isOnline: true }),
        Ride.countDocuments({ zoneId: partner.zoneId, createdAt: { $gte: today } }),
        Ride.countDocuments({ zoneId: partner.zoneId, status: { $in: ['completed', 'dropped'] } }),
    ]);

    return {
        partner: serializePartner(partner),
        stats: {
            totalDrivers,
            activeDrivers,
            todayRides,
            totalRides,
            walletBalance: partner.walletBalance || 0,
            totalEarned: partner.totalEarned || 0,
            franchiseCommissionRate: partner.franchiseCommissionRate,
            pendingPayouts: (partner.payoutRequests || []).filter(r => r.status === 'pending').length,
        },
    };
}

// ─── Serializer ──────────────────────────────────────────────────────────────

function serializePartner(p, full = false) {
    const base = {
        _id: p._id,
        id: String(p._id),
        partnerId: p.partnerId || '',
        name: p.name || '',
        email: p.email || '',
        phone: p.phone || '',
        zoneId: p.zoneId ? String(p.zoneId) : null,
        zoneName: p.zoneName || '',
        serviceLocationId: p.serviceLocationId ? String(p.serviceLocationId) : null,
        franchiseCommissionRate: p.franchiseCommissionRate || 0,
        platformCommissionRate: p.platformCommissionRate || 0,
        walletBalance: p.walletBalance || 0,
        totalEarned: p.totalEarned || 0,
        totalPaidOut: p.totalPaidOut || 0,
        franchiseFee: p.franchiseFee || 0,
        franchiseFeeStatus: p.franchiseFeeStatus || 'pending',
        status: p.status || 'pending',
        isActive: p.isActive || false,
        adminNote: p.adminNote || '',
        approvedAt: p.approvedAt || null,
        lastLoginAt: p.lastLoginAt || null,
        createdAt: p.createdAt || null,
    };

    if (full) {
        base.bankDetails = p.bankDetails || {};
        base.zoneSettings = p.zoneSettings || {};
        base.payoutRequests = (p.payoutRequests || []).slice(-50);
        base.commissionLedger = (p.commissionLedger || []).slice(-100);
    }

    return base;
}
