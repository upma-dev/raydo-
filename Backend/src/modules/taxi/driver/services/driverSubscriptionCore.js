import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { AdminBusinessSetting } from '../../admin/models/AdminBusinessSetting.js';
import { DriverSubscription } from '../models/DriverSubscription.js';
import { Driver } from '../models/Driver.js';
import {
  findLivePartnerPass,
  getDeliverySubscriptionModes,
  isPassMissing,
  passServiceForRide,
  partnerIdsWithLivePass,
  partnerPassWaivesCommission,
  subscriptionRequiredError,
} from '../../../food/delivery/services/deliverySubscriptionCore.js';

/**
 * DRIVER SUBSCRIPTION - the rules (no wallet code here, so the wallet service can import this safely).
 *
 * Admin > Driver > Subscription sets one of three modes:
 *   commissionOnly   - drivers pay the usual commission on each ride; passes are ignored and cannot be bought.
 *   subscriptionOnly - a driver needs a live pass to go online, get requests and accept rides; no commission while it lasts.
 *   both             - passes are optional: with a live pass there is no commission, without one the commission is charged.
 */

export const SUBSCRIPTION_MODES = ['commissionOnly', 'subscriptionOnly', 'both'];

export const getDriverSubscriptionMode = async () => {
  const setting = await AdminBusinessSetting.findOne({ scope: 'default' }, { subscription: 1, _id: 0 }).lean();
  const mode = String(setting?.subscription?.mode || '').trim();
  return SUBSCRIPTION_MODES.includes(mode) ? mode : 'commissionOnly';
};

const liveFilter = (driverId, at) => ({
  driverId,
  status: 'active',
  startedAt: { $lte: at },
  expiresAt: { $gt: at },
});

/** The pass that is running for this driver at the given moment (default: now), or null. */
export const findLiveDriverSubscription = async (driverId, at = new Date(), { session = null } = {}) => {
  if (!driverId || !mongoose.Types.ObjectId.isValid(String(driverId))) return null;
  const query = DriverSubscription.findOne(liveFilter(driverId, at)).sort({ expiresAt: -1 });
  if (session) query.session(session);
  return query.lean();
};

/**
 * A driver linked to a delivery partner (Ride & Parcel from the delivery app) does not use the driver-app passes: the
 * partner buys ride / parcel passes in the delivery app instead. Returns the partner id, or null for ordinary drivers.
 */
const linkedPartnerIdOf = async (driverOrId, { session = null } = {}) => {
  if (driverOrId && typeof driverOrId === 'object' && 'linkedDeliveryPartnerId' in driverOrId) {
    return driverOrId.linkedDeliveryPartnerId || null;
  }
  const id = driverOrId && typeof driverOrId === 'object' ? driverOrId._id : driverOrId;
  if (!id || !mongoose.Types.ObjectId.isValid(String(id))) return null;
  const query = Driver.findById(id).select('linkedDeliveryPartnerId').lean();
  if (session) query.session(session);
  return (await query)?.linkedDeliveryPartnerId || null;
};

/**
 * True when a subscription removes the ride commission for this driver at that moment.
 * serviceType (ride / parcel / intercity) matters only for delivery partners, whose passes are per kind of work.
 */
export const subscriptionWaivesCommission = async (driverId, at = new Date(), { session = null, serviceType = 'ride' } = {}) => {
  const partnerId = await linkedPartnerIdOf(driverId, { session });
  if (partnerId) return partnerPassWaivesCommission(partnerId, passServiceForRide(serviceType), at, { session });

  const mode = await getDriverSubscriptionMode();
  if (mode === 'commissionOnly') return false;
  return Boolean(await findLiveDriverSubscription(driverId, at, { session }));
};

/** subscriptionOnly mode: a driver without a live pass may not go online or accept rides. */
export const assertDriverMaySubscriptionWork = async (driverOrId, { session = null, serviceType = null } = {}) => {
  const partnerId = await linkedPartnerIdOf(driverOrId, { session });
  if (partnerId) {
    // Going online has no single kind of work: only a specific ride / parcel accept is checked against its pass
    if (serviceType && (await isPassMissing(partnerId, passServiceForRide(serviceType)))) {
      throw subscriptionRequiredError(passServiceForRide(serviceType));
    }
    return;
  }

  const mode = await getDriverSubscriptionMode();
  if (mode !== 'subscriptionOnly') return;

  const driverId = typeof driverOrId === 'object' && driverOrId?._id ? driverOrId._id : driverOrId;
  const live = await findLiveDriverSubscription(driverId, new Date(), { session });
  if (!live) {
    throw new ApiError(403, 'An active subscription is required to take rides. Please buy a subscription plan.');
  }
};

/**
 * Dispatch priority: ids (strings) of the drivers who hold a live pass that counts for this kind of work. Ordinary drivers
 * use the driver-app passes; delivery-partner drivers use their ride / parcel pass. Nothing counts while passes are off.
 */
export const driversWithLivePass = async (drivers = [], serviceType = 'ride') => {
  const result = new Set();
  if (!drivers.length) return result;

  const own = drivers.filter((driver) => !driver.linkedDeliveryPartnerId);
  const linked = drivers.filter((driver) => driver.linkedDeliveryPartnerId);

  if (own.length && (await getDriverSubscriptionMode()) !== 'commissionOnly') {
    const now = new Date();
    const ids = await DriverSubscription.distinct('driverId', {
      driverId: { $in: own.map((driver) => driver._id) },
      status: 'active',
      startedAt: { $lte: now },
      expiresAt: { $gt: now },
    });
    ids.forEach((id) => result.add(String(id)));
  }

  if (linked.length) {
    const live = await partnerIdsWithLivePass(linked.map((driver) => driver.linkedDeliveryPartnerId), passServiceForRide(serviceType));
    linked.forEach((driver) => {
      if (live.has(String(driver.linkedDeliveryPartnerId))) result.add(String(driver._id));
    });
  }
  return result;
};

/**
 * Dispatch filter: in subscriptionOnly mode keep only the drivers who have a live pass.
 * Other modes return the list untouched.
 */
export const filterDriversBySubscription = async (drivers = []) => {
  if (!drivers.length) return drivers;
  const mode = await getDriverSubscriptionMode();
  if (mode !== 'subscriptionOnly') return drivers;

  // Delivery-partner drivers are filtered by their own passes (filterLinkedDriversForDispatch), not by driver-app passes
  const own = drivers.filter((driver) => !driver.linkedDeliveryPartnerId);
  if (!own.length) return drivers;

  const now = new Date();
  const liveIds = await DriverSubscription.distinct('driverId', {
    driverId: { $in: own.map((driver) => driver._id) },
    status: 'active',
    startedAt: { $lte: now },
    expiresAt: { $gt: now },
  });
  const liveSet = new Set(liveIds.map((id) => String(id)));
  return drivers.filter((driver) => driver.linkedDeliveryPartnerId || liveSet.has(String(driver._id)));
};
