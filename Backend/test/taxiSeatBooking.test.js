/**
 * Taxi: bus + pooling SEAT BOOKING on an in-memory MongoDB replica set.
 * Covers: abandoned holds give the seats back, a late payment is honoured (or refunded), two payments at once confirm
 * once, a seat is never double-sold, pooling can't be paid for 1 seat and booked for 4, orphan reservations are undone.
 * Razorpay itself is not called: its credentials are not set in the test database, so refunds are only attempted.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
let replSet; let mongoose; const S = {};
const oid = () => new mongoose.Types.ObjectId();
const IN_2H = () => new Date(Date.now() + 2 * 60 * 60 * 1000);
const AGO = (min) => new Date(Date.now() - min * 60 * 1000);

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    S.user = await import('../src/modules/taxi/user/controllers/userController.js');
    S.pool = await import('../src/modules/taxi/user/controllers/poolingController.js');
    S.BusBooking = (await import('../src/modules/taxi/user/models/BusBooking.js')).BusBooking;
    S.Inv = (await import('../src/modules/taxi/user/models/TripSeatInventory.js')).TripSeatInventory;
    S.Hold = (await import('../src/modules/taxi/user/models/BusSeatHold.js')).BusSeatHold;
    S.PRoute = (await import('../src/modules/taxi/admin/models/PoolingRoute.js')).PoolingRoute;
    S.PVehicle = (await import('../src/modules/taxi/admin/models/PoolingVehicle.js')).PoolingVehicle;
    S.PBooking = (await import('../src/modules/taxi/admin/models/PoolingBooking.js')).PoolingBooking;
    S.PRes = (await import('../src/modules/taxi/admin/models/PoolingSeatReservation.js')).PoolingSeatReservation;
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));
});
after(async () => { await mongoose?.disconnect(); await replSet?.stop(); });

// ---------------------------------------------------------------- bus
async function bus({ seats = ['A1', 'A2', 'A3'], departure = IN_2H() } = {}) {
    const tripId = oid(); const busServiceId = oid();
    await mongoose.connection.collection('taxitripinstances').insertOne({
        _id: tripId, busServiceId, scheduleId: 's1', travelDate: '2030-01-01', departureDateTime: departure,
        arrivalDateTime: new Date(departure.getTime() + 3600000), status: 'scheduled', generationStatus: 'ready',
    });
    await S.Inv.insertMany(seats.map((seatId) => ({ tripId, busServiceId, scheduleId: 's1', travelDate: '2030-01-01', seatId, seatLabel: seatId, price: 100, status: 'available' })));
    return { tripId, busServiceId };
}
async function pendingBooking({ tripId, busServiceId }, seatIds, { expiresAt = new Date(Date.now() + 600000), userId = oid(), hold = true } = {}) {
    const booking = await S.BusBooking.create({
        userId, tripId, busServiceId, bookingCode: `B${Math.random().toString(36).slice(2, 8).toUpperCase()}`, scheduleId: 's1', travelDate: '2030-01-01',
        seatIds, seatLabels: seatIds, passenger: { name: 'Asha', age: 30, gender: 'female', phone: '9000000001', email: 'a@t.local' },
        amount: 100 * seatIds.length, status: 'pending', expiresAt, payment: { provider: 'razorpay', orderId: `order_${Math.random()}`, status: 'created' },
    });
    if (hold) {
        const h = await S.Hold.create({ tripId, busServiceId, bookingId: booking._id, userId, scheduleId: 's1', travelDate: '2030-01-01', seatId: seatIds[0], seatIds, holdToken: booking.bookingCode, status: 'held', expiresAt });
        await S.Inv.updateMany({ tripId, seatId: { $in: seatIds } }, { $set: { status: 'held', bookingId: booking._id, holdId: h._id, holdExpiresAt: expiresAt } });
    }
    return booking;
}
const seatState = async (tripId) => Object.fromEntries((await S.Inv.find({ tripId }).lean()).map((i) => [i.seatId, i.status]));

describe('bus: an abandoned booking gives its seats back', () => {
    it('hold expired -> booking "expired" and the seats are on sale again (before: stuck "held" for ever)', async () => {
        const t = await bus();
        await pendingBooking(t, ['A1', 'A2'], { expiresAt: AGO(1) });
        assert.deepEqual(await seatState(t.tripId), { A1: 'held', A2: 'held', A3: 'available' });
        await S.user.cleanupExpiredBusSeatHolds();
        assert.deepEqual(await seatState(t.tripId), { A1: 'available', A2: 'available', A3: 'available' });
    });

    it('a hold that is still running is left alone', async () => {
        const t = await bus();
        await pendingBooking(t, ['A1']);
        await S.user.cleanupExpiredBusSeatHolds();
        assert.equal((await seatState(t.tripId)).A1, 'held');
    });
});

describe('bus: payment confirmation', () => {
    it('normal payment: booking confirmed, seats "booked"', async () => {
        const t = await bus();
        const b = await pendingBooking(t, ['A1', 'A2']);
        const done = await S.user.processBusPaymentConfirmation({ bookingId: b._id, paymentId: 'pay_1', signature: 'sig' });
        assert.equal(done.status, 'confirmed');
        assert.equal(done.payment.status, 'paid');
        assert.deepEqual(await seatState(t.tripId), { A1: 'booked', A2: 'booked', A3: 'available' });
    });

    it('LATE payment, seats still free: the customer gets the seats (before: charged, booking "expired", no refund)', async () => {
        const t = await bus();
        const b = await pendingBooking(t, ['A1', 'A2'], { expiresAt: AGO(2) });
        await S.user.cleanupExpiredBusSeatHolds();                            // every request runs this first
        assert.equal((await S.BusBooking.findById(b._id).lean()).status, 'expired');
        const done = await S.user.processBusPaymentConfirmation({ bookingId: b._id, paymentId: 'pay_late' });
        assert.equal(done.status, 'confirmed');
        assert.deepEqual(await seatState(t.tripId), { A1: 'booked', A2: 'booked', A3: 'available' });
    });

    it('LATE payment but somebody else bought one seat meanwhile: nothing is stolen, booking fails (refund is attempted)', async () => {
        const t = await bus();
        const b = await pendingBooking(t, ['A1', 'A2'], { expiresAt: AGO(2) });
        await S.user.cleanupExpiredBusSeatHolds();
        const other = await pendingBooking(t, ['A2']);                          // another customer took A2
        await S.user.processBusPaymentConfirmation({ bookingId: other._id, paymentId: 'pay_other' });
        await assert.rejects(S.user.processBusPaymentConfirmation({ bookingId: b._id, paymentId: 'pay_late2' }), /no longer available/);
        assert.equal((await S.BusBooking.findById(b._id).lean()).status, 'failed');
        const seats = await seatState(t.tripId);
        assert.equal(seats.A2, 'booked');                                         // still the other customer's
        assert.equal(String((await S.Inv.findOne({ tripId: t.tripId, seatId: 'A2' }).lean()).bookingId), String(other._id));
        assert.equal(seats.A1, 'available');                                      // our A1 was not left half-booked
    });

    it('app "verify" and the webhook at the same moment: confirmed ONCE, never failed / refunded', async () => {
        const t = await bus();
        const b = await pendingBooking(t, ['A1', 'A2', 'A3']);
        const results = await Promise.allSettled([
            S.user.processBusPaymentConfirmation({ bookingId: b._id, paymentId: 'pay_x', signature: 'sig' }),
            S.user.processBusPaymentConfirmation({ bookingId: b._id, paymentId: 'pay_x', eventId: 'evt1' }),
            S.user.processBusPaymentConfirmation({ bookingId: b._id, paymentId: 'pay_x', eventId: 'evt2' }),
        ]);
        assert.ok(results.every((r) => r.status === 'fulfilled'), JSON.stringify(results.map((r) => r.reason?.message)));
        const final = await S.BusBooking.findById(b._id).lean();
        assert.equal(final.status, 'confirmed');
        assert.deepEqual(await seatState(t.tripId), { A1: 'booked', A2: 'booked', A3: 'booked' });
    });

    it('the bus already left: a late payment is not turned into a booking', async () => {
        const t = await bus({ departure: AGO(30) });
        const b = await pendingBooking(t, ['A1'], { expiresAt: AGO(40) });
        await S.user.cleanupExpiredBusSeatHolds();
        await assert.rejects(S.user.processBusPaymentConfirmation({ bookingId: b._id, paymentId: 'pay_gone' }), /no longer available/);
        assert.equal((await S.BusBooking.findById(b._id).lean()).status, 'failed');
    });

    it('two customers, same seat, same moment: exactly one holds it', async () => {
        const t = await bus({ seats: ['A1'] });
        const claim = (user) => S.Inv.updateMany(
            { tripId: t.tripId, seatId: { $in: ['A1'] }, status: 'available' },
            { $set: { status: 'held', bookedBy: { userId: user }, holdExpiresAt: IN_2H() } },
        );
        const [a, b] = await Promise.all([claim(oid()), claim(oid())]);
        assert.equal(a.modifiedCount + b.modifiedCount, 1);
    });
});

// ---------------------------------------------------------------- pooling
const rajkot = (extra = {}) => ({
    routeName: 'Rajkot - Jamnagar', originLabel: 'Rajkot', destinationLabel: 'Jamnagar', status: 'active', active: true, farePerSeat: 100,
    maxSeatsPerBooking: 3, maxAdvanceBookingHours: 0, boardingBufferMinutes: 15,
    stops: [{ id: 'p1', name: 'Pickup', address: 'x' }, { id: 'd1', name: 'Drop', address: 'y' }],
    schedules: [{ id: 'sch1', status: 'active', departureTime: '23:59', arrivalTime: '23:59' }],
    ...extra,
});

describe('pooling: seats and money', () => {
    let route; let vehicle; let user;
    const date = '2099-06-15';
    before(async () => {
        user = String(oid());
        vehicle = await S.PVehicle.create({
            name: 'Innova', vehicleNumber: 'GJ03', vehicleModel: 'Innova Crysta', capacity: 4, status: 'active', serviceTaxPercentage: 5,
            blueprint: { layout: [{ type: 'seat', r: 1, c: 1 }, { type: 'seat', r: 1, c: 2 }, { type: 'seat', r: 2, c: 1 }, { type: 'seat', r: 2, c: 2 }] },
        });
        route = await S.PRoute.create(rajkot({ assignedVehicleTypeIds: [vehicle._id] }));
    });
    const base = (seats) => ({
        userId: user, orderId: `order_${Math.random()}`, paymentId: `pay_${Math.random()}`, routeId: String(route._id), vehicleId: String(vehicle._id),
        scheduleId: 'sch1', travelDate: date, selectedSeats: seats, pickupStopId: 'p1', dropStopId: 'd1',
    });
    // 2 seats = 200 + 5% = 210
    const order = (seats, extra = {}) => ({
        amount: 21000 * seats.length / 2, amount_paid: 21000 * seats.length / 2,
        notes: { userId: user, routeId: String(route._id), vehicleId: String(vehicle._id), scheduleId: 'sch1', travelDate: date, seats: seats.join(',') }, ...extra,
    });

    it('fare maths: 2 seats x 100 + 5% tax = 210.00 exactly', async () => {
        const r = await S.pool.finalizePoolingBooking({ ...base(['1-1', '1-2']), rzOrder: order(['1-1', '1-2']) });
        assert.equal(r.booking.fare, 210);
        assert.equal(r.booking.baseFare, 200);
        assert.equal(r.booking.serviceTaxAmount, 10);
        assert.equal(await S.PRes.countDocuments({ booking: r.booking._id }), 2);
    });

    it('verify twice with the same payment: one booking', async () => {
        const args = { ...base(['2-1']), rzOrder: { ...order(['2-1']), amount: 10500, amount_paid: 10500 } };
        const first = await S.pool.finalizePoolingBooking(args);
        const second = await S.pool.finalizePoolingBooking(args);
        assert.equal(second.alreadyConfirmed, true);
        assert.equal(String(second.booking._id), String(first.booking._id));
        assert.equal(await S.PBooking.countDocuments({ 'payment.paymentId': args.paymentId }), 1);
    });

    it('SAME payment fired concurrently (app + webhook): one booking, no error', async () => {
        const args = { ...base(['2-2']), rzOrder: { ...order(['2-2']), amount: 10500, amount_paid: 10500 } };
        const res = await Promise.allSettled([S.pool.finalizePoolingBooking(args), S.pool.finalizePoolingBooking(args), S.pool.finalizePoolingBooking(args)]);
        assert.ok(res.every((r) => r.status === 'fulfilled'), JSON.stringify(res.map((r) => r.reason?.message)));
        assert.equal(await S.PBooking.countDocuments({ 'payment.paymentId': args.paymentId }), 1);
        assert.equal(await S.PRes.countDocuments({ route: route._id, seatId: '2-2', travelDate: date }), 1);
    });

    it('PAY FOR 1 SEAT, ASK FOR 3: refused, nothing booked, no seat blocked (the hole that let anyone ride cheap)', async () => {
        const seats = ['1-1', '1-2', '2-1'];
        const cheap = { ...order(['1-1']), amount: 10500, amount_paid: 10500 };                 // the order really was for 1 seat
        const args = { ...base(seats), travelDate: '2099-07-01', rzOrder: { ...cheap, notes: { ...cheap.notes, travelDate: '2099-07-01', seats: '1-1' } } };
        await assert.rejects(S.pool.finalizePoolingBooking(args), /did not match/);
        assert.equal(await S.PBooking.countDocuments({ 'payment.paymentId': args.paymentId }), 0);
        assert.equal(await S.PRes.countDocuments({ route: route._id, travelDate: '2099-07-01' }), 0);
    });

    it('somebody else\'s Razorpay order cannot be used', async () => {
        const args = { ...base(['1-1']), travelDate: '2099-08-01', rzOrder: { ...order(['1-1']), notes: { ...order(['1-1']).notes, userId: String(oid()), travelDate: '2099-08-01' }, amount: 10500, amount_paid: 10500 } };
        await assert.rejects(S.pool.finalizePoolingBooking(args), /another user/);
    });

    it('seat taken first: later customer is refunded, and seats reserved before the clash do NOT stay blocked', async () => {
        const d = '2099-09-01';
        const mk = (seats, n = seats.length) => ({
            ...base(seats), travelDate: d,
            rzOrder: { amount: 10500 * n, amount_paid: 10500 * n, notes: { userId: user, routeId: String(route._id), vehicleId: String(vehicle._id), scheduleId: 'sch1', travelDate: d, seats: seats.join(',') } },
        });
        await S.pool.finalizePoolingBooking(mk(['2-2']));                              // seat 2-2 taken
        await assert.rejects(S.pool.finalizePoolingBooking(mk(['1-1', '2-2'])), /just booked by another user/);
        const reserved = (await S.PRes.find({ route: route._id, travelDate: d }).lean()).map((r) => r.seatId);
        assert.deepEqual(reserved, ['2-2']);                                          // 1-1 was released again (before: stayed blocked)
        const ok = await S.pool.finalizePoolingBooking(mk(['1-1']));                  // and 1-1 can still be sold
        assert.equal(ok.booking.selectedSeats[0], '1-1');
    });

    it('the webhook builds the booking from the order notes when the app never called verify', async () => {
        const d = '2099-10-01';
        const rzOrder = { amount: 10500, amount_paid: 10500, notes: { userId: user, routeId: String(route._id), vehicleId: String(vehicle._id), scheduleId: 'sch1', travelDate: d, seats: '1-2', pickupStopId: 'p1', dropStopId: 'd1' } };
        assert.equal(await S.pool.confirmPoolingFromWebhook({ orderId: 'order_w', paymentId: 'pay_w', rzOrder }), true);
        const b = await S.PBooking.findOne({ 'payment.paymentId': 'pay_w' }).lean();
        assert.ok(b);
        assert.equal(b.bookingStatus, 'confirmed');
        assert.equal(await S.pool.confirmPoolingFromWebhook({ orderId: 'x', paymentId: 'y', rzOrder: { notes: {} } }), false);   // not a pooling order
    });
});

// ---------------------------------------------------------------- bus cancellation (refund amount 0 so Razorpay is never called)
describe('bus: cancelling seats', () => {
    const res = () => ({ code: 200, body: null, status(c) { this.code = c; return this; }, json(b) { this.body = b; return this; } });
    before(async () => {
        const { AdminBusinessSetting } = await import('../src/modules/taxi/admin/models/AdminBusinessSetting.js');
        await AdminBusinessSetting.collection.insertOne({ scope: 'default', transport_ride: { enable_bus_service: '1' } });
    });

    async function confirmed(seatIds) {
        const t = await bus({ seats: ['A1', 'A2', 'A3', 'A4'] });
        await mongoose.connection.collection('taxibusservices').insertOne({
            _id: t.busServiceId, status: 'active', busName: 'Volvo', schedules: [{ id: 's1', departureTime: '10:00', arrivalTime: '18:00' }],
            cancellationRules: [{ id: 'r1', label: 'Any time', hoursBeforeDeparture: 0, refundType: 'percentage', refundValue: 0 }],
        });
        await mongoose.connection.collection('taxitripinstances').updateOne({ _id: t.tripId }, { $set: { travelDate: '2099-01-01' } });
        const b = await pendingBooking(t, seatIds);
        await S.BusBooking.updateOne({ _id: b._id }, { $set: { travelDate: '2099-01-01', busServiceId: t.busServiceId } });
        await S.user.processBusPaymentConfirmation({ bookingId: b._id, paymentId: `pay_${Math.random()}` });
        return { t, b };
    }
    const cancel = async (b, seatIds) => {
        const r = res();
        await S.user.cancelMyBusBooking({ auth: { sub: String(b.userId) }, params: { id: String(b._id) }, body: { seatIds } }, r);
        return r;
    };

    it('cancel one seat, then another, then the last: each works (before: the 2nd was silently refused), seats go back on sale', async () => {
        const { t, b } = await confirmed(['A1', 'A2', 'A3']);
        await cancel(b, ['A1']);
        let doc = await S.BusBooking.findById(b._id).lean();
        assert.equal(doc.status, 'confirmed');
        assert.equal(doc.cancelledSeats.length, 1);
        assert.equal((await seatState(t.tripId)).A1, 'available');

        await cancel(b, ['A2']);
        doc = await S.BusBooking.findById(b._id).lean();
        assert.equal(doc.cancelledSeats.length, 2);
        assert.equal(doc.status, 'confirmed');

        await cancel(b, ['A3']);
        doc = await S.BusBooking.findById(b._id).lean();
        assert.equal(doc.status, 'cancelled');
        assert.deepEqual(await seatState(t.tripId), { A1: 'available', A2: 'available', A3: 'available', A4: 'available' });
    });

    it('the same seat cancelled twice at the same moment: only one succeeds', async () => {
        const { b } = await confirmed(['A1', 'A2']);
        const results = await Promise.allSettled([cancel(b, ['A1']), cancel(b, ['A1'])]);
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1, JSON.stringify(results.map((r) => r.reason?.message)));
        const doc = await S.BusBooking.findById(b._id).lean();
        assert.equal(doc.cancelledSeats.length, 1);
    });

    it('a seat that was cancelled and sold to somebody else is never released by an old cancel', async () => {
        const { t, b } = await confirmed(['A1', 'A2']);
        await cancel(b, ['A1']);                                          // A1 back on sale
        const other = await pendingBooking(t, ['A1']);                    // somebody buys A1
        await S.user.processBusPaymentConfirmation({ bookingId: other._id, paymentId: 'pay_new' });
        await cancel(b, ['A2']);                                          // our remaining seat is cancelled
        const a1 = await S.Inv.findOne({ tripId: t.tripId, seatId: 'A1' }).lean();
        assert.equal(a1.status, 'booked');
        assert.equal(String(a1.bookingId), String(other._id));
    });
});
