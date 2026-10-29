import mongoose from 'mongoose';
import { Ride } from '../user/models/Ride.js';
import { User } from '../user/models/User.js';
import { UserWallet } from '../user/models/UserWallet.js';
import { Driver } from '../driver/models/Driver.js';
import { WalletTransaction } from '../driver/models/WalletTransaction.js';
import { applyDriverWalletAdjustment } from '../driver/services/walletService.js';
import { resolveSetPriceForRide } from './rideService.js';
import { AdminBusinessSetting } from '../admin/models/AdminBusinessSetting.js';
import { createDefaultBusinessSettings } from '../admin/data/defaultBusinessSettings.js';

// A cap of 0 (or blank) means no cap; before, a 0 cap made every cancellation fee 0
const applyFeeCap = (amount, cap) => {
  const rounded = Math.round(Number(amount) || 0);
  return Number(cap) > 0 ? Math.min(rounded, Number(cap)) : rounded;
};

const roundMoney = (val) => Math.round((Number(val || 0) + Number.EPSILON) * 100) / 100;

export const getCancellationPolicy = async (ride) => {
  let setPrice = null;
  if (ride?.vehicleTypeId) {
    try {
      const serviceType = String(ride?.serviceType || '').trim().toLowerCase();
      const transportType = serviceType === 'parcel' ? 'delivery' : serviceType === 'intercity' ? 'intercity' : 'taxi';
      setPrice = await resolveSetPriceForRide({
        serviceLocationId: ride.service_location_id || null,
        transportType,
        vehicleTypeId: ride.vehicleTypeId,
      });
    } catch (err) {
      console.warn('Failed to resolve SetPrice for cancellation policy:', err?.message);
    }
  }

  if (setPrice?.cancellation_policy && Object.keys(setPrice.cancellation_policy).length > 0) {
    const userCancelFeeType = String(setPrice.user_cancellation_fee_type || '').trim().toLowerCase();
    const userCancelFee = Number(setPrice.user_cancellation_fee ?? 0);

    // The admin's cancellation policy block (Fixed Cancellation Charge / percentage) is the base. The older "Cancellation
    // Fee for User" (% or FIXED) overrides it only when the admin actually entered an amount: a blank/0 there used to
    // wipe the fixed charge to 0, so no cancellation fee was ever charged.
    let fixedCharge = Number(setPrice.cancellation_policy.fixed_cancellation_charge ?? 50);
    let percentageCharge = Number(setPrice.cancellation_policy.percentage_cancellation_charge ?? 0);
    if (userCancelFee > 0 && userCancelFeeType === 'percentage') {
      fixedCharge = 0;
      percentageCharge = userCancelFee;
    } else if (userCancelFee > 0 && userCancelFeeType === 'fixed') {
      fixedCharge = userCancelFee;
      percentageCharge = 0;
    }

    return {
      enable_cancellation_charge: setPrice.cancellation_policy.enable_cancellation_charge ?? true,
      free_cancellation_time_mins: Number(setPrice.cancellation_policy.free_cancellation_time_mins ?? 2),
      fixed_cancellation_charge: fixedCharge,
      percentage_cancellation_charge: percentageCharge,
      max_cancellation_fee: Number(setPrice.cancellation_policy.max_cancellation_fee ?? 150),
      charge_after_driver_accepted: setPrice.cancellation_policy.charge_after_driver_accepted ?? true,
      charge_after_driver_arrived: setPrice.cancellation_policy.charge_after_driver_arrived ?? true,
      allow_driver_cancellation: setPrice.cancellation_policy.allow_driver_cancellation ?? true,
      driver_cancellation_penalty: Number(setPrice.cancellation_policy.driver_cancellation_penalty ?? 30),
      driver_compensation_percentage: Number(setPrice.cancellation_policy.driver_compensation_percentage ?? 0),
      cancellation_grace_period_driver_arrived: Number(setPrice.cancellation_policy.cancellation_grace_period_driver_arrived ?? 5),
    };
  }

  const bizSetting = await AdminBusinessSetting.findOne({ scope: 'default' }).lean();
  const defaultPolicy = createDefaultBusinessSettings().transport_ride.cancellation_policy;
  const policyFromBiz = bizSetting?.transport_ride?.cancellation_policy || defaultPolicy;

  return {
    enable_cancellation_charge: Boolean(policyFromBiz.enable_cancellation_charge ?? true),
    free_cancellation_time_mins: Number(policyFromBiz.free_cancellation_time_mins ?? 2),
    fixed_cancellation_charge: Number(policyFromBiz.fixed_cancellation_charge ?? 50),
    percentage_cancellation_charge: Number(policyFromBiz.percentage_cancellation_charge ?? 0),
    max_cancellation_fee: Number(policyFromBiz.max_cancellation_fee ?? 150),
    charge_after_driver_accepted: Boolean(policyFromBiz.charge_after_driver_accepted ?? true),
    charge_after_driver_arrived: Boolean(policyFromBiz.charge_after_driver_arrived ?? true),
    allow_driver_cancellation: Boolean(policyFromBiz.allow_driver_cancellation ?? true),
    driver_cancellation_penalty: Number(policyFromBiz.driver_cancellation_penalty ?? 30),
    driver_compensation_percentage: Number(policyFromBiz.driver_compensation_percentage ?? 0),
    cancellation_grace_period_driver_arrived: Number(policyFromBiz.cancellation_grace_period_driver_arrived ?? 5),
  };
};

