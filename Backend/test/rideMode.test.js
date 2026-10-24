import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';
import { HybridWalletTransfer } from '../src/modules/food/delivery/models/hybridWalletTransfer.model.js';
import { FoodDeliveryWithdrawal } from '../src/modules/food/delivery/models/foodDeliveryWithdrawal.model.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { WalletTransaction } from '../src/modules/taxi/driver/models/WalletTransaction.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';
import { applyDriverWalletAdjustment, settleCompletedRideWallet } from '../src/modules/taxi/driver/services/walletService.js';
import { verifyAccessToken } from '../src/modules/taxi/services/tokenService.js';
import {
    applyForRideMode,
    assertLinkedDriverMayGoOnline,
    getRideModeStatus,
    issueRideSession,
    listRideModeVehicleTypes,
    reconcileRideWallet,
    switchRideMode,
} from '../src/modules/food/delivery/services/hybridRide.service.js';
import { getDeliveryPartnerWalletEnhanced, requestDeliveryWithdrawal } from '../src/modules/food/delivery/services/deliveryFinance.service.js';
import { deleteDeliveryPartnerAccount, updateDeliveryAvailability } from '../src/modules/food/delivery/services/delivery.service.js';
import { createDriverWithdrawalRequest } from '../src/modules/taxi/driver/controllers/driverController.js';
import express from 'express';
import request from 'supertest';
import deliveryRouter from '../src/modules/food/delivery/routes/delivery.routes.js';
import { driverRouter } from '../src/modules/taxi/driver/routes/driverRoutes.js';
import errorHandler from '../src/middleware/errorHandler.js';
import { signAccessToken as signDeliveryToken } from '../src/core/auth/token.util.js';

let replSet;
let seq = 0;
let bikeId;
let carTaxiOnlyId;
let scootyTaxiOnlyId;

const today = () => new Date().toISOString().slice(0, 10);

const makePartner = (extra = {}) => FoodDeliveryPartner.create({
    name: 'Ravi Rider',
    phone: `70000000${String(++seq).padStart(2, '0')}`,
    status: 'approved',
    availabilityStatus: 'online',
    drivingLicenseNumber: 'MP09-2020-0001',
    drivingLicensePhoto: 'https://cdn.test/dl.jpg',
    aadharPhoto: 'https://cdn.test/aadhar.jpg',
    fcmTokenMobile: ['old-token', 'device-token'],
    onlineSelfie: { imageUrl: 'https://cdn.test/selfie.jpg', capturedAt: new Date(), uploadedAt: new Date(), forDate: today(), verifiedStatus: 'verified' },
    lastLocation: { type: 'Point', coordinates: [75.86, 22.72] },
    ...extra,
});

const apply = (partner, extra = {}) => applyForRideMode(partner._id, {
    vehicleTypeId: String(bikeId), vehicleNumber: 'mp09ab1234', services: ['ride', 'parcel'], ...extra,
});

const approveDriverFor = async (partner) => {
    const p = await FoodDeliveryPartner.findById(partner._id).lean();
    await Driver.updateOne({ _id: p.rideMode.taxiDriverId }, { $set: { approve: true, status: 'approved' } });
    return p.rideMode.taxiDriverId;
};

const enrolledPartner = async ({ pocket = 0, ...extra } = {}) => {
    const partner = await makePartner(extra);
    await apply(partner);
    const driverId = await approveDriverFor(partner);
    if (pocket) await deliveredOrder(partner._id, pocket);
    return { partner, driverId };
};

const deliveredOrder = (partnerId, riderEarning) => FoodOrder.collection.insertOne({
    dispatch: { deliveryPartnerId: partnerId }, orderStatus: 'delivered', riderEarning, payment: { method: 'razorpay' },
    pricing: { total: 300 }, createdAt: new Date(),
});

const makeRide = (driverId, { paymentMethod, fare = 500, status = 'completed' }) => Ride.create({
    userId: new mongoose.Types.ObjectId(),
    driverId,
    status,
    paymentMethod,
    fare,
    baseRideFare: fare,
    pickupLocation: { type: 'Point', coordinates: [75.8, 22.7] },
    dropLocation: { type: 'Point', coordinates: [75.9, 22.8] },
    pricingSnapshot: { admin_commission_type_from_driver: 1, admin_commission_from_driver: 10 },
    ...(paymentMethod === 'online' ? { driverPaymentCollection: { status: 'paid', paidAt: new Date() } } : {}),
});

