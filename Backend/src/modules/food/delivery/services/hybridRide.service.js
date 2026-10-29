import crypto from 'crypto';
import mongoose from 'mongoose';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { HybridWalletTransfer } from '../models/hybridWalletTransfer.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { Driver } from '../../../taxi/driver/models/Driver.js';
import { Vehicle } from '../../../taxi/admin/models/Vehicle.js';
import { listDriverNeededDocuments } from '../../../taxi/admin/services/adminService.js';
import { Ride } from '../../../taxi/user/models/Ride.js';
import { RIDE_STATUS } from '../../../taxi/constants/index.js';
import { applyDriverWalletAdjustment, serializeDriverWallet } from '../../../taxi/driver/services/walletService.js';
import { hashPassword } from '../../../taxi/driver/services/authService.js';
import { signAccessToken } from '../../../taxi/services/tokenService.js';
import { findZoneByPickup } from '../../../taxi/services/matchingService.js';
import { getDeliveryPocketTotals } from './deliveryFinance.service.js';
import { withPartnerWalletLock } from './rideWalletLock.js';
import { uploadImageBuffer } from '../../../../services/cloudinary.service.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Ride & Parcel mode for food delivery partners.
 *
 * A delivery partner can also take taxi rides and parcel deliveries from the delivery app. The taxi side works on a
 * normal TaxiDriver record linked to the partner (Driver.linkedDeliveryPartnerId / partner.rideMode.taxiDriverId), so
 * all existing taxi matching, ride and payment code keeps working unchanged. Rules:
 *  - one mode at a time: in taxi mode the partner is offline for food, in food mode the driver is offline for taxi
 *  - no switching while a food order or a ride is in progress
 *  - one wallet: the taxi wallet is kept at its minimum; earnings above it go to the Pocket and cash-ride commission
 *    dues are recovered from the Pocket, so the partner withdraws everything from one place
 *  - owner fleet drivers (cab / bus owners) stay in the driver app and can not be linked
 */

const ACTIVE_FOOD_ORDER_STATUSES = ['confirmed', 'preparing', 'ready_for_pickup', 'reached_pickup', 'picked_up', 'reached_drop'];
const NOT_APPROVED_DRIVER_STATUSES = ['pending', 'rejected', 'disapproved', 'declined', 'blocked', 'inactive'];
const REJECTED_DRIVER_STATUSES = ['rejected', 'disapproved', 'declined'];
const ALLOWED_SERVICES = ['taxi', 'delivery'];
// A scheduled ride this close to its start time counts as the driver's current work
const SCHEDULED_RIDE_LOCK_MS = 30 * 60 * 1000;

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const todayKey = () => new Date().toISOString().slice(0, 10);

const codedError = (message, code, details) => {
    const err = new ValidationError(message);
    err.code = code;
    if (details) err.details = details;
    return err;
};

export const rideStatusOfDriver = (driver) => {
    if (!driver || driver.deletedAt) return 'none';
    const status = String(driver.status || '').trim().toLowerCase();
    if (REJECTED_DRIVER_STATUSES.includes(status)) return 'rejected';
    if (status === 'blocked' || status === 'inactive') return 'blocked';
    if (driver.approve === true && !NOT_APPROVED_DRIVER_STATUSES.includes(status)) return 'approved';
    return 'pending';
};

const loadPartner = async (partnerId) => {
    if (!mongoose.Types.ObjectId.isValid(String(partnerId || ''))) throw new ValidationError('Delivery partner not found');
    const partner = await FoodDeliveryPartner.findById(partnerId);
    if (!partner) throw new ValidationError('Delivery partner not found');
    return partner;
};

const loadLinkedDriver = async (partner) => {
    const driverId = partner?.rideMode?.taxiDriverId;
    if (!driverId) return null;
    return Driver.findById(driverId);
};

const findActiveFoodOrder = (partnerId) =>
    FoodOrder.findOne({ 'dispatch.deliveryPartnerId': partnerId, orderStatus: { $in: ACTIVE_FOOD_ORDER_STATUSES } })
        .select('_id orderId order_id')
        .lean();

const findActiveRide = (driverId) =>
    Ride.findOne({
        driverId,
        status: { $in: [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] },
        $or: [
            { scheduledAt: null },
            { scheduledAt: { $exists: false } },
            { scheduledAt: { $lte: new Date(Date.now() + SCHEDULED_RIDE_LOCK_MS) } },
        ],
    })
        .select('_id status liveStatus serviceType scheduledAt')
        .lean();

const findUpcomingScheduledRides = (driverId) =>
    Ride.find({
        driverId,
        status: RIDE_STATUS.ACCEPTED,
        scheduledAt: { $gt: new Date(Date.now() + SCHEDULED_RIDE_LOCK_MS) },
    })
        .select('_id scheduledAt serviceType')
        .sort({ scheduledAt: 1 })
        .limit(5)
        .lean();

const isVehicleOffering = (vehicle, service) => {
    const transport = String(vehicle?.transport_type || '').toLowerCase();
    const allowed = Array.isArray(vehicle?.allowed_services) ? vehicle.allowed_services.map((s) => String(s).toLowerCase()) : [];
    if (allowed.includes(service)) return true;
    return transport === 'both' || transport === service;
};

const genericVehicleType = (vehicle = {}) => {
    const value = String(vehicle.icon_types || vehicle.name || '').trim().toLowerCase();
    if (value.includes('bike') || value.includes('scooter')) return 'bike';
    if (value.includes('auto')) return 'auto';
    return 'car';
};

// Delivery partners ride on bikes / scooters only. Cars and autos register in the Raydo Sarthi (driver) app.
const isBikeVehicleType = (value) => /bike|scooter|scooty|moped/i.test(String(value || ''));
const isBikeVehicle = (vehicle = {}) => isBikeVehicleType(vehicle.icon_types) || isBikeVehicleType(vehicle.name);
const BIKE_ONLY_MESSAGE = 'Cars and autos can not be added here. Register in the Raydo Sarthi app to take rides with a car or auto.';

