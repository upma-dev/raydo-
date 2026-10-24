import crypto from 'crypto';
import mongoose from 'mongoose';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { HybridWalletTransfer } from '../models/hybridWalletTransfer.model.js';
import { FoodOrder } from '../../orders/models/order.model.js';
import { Driver } from '../../../taxi/driver/models/Driver.js';
import { Vehicle } from '../../../taxi/admin/models/Vehicle.js';
import { Ride } from '../../../taxi/user/models/Ride.js';
import { RIDE_STATUS } from '../../../taxi/constants/index.js';
import { applyDriverWalletAdjustment, serializeDriverWallet } from '../../../taxi/driver/services/walletService.js';
import { hashPassword } from '../../../taxi/driver/services/authService.js';
import { signAccessToken } from '../../../taxi/services/tokenService.js';
import { findZoneByPickup } from '../../../taxi/services/matchingService.js';
import { getDeliveryPartnerWalletEnhanced } from './deliveryFinance.service.js';
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
    const workMode = mode || partner.rideMode?.activeMode || 'food';

    return withPartnerWalletLock(partner._id, async () => {
        const driver = await Driver.findById(driverId);
        if (!driver || driver.deletedAt) return null;

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
            const pocket = await getDeliveryPartnerWalletEnhanced(String(partner._id));
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
        const pocket = await getDeliveryPartnerWalletEnhanced(String(driver.linkedDeliveryPartnerId));
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
        ? (await getDeliveryPartnerWalletEnhanced(String(partner._id))).pocketBalance
        : 0;

    return {
        eligible: partner.status === 'approved',
        status,
        activeMode: status === 'approved' ? (partner.rideMode?.activeMode || 'food') : 'food',
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
    if (!partner.drivingLicensePhoto && !partner.drivingLicenseNumber) {
        throw codedError('Add your driving licence in Profile > Documents before applying.', 'DRIVING_LICENSE_REQUIRED');
    }

    const rcFile = files?.rcPhoto?.[0];
    const rcPhotoUrl = rcFile ? await uploadImageBuffer(rcFile.buffer, 'food/delivery/ride-mode') : String(payload.rcPhotoUrl || '').trim();

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

    const linked = await loadLinkedDriver(partner);
    if (linked && !linked.deletedAt) {
        // Re-apply after a rejection with corrected details; anything else is already applied / approved
        if (rideStatusOfDriver(linked) !== 'rejected') {
            throw codedError('You have already applied for Ride & Parcel.', 'ALREADY_APPLIED');
        }
        Object.assign(linked, vehicleFields, { approve: false, status: 'pending' });
        linked.documents = { ...(linked.documents || {}), ...buildDriverDocuments(partner, rcPhotoUrl || linked.documents?.vehicle_rc?.secureUrl, vehicleNumber) };
        linked.onboarding = { ...(linked.onboarding || {}), resubmittedAt: new Date(), rejectionReason: '' };
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
            approve: autoApprove,
            status: autoApprove ? 'approved' : 'pending',
            zoneId: zone?._id || null,
            location: { type: 'Point', coordinates: coords },
            documents: buildDriverDocuments(partner, rcPhotoUrl, vehicleNumber),
            fcmTokenMobile: lastToken(partner.fcmTokenMobile),
            fcmTokenWeb: lastToken(partner.fcmTokens),
            onboarding: {
                source: 'delivery_partner_app',
                deliveryPartnerId: String(partner._id),
                submittedAt: new Date(),
                vehicle: { ...vehicleFields, vehicleTypeId: String(vehicle._id) },
            },
        });

        if (!autoApprove) import('../../../taxi/services/dispatchService.js')
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
    } else if (status === 'pending' && driver.onboarding?.source === 'delivery_partner_app') {
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

        // Fund the ride wallet's minimum balance from the Pocket before going to rides
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
    const [, , upcoming] = await Promise.all([
        Driver.updateOne(
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

/** Called by the taxi app's go-online: a linked driver may only be online for rides while the partner is in taxi mode. */
export const assertLinkedDriverMayGoOnline = async (driver) => {
    if (!driver?.linkedDeliveryPartnerId) return;
    const partner = await FoodDeliveryPartner.findById(driver.linkedDeliveryPartnerId).select('rideMode availabilityStatus').lean();
    if (!partner) return;
    if (partner.rideMode?.activeMode !== 'taxi') {
        throw codedError('Switch to Ride & Parcel in the delivery app before going online for rides.', 'SWITCH_TO_RIDE_MODE');
    }
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
