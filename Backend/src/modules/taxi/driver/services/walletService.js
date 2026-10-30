import mongoose from 'mongoose';
import { env } from '../../../../config/env.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { SetPrice } from '../../admin/models/SetPrice.js';
import { Driver } from '../models/Driver.js';
import { WalletTransaction } from '../models/WalletTransaction.js';
import { Ride } from '../../user/models/Ride.js';
import { getWalletSettings } from '../../services/appSettingsService.js';
import { Owner } from '../../admin/models/Owner.js';
import { assertDriverMaySubscriptionWork, subscriptionWaivesCommission } from './driverSubscriptionCore.js';
import {
  applyOwnerWalletAdjustment,
  computeFleetRideSplit,
  resolveOwnerEarningSettings,
  round2,
} from './ownerWalletService.js';

const normalizeAmount = (value, fieldName = 'amount') => {
  const amount = Number(value);

  if (!Number.isFinite(amount)) {
    throw new ApiError(400, `${fieldName} must be a valid number`);
  }

  return Math.round(amount * 100) / 100;
};

const normalizePaymentMethod = (value) => (
  String(value || '').trim().toLowerCase() === 'cash' ? 'cash' : 'online'
);

const normalizeCommissionType = (value) => {
  const numericValue = Number(value);
  return numericValue === 1 ? 'percentage' : 'fixed';
};

const computeCommissionAmount = ({ fare, type, value }) => {
  const safeFare = normalizeAmount(fare, 'fare');
  const safeValue = Math.max(normalizeAmount(value || 0, 'commission'), 0);

  if (normalizeCommissionType(type) === 'percentage') {
    return Math.min(Math.round((safeFare * safeValue)) / 100, safeFare);
  }

  return Math.min(safeValue, safeFare);
};

const resolveCommissionConfigForRide = async (ride, session) => {
  if (ride?.pricingSnapshot?.admin_commission_from_driver !== undefined) {
    return {
      source: ride.pricingSnapshot?.setPriceId ? 'ride_snapshot' : 'ride_snapshot_fallback',
      type: Number(ride.pricingSnapshot?.admin_commission_type_from_driver ?? 1),
      value: Number(ride.pricingSnapshot?.admin_commission_from_driver ?? 0),
    };
  }

  if (ride?.vehicleTypeId) {
    const normalizedServiceType = String(ride?.serviceType || '').trim().toLowerCase();
    const savedTransportType = String(ride.transport_type || '').trim().toLowerCase();
    const normalizedTransportType =
      normalizedServiceType === 'parcel'
        ? (savedTransportType === 'delivery' || savedTransportType === 'both' ? savedTransportType : 'delivery')
        : (savedTransportType || 'taxi');
    const filters = [
      {
        vehicle_type: ride.vehicleTypeId,
        active: 1,
        status: 'active',
        ...(ride.service_location_id ? { service_location_id: ride.service_location_id } : {}),
        transport_type: normalizedTransportType,
      },
      {
        vehicle_type: ride.vehicleTypeId,
        active: 1,
        status: 'active',
        ...(ride.service_location_id ? { service_location_id: ride.service_location_id } : {}),
        transport_type: 'both',
      },
      {
        vehicle_type: ride.vehicleTypeId,
        active: 1,
        status: 'active',
        transport_type: normalizedTransportType,
      },
      {
        vehicle_type: ride.vehicleTypeId,
        active: 1,
        status: 'active',
        transport_type: 'both',
      },
    ];

    for (const filter of filters) {
      const setPrice = await SetPrice.findOne(filter).sort({ updatedAt: -1, createdAt: -1 }).session(session).lean();
      if (setPrice) {
        return {
          source: 'set_price_lookup',
          type: Number(setPrice.admin_commission_type_from_driver ?? 1),
          value: Number(setPrice.admin_commission_from_driver ?? 0),
          setPriceId: setPrice._id,
        };
      }
    }
  }

  return {
    source: 'env_fallback',
    type: 1,
    value: Number(env.driverWallet.commissionPercent || 0),
  };
};

const toNonNegativeNumber = (value, fallback = 0) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue >= 0 ? numericValue : fallback;
};

const isEnabledSetting = (value, fallback = true) => {
  if (value === undefined || value === null || value === '') {
    return fallback;
  }

  return ['1', 'true', 'yes', 'on'].includes(String(value).trim().toLowerCase());
};

