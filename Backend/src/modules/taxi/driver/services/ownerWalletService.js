import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { Owner } from '../../admin/models/Owner.js';
import { OwnerWalletTransaction } from '../../admin/models/OwnerWalletTransaction.js';
import { BusService } from '../../admin/models/BusService.js';
import { BusBooking } from '../../user/models/BusBooking.js';

/**
 * FLEET OWNER MONEY FLOW
 *
 * Rides by a fleet driver (driver.owner_id is set), settled in walletService.settleCompletedRideWallet:
 *   net        = ride fare - admin commission            (same numbers a normal driver gets)
 *   ownerShare = net * ownerSharePercent / 100          (salary model = 100%, split model = admin-set %)
 *   driverShare= net - ownerShare
 *   ONLINE: platform holds the fare -> owner wallet +ownerShare, driver wallet +driverShare
 *   CASH:   driver holds the whole fare -> owner wallet -(commission + collected cancellation fee),
 *           driver.owner_cash_due += fare - driverShare  (owner collects it from the driver, then marks it received)
 *
 * Bus tickets on an owner's bus (online, paid): once the travel date has passed, the owner wallet gets
 *   operatorEarning (ticket - admin commission, fixed at booking time) x share not refunded to the passenger.
 */

export const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

// Bus bookings made before this flow existed were never meant to pay owners: do not back-pay them.
export const OWNER_BUS_SETTLEMENT_START = new Date('2026-10-15T00:00:00.000Z');

export const resolveOwnerEarningSettings = (owner = {}) => {
  const model = owner?.earning_settings?.model === 'split' ? 'split' : 'salary';
  const configured = Number(owner?.earning_settings?.owner_share_percent);
  const ownerSharePercent =
    model === 'salary'
      ? 100
      : Math.min(100, Math.max(0, Number.isFinite(configured) ? configured : 100));

  return { model, ownerSharePercent };
};

/** Splits a settled fleet ride. All amounts are rupees rounded to paise. */
export const computeFleetRideSplit = ({
  paymentMethod,
  fare,
  driverEarnings,
  commissionAmount,
  previousCancellationFee = 0,
  ownerSharePercent,
}) => {
  const net = Math.max(round2(driverEarnings), 0);
  const ownerShare = round2((net * ownerSharePercent) / 100);
  const driverShare = round2(net - ownerShare);
  const isCash = paymentMethod === 'cash';
  const platformDue = isCash ? round2(Number(commissionAmount || 0) + Number(previousCancellationFee || 0)) : 0;

  return {
    netEarning: net,
    ownerShare,
    driverShare,
    platformDue,
    // Owner wallet change: online = credit owner share, cash = owner pays the platform's dues.
    ownerWalletChange: isCash ? -platformDue : ownerShare,
    // Driver wallet change: online = credit driver share, cash = nothing (driver keeps his share from the cash).
    driverWalletChange: isCash ? 0 : driverShare,
    cashDueFromDriver: isCash ? Math.max(round2(Number(fare || 0) - driverShare), 0) : 0,
  };
};

export const applyOwnerWalletAdjustment = async ({
  ownerId,
  amount,
  category,
  title,
  rideId = null,
  busBookingId = null,
  driverId = null,
  metadata = {},
  session = null,
}) => {
  const value = round2(amount);
  if (!value) {
    throw new ApiError(400, 'Owner wallet adjustment amount cannot be zero');
  }

  const owner = await Owner.findByIdAndUpdate(
    ownerId,
    { $inc: { 'wallet.balance': value } },
    { new: true, session },
  ).lean();

  if (!owner) {
    throw new ApiError(404, 'Owner not found');
  }

  const balance = round2(owner.wallet?.balance || 0);
  const [transaction] = await OwnerWalletTransaction.create(
    [
      {
        ownerId,
        amount: Math.abs(value),
        kind: value > 0 ? 'credit' : 'debit',
        title,
        balance,
        category,
        rideId,
        busBookingId,
        driverId,
        metadata,
      },
    ],
    { session },
  );

  return { balance, transaction };
};

const todayKeyIST = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** Credits bus owners for online-paid tickets whose travel date has passed. Safe to run any time. */
export const settleOwnerBusBookings = async (limit = 100) => {
  const ownerBusIds = await BusService.find({ ownerId: { $ne: null } }).distinct('_id');
  if (ownerBusIds.length === 0) return 0;

  const bookings = await BusBooking.find({
    busServiceId: { $in: ownerBusIds },
    bookingSource: 'user',
    'payment.paymentId': { $nin: ['', null] },
    status: { $in: ['confirmed', 'boarded', 'completed', 'no_show', 'partially_cancelled', 'cancelled'] },
    travelDate: { $lt: todayKeyIST() },
    createdAt: { $gte: OWNER_BUS_SETTLEMENT_START },
    'financialSnapshot.settlementStatus': 'pending',
  })
    .select('_id')
    .limit(limit)
    .lean();

  let settled = 0;
  for (const { _id } of bookings) {
    const session = await mongoose.startSession();
    try {
      session.startTransaction();

      // Atomic claim: a booking is credited at most once even if two servers run this together.
      const booking = await BusBooking.findOneAndUpdate(
        { _id, 'financialSnapshot.settlementStatus': 'pending' },
        { $set: { 'financialSnapshot.settlementStatus': 'settled', 'financialSnapshot.ownerSettledAt': new Date() } },
        { new: true, session },
      );
      if (!booking) {
        await session.abortTransaction();
        continue;
      }

      const busService = await BusService.findById(booking.busServiceId).select('ownerId busName').session(session).lean();
      const total = Number(booking.amount || 0);
      const refunded = Math.min(Number(booking.financialSnapshot?.refundedAmount || 0), total);
      const keptRatio = total > 0 ? (total - refunded) / total : 0;
      const ownerCredit = round2(Number(booking.financialSnapshot?.operatorEarning || 0) * keptRatio);

      if (busService?.ownerId && ownerCredit > 0) {
        await applyOwnerWalletAdjustment({
          ownerId: busService.ownerId,
          amount: ownerCredit,
          category: 'bus_ticket',
          title: `Bus ticket ${booking.bookingCode} (${booking.travelDate})`,
          busBookingId: booking._id,
          metadata: {
            ticketAmount: total,
            refundedAmount: refunded,
            platformEarning: Number(booking.financialSnapshot?.calculatedPlatformEarning || 0),
            operatorEarning: Number(booking.financialSnapshot?.operatorEarning || 0),
            busName: busService.busName || '',
          },
          session,
        });
        await BusBooking.updateOne(
          { _id: booking._id },
          { $set: { 'financialSnapshot.ownerCreditedAmount': ownerCredit } },
          { session },
        );
      }

      await session.commitTransaction();
      settled += 1;
    } catch (err) {
      await session.abortTransaction().catch(() => {});
      console.error(`[Owner] bus settlement failed for ${_id}:`, err?.message || err);
    } finally {
      session.endSession();
    }
  }

  return settled;
};