const rejectsWith = async (promise, code) => {
    await assert.rejects(promise, (err) => {
        assert.equal(err.code, code, `expected ${code}, got ${err.code}: ${err.message}`);
        return true;
    });
};

// The settle hook merges the wallet in the background; tests call the merge themselves, so wait for the hook to finish
const settle = async (rideId) => {
    await settleCompletedRideWallet({ rideId });
    await new Promise((r) => setTimeout(r, 300));
};

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
    await mongoose.connect(replSet.getUri());
    for (const model of Object.values(mongoose.models)) {
        await model.createCollection().catch(() => {});
        await model.init().catch(() => {});
    }
});

after(async () => {
    await mongoose.disconnect();
    await replSet?.stop();
});

beforeEach(async () => {
    await Promise.all([
        FoodDeliveryPartner.deleteMany({}), HybridWalletTransfer.deleteMany({}), FoodDeliveryWithdrawal.deleteMany({}),
        FoodOrder.collection.deleteMany({}), Driver.deleteMany({}), WalletTransaction.deleteMany({}), Ride.deleteMany({}),
        Vehicle.collection.deleteMany({}),
    ]);
    bikeId = (await Vehicle.collection.insertOne({ name: 'Bike', transport_type: 'both', icon_types: 'bike', active: true, status: 1 })).insertedId;
    carTaxiOnlyId = (await Vehicle.collection.insertOne({ name: 'Sedan', transport_type: 'taxi', icon_types: 'car', active: true, status: 1 })).insertedId;
    scootyTaxiOnlyId = (await Vehicle.collection.insertOne({ name: 'Scooty', transport_type: 'taxi', icon_types: 'bike', active: true, status: 1 })).insertedId;
    await Vehicle.collection.insertOne({ name: 'Old Van', transport_type: 'delivery', icon_types: 'truck', active: false, status: 1 });
});

describe('Ride & Parcel enrolment', () => {
    it('lists only active vehicles with the services they offer', async () => {
        const vehicles = await listRideModeVehicleTypes();
        // Only bikes can be added from the delivery app; the car is listed but not allowed
        assert.deepEqual(vehicles.map((v) => [v.name, v.services, v.allowed]), [
            ['Bike', ['taxi', 'delivery'], true],
            ['Scooty', ['taxi'], true],
            ['Sedan', ['taxi'], false],
        ]);
    });

    it('needs an approved delivery account', async () => {
        const partner = await makePartner({ status: 'pending' });
        await rejectsWith(apply(partner), 'PARTNER_NOT_APPROVED');
    });

    it('rejects a service the vehicle does not offer', async () => {
        const partner = await makePartner();
        await assert.rejects(apply(partner, { vehicleTypeId: String(scootyTaxiOnlyId) }), /can not be used for parcels/);
    });

    it('only allows bikes: a car is sent to the Raydo Sarthi app', async () => {
        const partner = await makePartner();
        await rejectsWith(apply(partner, { vehicleTypeId: String(carTaxiOnlyId), services: ['ride'] }), 'BIKE_ONLY');
        assert.equal(await Driver.countDocuments({}), 0);

        const carDriverPartner = await makePartner();
        await Driver.create({ name: 'Cab', phone: carDriverPartner.phone, password: 'secret123', vehicleType: 'car', approve: true, status: 'approved' });
        await rejectsWith(apply(carDriverPartner), 'BIKE_ONLY');
    });

    it('creates a pending ride profile with the partner documents, and blocks switching until approved', async () => {
        const partner = await makePartner();
        const status = await apply(partner);
        assert.equal(status.status, 'pending');
        assert.deepEqual(status.vehicle.services, ['taxi', 'delivery']);

        const driver = await Driver.findOne({ linkedDeliveryPartnerId: partner._id }).lean();
        assert.equal(driver.phone, partner.phone);
        assert.equal(driver.vehicleNumber, 'MP09AB1234');
        assert.equal(driver.registerFor, 'both');
        assert.equal(driver.approve, false);
        assert.equal(driver.documents.driving_license.secureUrl, 'https://cdn.test/dl.jpg');
        assert.equal(driver.fcmTokenMobile, 'device-token');

        await rejectsWith(apply(partner), 'ALREADY_APPLIED');

        // An application made from the delivery app needs no admin review: switching approves it (the wallet rule still applies)
        await rejectsWith(switchRideMode(partner._id, { mode: 'taxi' }), 'RIDE_WALLET_DUES');
        assert.equal((await getRideModeStatus(partner._id)).status, 'approved');
    });

    it('lets a rejected partner apply again', async () => {
        const partner = await makePartner();
        await apply(partner);
        await Driver.updateOne({ linkedDeliveryPartnerId: partner._id }, { $set: { status: 'rejected', approve: false } });
        assert.equal((await getRideModeStatus(partner._id)).status, 'rejected');
        await rejectsWith(switchRideMode(partner._id, { mode: 'taxi' }), 'RIDE_MODE_REJECTED');

        const again = await apply(partner, { vehicleNumber: 'MP09ZZ9999' });
        assert.equal(again.status, 'pending');
        assert.equal(again.vehicle.vehicleNumber, 'MP09ZZ9999');
        assert.equal(await Driver.countDocuments({ phone: partner.phone }), 1);
    });

    it('links an existing driver-app account with the same phone, but never an owner fleet driver', async () => {
        const partner = await makePartner();
        await Driver.create({ name: 'Ravi', phone: partner.phone, password: 'secret123', vehicleType: 'bike', approve: true, status: 'approved' });
        const status = await apply(partner);
        assert.equal(status.status, 'approved'); // already approved in the driver app
        assert.equal(await Driver.countDocuments({ phone: partner.phone }), 1);

        const fleetPartner = await makePartner();
        await Driver.create({ name: 'Fleet', phone: fleetPartner.phone, password: 'secret123', vehicleType: 'car', owner_id: new mongoose.Types.ObjectId() });
        await rejectsWith(apply(fleetPartner), 'FLEET_DRIVER');
    });
});