export const calculateCancellationBill = async ({ ride, cancelledBy = 'user', reason = '' }) => {
  const policy = await getCancellationPolicy(ride);
  const now = new Date();

  const bookingTime = ride.createdAt ? new Date(ride.createdAt) : now;
  const timeSinceBookingMins = Math.max(0, Math.round((now.getTime() - bookingTime.getTime()) / 60000));

  const timeSinceAcceptanceMins = ride.acceptedAt
    ? Math.max(0, Math.round((now.getTime() - new Date(ride.acceptedAt).getTime()) / 60000))
    : 0;

  const timeSinceArrivalMins = ride.arrivedAt
    ? Math.max(0, Math.round((now.getTime() - new Date(ride.arrivedAt).getTime()) / 60000))
    : 0;

  let stage = 'searching';
  if (ride.startedAt) {
    stage = 'started';
  } else if (ride.arrivedAt) {
    stage = 'arrived';
  } else if (ride.acceptedAt || ride.driverId) {
    stage = 'accepted';
  }

  let cancellationFee = 0;
  let isWaived = false;
  let feeWaivedReason = '';
  let driverCompensation = 0;
  let driverPenalty = 0;
  let paymentStatus = 'not_applicable';

  const estimatedFare = Number(ride.fare || ride.baseFare || 0);

  if (!policy.enable_cancellation_charge) {
    isWaived = true;
    feeWaivedReason = 'Cancellation charges disabled by policy';
  } else if (cancelledBy === 'user') {
    // The free window runs from the moment the driver accepted (as the admin form says); before that, from booking
    const minutesIntoFreeWindow = ride.acceptedAt ? timeSinceAcceptanceMins : timeSinceBookingMins;
    if (stage === 'searching' || minutesIntoFreeWindow <= policy.free_cancellation_time_mins) {
      isWaived = true;
      feeWaivedReason = stage === 'searching'
        ? 'Cancelled while searching for driver'
        : `Cancelled within free time limit (${policy.free_cancellation_time_mins} mins)`;
    } else if (
      (stage === 'accepted' && policy.charge_after_driver_accepted) ||
      (stage === 'arrived' && policy.charge_after_driver_arrived) ||
      stage === 'started'
    ) {
      const calculatedBase = policy.fixed_cancellation_charge + (estimatedFare * policy.percentage_cancellation_charge / 100);
      cancellationFee = applyFeeCap(calculatedBase, policy.max_cancellation_fee);

      if (policy.driver_compensation_percentage > 0) {
        driverCompensation = Math.round((cancellationFee * policy.driver_compensation_percentage) / 100);
      }
      paymentStatus = 'added_to_next_ride_due';
    } else {
      isWaived = true;
      feeWaivedReason = 'No charge applicable for current stage';
    }
  } else if (cancelledBy === 'driver') {
    const isPassengerNoShow = String(reason).toLowerCase().includes('no-show') || String(reason).toLowerCase().includes('no show');

    if (isPassengerNoShow && timeSinceArrivalMins >= policy.cancellation_grace_period_driver_arrived) {
      const calculatedBase = policy.fixed_cancellation_charge + (estimatedFare * policy.percentage_cancellation_charge / 100);
      cancellationFee = applyFeeCap(calculatedBase, policy.max_cancellation_fee);
      if (policy.driver_compensation_percentage > 0) {
        driverCompensation = Math.round((cancellationFee * policy.driver_compensation_percentage) / 100);
      }
      driverPenalty = 0;
      paymentStatus = 'added_to_next_ride_due';
    } else {
      isWaived = true;
      feeWaivedReason = 'Driver cancelled booking';
      cancellationFee = 0;
      driverCompensation = 0;
      driverPenalty = policy.driver_cancellation_penalty;
    }
  } else {
    isWaived = true;
    feeWaivedReason = `Cancelled by ${cancelledBy}`;
  }

  const taxAmount = 0;
  const totalAmount = Math.round(cancellationFee);

  return {
    rideId: String(ride._id),
    cancelledBy,
    cancelledAt: now.toISOString(),
    cancellationStage: stage,
    cancellationReason: reason || '',
    billBreakdown: {
      baseFare: 0,
      freeCancellationLimitMins: policy.free_cancellation_time_mins,
      elapsedMinutes: stage === 'arrived' ? timeSinceArrivalMins : stage === 'accepted' ? timeSinceAcceptanceMins : timeSinceBookingMins,
      cancellationFee,
      taxAmount,
      totalAmount,
      isWaived,
      feeWaivedReason,
    },
    driverBreakdown: {
      driverPayout: driverCompensation,
      driverPenalty,
      netWalletChange: Math.round(driverCompensation - driverPenalty),
    },
    paymentDetails: {
      status: paymentStatus,
      note: cancellationFee > 0
        ? 'This amount will be added to your next ride fare.'
        : 'No fee charged for this cancellation.',
    },
    currency: '₹',
  };
};

