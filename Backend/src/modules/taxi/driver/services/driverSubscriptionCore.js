import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { AdminBusinessSetting } from '../../admin/models/AdminBusinessSetting.js';
import { DriverSubscription } from '../models/DriverSubscription.js';

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

/** True when the subscription removes the ride commission for this driver at that moment. */
export const subscriptionWaivesCommission = async (driverId, at = new Date(), { session = null } = {}) => {
  const mode = await getDriverSubscriptionMode();
  if (mode === 'commissionOnly') return false;
  return Boolean(await findLiveDriverSubscription(driverId, at, { session }));
};

/** subscriptionOnly mode: a driver without a live pass may not go online or accept rides. */
export const assertDriverMaySubscriptionWork = async (driverOrId, { session = null } = {}) => {
  const mode = await getDriverSubscriptionMode();
  if (mode !== 'subscriptionOnly') return;

  const driverId = typeof driverOrId === 'object' && driverOrId?._id ? driverOrId._id : driverOrId;
  const live = await findLiveDriverSubscription(driverId, new Date(), { session });
  if (!live) {
    throw new ApiError(403, 'An active subscription is required to take rides. Please buy a subscription plan.');
  }
};

/**
 * Dispatch filter: in subscriptionOnly mode keep only the drivers who have a live pass.
 * Other modes return the list untouched.
 */
export const filterDriversBySubscription = async (drivers = []) => {
  if (!drivers.length) return drivers;
  const mode = await getDriverSubscriptionMode();
  if (mode !== 'subscriptionOnly') return drivers;

  const now = new Date();
  const liveIds = await DriverSubscription.distinct('driverId', {
    driverId: { $in: drivers.map((driver) => driver._id) },
    status: 'active',
    startedAt: { $lte: now },
    expiresAt: { $gt: now },
  });
  const liveSet = new Set(liveIds.map((id) => String(id)));
  return drivers.filter((driver) => liveSet.has(String(driver._id)));
};
