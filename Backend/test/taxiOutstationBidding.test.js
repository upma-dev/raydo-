/**
 * Taxi: outstation fare from the MAP distance, waiting charge, and the bidding flow.
 * Google Directions is replaced by a fake so the test needs no network.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
let replSet; let mongoose; const S = {};
const oid = () => new mongoose.Types.ObjectId();
const realFetch = globalThis.fetch;
let googleKm = 250;          // what the fake Google says
let googleMode = 'ok';       // 'ok' | 'fail'
let directionsCalls = 0;

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    const { config } = await import('../src/config/env.js');
    config.googleMapsApiKey = 'test-key';
    globalThis.fetch = async (url, ...rest) => {
        if (String(url).includes('maps.googleapis.com/maps/api/directions')) {
            directionsCalls += 1;
            if (googleMode === 'fail') return { json: async () => ({ status: 'REQUEST_DENIED', error_message: 'bad key' }) };
            return { json: async () => ({ status: 'OK', routes: [{ legs: [{ distance: { value: googleKm * 1000 }, duration: { value: 3 * 3600 } }] }] }) };
        }
        return realFetch(url, ...rest);
    };
    S.fare = await import('../src/modules/taxi/services/intercityFareService.js');
    S.route = await import('../src/modules/taxi/services/routeMetricsService.js');
    S.ride = await import('../src/modules/taxi/services/rideService.js');
    S.SetPrice = (await import('../src/modules/taxi/admin/models/SetPrice.js')).SetPrice;
    S.Ride = (await import('../src/modules/taxi/user/models/Ride.js')).Ride;
    S.RideBid = (await import('../src/modules/taxi/user/models/RideBid.js')).RideBid;
    S.User = (await import('../src/modules/taxi/user/models/User.js')).User;
    S.Driver = (await import('../src/modules/taxi/driver/models/Driver.js')).Driver;
    S.Vehicle = (await import('../src/modules/taxi/admin/models/Vehicle.js')).Vehicle;
    S.constants = await import('../src/modules/taxi/constants/index.js');
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));
});
after(async () => { globalThis.fetch = realFetch; await mongoose?.disconnect(); await replSet?.stop(); });

const R = () => S.constants.RIDE_STATUS;
const L = () => S.constants.RIDE_LIVE_STATUS;
const INDORE = [75.8577, 22.7196];
const UJJAIN = [75.7885, 23.1765];
const BHOPAL = [77.4126, 23.2599];

async function user() {
    const _id = oid();
    await S.User.collection.insertOne({ _id, name: 'Asha', phone: `9${Math.floor(Math.random() * 1e9)}`, email: `${_id}@t.local`, createdAt: new Date(), updatedAt: new Date() });
    return _id;
}

describe('outstation fare maths (pure)', () => {
    const veh = { base_price: 1000, free_distance: 100, distance_price: 12, free_time: 120, time_price: 1, service_tax: 5 };

    it('within the free distance and time: only the base price (+ tax)', () => {
        const r = S.fare.computeIntercityFare({ vehiclePrice: veh, distanceKm: 80, durationMinutes: 100 });
        assert.equal(r.extraKm, 0);
        assert.equal(r.extraMinutes, 0);
        assert.equal(r.subtotal, 1000);
        assert.equal(r.tax, 50);
        assert.equal(r.fare, 1050);
    });

    it('250 km, 3 h: 1000 + 150km x 12 + 60min x 1 = 2860, +5% = 3003', () => {
        const r = S.fare.computeIntercityFare({ vehiclePrice: veh, distanceKm: 250, durationMinutes: 180 });
        assert.equal(r.extraKm, 150);
        assert.equal(r.distanceCharge, 1800);
        assert.equal(r.extraMinutes, 60);
        assert.equal(r.timeCharge, 60);
        assert.equal(r.subtotal, 2860);
        assert.equal(r.tax, 143);
        assert.equal(r.fare, 3003);
    });

    it('round trip = there and back: distance and time double, base price counted once', () => {
        const r = S.fare.computeIntercityFare({ vehiclePrice: veh, distanceKm: 250, durationMinutes: 180, tripType: 'Round Trip' });
        assert.equal(r.distanceKm, 500);
        assert.equal(r.durationMinutes, 360);
        // 1000 + 400x12 + 240x1 = 6040, +5% = 6342
        assert.equal(r.subtotal, 6040);
        assert.equal(r.fare, 6342);
    });

    it('zero prices never produce NaN / negative', () => {
        const r = S.fare.computeIntercityFare({ vehiclePrice: {}, distanceKm: 10, durationMinutes: 10 });
        assert.equal(r.fare, 0);
    });
});

describe('server measures the distance on the map', () => {
    it('uses Google when it answers; falls back to a straight-line estimate (flagged) when it does not', async () => {
        googleMode = 'ok'; googleKm = 52;
        const a = await S.route.getDrivingRoute({ origin: INDORE, destination: UJJAIN });
        assert.equal(a.source, 'google');
        assert.equal(a.distanceMeters, 52000);
        assert.equal(a.durationMinutes, 180);

        googleMode = 'fail';
        const b = await S.route.getDrivingRoute({ origin: INDORE, destination: BHOPAL });
        assert.equal(b.source, 'estimate');
        // Indore -> Bhopal is ~ 170 km in a straight line, so the estimate is in a sane range
        assert.ok(b.distanceMeters > 150000 && b.distanceMeters < 300000, `estimate ${b.distanceMeters}`);
        googleMode = 'ok';
    });

    it('the same trip is asked from Google only once (cached)', async () => {
        googleMode = 'ok'; googleKm = 77;
        directionsCalls = 0;
        await S.route.getDrivingRoute({ origin: [74.1, 21.1], destination: [74.9, 21.9] });
        await S.route.getDrivingRoute({ origin: [74.1, 21.1], destination: [74.9, 21.9] });
        assert.equal(directionsCalls, 1);
    });

    it('invalid coordinates are refused', async () => {
        assert.equal(await S.route.getDrivingRoute({ origin: ['x', 1], destination: UJJAIN }), null);
    });
});

describe('outstation booking: the SERVER decides fare and distance', () => {
    let vehicleTypeId; let packageId;
    before(async () => {
        vehicleTypeId = oid();
        const pkg = await S.SetPrice.create({
            pricing_scope: 'package', transport_type: 'intercity', package_destination: 'Ujjain', package_availability: 'available', active: 1, status: 'active',
            waiting_charge: 2, free_waiting_before: 3,
            package_vehicle_prices: [{
                vehicle_type: vehicleTypeId, base_price: 1000, free_distance: 100, distance_price: 12, free_time: 120, time_price: 1, service_tax: 5,
                admin_commission_type_from_driver: 1, admin_commission_from_driver: 10,
            }],
        });
        packageId = String(pkg._id);
    });
    const book = (userId, extra = {}) => { S.route.clearRouteCache(); return S.ride.createRideRecord({
        userId, pickupCoords: INDORE, dropCoords: UJJAIN, pickupAddress: 'Indore', dropAddress: 'Ujjain',
        fare: 1, estimatedDistanceMeters: 0, estimatedDurationMinutes: 0, paymentMethod: 'cash',
        vehicleTypeId: String(vehicleTypeId), serviceType: 'intercity', transport_type: 'intercity',
        intercity: { packageId, tripType: 'One Way', fromCity: 'Indore', toCity: 'Ujjain', distance: 0 }, ...extra,
    }); };

    it('app says fare 1 and distance 0: the ride is priced from the map (250 km -> 3003) and stores the distance', async () => {
        googleMode = 'ok'; googleKm = 250;
        const u = await user();
        const ride = await book(u);
        assert.equal(ride.fare, 3003);
        assert.equal(ride.estimatedDistanceMeters, 250000);
        assert.equal(ride.intercity.distance, 250);
        assert.equal(ride.intercity.distanceSource, 'google');
        assert.equal(ride.intercity.fareBreakdown.subtotal, 2860);
        assert.equal(ride.pricingSnapshot.waiting_charge, 2);
        assert.equal(ride.pricingSnapshot.free_waiting_before, 3);
        assert.equal(ride.pricingSnapshot.admin_commission_from_driver, 10);
    });

    it('round trip is priced on twice the distance', async () => {
        googleMode = 'ok'; googleKm = 250;
        const ride = await book(await user(), { intercity: { packageId, tripType: 'Round Trip', fromCity: 'Indore', toCity: 'Ujjain' } });
        assert.equal(ride.fare, 6342);
    });

    it('a different map distance gives a different fare (not a fixed price)', async () => {
        googleMode = 'ok'; googleKm = 90;               // inside the 100 km free distance, but the fake Google trip takes 3 h (60 min over the free 120)
        const ride = await book(await user());
        assert.equal(ride.intercity.fareBreakdown.distanceCharge, 0);
        assert.equal(ride.intercity.fareBreakdown.timeCharge, 60);
        assert.equal(ride.fare, 1113);                  // (1000 + 60) + 5%
    });

    it('unknown package or a vehicle that is not in the package is refused', async () => {
        const u = await user();
        await assert.rejects(book(u, { intercity: { packageId: String(oid()), tripType: 'One Way' } }), /not available/);
        await assert.rejects(book(u, { vehicleTypeId: String(oid()) }), /not available for the selected/);
    });

    it('Google down: still priced (estimate), and the ride says it was an estimate', async () => {
        googleMode = 'fail';
        const ride = await book(await user(), { dropCoords: BHOPAL });
        assert.ok(ride.fare > 1000);
        assert.equal(ride.intercity.distanceSource, 'estimate');
        googleMode = 'ok';
    });
});

describe('waiting charge reaches both rider and driver', () => {
    it('10 min wait, 3 free, Rs 2/min: 7 min billed = Rs 14 added; the split is saved and sent in the ride payload', async () => {
        const u = await user();
        const ride = await S.ride.createRideRecord({
            userId: u, pickupCoords: INDORE, dropCoords: UJJAIN, pickupAddress: 'A', dropAddress: 'B', fare: 200, paymentMethod: 'cash',
        });
        const driverId = oid();
        const arrived = new Date(Date.now() - 12 * 60000);
        const started = new Date(arrived.getTime() + 10 * 60000);
        await S.Ride.updateOne({ _id: ride._id }, { $set: {
            driverId, status: R().ONGOING, liveStatus: L().STARTED, arrivedAt: arrived, startedAt: started,
            'pricingSnapshot.waiting_charge': 2, 'pricingSnapshot.free_waiting_before': 3,
        } });
        await S.Driver.collection.insertOne({ _id: driverId, phone: `8${Math.floor(Math.random() * 1e9)}`, isOnline: true, isOnRide: true });
        const done = await S.ride.updateRideLifecycle({ rideId: ride._id, driverId, nextStatus: L().COMPLETED });
        const saved = await S.Ride.findById(ride._id).lean();
        assert.equal(saved.fareBeforeWaiting, 200);
        assert.equal(saved.waitingCharge.minutes, 7);
        assert.equal(saved.waitingCharge.totalWaitedMinutes, 10);
        assert.equal(saved.waitingCharge.freeMinutes, 3);
        assert.equal(saved.waitingCharge.amount, 14);
        assert.equal(saved.fare, 214);

        const payload = S.ride.serializeRideRealtime(done);
        assert.equal(payload.fare, 214);
        assert.equal(payload.fareBeforeWaiting, 200);
        assert.equal(payload.waitingCharge.amount, 14);
        assert.equal(payload.waitingCharge.minutes, 7);
    });

    it('inside the free minutes nothing is added', async () => {
        const u = await user();
        const ride = await S.ride.createRideRecord({ userId: u, pickupCoords: INDORE, dropCoords: UJJAIN, pickupAddress: 'A', dropAddress: 'B', fare: 200, paymentMethod: 'cash' });
        const driverId = oid();
        const arrived = new Date(Date.now() - 5 * 60000);
        await S.Ride.updateOne({ _id: ride._id }, { $set: { driverId, status: R().ONGOING, liveStatus: L().STARTED, arrivedAt: arrived, startedAt: new Date(arrived.getTime() + 2 * 60000), 'pricingSnapshot.waiting_charge': 2, 'pricingSnapshot.free_waiting_before': 3 } });
        await S.Driver.collection.insertOne({ _id: driverId, phone: `8${Math.floor(Math.random() * 1e9)}`, isOnline: true, isOnRide: true });
        await S.ride.updateRideLifecycle({ rideId: ride._id, driverId, nextStatus: L().COMPLETED });
        const saved = await S.Ride.findById(ride._id).lean();
        assert.equal(saved.fare, 200);
        assert.equal(saved.waitingCharge.amount, 0);
    });
});


describe('bidding flow (outstation, drivers bid, rider picks)', () => {
    let vehicleTypeId; let packageId;
    before(async () => {
        vehicleTypeId = oid();
        const pkg = await S.SetPrice.create({
            pricing_scope: 'package', transport_type: 'intercity', package_destination: 'Ujjain', package_availability: 'available', active: 1, status: 'active',
            package_vehicle_prices: [{ vehicle_type: vehicleTypeId, base_price: 1000, free_distance: 100, distance_price: 12, free_time: 120, time_price: 1, service_tax: 5 }],
        });
        packageId = String(pkg._id);
    });
    const newDriver = async (extra = {}) => {
        const _id = oid();
        await S.Driver.collection.insertOne({
            _id, name: 'Driver', phone: `7${Math.floor(Math.random() * 1e9)}`, vehicleTypeId, vehicleType: 'car', vehicleIconType: 'car', isOnline: true, isOnRide: false,
            wallet: { balance: 5000, isBlocked: false }, ...extra,
        });
        return _id;
    };
    const biddingRide = async (userId) => {
        S.route.clearRouteCache(); googleMode = 'ok'; googleKm = 250;
        return S.ride.createRideRecord({
            userId, pickupCoords: INDORE, dropCoords: UJJAIN, pickupAddress: 'Indore', dropAddress: 'Ujjain', fare: 100, paymentMethod: 'cash',
            vehicleTypeId: String(vehicleTypeId), serviceType: 'intercity', transport_type: 'intercity', bookingMode: 'bidding', userMaxBidFare: 9999,
            intercity: { packageId, tripType: 'One Way', fromCity: 'Indore', toCity: 'Ujjain' },
        });
    };

    it('an outstation booking starts open for bids, priced from the map (3003), with a floor and a ceiling around it', async () => {
        const ride = await biddingRide(await user());
        assert.equal(ride.bookingMode, 'bidding');
        assert.equal(ride.pricingNegotiationMode, 'driver_bid');
        assert.equal(ride.biddingStatus, 'open');
        assert.equal(ride.baseFare, 3003);
        assert.ok(ride.bidFloorFare <= 3003 && ride.bidFloorFare > 0);
        assert.ok(ride.userMaxBidFare >= 3003, 'the rider ceiling is never below the real fare');
        assert.ok(ride.userMaxBidFare <= ride.bidCeilingMaxFare);
    });

    it('bids must be inside the floor/ceiling and in whole steps; one bid per driver (updating it, not adding)', async () => {
        const ride = await biddingRide(await user());
        const d1 = await newDriver();
        const step = ride.bidStepAmount;
        await assert.rejects(S.ride.submitRideBid({ rideId: ride._id, driverId: d1, bidFare: ride.bidFloorFare - step }), /below the minimum/);
        await assert.rejects(S.ride.submitRideBid({ rideId: ride._id, driverId: d1, bidFare: ride.userMaxBidFare + step }), /exceeds rider ceiling/);
        await assert.rejects(S.ride.submitRideBid({ rideId: ride._id, driverId: d1, bidFare: ride.baseFare + 1 }), /steps/);

        const first = await S.ride.submitRideBid({ rideId: ride._id, driverId: d1, bidFare: ride.baseFare + step });
        assert.equal(first.bid.bidFare, ride.baseFare + step);
        await S.ride.submitRideBid({ rideId: ride._id, driverId: d1, bidFare: ride.baseFare });
        assert.equal(await S.RideBid.countDocuments({ rideId: ride._id }), 1);
        assert.equal((await S.RideBid.findOne({ rideId: ride._id }).lean()).bidFare, ride.baseFare);
    });

    it('an offline or busy driver cannot bid', async () => {
        const ride = await biddingRide(await user());
        const offline = await newDriver({ isOnline: false });
        const busy = await newDriver({ isOnRide: true });
        await assert.rejects(S.ride.submitRideBid({ rideId: ride._id, driverId: offline, bidFare: ride.baseFare }), /unavailable/);
        await assert.rejects(S.ride.submitRideBid({ rideId: ride._id, driverId: busy, bidFare: ride.baseFare }), /unavailable/);
    });

    it('rider accepts one bid: ride goes to that driver at THAT fare, the other bids are rejected, driver is marked busy', async () => {
        const u = await user();
        const ride = await biddingRide(u);
        const [d1, d2] = [await newDriver(), await newDriver()];
        const step = ride.bidStepAmount;
        const b1 = await S.ride.submitRideBid({ rideId: ride._id, driverId: d1, bidFare: ride.baseFare + step });
        const b2 = await S.ride.submitRideBid({ rideId: ride._id, driverId: d2, bidFare: ride.baseFare });
        const won = await S.ride.acceptRideBidAssignment({ rideId: ride._id, bidId: b2.bid.id, userId: u });
        assert.equal(String(won.driverId), String(d2));
        assert.equal(won.fare, ride.baseFare);
        assert.equal(won.status, R().ACCEPTED);
        assert.equal(won.biddingStatus, 'accepted');
        assert.equal((await S.RideBid.findById(b1.bid.id).lean()).status, 'rejected');
        assert.equal((await S.RideBid.findById(b2.bid.id).lean()).status, 'accepted');
        assert.equal((await S.Driver.findById(d2).lean()).isOnRide, true);
        assert.equal((await S.Driver.findById(d1).lean()).isOnRide, false);
        await assert.rejects(S.ride.acceptRideBidAssignment({ rideId: ride._id, bidId: b1.bid.id, userId: u }), /no longer available/);
    });

    it('two taps on two different bids at the same time: exactly one driver wins', async () => {
        const u = await user();
        const ride = await biddingRide(u);
        const [d1, d2] = [await newDriver(), await newDriver()];
        const b1 = await S.ride.submitRideBid({ rideId: ride._id, driverId: d1, bidFare: ride.baseFare });
        const b2 = await S.ride.submitRideBid({ rideId: ride._id, driverId: d2, bidFare: ride.baseFare });
        const res = await Promise.allSettled([
            S.ride.acceptRideBidAssignment({ rideId: ride._id, bidId: b1.bid.id, userId: u }),
            S.ride.acceptRideBidAssignment({ rideId: ride._id, bidId: b2.bid.id, userId: u }),
        ]);
        assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1, JSON.stringify(res.map((r) => r.reason?.message)));
        const busy = await S.Driver.countDocuments({ _id: { $in: [d1, d2] }, isOnRide: true });
        assert.equal(busy, 1);
    });

    it('one driver cannot be given two rides at once', async () => {
        const [u1, u2] = [await user(), await user()];
        const [r1, r2] = [await biddingRide(u1), await biddingRide(u2)];
        const d = await newDriver();
        const b1 = await S.ride.submitRideBid({ rideId: r1._id, driverId: d, bidFare: r1.baseFare });
        const b2 = await S.ride.submitRideBid({ rideId: r2._id, driverId: d, bidFare: r2.baseFare });
        const res = await Promise.allSettled([
            S.ride.acceptRideBidAssignment({ rideId: r1._id, bidId: b1.bid.id, userId: u1 }),
            S.ride.acceptRideBidAssignment({ rideId: r2._id, bidId: b2.bid.id, userId: u2 }),
        ]);
        assert.equal(res.filter((r) => r.status === 'fulfilled').length, 1, JSON.stringify(res.map((r) => r.reason?.message)));
    });

    it('rider raises the ceiling by one step; the driver can then bid higher', async () => {
        const u = await user();
        const ride = await biddingRide(u);
        const before = ride.userMaxBidFare;
        const updated = await S.ride.increaseRideBidCeiling({ rideId: ride._id, userId: u, incrementSteps: 1 });
        assert.equal(updated.userMaxBidFare, before + ride.bidStepAmount);
        const d = await newDriver();
        const bid = await S.ride.submitRideBid({ rideId: ride._id, driverId: d, bidFare: before + ride.bidStepAmount });
        assert.equal(bid.bid.bidFare, before + ride.bidStepAmount);
    });

    it('after the rider accepted, nobody can bid any more', async () => {
        const u = await user();
        const ride = await biddingRide(u);
        const [d1, d2] = [await newDriver(), await newDriver()];
        const b1 = await S.ride.submitRideBid({ rideId: ride._id, driverId: d1, bidFare: ride.baseFare });
        await S.ride.acceptRideBidAssignment({ rideId: ride._id, bidId: b1.bid.id, userId: u });
        await assert.rejects(S.ride.submitRideBid({ rideId: ride._id, driverId: d2, bidFare: ride.baseFare }), /no longer open|not open/);
    });
});