describe('Switching without an application', () => {
    it('registers an existing delivery partner for bike rides + parcels on the first switch', async () => {
        const partner = await makePartner({ vehicleNumber: 'mp09xy4321' });
        await deliveredOrder(partner._id, 500);
        assert.equal((await getRideModeStatus(partner._id)).status, 'none');

        const result = await switchRideMode(partner._id, { mode: 'taxi' });
        assert.equal(result.mode, 'taxi');

        const driver = await Driver.findOne({ linkedDeliveryPartnerId: partner._id }).lean();
        assert.equal(driver.approve, true);
        assert.equal(driver.status, 'approved');
        assert.equal(driver.vehicleType, 'bike');
        assert.equal(driver.vehicleNumber, 'MP09XY4321');
        assert.deepEqual(driver.serviceCategories, ['taxi', 'delivery']);
        assert.equal(driver.documents.driving_license.secureUrl, 'https://cdn.test/dl.jpg');
        const status = await getRideModeStatus(partner._id);
        assert.equal(status.status, 'approved');
        assert.equal(status.activeMode, 'taxi');

        // switching again does not create a second ride profile
        await switchRideMode(partner._id, { mode: 'food' });
        await switchRideMode(partner._id, { mode: 'taxi' });
        assert.equal(await Driver.countDocuments({ phone: partner.phone }), 1);
    });

    it('needs a vehicle number and a driving licence on the delivery profile', async () => {
        const noVehicle = await makePartner();
        await rejectsWith(switchRideMode(noVehicle._id, { mode: 'taxi' }), 'VEHICLE_NUMBER_REQUIRED');
        const noLicence = await makePartner({ vehicleNumber: 'MP09QQ1111', drivingLicensePhoto: undefined, drivingLicenseNumber: undefined });
        await rejectsWith(switchRideMode(noLicence._id, { mode: 'taxi' }), 'DRIVING_LICENSE_REQUIRED');
        assert.equal(await Driver.countDocuments({}), 0);
    });

    it('does not approve a partner whose delivery account is not approved, or switch back to food before enrolling', async () => {
        const pending = await makePartner({ status: 'pending', vehicleNumber: 'MP09PP2222' });
        await rejectsWith(switchRideMode(pending._id, { mode: 'taxi' }), 'PARTNER_NOT_APPROVED');
        const fresh = await makePartner({ vehicleNumber: 'MP09FF3333' });
        await rejectsWith(switchRideMode(fresh._id, { mode: 'food' }), 'RIDE_MODE_NOT_ENROLLED');
    });
});

