import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { Owner } from '../src/modules/taxi/admin/models/Owner.js';
import { OwnerWalletTransaction } from '../src/modules/taxi/admin/models/OwnerWalletTransaction.js';
import { WithdrawalRequest } from '../src/modules/taxi/admin/models/WithdrawalRequest.js';
import { BusService } from '../src/modules/taxi/admin/models/BusService.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { WalletTransaction } from '../src/modules/taxi/driver/models/WalletTransaction.js';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';
import { BusBooking } from '../src/modules/taxi/user/models/BusBooking.js';
import { settleCompletedRideWallet } from '../src/modules/taxi/driver/services/walletService.js';
import { settleOwnerBusBookings } from '../src/modules/taxi/driver/services/ownerWalletService.js';
import {
  createDriverWithdrawalRequest,
  getMyWallet,
  getOwnerFleetEarnings,
  markOwnerDriverCashReceived,
} from '../src/modules/taxi/driver/controllers/driverController.js';
import {
  approveDriverWithdrawalRequest,
  rejectDriverWithdrawalRequest,
  updateOwnerEarningSettings,
} from '../src/modules/taxi/admin/services/adminService.js';

let replSet;

const fakeRes = () => {
  const res = { statusCode: 200, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (body) => { res.body = body; return res; };
  return res;
};

const ownerReq = (owner, extra = {}) => ({ auth: { sub: String(owner._id), role: 'owner' }, query: {}, params: {}, body: {}, ...extra });

const balanceOf = async (owner) => Number((await Owner.findById(owner._id).lean()).wallet?.balance || 0);

let seq = 0;
const makeOwner = (earning = {}) => Owner.create({
  company_name: 'Test Fleet', name: 'Owner', owner_name: 'Owner', mobile: `90000000${String(++seq).padStart(2, '0')}`,
  email: `owner${seq}@test.com`, approve: true, status: 'approved', active: true,
  earning_settings: { model: 'salary', owner_share_percent: 100, ...earning },
});

const makeDriver = (ownerId) => Driver.create({
  name: 'Fleet Driver', phone: `80000000${String(++seq).padStart(2, '0')}`, password: 'secret123', vehicleType: 'car',
  owner_id: ownerId, approve: true, status: 'approved',
});

const makeRide = (driverId, { paymentMethod, fare = 500 }) => Ride.create({
  userId: new mongoose.Types.ObjectId(),
  driverId,
  status: 'completed',
  paymentMethod,
  fare,
  baseRideFare: fare,
  pickupLocation: { type: 'Point', coordinates: [75.8, 22.7] },
  dropLocation: { type: 'Point', coordinates: [75.9, 22.8] },
  pricingSnapshot: { admin_commission_type_from_driver: 1, admin_commission_from_driver: 10 }, // 10% commission
  ...(paymentMethod === 'online' ? { driverPaymentCollection: { status: 'paid', paidAt: new Date() } } : {}),
});

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  // Collections + indexes must exist before any transaction touches them (as they do in production).
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
  // Raw collection delete: some ledger models block deleteMany through middleware on purpose.
  for (const model of Object.values(mongoose.models)) {
    await model.collection.deleteMany({});
  }
});