const partnerDocument = (key, url, number = '') => (url ? {
    key,
    fileName: `${key}.jpg`,
    uploaded: true,
    uploadedAt: new Date().toISOString(),
    previewUrl: url,
    secureUrl: url,
    identifyNumber: number || '',
    identify_number: number || '',
    documentNumber: number || '',
    document_number: number || '',
    source: 'delivery_partner_profile',
} : null);

const buildDriverDocuments = (partner, rcPhotoUrl, vehicleNumber) => {
    const entries = [
        partnerDocument('driving_license', partner.drivingLicensePhoto, partner.drivingLicenseNumber),
        partnerDocument('driving_license_back', partner.drivingLicensePhotoBack, partner.drivingLicenseNumber),
        partnerDocument('aadhaar_card', partner.aadharPhoto, partner.aadharNumber),
        partnerDocument('aadhaar_card_back', partner.aadharPhotoBack, partner.aadharNumber),
        partnerDocument('pan_card', partner.panPhoto, partner.panNumber),
        partnerDocument('vehicle_rc', rcPhotoUrl, vehicleNumber),
    ].filter(Boolean);
    return Object.fromEntries(entries.map((doc) => [doc.key, doc]));
};

/* ---------------------------------------------------------------------------------------------------------------- */
/* Documents the ride (taxi driver) side asks for                                                                    */
/* ---------------------------------------------------------------------------------------------------------------- */

// Which admin-configured driver documents the delivery profile already covers (matched on the document's name)
const PROFILE_DOCUMENT_MATCHERS = [
    { id: 'licence', test: /licen[cs]e|\bdl\b/i, front: 'drivingLicensePhoto', back: 'drivingLicensePhotoBack', number: 'drivingLicenseNumber' },
    { id: 'aadhaar', test: /a{1,2}dh?a{1,2}r/i, front: 'aadharPhoto', back: 'aadharPhotoBack', number: 'aadharNumber' },
    { id: 'pan', test: /\bpan\b/i, front: 'panPhoto', back: 'panPhotoBack', number: 'panNumber' },
];

const profileMatcherFor = (template) => PROFILE_DOCUMENT_MATCHERS.find((m) => m.test.test(String(template?.name || '')));
const isLicenceTemplate = (template) => profileMatcherFor(template)?.id === 'licence';

/** The driver documents the admin configured for individual drivers, the same list the Raydo Sarthi registration shows. */
const loadRideDocumentTemplates = async () => {
    const items = await listDriverNeededDocuments({ activeOnly: true, includeFields: true });
    return items.filter((t) => ['individual', 'both'].includes(String(t.account_type || 'individual').toLowerCase())
        && Array.isArray(t.fields) && t.fields.length > 0);
};

const profileValueFor = (partner, template, field) => {
    const matcher = profileMatcherFor(template);
    if (!matcher) return { url: '', number: '' };
    const url = field.side === 'back' ? partner[matcher.back] : partner[matcher.front];
    return { url: String(url || ''), number: String(partner[matcher.number] || '') };
};

const parseJsonObject = (value) => {
    if (value && typeof value === 'object') return value;
    try { return JSON.parse(String(value || '')) || {}; } catch { return {}; }
};

/**
 * Resolves every configured document field for this partner: a photo uploaded now wins, then what the ride profile
 * already holds, then the delivery profile (licence / Aadhaar / PAN). Returns what is still missing, by name.
 */
const resolveRideDocuments = (partner, templates, { uploads = {}, meta = {}, existing = {} } = {}) => {
    const documents = {};
    const missing = [];
    const outline = [];

    for (const template of templates) {
        const required = template.is_required !== false;
        const fields = [];
        let anyDoc = null;
        let number = '';
        let expiry = '';

        for (const field of template.fields) {
            const fromProfile = profileValueFor(partner, template, field);
            const current = existing[field.key];
            const url = uploads[field.key] || current?.secureUrl || current?.previewUrl || fromProfile.url;
            const fieldMeta = meta[field.key] || meta[template.id] || {};
            number = number || String(fieldMeta.identifyNumber || current?.identifyNumber || fromProfile.number || '').trim();
            expiry = expiry || String(fieldMeta.expiryDate || current?.expiryDate || '').trim();
            fields.push({
                key: field.key, label: field.label, side: field.side, required: field.required !== false,
                url, fromProfile: !uploads[field.key] && !current && Boolean(fromProfile.url),
            });
            if (url) anyDoc = true;
            if (!url && required && field.required !== false) missing.push(field.label);
        }

        if (anyDoc) {
            if (template.has_identify_number && !number) missing.push(`${template.name} ID number`);
            if (template.has_expiry_date && !expiry) missing.push(`${template.name} expiry date`);
        }
        for (const f of fields) {
            if (!f.url) continue;
            documents[f.key] = {
                key: f.key,
                fileName: `${f.key}.jpg`,
                uploaded: true,
                uploadedAt: new Date().toISOString(),
                previewUrl: f.url,
                secureUrl: f.url,
                identifyNumber: number,
                identify_number: number,
                documentNumber: number,
                document_number: number,
                expiryDate: expiry,
                expiry_date: expiry,
                source: f.fromProfile ? 'delivery_partner_profile' : 'delivery_partner_ride_application',
            };
        }
        outline.push({
            id: String(template.id), name: template.name, imageType: template.image_type, required,
            hasExpiryDate: Boolean(template.has_expiry_date), hasIdentifyNumber: Boolean(template.has_identify_number),
            identifyNumber: number, expiryDate: expiry, fields,
        });
    }
    return { documents, missing: [...new Set(missing)], outline };
};

