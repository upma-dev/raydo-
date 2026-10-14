/**
 * Taxi ride flow: booking, active-ride safety, cancellation fee, completion guard
 * on an in-memory MongoDB replica set.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
let replSet; let mongoose; const S = {};
const oid = () => new mongoose.Types.ObjectId();

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    S.ride = await import('../src/modules/taxi/services/rideService.js');
    S.cancel = await import('../src/modules/taxi/services/cancellationService.js');
    S.Ride = (await import('../src/modules/taxi/user/models/Ride.js')).Ride;
    S.User = (await import('../src/modules/taxi/user/models/User.js')).User;
    S.Driver = (await import('../src/modules/taxi/driver/models/Driver.js')).Driver;
    S.constants = await import('../src/modules/taxi/constants/index.js');
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));
});
after(async () => { await mongoose?.disconnect(); await replSet?.stop(); });

async function user() {
    const _id = oid();
    await S.User.collection.insertOne({ _id, name: 'Asha', phone: `9${Math.floor(Math.random() * 1e9)}`, email: `${_id}@t.local`, createdAt: new Date(), updatedAt: new Date() });
    return _id;
}
const create = (userId, extra = {}) => S.ride.createRideRecord({
    userId, pickupCoords: [77.2, 28.6], dropCoords: [77.3, 28.7], pickupAddress: 'A', dropAddress: 'B',
    fare: 120, estimatedDistanceMeters: 5000, estimatedDurationMinutes: 12, paymentMethod: 'cash', ...extra,
});
const R = () => S.constants.RIDE_STATUS;
const L = () => S.constants.RIDE_LIVE_STATUS;

describe('booking safety', () => {
    it('fare 0 or negative is refused', async () => {
        const u = await user();
        await assert.rejects(create(u, { fare: 0 }), /above zero/);
        await assert.rejects(create(u, { fare: -5 }), /fare must/);
    });

    it('a normal booking is created in searching with an OTP and the user points at it', async () => {
        const u = await user();
        const ride = await create(u);
        assert.equal(ride.status, R().SEARCHING);
        assert.ok(ride.otp);
        assert.equal(String((await S.User.findById(u).lean()).currentRideId), String(ride._id));
    });

    it('booking again while a driver is ON your trip is refused, and that trip is left untouched (before: silently cancelled)', async () => {
        const u = await user();
        const first = await create(u);
        const driverId = oid();
        await S.Ride.updateOne({ _id: first._id }, { $set: { driverId, status: R().ONGOING, liveStatus: L().STARTED, startedAt: new Date() } });
        await S.Driver.collection.insertOne({ _id: driverId, isOnRide: true, isOnline: true });
        await assert.rejects(create(u), /already have a ride in progress/);
        const after = await S.Ride.findById(first._id).lean();
        assert.equal(after.status, R().ONGOING);
        assert.equal((await S.Driver.findById(driverId).lean()).isOnRide, true);
    });

    it('booking again while the old one is only searching closes the old one properly (no fee) and the new one starts', async () => {
        const u = await user();
        const first = await create(u);
        const second = await create(u);
        const old = await S.Ride.findById(first._id).lean();
        assert.equal(old.status, R().CANCELLED);
        assert.equal(old.cancellation?.cancelled_by, 'user');
        assert.equal(old.cancellation?.cancellation_charge || 0, 0);
        assert.equal(second.status, R().SEARCHING);
    });

    it('a booking made for LATER is neither blocked by nor cancelled by a new booking', async () => {
        const u = await user();
        const later = await create(u, { scheduledAt: new Date(Date.now() + 5 * 3600000).toISOString() });
        const now = await create(u);
        assert.equal((await S.Ride.findById(later._id).lean()).status, R().SEARCHING);
        assert.equal(now.status, R().SEARCHING);
    });
});

describe('cancellation fee', () => {
    it('searching: free. accepted after the free window: a fee, never above the cap, added to next-ride dues', async () => {
        const u = await user();
        const ride = await create(u);
        const free = await S.cancel.calculateCancellationBill({ ride, cancelledBy: 'user' });
        assert.equal(free.billBreakdown.cancellationFee, 0);
        assert.equal(free.billBreakdown.isWaived, true);

        // createdAt is immutable on a document, so work on a plain copy
        const accepted = { ...(await S.Ride.findById(ride._id).lean()), driverId: oid(), acceptedAt: new Date(Date.now() - 10 * 60000), createdAt: new Date(Date.now() - 20 * 60000) };
        const bill = await S.cancel.calculateCancellationBill({ ride: accepted, cancelledBy: 'user' });
        assert.ok(bill.billBreakdown.cancellationFee > 0, 'a fee is charged after the free window');
        assert.ok(bill.billBreakdown.cancellationFee <= 150, 'never above the cap');
        assert.equal(bill.paymentDetails.status, 'added_to_next_ride_due');
        assert.equal(bill.cancellationStage, 'accepted');
    });

    it('driver cancels: no fee to the rider, a penalty for the driver', async () => {
        const u = await user();
        const ride = await create(u);
        ride.driverId = oid();
        ride.acceptedAt = new Date();
        const bill = await S.cancel.calculateCancellationBill({ ride, cancelledBy: 'driver', reason: 'vehicle problem' });
        assert.equal(bill.billBreakdown.cancellationFee, 0);
        assert.ok(bill.driverBreakdown.driverPenalty >= 0);
    });
});

describe('completion safety', () => {
    it('a ride that never started cannot be completed', async () => {
        const u = await user();
        const ride = await create(u);
        const driverId = oid();
        await S.Ride.updateOne({ _id: ride._id }, { $set: { driverId, status: R().ACCEPTED, liveStatus: L().ACCEPTED, acceptedAt: new Date() } });
        await assert.rejects(S.ride.updateRideLifecycle({ rideId: ride._id, driverId, nextStatus: L().COMPLETED }), /Start the ride/);
        assert.equal((await S.Ride.findById(ride._id).lean()).status, R().ACCEPTED);
    });

    it("a driver cannot move somebody else's ride", async () => {
        const u = await user();
        const ride = await create(u);
        await S.Ride.updateOne({ _id: ride._id }, { $set: { driverId: oid(), status: R().ACCEPTED, liveStatus: L().ACCEPTED } });
        await assert.rejects(S.ride.updateRideLifecycle({ rideId: ride._id, driverId: oid(), nextStatus: L().STARTED }), /not found/i);
    });
});