const resolveWalletRules = async () => {
  const walletSettings = await getWalletSettings();
  const configuredMinimumBalance = Number(walletSettings.driver_wallet_minimum_amount_to_get_an_order);
  const minimumBalanceForOrders = Number.isFinite(configuredMinimumBalance)
    ? Math.round(configuredMinimumBalance * 100) / 100
    : -toNonNegativeNumber(env.driverWallet.defaultCashLimit, 500);

  return {
    minimumBalanceForOrders,
    cashLimit: Math.abs(Math.min(minimumBalanceForOrders, 0)),
    minimumTopUpAmount: toNonNegativeNumber(walletSettings.minimum_amount_added_to_wallet, 0),
    minimumTransferAmount: toNonNegativeNumber(walletSettings.minimum_wallet_amount_for_transfer, 0),
    isWalletEnabled: isEnabledSetting(walletSettings.show_wallet_feature_for_driver, true),
    isTransferEnabled: isEnabledSetting(walletSettings.enable_wallet_transfer_driver, true),
  };
};

const getWalletSnapshot = async (driver) => {
  const rules = await resolveWalletRules();
  // A delivery partner's ride profile never needs a reserve in the ride wallet (nothing is moved from the Pocket just to
  // go online): only cash-ride commission dues below the cash limit block it
  if (driver?.linkedDeliveryPartnerId && rules.minimumBalanceForOrders > 0) {
    rules.minimumBalanceForOrders = 0;
  }
  // The reserve exists to cover ride commission. A driver with a live subscription pays none, so a positive minimum
  // must not block them (buying the plan itself may have lowered the balance).
  if (driver?._id && rules.minimumBalanceForOrders > 0 && (await subscriptionWaivesCommission(driver._id))) {
    rules.minimumBalanceForOrders = 0;
  }
  const balance = Number(driver?.wallet?.balance || 0);

  return {
    balance,
    cashLimit: rules.cashLimit,
    minimumBalanceForOrders: rules.minimumBalanceForOrders,
    availableForOrders: Math.round((balance - rules.minimumBalanceForOrders) * 100) / 100,
    // Decided from the CURRENT admin rules and balance. The saved wallet.isBlocked flag can be stale (it was set under an
    // older minimum balance), so it must never block a driver whose balance meets today's minimum.
    isBlocked: !rules.isWalletEnabled || balance < rules.minimumBalanceForOrders,
    rules,
  };
};

export const serializeDriverWallet = async (driver) => {
  const wallet = await getWalletSnapshot(driver);

  // Dispatch filters on the saved wallet.isBlocked, so bring it in line with the current rules (e.g. admin lowered the minimum)
  if (driver?._id && Boolean(driver?.wallet?.isBlocked) !== wallet.isBlocked) {
    await Driver.findByIdAndUpdate(driver._id, {
      'wallet.cashLimit': wallet.cashLimit,
      'wallet.isBlocked': wallet.isBlocked,
    });
  }

  return {
    balance: wallet.balance,
    cashLimit: wallet.cashLimit,
    minimumBalanceForOrders: wallet.minimumBalanceForOrders,
    availableForOrders: wallet.availableForOrders,
    isWalletEnabled: wallet.rules.isWalletEnabled,
    isTransferEnabled: wallet.rules.isTransferEnabled,
    minimumTopUpAmount: wallet.rules.minimumTopUpAmount,
    minimumTransferAmount: wallet.rules.minimumTransferAmount,
    isBlocked: wallet.isBlocked,
  };
};

export const ensureDriverWalletCanAcceptRide = async (driverOrId, { session } = {}) => {
  const driver =
    typeof driverOrId === 'object' && driverOrId?._id
      ? driverOrId
      : await Driver.findById(driverOrId).session(session);

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  // Subscription-only mode: no live pass, no going online and no accepting rides
  await assertDriverMaySubscriptionWork(driver, { session });

  const wallet = await getWalletSnapshot(driver);
  const isBlocked = wallet.isBlocked;

  if (isBlocked) {
    await Driver.findByIdAndUpdate(driver._id, {
      'wallet.cashLimit': wallet.cashLimit,
      'wallet.isBlocked': true,
    });
    throw new ApiError(403, wallet.rules.isWalletEnabled
      ? 'Driver wallet minimum balance is not met. Please top up to accept rides.'
      : 'Driver wallet is disabled by admin.');
  }

  if (Number(driver?.wallet?.cashLimit) !== wallet.cashLimit || driver?.wallet?.isBlocked) {
    await Driver.findByIdAndUpdate(driver._id, {
      'wallet.cashLimit': wallet.cashLimit,
      'wallet.isBlocked': false,
    });
  }

  return wallet;
};