/** What the Ride & Parcel form has to ask this partner for: the admin's driver documents, minus what the profile covers. */
export const getRideDocumentRequirements = async (partnerId) => {
    const partner = await loadPartner(partnerId);
    const linked = await loadLinkedDriver(partner);
    const templates = await loadRideDocumentTemplates();
    const { missing, outline } = resolveRideDocuments(partner, templates, { existing: linked?.documents || {} });
    return {
        documents: outline,
        missing,
        vehicleNumber: String(partner.vehicleNumber || '').trim().toUpperCase(),
        // an RC photo is only asked separately when the admin has not configured a vehicle RC document
        needsRcPhoto: !templates.some((t) => /\brc\b|registration/i.test(String(t.name || ''))),
    };
};

const lastToken = (value) => {
    const list = Array.isArray(value) ? value : [value];
    return String(list.filter(Boolean).slice(-1)[0] || '');
};

/* ---------------------------------------------------------------------------------------------------------------- */
/* Wallet merge                                                                                                      */
/* ---------------------------------------------------------------------------------------------------------------- */

/**
 * Keeps the partner's taxi wallet at a target balance and moves everything else to / from the Pocket:
 *  - above the target (ride earnings): moved to the Pocket, where the partner withdraws it
 *  - below the target (cash-ride commission dues): recovered from the Pocket as far as the Pocket allows
 * The target is the admin's "minimum balance to get rides" while the partner works rides, and 0 in food mode, so the
 * reserve goes back to the Pocket when the partner is not taking rides.
 * Safe to call any time; it only ever moves the difference.
 */
export const reconcileRideWallet = async (partnerId, { mode } = {}) => {
    const partner = await FoodDeliveryPartner.findById(partnerId).select('rideMode').lean();
    const driverId = partner?.rideMode?.taxiDriverId;
    if (!driverId) return null;

    return withPartnerWalletLock(partner._id, async () => {
        const driver = await Driver.findById(driverId);
        if (!driver || driver.deletedAt) return null;
        // The partner works rides in Ride & Parcel mode, or while the ride profile is online in the one-panel app
        const workMode = mode || (partner.rideMode?.activeMode === 'taxi' || driver.isOnline ? 'taxi' : 'food');

        const wallet = await serializeDriverWallet(driver);
        if (!wallet.isWalletEnabled) return { moved: 0, direction: null, taxiWallet: wallet };

        const target = workMode === 'taxi' ? Math.max(0, round2(wallet.minimumBalanceForOrders)) : 0;
        const balance = round2(wallet.balance);
        let direction = null;
        let amount = 0;

        if (balance > target) {
            direction = 'taxi_to_food';
            amount = round2(balance - target);
        } else if (balance < target) {
            const pocket = await getDeliveryPocketTotals(String(partner._id));
            amount = round2(Math.min(target - balance, Math.max(0, pocket.pocketBalance)));
            if (amount > 0) direction = 'food_to_taxi';
        }

        if (!direction || amount < 0.01) return { moved: 0, direction: null, taxiWallet: wallet };

        const session = await mongoose.startSession();
        try {
            let result;
            await session.withTransaction(async () => {
                result = await applyDriverWalletAdjustment({
                    driverId,
                    amount: direction === 'taxi_to_food' ? -amount : amount,
                    type: 'wallet_merge',
                    description: direction === 'taxi_to_food'
                        ? 'Ride earnings moved to delivery Pocket'
                        : 'Moved from delivery Pocket (ride dues / minimum balance)',
                    metadata: { deliveryPartnerId: String(partner._id), direction },
                    session,
                });
                await HybridWalletTransfer.create([{
                    deliveryPartnerId: partner._id,
                    taxiDriverId: driverId,
                    direction,
                    amount,
                    taxiWalletTransactionId: result?.transaction?._id || null,
                    reason: direction === 'taxi_to_food' ? 'ride_earnings' : 'ride_wallet_funding',
                }], { session });
            });
            return { moved: amount, direction, taxiWallet: result?.wallet || wallet };
        } finally {
            await session.endSession();
        }
    });
};

/**
 * The one amount both apps show for a linked partner: Pocket + ride wallet. Moving money between the two (wallet merge)
 * never changes it, so the Pocket and the ride wallet always read the same rupees. Earnings and history stay per app.
 * `displayBalance` is for display only; blocking / withdrawal rules keep using the real balances.
 */
export const withUnifiedWalletBalance = async (driver, wallet) => {
    if (!driver?.linkedDeliveryPartnerId || !wallet) return wallet;
    try {
        const pocket = await getDeliveryPocketTotals(String(driver.linkedDeliveryPartnerId));
        return { ...wallet, displayBalance: round2(Number(pocket.pocketBalance || 0) + Number(wallet.balance || 0)) };
    } catch (err) {
        logger.warn(`[RideMode] unified balance skipped for driver ${driver._id}: ${err?.message || err}`);
        return wallet;
    }
};

/** Wallet merge for a taxi driver id (used after a ride is settled). Does nothing for normal taxi drivers. */
export const reconcileRideWalletForDriver = async (driverId) => {
    const driver = await Driver.findById(driverId).select('linkedDeliveryPartnerId').lean();
    if (!driver?.linkedDeliveryPartnerId) return null;
    return reconcileRideWallet(driver.linkedDeliveryPartnerId);
};

/* ---------------------------------------------------------------------------------------------------------------- */
/* Status / enrolment                                                                                                */
/* ---------------------------------------------------------------------------------------------------------------- */