const FLAGGED_DRIVER_REASONS = [
  'driver asked me to cancel',
  'driver asked for extra fare',
  'driver is not coming',
  "don't feel comfortable",
  'driver is behaving improperly',
  'driver is moving away',
  'driver is not responding'
];

export const processRideCancellation = async ({ ride, cancelledBy = 'user', reason = '', comment = '', cancellerId = null, session = null }) => {
  if (!ride) {
    return null;
  }

  const cleanReason = String(reason || '').trim();
  const cleanComment = String(comment || '').trim();
  const lowerReason = cleanReason.toLowerCase();
  const isFlagged = FLAGGED_DRIVER_REASONS.some(r => lowerReason.includes(r));

  const cancellationBill = await calculateCancellationBill({ ride, cancelledBy, reason: cleanReason });
  const { billBreakdown, driverBreakdown, paymentDetails, cancellationStage } = cancellationBill;

  ride.cancellation = {
    cancelled_by: cancelledBy,
    canceller_id: cancellerId || null,
    reason: cleanReason,
    comment: cleanComment,
    flaggedForAdminReview: isFlagged,
    flagReason: isFlagged ? cleanReason : '',
    stage: cancellationStage,
    cancelled_at: new Date(),
    is_fee_applied: !billBreakdown.isWaived,
    fee_waived_reason: billBreakdown.feeWaivedReason || '',
    cancellation_charge: billBreakdown.totalAmount,
    driver_compensation_amount: driverBreakdown.driverPayout,
    driver_penalty_amount: driverBreakdown.driverPenalty,
    payment_status: paymentDetails.status,
  };

  // Reset driver isOnRide status & driver wallet transactions
  if (ride.driverId) {
    await Driver.updateOne(
      { _id: ride.driverId },
      { $set: { isOnRide: false } },
      { session }
    );

    const refBase = `ride-cancel:${String(ride._id)}`;

    // Driver Compensation
    if (driverBreakdown.driverPayout > 0) {
      await applyDriverWalletAdjustment({
        driverId: ride.driverId,
        amount: driverBreakdown.driverPayout,
        type: 'adjustment',
        rideId: ride._id,
        description: `Cancellation compensation for booking ${String(ride._id).slice(-6)}`,
        metadata: {
          source: 'CANCELLATION_COMPENSATION',
          cancelledBy,
          referenceKey: `${refBase}:compensation`,
        },
        session,
      });
    }

    // Driver Penalty
    if (driverBreakdown.driverPenalty > 0) {
      await applyDriverWalletAdjustment({
        driverId: ride.driverId,
        amount: -driverBreakdown.driverPenalty,
        type: 'adjustment',
        rideId: ride._id,
        description: `Cancellation penalty for booking ${String(ride._id).slice(-6)}`,
        metadata: {
          source: 'CANCELLATION_PENALTY',
          cancelledBy,
          referenceKey: `${refBase}:penalty`,
        },
        session,
      });

      // Increment driver cancellation count
      await Driver.updateOne(
        { _id: ride.driverId },
        { $inc: { cancellation_count: 1 } },
        { session }
      );
    }
  }

  return cancellationBill;
};