export const applyDriverWalletAdjustment = async ({
  driverId,
  amount,
  type,
  rideId = null,
  description = '',
  metadata = {},
  session = null,
}) => {
  const normalizedAmount = normalizeAmount(amount);

  if (!normalizedAmount) {
    throw new ApiError(400, 'Wallet adjustment amount cannot be zero');
  }

  const driver = await Driver.findById(driverId).session(session);

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const before = await getWalletSnapshot(driver);
  const balanceAfter = Math.round((before.balance + normalizedAmount) * 100) / 100;
  const isBlockedAfter = !before.rules.isWalletEnabled || balanceAfter < before.minimumBalanceForOrders;

  const updatedDriver = await Driver.findByIdAndUpdate(
    driverId,
    {
      $inc: { 'wallet.balance': normalizedAmount },
      $set: {
        'wallet.cashLimit': before.cashLimit,
        'wallet.isBlocked': isBlockedAfter,
      },
    },
    { returnDocument: 'after', session },
  );

  const [transaction] = await WalletTransaction.create(
    [
      {
        driverId,
        rideId,
        type,
        amount: normalizedAmount,
        balanceBefore: before.balance,
        balanceAfter,
        cashLimit: before.cashLimit,
        isBlockedAfter,
        description,
        metadata,
      },
    ],
    { session },
  );

  return {
    driver: updatedDriver,
    wallet: await serializeDriverWallet(updatedDriver),
    transaction,
  };
};