export const listRideModeVehicleTypes = async () => {
    const vehicles = await Vehicle.find({ active: true, status: 1 })
        .select('name transport_type allowed_services icon_types image icon capacity')
        .sort({ name: 1 })
        .lean();
    return vehicles
        .map((v) => ({
            id: String(v._id),
            name: v.name,
            icon: v.icon || v.image || '',
            iconType: v.icon_types || '',
            capacity: v.capacity || null,
            services: ALLOWED_SERVICES.filter((s) => isVehicleOffering(v, s)),
            // false for cars / autos: the app shows them greyed out with "register in Raydo Sarthi"
            allowed: isBikeVehicle(v),
        }))
        .filter((v) => v.services.length > 0);
};

export const getRideModeStatus = async (partnerId, { reconcile = true } = {}) => {
    const partner = await loadPartner(partnerId);
    let driver = await loadLinkedDriver(partner);

    if (driver && reconcile) {
        try {
            await reconcileRideWallet(partner._id);
            driver = await Driver.findById(driver._id);
        } catch (err) {
            logger.warn(`[RideMode] wallet merge skipped for ${partner._id}: ${err?.message || err}`);
        }
    }

    const status = rideStatusOfDriver(driver);
    const taxiWallet = driver && status !== 'none' ? await serializeDriverWallet(driver) : null;
    const minimum = taxiWallet ? Math.max(0, round2(taxiWallet.minimumBalanceForOrders)) : 0;
    const activeRide = driver ? await findActiveRide(driver._id) : null;
    const pocketBalance = driver && partner.rideMode?.activeMode !== 'taxi'
        ? (await getDeliveryPocketTotals(String(partner._id))).pocketBalance
        : 0;

    return {
        eligible: partner.status === 'approved',
        status,
        activeMode: status === 'approved' ? (partner.rideMode?.activeMode || 'food') : 'food',
        foodOrdersEnabled: partner.rideMode?.foodOrdersEnabled !== false,
        rejectionReason: status === 'rejected' ? String(driver?.onboarding?.rejectionReason || driver?.deletion_reason || '') : '',
        appliedAt: partner.rideMode?.appliedAt || null,
        vehicle: driver ? {
            vehicleTypeId: driver.vehicleTypeId ? String(driver.vehicleTypeId) : null,
            vehicleType: driver.vehicleType,
            vehicleNumber: driver.vehicleNumber,
            vehicleMake: driver.vehicleMake,
            vehicleModel: driver.vehicleModel,
            vehicleColor: driver.vehicleColor,
            services: driver.serviceCategories || [],
        } : null,
        taxi: driver ? {
            driverId: String(driver._id),
            isOnline: Boolean(driver.isOnline),
            isOnRide: Boolean(driver.isOnRide),
            activeRideId: activeRide ? String(activeRide._id) : null,
            rating: driver.rating || 0,
        } : null,
        wallet: taxiWallet ? {
            rideWalletBalance: round2(taxiWallet.balance),
            // Cash-ride commission the Pocket could not cover yet
            duesPending: round2(Math.max(0, -taxiWallet.balance)),
            // What still has to be added (on top of the Pocket) before rides can be taken
            topUpNeeded: round2(Math.max(0, minimum - taxiWallet.balance - Math.max(0, pocketBalance))),
            minimumBalanceForRides: round2(taxiWallet.minimumBalanceForOrders),
            isBlocked: Boolean(taxiWallet.isBlocked),
        } : null,
    };
};