describe('fleet owner money flow', () => {
  it('salary model, online ride: owner gets the full net earning, driver wallet unchanged', async () => {
    const owner = await makeOwner();
    const driver = await makeDriver(owner._id);
    const ride = await makeRide(driver._id, { paymentMethod: 'online' });

    await settleCompletedRideWallet({ rideId: ride._id });

    assert.equal(await balanceOf(owner), 450); // 500 - 10% commission
    const d = await Driver.findById(driver._id).lean();
    assert.equal(Number(d.wallet?.balance || 0), 0);
    assert.equal(await WalletTransaction.countDocuments({ driverId: driver._id }), 0);
    const settled = await Ride.findById(ride._id).lean();
    assert.equal(settled.ownerSettlement.ownerShare, 450);
    assert.equal(settled.ownerSettlement.driverShare, 0);
  });

  it('settling the same ride twice never pays twice', async () => {
    const owner = await makeOwner();
    const driver = await makeDriver(owner._id);
    const ride = await makeRide(driver._id, { paymentMethod: 'online' });

    await Promise.all([settleCompletedRideWallet({ rideId: ride._id }), settleCompletedRideWallet({ rideId: ride._id })].map((p) => p.catch(() => null)));
    await settleCompletedRideWallet({ rideId: ride._id });

    assert.equal(await balanceOf(owner), 450);
    assert.equal(await OwnerWalletTransaction.countDocuments({ ownerId: owner._id }), 1);
  });

  it('salary model, cash ride: owner pays commission, driver owes owner the full fare', async () => {
    const owner = await makeOwner();
    const driver = await makeDriver(owner._id);
    const ride = await makeRide(driver._id, { paymentMethod: 'cash' });

    await settleCompletedRideWallet({ rideId: ride._id });

    assert.equal(await balanceOf(owner), -50);
    const d = await Driver.findById(driver._id).lean();
    assert.equal(d.owner_cash_due, 500);
    assert.equal(Number(d.wallet?.balance || 0), 0); // fleet driver no longer pays the commission himself
  });

  it('split model 70%: online and cash rides share the net correctly', async () => {
    const owner = await makeOwner({ model: 'split', owner_share_percent: 70 });
    const driver = await makeDriver(owner._id);

    await settleCompletedRideWallet({ rideId: (await makeRide(driver._id, { paymentMethod: 'online' }))._id });
    assert.equal(await balanceOf(owner), 315);
    assert.equal(Number((await Driver.findById(driver._id).lean()).wallet.balance), 135);

    await settleCompletedRideWallet({ rideId: (await makeRide(driver._id, { paymentMethod: 'cash' }))._id });
    assert.equal(await balanceOf(owner), 265); // 315 - 50 commission
    assert.equal((await Driver.findById(driver._id).lean()).owner_cash_due, 365); // 500 cash - 135 driver keeps
  });

  it('normal (non-fleet) driver keeps the old behaviour', async () => {
    const driver = await makeDriver(null);
    const ride = await makeRide(driver._id, { paymentMethod: 'online' });
    await settleCompletedRideWallet({ rideId: ride._id });
    assert.equal(Number((await Driver.findById(driver._id).lean()).wallet.balance), 450);
    assert.equal(await OwnerWalletTransaction.countDocuments({}), 0);
  });

  it('cash received: reduces due, cannot exceed due, other owners cannot touch it', async () => {
    const owner = await makeOwner();
    const other = await makeOwner();
    const driver = await makeDriver(owner._id);
    await settleCompletedRideWallet({ rideId: (await makeRide(driver._id, { paymentMethod: 'cash' }))._id });

    const res = fakeRes();
    await markOwnerDriverCashReceived(ownerReq(owner, { params: { driverId: String(driver._id) }, body: { amount: 300 } }), res);
    assert.equal(res.body.data.cashDue, 200);

    await assert.rejects(
      markOwnerDriverCashReceived(ownerReq(owner, { params: { driverId: String(driver._id) }, body: { amount: 201 } }), fakeRes()),
      /more than the cash/,
    );
    await assert.rejects(
      markOwnerDriverCashReceived(ownerReq(other, { params: { driverId: String(driver._id) }, body: { amount: 10 } }), fakeRes()),
      /not found/,
    );
    assert.equal((await Driver.findById(driver._id).lean()).owner_cash_due, 200);
  });

  it('bus tickets: owner gets operator earning after travel date, minus refunded part, once', async () => {
    const owner = await makeOwner();
    const bus = await BusService.create({ ownerId: owner._id, operatorName: 'Op', busName: 'Bus 1', status: 'active' });
    const base = {
      userId: new mongoose.Types.ObjectId(), busServiceId: bus._id, scheduleId: 's1',
      bookingSource: 'user', payment: { paymentId: 'pay_1', status: 'paid' },
    };
    await BusBooking.create({ ...base, bookingCode: 'B1', travelDate: '2026-10-01', amount: 1000, status: 'confirmed',
      financialSnapshot: { operatorEarning: 900, calculatedPlatformEarning: 100 } });
    await BusBooking.create({ ...base, bookingCode: 'B2', travelDate: '2026-10-01', amount: 1000, status: 'partially_cancelled',
      financialSnapshot: { operatorEarning: 900, calculatedPlatformEarning: 100, refundedAmount: 500 } });
    await BusBooking.create({ ...base, bookingCode: 'B3', travelDate: '2999-01-01', amount: 1000, status: 'confirmed',
      financialSnapshot: { operatorEarning: 900 } }); // future trip: not yet
    await BusBooking.create({ ...base, bookingCode: 'B4', travelDate: '2026-10-01', amount: 1000, status: 'confirmed',
      bookingSource: 'bus_driver', financialSnapshot: { operatorEarning: 900 } }); // cash with bus driver: never via wallet

    await settleOwnerBusBookings();
    await settleOwnerBusBookings();

    assert.equal(await balanceOf(owner), 1350); // 900 + 900 * 50%
    assert.equal(await OwnerWalletTransaction.countDocuments({ category: 'bus_ticket' }), 2);
  });

  it('withdrawal: holds balance, reject refunds it, approve keeps it, cannot overdraw', async () => {
    const owner = await makeOwner();
    await Owner.updateOne({ _id: owner._id }, { $set: { 'wallet.balance': 1000 } });

    const r1 = fakeRes();
    await createDriverWithdrawalRequest(ownerReq(owner, { body: { amount: 600, upiId: 'a@upi' } }), r1);
    assert.equal(await balanceOf(owner), 400);
    await assert.rejects(
      createDriverWithdrawalRequest(ownerReq(owner, { body: { amount: 500, upiId: 'a@upi' } }), fakeRes()),
      /exceed/,
    );

    await rejectDriverWithdrawalRequest(r1.body.data.request._id);
    assert.equal(await balanceOf(owner), 1000);

    const r2 = fakeRes();
    await createDriverWithdrawalRequest(ownerReq(owner, { body: { amount: 250, accountNumber: '123', ifscCode: 'SBIN0001' } }), r2);
    await approveDriverWithdrawalRequest(r2.body.data.request._id);
    assert.equal(await balanceOf(owner), 750);
    assert.equal((await WithdrawalRequest.findById(r2.body.data.request._id).lean()).status, 'completed');

    const w = fakeRes();
    await getMyWallet(ownerReq(owner), w);
    assert.equal(w.body.data.wallet.balance, 750);
    assert.equal(w.body.data.withdrawalRequests.length, 2);
    assert.ok(w.body.data.transactions.some((t) => t.category === 'withdrawal_refund'));
  });

  it('admin earning settings validate and change the next rides only', async () => {
    const owner = await makeOwner();
    const driver = await makeDriver(owner._id);
    await settleCompletedRideWallet({ rideId: (await makeRide(driver._id, { paymentMethod: 'online' }))._id });

    await assert.rejects(updateOwnerEarningSettings(owner._id, { model: 'split', owner_share_percent: 120 }), /between 0 and 100/);
    await assert.rejects(updateOwnerEarningSettings(owner._id, { model: 'other' }), /salary or split/);
    const saved = await updateOwnerEarningSettings(owner._id, { model: 'split', owner_share_percent: 60 });
    assert.deepEqual([saved.model, saved.ownerSharePercent], ['split', 60]);

    await settleCompletedRideWallet({ rideId: (await makeRide(driver._id, { paymentMethod: 'online' }))._id });
    assert.equal(await balanceOf(owner), 450 + 270); // first ride 100%, second ride 60% of 450

    const res = fakeRes();
    await getOwnerFleetEarnings(ownerReq(owner, { query: { period: 'all' } }), res);
    assert.equal(res.body.data.totals.ownerShareFromRides, 720);
    assert.equal(res.body.data.totals.driverShareFromRides, 180);
    assert.equal(res.body.data.drivers[0].rides, 2);
  });
});