export const topUpDriverWallet = async ({ driverId, amount, metadata = {} }) => {
  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const walletSettings = await getWalletSettings();
    if (!isEnabledSetting(walletSettings.show_wallet_feature_for_driver, true)) {
      throw new ApiError(403, 'Driver wallet is disabled by admin');
    }

    const minimumTopUpAmount = toNonNegativeNumber(walletSettings.minimum_amount_added_to_wallet, 0);
    const normalizedTopUpAmount = Math.abs(normalizeAmount(amount));

    if (minimumTopUpAmount > 0 && normalizedTopUpAmount < minimumTopUpAmount) {
      throw new ApiError(400, `amount must be at least ${minimumTopUpAmount}`);
    }

    const result = await applyDriverWalletAdjustment({
      driverId,
      amount: normalizedTopUpAmount,
      type: 'top_up',
      description: 'Driver wallet top-up',
      metadata: {
        ...metadata,
        minimumTopUpAmount,
      },
      session,
    });

    await session.commitTransaction();
    return result;
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const PAID_COLLECTION_STATUSES = new Set(['paid', 'captured', 'completed']);

/** Proof that the rider really paid online (confirmed with Razorpay / the in-app wallet), not just the driver's word. */
const isOnlineFarePaid = (ride = {}) =>
  Boolean(ride?.driverPaymentCollection?.paidAt) ||
  PAID_COLLECTION_STATUSES.has(String(ride?.driverPaymentCollection?.status || '').trim().toLowerCase());

export const settleCompletedRideWallet = async ({ rideId }) => {
  // An ONLINE ride must not credit the driver before the rider has actually paid. Otherwise a driver can end a ride as
  // "online", collect cash, and still be credited from the platform. Such a ride stays unsettled and is settled the moment
  // the payment is confirmed (see settlePaidOnlineRides, which also runs on a timer as a safety net).
  const pre = await Ride.findById(rideId).select('paymentMethod driverPaymentCollection walletSettledAt driverId').lean();
  if (!pre || pre.walletSettledAt || !pre.driverId) return null;
  if (normalizePaymentMethod(pre.paymentMethod) === 'online' && !isOnlineFarePaid(pre)) return null;

  const session = await mongoose.startSession();

  try {
    session.startTransaction();

    const ride = await Ride.findOneAndUpdate(
      { _id: rideId, walletSettledAt: null, driverId: { $ne: null } },
      { $set: { walletSettledAt: new Date() } },
      { returnDocument: 'after', session },
    );

    if (!ride) {
      await session.commitTransaction();
      return null;
    }

    const fare = Math.round(ride.fare || 0);
    const previousCancellationFee = Math.max(0, Math.round(ride.previousCancellationFee || 0));
    const baseRideFare = Math.max(0, Math.round(ride.baseRideFare || (fare - previousCancellationFee)));
    const surgeAmount = Math.max(0, Math.round(ride?.pricingSnapshot?.ride_surge_amount || 0));
    const commissionableFare = Math.max(0, Math.round(baseRideFare - surgeAmount));
    const commissionConfig = await resolveCommissionConfigForRide(ride, session);
    // A live driver subscription replaces the per-ride commission (checked at the moment the ride was completed)
    const subscriptionWaived = await subscriptionWaivesCommission(ride.driverId, ride.completedAt || new Date(), { session });
    const commissionAmount = subscriptionWaived
      ? 0
      : Math.round(computeCommissionAmount({
        fare: commissionableFare,
        type: commissionConfig.type,
        value: commissionConfig.value,
      }));
    const paymentMethod = normalizePaymentMethod(ride.paymentMethod);
    const driverEarnings = Math.max(Math.round(baseRideFare - commissionAmount), 0);
    const amount = paymentMethod === 'cash'
      ? -Math.round(commissionAmount + previousCancellationFee)
      : driverEarnings;
    const type = paymentMethod === 'cash' ? 'commission_deduction' : 'ride_earning';

    ride.paymentMethod = paymentMethod;
    ride.commissionAmount = commissionAmount;
    ride.driverEarnings = driverEarnings;
    ride.pricingSnapshot = {
      ...(ride.pricingSnapshot?.toObject ? ride.pricingSnapshot.toObject() : ride.pricingSnapshot || {}),
      setPriceId: ride.pricingSnapshot?.setPriceId || commissionConfig.setPriceId || null,
      admin_commission_type_from_driver: Number(commissionConfig.type ?? ride.pricingSnapshot?.admin_commission_type_from_driver ?? 1),
      admin_commission_from_driver: Number(commissionConfig.value ?? ride.pricingSnapshot?.admin_commission_from_driver ?? 0),
      resolvedAt: ride.pricingSnapshot?.resolvedAt || new Date(),
    };
    await ride.save({ session });

    // Mark previous cancellation dues as paid in next ride
    if (Array.isArray(ride.carriedCancellationRideIds) && ride.carriedCancellationRideIds.length > 0) {
      await Ride.updateMany(
        { _id: { $in: ride.carriedCancellationRideIds } },
        { $set: { 'cancellation.payment_status': 'paid_in_next_ride' } },
        { session }
      );
    }

    // Fleet driver: the ride earning belongs to the owner (fully or by the admin-set share).
    const fleetDriver = await Driver.findById(ride.driverId).select('owner_id').session(session).lean();
    const fleetOwner = fleetDriver?.owner_id
      ? await Owner.findById(fleetDriver.owner_id).select('earning_settings').session(session).lean()
      : null;

    if (fleetOwner) {
      const { model, ownerSharePercent } = resolveOwnerEarningSettings(fleetOwner);
      const split = computeFleetRideSplit({
        paymentMethod,
        fare,
        driverEarnings,
        commissionAmount,
        previousCancellationFee,
        ownerSharePercent,
      });

      await Ride.updateOne(
        { _id: ride._id },
        {
          $set: {
            ownerSettlement: {
              ownerId: fleetOwner._id,
              model,
              ownerSharePercent,
              netEarning: split.netEarning,
              ownerShare: split.ownerShare,
              driverShare: split.driverShare,
              platformDue: split.platformDue,
              cashDueFromDriver: split.cashDueFromDriver,
              paymentMethod,
            },
          },
        },
        { session },
      );

      const fleetMeta = {
        fare,
        baseRideFare,
        previousCancellationFee,
        commissionAmount,
        netEarning: split.netEarning,
        ownerShare: split.ownerShare,
        driverShare: split.driverShare,
        ownerSharePercent,
        model,
        paymentMethod,
      };

      if (split.ownerWalletChange) {
        await applyOwnerWalletAdjustment({
          ownerId: fleetOwner._id,
          amount: split.ownerWalletChange,
          category: paymentMethod === 'cash' ? 'ride_commission' : 'ride_share',
          title: paymentMethod === 'cash'
            ? 'Admin commission for cash ride'
            : `Ride earning (${ownerSharePercent}% owner share)`,
          rideId: ride._id,
          driverId: ride.driverId,
          metadata: fleetMeta,
          session,
        });
      }

      if (split.cashDueFromDriver > 0) {
        await Driver.updateOne(
          { _id: ride.driverId },
          { $inc: { owner_cash_due: split.cashDueFromDriver } },
          { session },
        );
      }

      let fleetResult = null;
      if (split.driverWalletChange > 0) {
        fleetResult = await applyDriverWalletAdjustment({
          driverId: ride.driverId,
          rideId: ride._id,
          amount: split.driverWalletChange,
          type: 'ride_earning',
          description: `Driver share of fleet ride (${round2(100 - ownerSharePercent)}%)`,
          metadata: { ...fleetMeta, source: 'fleet_driver_share' },
          session,
        });
      }

      await session.commitTransaction();

      import('../../../food/admin/services/franchiseTaxi.service.js')
        .then((m) => m.creditFranchiseForRide(ride._id))
        .catch((e) => console.error('[Franchise] taxi credit hook failed:', e?.message || e));

      if (fleetResult) {
        return { ...fleetResult, ride };
      }
      const driverDoc = await Driver.findById(ride.driverId);
      return { driver: driverDoc, wallet: driverDoc ? await serializeDriverWallet(driverDoc) : null, transaction: null, ride };
    }

    if (!amount) {
      await session.commitTransaction();
      return null;
    }

    const result = await applyDriverWalletAdjustment({
      driverId: ride.driverId,
      rideId: ride._id,
      amount,
      type,
      description: paymentMethod === 'cash'
        ? (previousCancellationFee > 0
            ? 'Commission & collected cancellation fee deducted'
            : 'Commission deducted for cash ride')
        : 'Driver earning credited for online ride',
      metadata: {
        fare,
        baseRideFare,
        previousCancellationFee,
        surgeAmount,
        commissionableFare,
        commissionAmount,
        driverEarnings,
        paymentMethod,
        subscriptionWaived,
        commissionSource: commissionConfig.source,
        commissionType: normalizeCommissionType(commissionConfig.type),
        commissionValue: Number(commissionConfig.value || 0),
      },
      session,
    });

    await session.commitTransaction();

    // Franchise that owns the driver's taxi zone earns its share (best effort, never blocks the ride)
    import('../../../food/admin/services/franchiseTaxi.service.js')
      .then((m) => m.creditFranchiseForRide(ride._id))
      .catch((e) => console.error('[Franchise] taxi credit hook failed:', e?.message || e));

    // Delivery partner in Ride & Parcel mode: move the earning to (or recover the dues from) the delivery Pocket
    import('../../../food/delivery/services/hybridRide.service.js')
      .then((m) => m.reconcileRideWalletForDriver(ride.driverId))
      .catch((e) => console.error('[RideMode] wallet merge hook failed:', e?.message || e));

    return {
      ...result,
      ride,
    };
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Credit drivers for completed ONLINE rides whose payment has now been confirmed. Safe to run any time:
 * settleCompletedRideWallet claims each ride atomically, so a ride is never credited twice.
 */
export const settlePaidOnlineRides = async (limit = 50) => {
  const rides = await Ride.find({
    status: 'completed',
    paymentMethod: 'online',
    walletSettledAt: null,
    driverId: { $ne: null },
    $or: [
      { 'driverPaymentCollection.paidAt': { $ne: null } },
      { 'driverPaymentCollection.status': { $in: ['paid', 'captured', 'completed'] } },
    ],
  }).select('_id').limit(limit).lean();

  let settled = 0;
  for (const ride of rides) {
    try {
      const result = await settleCompletedRideWallet({ rideId: ride._id });
      if (result) settled += 1;
    } catch (err) {
      console.error(`[Taxi] Could not settle paid online ride ${ride._id}:`, err?.message || err);
    }
  }
  return settled;
};