export const applyForRideMode = async (partnerId, payload = {}, files = {}, { autoApprove = false } = {}) => {
    const partner = await loadPartner(partnerId);
    if (partner.status !== 'approved') {
        throw codedError('Your delivery account must be approved before you can add Ride & Parcel.', 'PARTNER_NOT_APPROVED');
    }

    const vehicleTypeId = String(payload.vehicleTypeId || '').trim();
    const vehicleNumber = String(payload.vehicleNumber || '').trim().toUpperCase();
    let services = payload.services ?? payload.serviceCategories ?? [];
    if (typeof services === 'string') services = services.split(',');
    services = [...new Set((Array.isArray(services) ? services : []).map((s) => String(s).trim().toLowerCase()))]
        .map((s) => (s === 'parcel' ? 'delivery' : s === 'ride' ? 'taxi' : s))
        .filter((s) => ALLOWED_SERVICES.includes(s));

    if (!mongoose.Types.ObjectId.isValid(vehicleTypeId)) throw new ValidationError('Select a vehicle type');
    if (!/^[A-Z0-9 -]{4,15}$/.test(vehicleNumber)) throw new ValidationError('Enter a valid vehicle number');
    if (services.length === 0) throw new ValidationError('Select at least one service: Ride or Parcel');

    const vehicle = await Vehicle.findOne({ _id: vehicleTypeId, active: true, status: 1 }).lean();
    if (!vehicle) throw new ValidationError('This vehicle type is not available');
    if (!isBikeVehicle(vehicle)) throw codedError(BIKE_ONLY_MESSAGE, 'BIKE_ONLY');
    const unsupported = services.filter((s) => !isVehicleOffering(vehicle, s));
    if (unsupported.length) {
        throw new ValidationError(`${vehicle.name} can not be used for ${unsupported.map((s) => (s === 'taxi' ? 'rides' : 'parcels')).join(' / ')}`);
    }
    const linked = await loadLinkedDriver(partner);

    // Photos sent with this application: `doc__<field key>` for the admin's driver documents, `rcPhoto` for the vehicle RC
    const documentFiles = Object.entries(files || {}).filter(([name, list]) => name.startsWith('doc__') && list?.[0]?.buffer);
    const uploads = Object.fromEntries(await Promise.all(documentFiles.map(async ([name, list]) => [
        name.slice('doc__'.length),
        await uploadImageBuffer(list[0].buffer, 'food/delivery/ride-mode'),
    ])));

    // The same documents the Raydo Sarthi registration asks for. Licence / Aadhaar / PAN already in the delivery profile
    // are reused; everything else (and any ID number / expiry date) has to come with this application.
    const templates = await loadRideDocumentTemplates();
    const resolved = resolveRideDocuments(partner, templates, {
        uploads,
        meta: parseJsonObject(payload.documentMeta),
        existing: linked && !linked.deletedAt ? linked.documents || {} : {},
    });
    if (templates.length > 0 && resolved.missing.length > 0) {
        throw codedError(`Add these documents to continue: ${resolved.missing.join(', ')}.`, 'RIDE_DOCUMENTS_REQUIRED', { missing: resolved.missing });
    }
    const licenceTemplateCovered = templates.some((t) => isLicenceTemplate(t) && t.fields.some((f) => resolved.documents[f.key]));
    if (!partner.drivingLicensePhoto && !partner.drivingLicenseNumber && !licenceTemplateCovered) {
        throw codedError('Add your driving licence in Profile > Documents before applying.', 'DRIVING_LICENSE_REQUIRED');
    }
    // A document the delivery team never saw needs the same admin review as in the driver app
    const needsAdminReview = Object.keys(uploads).length > 0;

    const rcFile = files?.rcPhoto?.[0];
    const rcPhotoUrl = rcFile ? await uploadImageBuffer(rcFile.buffer, 'food/delivery/ride-mode') : String(payload.rcPhotoUrl || '').trim();
    const driverDocuments = { ...buildDriverDocuments(partner, rcPhotoUrl, vehicleNumber), ...resolved.documents };

    const vehicleFields = {
        vehicleType: genericVehicleType(vehicle),
        vehicleTypeId: vehicle._id,
        vehicleIconType: vehicle.icon_types || genericVehicleType(vehicle),
        vehicleNumber,
        vehicleMake: String(payload.vehicleMake || '').trim(),
        vehicleModel: String(payload.vehicleModel || '').trim(),
        vehicleColor: String(payload.vehicleColor || '').trim(),
        serviceCategories: services,
        registerFor: services.length === 2 ? 'both' : services[0],
    };

    if (linked && !linked.deletedAt) {
        // Re-apply after a rejection with corrected details; anything else is already applied / approved
        if (rideStatusOfDriver(linked) !== 'rejected') {
            throw codedError('You have already applied for Ride & Parcel.', 'ALREADY_APPLIED');
        }
        Object.assign(linked, vehicleFields, { approve: false, status: 'pending' });
        linked.documents = { ...(linked.documents || {}), ...buildDriverDocuments(partner, rcPhotoUrl || linked.documents?.vehicle_rc?.secureUrl, vehicleNumber), ...resolved.documents };
        linked.onboarding = { ...(linked.onboarding || {}), resubmittedAt: new Date(), rejectionReason: '', needsAdminReview: true };
        linked.markModified('documents');
        linked.markModified('onboarding');
        await linked.save();
        partner.rideMode.appliedAt = new Date();
        await partner.save();
        return getRideModeStatus(partner._id, { reconcile: false });
    }

    // Same phone already in the driver app: this is the same person, so link that account instead of a duplicate
    const existing = await Driver.findOne({ phone: partner.phone });
    let driver;
    if (existing) {
        if (existing.deletedAt) {
            throw codedError('A deleted driver account uses this phone number. Please contact support.', 'DRIVER_ACCOUNT_DELETED');
        }
        if (existing.owner_id) {
            throw codedError('This number is a fleet driver under a cab owner. Fleet drivers keep using the driver app.', 'FLEET_DRIVER');
        }
        if (!isBikeVehicleType(existing.vehicleType) && !isBikeVehicleType(existing.vehicleIconType)) {
            throw codedError('Your driver account uses a car or auto. Keep using the Raydo Sarthi app for rides.', 'BIKE_ONLY');
        }
        if (existing.linkedDeliveryPartnerId && String(existing.linkedDeliveryPartnerId) !== String(partner._id)) {
            throw codedError('This driver account is already linked to another delivery partner.', 'DRIVER_ALREADY_LINKED');
        }
        existing.linkedDeliveryPartnerId = partner._id;
        existing.isOnline = false;
        // keep what the driver app already holds; only fill the documents it does not have
        existing.documents = { ...driverDocuments, ...(existing.documents || {}) };
        existing.markModified('documents');
        await existing.save();
        driver = existing;
    } else {
        const coords = Array.isArray(partner.lastLocation?.coordinates) && partner.lastLocation.coordinates.length === 2
            ? partner.lastLocation.coordinates
            : [0, 0];
        const zone = coords[0] || coords[1] ? await findZoneByPickup(coords).catch(() => null) : null;

        driver = await Driver.create({
            name: partner.name,
            phone: partner.phone,
            email: partner.email || '',
            // Never used to log in: the partner signs in with the delivery app OTP and gets a ride session from there
            password: await hashPassword(crypto.randomBytes(24).toString('hex')),
            profile_picture: partner.profilePhoto || '',
            profileImage: partner.profilePhoto || '',
            city: partner.city || '',
            ...vehicleFields,
            linkedDeliveryPartnerId: partner._id,
            // An approved delivery partner already passed document verification, so the app enrols them directly
            approve: autoApprove && !needsAdminReview,
            status: autoApprove && !needsAdminReview ? 'approved' : 'pending',
            zoneId: zone?._id || null,
            location: { type: 'Point', coordinates: coords },
            documents: driverDocuments,
            fcmTokenMobile: lastToken(partner.fcmTokenMobile),
            fcmTokenWeb: lastToken(partner.fcmTokens),
            onboarding: {
                source: 'delivery_partner_app',
                deliveryPartnerId: String(partner._id),
                needsAdminReview,
                submittedAt: new Date(),
                vehicle: { ...vehicleFields, vehicleTypeId: String(vehicle._id) },
            },
        });

        if (!autoApprove || needsAdminReview) import('../../../taxi/services/dispatchService.js')
            .then((m) => m.emitToAdmins('new_registration_alert', {
                id: String(driver._id),
                type: 'driver',
                role: 'driver',
                title: 'Delivery partner applied for Ride & Parcel',
                name: driver.name,
                phone: driver.phone,
                createdAt: new Date().toISOString(),
            }))
            .catch(() => {});
    }

    partner.rideMode = { ...(partner.rideMode?.toObject?.() || partner.rideMode || {}), taxiDriverId: driver._id, activeMode: 'food', appliedAt: new Date() };
    await partner.save();
    return getRideModeStatus(partner._id, { reconcile: false });
};