describe('Mode switch', () => {
    it('switches to taxi: food goes offline, selfie carries over, a ride token is issued', async () => {
        const { partner, driverId } = await enrolledPartner({ pocket: 500 });
        const result = await switchRideMode(partner._id, { mode: 'taxi', latitude: 22.7, longitude: 75.8 });

        assert.equal(result.mode, 'taxi');
        assert.equal(result.wasOnline, true);
        const payload = verifyAccessToken(result.taxiToken);
        assert.equal(payload.sub, String(driverId));
        assert.equal(payload.role, 'driver');

        const p = await FoodDeliveryPartner.findById(partner._id).lean();
        assert.equal(p.availabilityStatus, 'offline');
        assert.equal(p.rideMode.activeMode, 'taxi');
        const d = await Driver.findById(driverId).lean();
        assert.equal(d.onlineSelfie.imageUrl, 'https://cdn.test/selfie.jpg');
        assert.deepEqual(d.location.coordinates, [75.8, 22.7]);

        // Food can not go online in ride mode; the taxi app may go online now
        await rejectsWith(updateDeliveryAvailability(String(partner._id), { status: 'online' }), 'RIDE_MODE_ACTIVE');
        await assertLinkedDriverMayGoOnline(d);
        assert.equal((await issueRideSession(partner._id)).activeMode, 'taxi');
    });

    it('does not switch to taxi during a food order', async () => {
        const { partner } = await enrolledPartner();
        await FoodOrder.collection.insertOne({ dispatch: { deliveryPartnerId: partner._id }, orderStatus: 'picked_up', orderId: 'FO123' });
        await rejectsWith(switchRideMode(partner._id, { mode: 'taxi' }), 'ACTIVE_ORDER_IN_PROGRESS');
    });

    it('does not switch back to food during a ride, and takes the driver offline after it', async () => {
        const { partner, driverId } = await enrolledPartner({ pocket: 500 });
        await switchRideMode(partner._id, { mode: 'taxi' });
        await Driver.updateOne({ _id: driverId }, { $set: { isOnline: true, isOnRide: true } });
        const ride = await makeRide(driverId, { paymentMethod: 'cash', status: 'ongoing' });

        await rejectsWith(switchRideMode(partner._id, { mode: 'food' }), 'ACTIVE_RIDE_IN_PROGRESS');

        await Ride.updateOne({ _id: ride._id }, { $set: { status: 'completed' } });
        await Driver.updateOne({ _id: driverId }, { $set: { isOnRide: false } });
        const back = await switchRideMode(partner._id, { mode: 'food' });
        assert.equal(back.mode, 'food');
        assert.equal(back.wasOnline, true);
        assert.equal((await Driver.findById(driverId).lean()).isOnline, false);

        // In food mode the ride app can not go online
        await rejectsWith(assertLinkedDriverMayGoOnline(await Driver.findById(driverId).lean()), 'SWITCH_TO_RIDE_MODE');
    });

    it('reports a scheduled ride that is still ahead when switching back to food', async () => {
        const { partner, driverId } = await enrolledPartner({ pocket: 500 });
        await switchRideMode(partner._id, { mode: 'taxi' });
        const ride = await makeRide(driverId, { paymentMethod: 'cash', status: 'accepted' });
        await Ride.updateOne({ _id: ride._id }, { $set: { scheduledAt: new Date(Date.now() + 3 * 60 * 60 * 1000) } });

        const back = await switchRideMode(partner._id, { mode: 'food' });
        assert.equal(back.upcomingScheduledRides.length, 1);
    });
});