/* ---------------------------------------------------------------------------------------------------------------- */
/* Mode switch                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------------- */

const issueTaxiToken = (driver) => signAccessToken({ sub: String(driver._id), role: 'driver' });

/**
 * An approved delivery partner does not fill an application: the first time they switch to Ride & Parcel, a ride profile
 * is created from their delivery profile (their bike and documents) and approved on the spot.
 * Applications that were submitted earlier and are still pending are approved the same way.
 */
const ensureEnrolledForRides = async (partner) => {
    let driver = await loadLinkedDriver(partner);
    const status = rideStatusOfDriver(driver);

    if (status === 'none') {
        if (partner.status !== 'approved') {
            throw codedError('Your delivery account must be approved before you can take rides.', 'PARTNER_NOT_APPROVED');
        }
        const vehicleNumber = String(partner.vehicleNumber || '').trim().toUpperCase();
        if (!/^[A-Z0-9 -]{4,15}$/.test(vehicleNumber)) {
            throw codedError('Add your vehicle number in Profile > Documents to start taking rides.', 'VEHICLE_NUMBER_REQUIRED');
        }
        const bikes = (await Vehicle.find({ active: true, status: 1 }).sort({ name: 1 }).lean()).filter(isBikeVehicle);
        const bike = bikes.find((v) => ALLOWED_SERVICES.every((svc) => isVehicleOffering(v, svc))) || bikes[0];
        if (!bike) throw codedError('Ride & Parcel is not available for bikes yet.', 'NO_BIKE_VEHICLE_TYPE');

        await applyForRideMode(partner._id, {
            vehicleTypeId: String(bike._id),
            vehicleNumber,
            services: ALLOWED_SERVICES.filter((svc) => isVehicleOffering(bike, svc)),
        }, {}, { autoApprove: true });
        driver = await Driver.findById((await FoodDeliveryPartner.findById(partner._id).select('rideMode').lean()).rideMode.taxiDriverId);
        // applyForRideMode saved the partner through another document
        partner.rideMode = (await FoodDeliveryPartner.findById(partner._id).select('rideMode').lean()).rideMode;
    } else if (status === 'pending' && driver.onboarding?.source === 'delivery_partner_app' && !driver.onboarding?.needsAdminReview) {
        driver.approve = true;
        driver.status = 'approved';
        await driver.save();
    }
    return driver;
};

const requireApprovedDriver = async (partner, loadedDriver) => {
    const driver = loadedDriver || await loadLinkedDriver(partner);
    const status = rideStatusOfDriver(driver);
    if (status === 'none') throw codedError('Apply for Ride & Parcel first.', 'RIDE_MODE_NOT_ENROLLED');
    if (status === 'pending') throw codedError('Your Ride & Parcel application is still under review.', 'RIDE_MODE_PENDING');
    if (status === 'rejected') throw codedError('Your Ride & Parcel application was rejected. Update the details and apply again.', 'RIDE_MODE_REJECTED');
    if (status === 'blocked') throw codedError('Your ride account is blocked. Please contact support.', 'RIDE_MODE_BLOCKED');
    return driver;
};

/** Funds the ride wallet's minimum balance from the Pocket and refuses when the wallet still blocks rides. */
const assertRideWalletReady = async (partner, driver) => {
    await reconcileRideWallet(partner._id, { mode: 'taxi' });
    const freshDriver = await Driver.findById(driver._id);
    const taxiWallet = await serializeDriverWallet(freshDriver);
    if (taxiWallet.isBlocked) {
        if (!taxiWallet.isWalletEnabled) throw codedError('Ride wallet is disabled by admin.', 'RIDE_WALLET_DISABLED');
        const topUpNeeded = round2(Math.max(0, Math.max(0, taxiWallet.minimumBalanceForOrders) - taxiWallet.balance));
        const duesPending = round2(Math.max(0, -taxiWallet.balance));
        throw codedError(
            duesPending > 0
                ? `Ride commission dues of ₹${duesPending} are pending. Add ₹${topUpNeeded} to your ride wallet to take rides.`
                : `Rides need a minimum wallet balance of ₹${round2(taxiWallet.minimumBalanceForOrders)}. Earn it from food deliveries or add ₹${topUpNeeded} to your ride wallet.`,
            'RIDE_WALLET_DUES',
            { duesPending, topUpNeeded }
        );
    }
};

/** What the linked ride profile takes over from the delivery profile when the partner starts working rides. */
const driverSyncUpdate = (partner, payload = {}) => {
    const update = {
        // The selfie the partner verified for food today also counts for rides (same person, same shift)
        ...(partner.onlineSelfie?.verifiedStatus === 'verified' && partner.onlineSelfie?.forDate === todayKey() && partner.onlineSelfie?.imageUrl
            ? { onlineSelfie: {
                imageUrl: partner.onlineSelfie.imageUrl,
                capturedAt: partner.onlineSelfie.capturedAt || new Date(),
                uploadedAt: partner.onlineSelfie.uploadedAt || new Date(),
                forDate: partner.onlineSelfie.forDate,
            } }
            : {}),
    };
    const mobileToken = lastToken(partner.fcmTokenMobile);
    const webToken = lastToken(partner.fcmTokens);
    if (mobileToken) update.fcmTokenMobile = mobileToken;
    if (webToken) update.fcmTokenWeb = webToken;
    const lat = Number(payload.latitude);
    const lng = Number(payload.longitude);
    if (Number.isFinite(lat) && Number.isFinite(lng) && (lat || lng)) {
        update.location = { type: 'Point', coordinates: [lng, lat] };
    }
    return update;
};

export const switchRideMode = async (partnerId, payload = {}) => {
    const mode = String(payload.mode || '').trim().toLowerCase();
    if (!['food', 'taxi'].includes(mode)) throw new ValidationError('mode must be food or taxi');

    const partner = await loadPartner(partnerId);
    // The enrolment already loads the driver: reuse it, and look for a running food order at the same time
    const [enrolledDriver, activeOrder] = mode === 'taxi'
        ? await Promise.all([ensureEnrolledForRides(partner), findActiveFoodOrder(partner._id)])
        : [null, null];
    const driver = await requireApprovedDriver(partner, enrolledDriver);

    if (mode === 'taxi') {
        if (activeOrder) {
            throw codedError(
                `Finish your current food order (#${activeOrder.order_id || activeOrder.orderId || activeOrder._id}) before switching to Ride & Parcel.`,
                'ACTIVE_ORDER_IN_PROGRESS'
            );
        }

        await assertRideWalletReady(partner, driver);
        const update = driverSyncUpdate(partner, payload);
        if (Object.keys(update).length) await Driver.updateOne({ _id: driver._id }, { $set: update });

        const wasOnline = partner.availabilityStatus === 'online';
        partner.availabilityStatus = 'offline';
        partner.rideMode.activeMode = 'taxi';
        partner.rideMode.lastSwitchedAt = new Date();
        await partner.save();

        return {
            mode: 'taxi',
            wasOnline,
            taxiToken: issueTaxiToken(driver),
            driverId: String(driver._id),
        };
    }

    // mode === 'food'
    const activeRide = await findActiveRide(driver._id);
    if (activeRide || driver.isOnRide) {
        throw codedError('Finish your current ride before switching to Food delivery.', 'ACTIVE_RIDE_IN_PROGRESS', {
            rideId: activeRide ? String(activeRide._id) : null,
        });
    }
    const wasOnline = Boolean(driver.isOnline);
    partner.rideMode.activeMode = 'food';
    partner.rideMode.lastSwitchedAt = new Date();
    // Still online in the delivery app: rides keep coming together with food, so the ride profile stays online
    const stillOnline = partner.availabilityStatus === 'online';
    const [, , upcoming] = await Promise.all([
        stillOnline ? null : Driver.updateOne(
            { _id: driver._id },
            { $set: { isOnline: false, socketId: null, 'incentiveTracking.currentOnlineStartedAt': null } }
        ),
        partner.save(),
        findUpcomingScheduledRides(driver._id),
    ]);

    // After the mode is saved (the wallet target depends on it)
    try {
        await reconcileRideWallet(partner._id);
    } catch (err) {
        logger.warn(`[RideMode] wallet merge after switch failed for ${partner._id}: ${err?.message || err}`);
    }

    return {
        mode: 'food',
        wasOnline,
        upcomingScheduledRides: upcoming.map((r) => ({ rideId: String(r._id), scheduledAt: r.scheduledAt, serviceType: r.serviceType })),
    };
};

/** A fresh ride-app session for the linked driver (the delivery app keeps its own login; this token is only for rides). */
export const issueRideSession = async (partnerId) => {
    const partner = await loadPartner(partnerId);
    const driver = await requireApprovedDriver(partner);
    return { taxiToken: issueTaxiToken(driver), driverId: String(driver._id), activeMode: partner.rideMode?.activeMode || 'food' };
};

/**
 * One panel: a linked ride profile is reachable for rides while its partner is online in the delivery app (or still in the
 * older Ride & Parcel mode). Used by the taxi go-online, the location ping and dispatch.
 */
const partnerAllowsRides = (partner) => !partner || partner.rideMode?.activeMode === 'taxi' || partner.availabilityStatus === 'online';

export const linkedDriverMayBeOnline = async (driverId) => {
    const driver = await Driver.findById(driverId).select('linkedDeliveryPartnerId').lean();
    if (!driver?.linkedDeliveryPartnerId) return true;
    const partner = await FoodDeliveryPartner.findById(driver.linkedDeliveryPartnerId).select('rideMode.activeMode availabilityStatus').lean();
    return partnerAllowsRides(partner);
};

/** Called by the taxi app's go-online: a linked driver is online for rides only while the partner is online in the delivery app. */
export const assertLinkedDriverMayGoOnline = async (driver) => {
    if (!driver?.linkedDeliveryPartnerId) return;
    const partner = await FoodDeliveryPartner.findById(driver.linkedDeliveryPartnerId);
    if (!partner) return;
    if (!partnerAllowsRides(partner)) {
        const todayKey = new Date().toISOString().slice(0, 10);
        const partnerSelfieVerified = partner.onlineSelfie?.forDate === todayKey && partner.onlineSelfie?.verifiedStatus === 'verified';
        const driverSelfieFresh = driver.onlineSelfie?.forDate === todayKey && Boolean(driver.onlineSelfie?.imageUrl);
        if (partnerSelfieVerified || driverSelfieFresh) {
            partner.availabilityStatus = 'online';
            if (driverSelfieFresh && !partner.onlineSelfie?.imageUrl) {
                partner.onlineSelfie = {
                    imageUrl: driver.onlineSelfie.imageUrl,
                    capturedAt: driver.onlineSelfie.capturedAt || new Date(),
                    uploadedAt: new Date(),
                    forDate: todayKey,
                    verifiedStatus: 'verified'
                };
            }
            await partner.save();
            return;
        }
        throw codedError('Go online in the delivery app to get ride and parcel requests.', 'GO_ONLINE_IN_DELIVERY_APP');
    }
};