describe('Merged wallet', () => {
    it('moves online ride earnings into the Pocket', async () => {
        const { partner, driverId } = await enrolledPartner();
        await deliveredOrder(partner._id, 100);
        const ride = await makeRide(driverId, { paymentMethod: 'online', fare: 500 });
        await settle(ride._id);
        await reconcileRideWallet(partner._id);

        assert.equal((await Driver.findById(driverId).lean()).wallet.balance, 0);
        const pocket = await getDeliveryPartnerWalletEnhanced(String(partner._id));
        assert.equal(pocket.rideEarningsMerged, 450); // 500 fare - 10% commission
        assert.equal(pocket.pocketBalance, 550); // 100 food + 450 ride
        assert.ok(pocket.transactions.some((t) => t.type === 'ride_earning' && t.amount === 450));

        // Running the merge again moves nothing twice
        await reconcileRideWallet(partner._id);
        assert.equal((await getDeliveryPartnerWalletEnhanced(String(partner._id))).pocketBalance, 550);
    });

    it('recovers cash-ride commission dues from the Pocket', async () => {
        const { partner, driverId } = await enrolledPartner();
        await deliveredOrder(partner._id, 200);
        const ride = await makeRide(driverId, { paymentMethod: 'cash', fare: 500 });
        await settle(ride._id);
        await reconcileRideWallet(partner._id);

        assert.equal((await Driver.findById(driverId).lean()).wallet.balance, 0);
        const pocket = await getDeliveryPartnerWalletEnhanced(String(partner._id));
        assert.equal(pocket.rideDuesRecovered, 50);
        assert.equal(pocket.pocketBalance, 150);
    });

    it('recovers only what the Pocket has, and blocks rides while dues are over the limit', async () => {
        const { partner, driverId } = await enrolledPartner();
        await deliveredOrder(partner._id, 100);
        await applyDriverWalletAdjustment({ driverId, amount: -700, type: 'commission_deduction', description: 'test dues' });

        const status = await getRideModeStatus(partner._id);
        assert.equal(status.wallet.rideWalletBalance, -600);
        assert.equal(status.wallet.duesPending, 600);
        assert.equal(status.wallet.topUpNeeded, 700); // 600 dues + the default minimum balance of 100
        assert.equal(status.wallet.isBlocked, true);
        assert.equal((await getDeliveryPartnerWalletEnhanced(String(partner._id))).pocketBalance, 0);

        await rejectsWith(switchRideMode(partner._id, { mode: 'taxi' }), 'RIDE_WALLET_DUES');
    });

    it('funds the ride wallet minimum from the Pocket in ride mode and gives it back in food mode', async () => {
        const { partner, driverId } = await enrolledPartner({ pocket: 300 });
        await rejectsWith(
            (async () => { const p2 = await enrolledPartner(); await switchRideMode(p2.partner._id, { mode: 'taxi' }); })(),
            'RIDE_WALLET_DUES'
        );

        await switchRideMode(partner._id, { mode: 'taxi' });
        assert.equal((await Driver.findById(driverId).lean()).wallet.balance, 100);
        assert.equal((await getDeliveryPartnerWalletEnhanced(String(partner._id))).pocketBalance, 200);

        // A cash ride in ride mode: the 50 commission is taken back from the Pocket to keep the minimum
        const ride = await makeRide(driverId, { paymentMethod: 'cash', fare: 500 });
        await settle(ride._id);
        await reconcileRideWallet(partner._id);
        assert.equal((await Driver.findById(driverId).lean()).wallet.balance, 100);
        assert.equal((await getDeliveryPartnerWalletEnhanced(String(partner._id))).pocketBalance, 150);

        await switchRideMode(partner._id, { mode: 'food' });
        assert.equal((await Driver.findById(driverId).lean()).wallet.balance, 0);
        assert.equal((await getDeliveryPartnerWalletEnhanced(String(partner._id))).pocketBalance, 250);
    });

    it('withdraws ride + food money from one Pocket, never more than it holds', async () => {
        const { partner, driverId } = await enrolledPartner();
        await deliveredOrder(partner._id, 300);
        await applyDriverWalletAdjustment({ driverId, amount: 400, type: 'ride_earning', description: 'test earning' });

        // The ride earning is merged as part of the withdrawal request
        const withdrawal = await requestDeliveryWithdrawal(String(partner._id), { amount: 700 });
        assert.equal(withdrawal.amount, 700);
        await assert.rejects(requestDeliveryWithdrawal(String(partner._id), { amount: 150 }), /Insufficient balance/);
    });

    it('two withdrawals at once can not spend the same money', async () => {
        const { partner } = await enrolledPartner();
        await deliveredOrder(partner._id, 500);
        const results = await Promise.allSettled([
            requestDeliveryWithdrawal(String(partner._id), { amount: 400 }),
            requestDeliveryWithdrawal(String(partner._id), { amount: 400 }),
        ]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
    });

    it('blocks withdrawals from the ride app for a linked driver', async () => {
        const { driverId } = await enrolledPartner();
        const res = { status() { return this; }, json() { return this; } };
        await assert.rejects(
            createDriverWithdrawalRequest({ auth: { sub: String(driverId), role: 'driver' }, body: { amount: 100 } }, res),
            /delivery Pocket/
        );
    });

    it('leaves normal taxi drivers alone', async () => {
        const driver = await Driver.create({ name: 'Solo', phone: '6000000001', password: 'secret123', vehicleType: 'car', approve: true, status: 'approved' });
        const ride = await makeRide(driver._id, { paymentMethod: 'online', fare: 500 });
        await settle(ride._id);
        assert.equal((await Driver.findById(driver._id).lean()).wallet.balance, 450);
        assert.equal(await HybridWalletTransfer.countDocuments({}), 0);
    });
});

describe('Account deletion', () => {
    it('closes the ride profile created from the delivery app', async () => {
        const { partner, driverId } = await enrolledPartner();
        await deleteDeliveryPartnerAccount(partner._id);
        const d = await Driver.findById(driverId).lean();
        assert.ok(d.deletedAt);
        assert.equal(d.linkedDeliveryPartnerId, null);
    });
});

describe('HTTP: delivery app -> ride app', () => {
    const app = express();
    app.use(express.json());
    app.use('/food/delivery', deliveryRouter);
    app.use('/drivers', driverRouter);
    app.use(errorHandler);

    it('applies, switches with a ride token that works on the taxi API, and blocks ride go-online in food mode', async () => {
        const partner = await makePartner();
        await deliveredOrder(partner._id, 500);
        const auth = { Authorization: `Bearer ${signDeliveryToken({ userId: String(partner._id), role: 'DELIVERY_PARTNER' })}` };

        let res = await request(app).get('/food/delivery/ride-mode').set(auth);
        assert.equal(res.status, 200);
        assert.equal(res.body.data.status, 'none');

        res = await request(app).get('/food/delivery/ride-mode/vehicle-types').set(auth);
        assert.equal(res.body.data.vehicles.length, 3);

        res = await request(app).post('/food/delivery/ride-mode/apply').set(auth)
            .send({ vehicleTypeId: String(bikeId), vehicleNumber: 'MP09CD5678', services: 'taxi,delivery', rcPhotoUrl: 'https://cdn.test/rc.jpg' });
        assert.equal(res.status, 201, JSON.stringify(res.body));
        assert.equal(res.body.data.status, 'pending');

        res = await request(app).post('/food/delivery/ride-mode/switch').set(auth).send({ mode: 'taxi' });
        assert.equal(res.status, 200, JSON.stringify(res.body));
        const rideAuth = { Authorization: `Bearer ${res.body.data.taxiToken}` };

        res = await request(app).get('/drivers/me').set(rideAuth);
        assert.equal(res.status, 200, JSON.stringify(res.body));

        res = await request(app).patch('/food/delivery/availability').set(auth).send({ status: 'online' });
        assert.equal(res.body.code, 'RIDE_MODE_ACTIVE');

        res = await request(app).post('/food/delivery/ride-mode/switch').set(auth).send({ mode: 'food' });
        assert.equal(res.status, 200);

        res = await request(app).patch('/drivers/online').set(rideAuth).send({ location: [75.86, 22.72] });
        assert.equal(res.status, 400);
        assert.equal(res.body.code, 'SWITCH_TO_RIDE_MODE');

        res = await request(app).post('/drivers/wallet/withdrawals').set(rideAuth).send({ amount: 100 });
        assert.equal(res.status, 400);
        assert.match(res.body.message, /delivery Pocket/);
    });
});

describe('Repeated switching', () => {
    it('keeps switching food <-> rides many times, with the ride app used in between', async () => {
        const partner = await makePartner({ vehicleNumber: 'MP09RR7777' });
        await deliveredOrder(partner._id, 500);
        for (let round = 1; round <= 4; round += 1) {
            const toTaxi = await switchRideMode(partner._id, { mode: 'taxi', latitude: 22.7, longitude: 75.8 });
            assert.equal(toTaxi.mode, 'taxi', `round ${round} to taxi`);
            const driverId = toTaxi.driverId;
            // the ride app goes online and later offline, like a real shift
            await Driver.updateOne({ _id: driverId }, { $set: { isOnline: true, socketId: 'sock' } });
            assert.equal((await getRideModeStatus(partner._id)).activeMode, 'taxi');

            const toFood = await switchRideMode(partner._id, { mode: 'food' });
            assert.equal(toFood.mode, 'food', `round ${round} to food`);
            assert.equal((await getRideModeStatus(partner._id)).activeMode, 'food');
            await FoodDeliveryPartner.updateOne({ _id: partner._id }, { $set: { availabilityStatus: 'online' } });
        }
        const pocket = await getDeliveryPartnerWalletEnhanced(String(partner._id));
        assert.equal(pocket.pocketBalance, 500); // nothing lost or doubled after 4 rounds
    });
});