/**
 * Taxi dispatch: drops linked drivers whose partner is offline in the delivery app or is busy with a food order, so one
 * person is never offered a ride while delivering food. Drivers without a linked partner pass through untouched.
 */
export const filterLinkedDriversForDispatch = async (drivers = []) => {
    const linkedIds = [...new Set(drivers.map((d) => d?.linkedDeliveryPartnerId).filter(Boolean).map(String))];
    if (linkedIds.length === 0) return drivers;
    try {
        const [partners, busyOrders] = await Promise.all([
            FoodDeliveryPartner.find({ _id: { $in: linkedIds } }).select('rideMode.activeMode availabilityStatus').lean(),
            FoodOrder.find({ 'dispatch.deliveryPartnerId': { $in: linkedIds }, orderStatus: { $in: ACTIVE_FOOD_ORDER_STATUSES } })
                .select('dispatch.deliveryPartnerId').lean(),
        ]);
        const partnerById = new Map(partners.map((p) => [String(p._id), p]));
        const busy = new Set(busyOrders.map((o) => String(o.dispatch?.deliveryPartnerId)));
        return drivers.filter((d) => {
            if (!d?.linkedDeliveryPartnerId) return true;
            const id = String(d.linkedDeliveryPartnerId);
            const partner = partnerById.get(id);
            return partnerAllowsRides(partner) && !busy.has(id);
        });
    } catch (err) {
        logger.warn(`[RideMode] dispatch filter skipped: ${err?.message || err}`);
        return drivers;
    }
};

/**
 * Food dispatch: partner ids that must not be offered a food order right now - food orders switched off in the delivery
 * app, or a ride / parcel trip in progress on the linked ride profile.
 */
export const partnerIdsBlockedForFood = async (partnerIds = []) => {
    const ids = [...new Set(partnerIds.filter(Boolean).map((id) => String(id?._id || id)))];
    const blocked = new Set();
    if (ids.length === 0) return blocked;
    try {
        const linked = await FoodDeliveryPartner.find({ _id: { $in: ids }, 'rideMode.taxiDriverId': { $ne: null } })
            .select('rideMode').lean();
        const driverToPartner = new Map();
        for (const p of linked) {
            if (p.rideMode?.foodOrdersEnabled === false || p.rideMode?.activeMode === 'taxi') blocked.add(String(p._id));
            else driverToPartner.set(String(p.rideMode.taxiDriverId), String(p._id));
        }
        if (driverToPartner.size) {
            const onRide = await Driver.find({ _id: { $in: [...driverToPartner.keys()] }, isOnRide: true }).select('_id').lean();
            onRide.forEach((d) => blocked.add(driverToPartner.get(String(d._id))));
        }
    } catch (err) {
        logger.warn(`[RideMode] food dispatch filter skipped: ${err?.message || err}`);
    }
    return blocked;
};

/**
 * Going online / offline in the delivery app also puts the linked ride profile online / offline, so one switch gives food
 * orders and ride / parcel requests together. The first time, the ride profile is created from the partner's bike and
 * documents. Never throws: food keeps working and the reason rides are not on is returned for the app to show.
 */
export const syncRidesWithOnline = async (partnerId, online, { latitude, longitude } = {}) => {
    try {
        const partner = await loadPartner(partnerId);
        let driver = await loadLinkedDriver(partner);

        if (!online) {
            if (!driver) return { active: false };
            await Driver.updateOne(
                { _id: driver._id, isOnRide: { $ne: true } },
                { $set: { isOnline: false, socketId: null, 'incentiveTracking.currentOnlineStartedAt': null } }
            );
            await reconcileRideWallet(partner._id, { mode: 'food' }).catch(() => null);
            return { active: false };
        }

        driver = await ensureEnrolledForRides(partner);
        driver = await requireApprovedDriver(partner, driver);
        await assertRideWalletReady(partner, driver);
        const update = { ...driverSyncUpdate(partner, { latitude, longitude }), isOnline: true };
        await Driver.updateOne({ _id: driver._id }, { $set: update });
        return { active: true };
    } catch (err) {
        logger.warn(`[RideMode] rides not switched on for partner ${partnerId}: ${err?.message || err}`);
        return { active: false, code: err?.code || '', reason: err?.message || 'Rides are not available right now' };
    }
};

/** The partner's choice to receive (or stop receiving) food orders while staying online for rides and parcels. */
export const setFoodOrdersEnabled = async (partnerId, enabled) => {
    const partner = await loadPartner(partnerId);
    const next = enabled !== false && enabled !== 'false';
    const driver = await loadLinkedDriver(partner);
    if (!next && rideStatusOfDriver(driver) !== 'approved') {
        throw codedError('Set up Ride & Parcel first: with food orders off there would be nothing to receive.', 'RIDE_MODE_NOT_ENROLLED');
    }
    await FoodDeliveryPartner.updateOne({ _id: partner._id }, { $set: { 'rideMode.foodOrdersEnabled': next } });
    return { foodOrdersEnabled: next };
};

/** Partner account deleted: the ride profile created for it is closed too; a driver-app account that was linked stays. */
export const detachRideModeOnPartnerDelete = async (partnerId) => {
    const driver = await Driver.findOne({ linkedDeliveryPartnerId: partnerId });
    if (!driver) return;
    if (driver.onboarding?.source === 'delivery_partner_app') {
        driver.isOnline = false;
        driver.deletedAt = new Date();
        driver.deletion_reason = 'Delivery partner account deleted';
    }
    driver.linkedDeliveryPartnerId = null;
    await driver.save();
};
