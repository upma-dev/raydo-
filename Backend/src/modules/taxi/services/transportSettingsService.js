import { createDefaultBusinessSettings } from '../admin/data/defaultBusinessSettings.js';
import { AdminBusinessSetting } from '../admin/models/AdminBusinessSetting.js';

const defaultTransportRideSettings = createDefaultBusinessSettings().transport_ride || {};
const defaultBidRideSettings = createDefaultBusinessSettings().bid_ride || {};

const toPositiveNumber = (value, fallback) => {
  const numericValue = Number(value);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallback;
};

export const getTransportRideSettings = async () => {
  const businessSettings = await AdminBusinessSetting.findOne({ scope: 'default' })
    .select('transport_ride')
    .lean();

  return {
    ...defaultTransportRideSettings,
    ...(businessSettings?.transport_ride || {}),
  };
};

export const getBidRideSettings = async () => {
  const businessSettings = await AdminBusinessSetting.findOne({ scope: 'default' })
    .select('bid_ride')
    .lean();

  return {
    ...defaultBidRideSettings,
    ...(businessSettings?.bid_ride || {}),
  };
};

// The dispatch config is read once per active ride on every driver location tick (notifyLateAvailableDriver), so an
// uncached read means one AdminBusinessSetting query per ride per ping. Admin dispatch settings change rarely, so a
// short in-memory cache is safe and removes that whole query storm. Invalidate by letting the TTL lapse (<= 30s stale).
const DISPATCH_CONFIG_TTL_MS = Number(process.env.DISPATCH_CONFIG_TTL_MS || 30000);
let dispatchConfigCache = null;
let dispatchConfigCachedAt = 0;

export const resolveTransportDispatchConfig = async () => {
  if (dispatchConfigCache && Date.now() - dispatchConfigCachedAt < DISPATCH_CONFIG_TTL_MS) {
    return dispatchConfigCache;
  }
  const settings = await getTransportRideSettings();
  const driverSearchRadiusKm = toPositiveNumber(
    settings.driver_search_radius,
    toPositiveNumber(defaultTransportRideSettings.driver_search_radius, 5),
  );
  const retryWindowSeconds = toPositiveNumber(
    settings.trip_accept_reject_duration_for_driver,
    toPositiveNumber(defaultTransportRideSettings.trip_accept_reject_duration_for_driver, 15),
  );
  const maxSearchSeconds = toPositiveNumber(
    settings.maximum_time_for_find_drivers_for_regular_ride,
    toPositiveNumber(defaultTransportRideSettings.maximum_time_for_find_drivers_for_regular_ride, 300),
  );

  dispatchConfigCache = {
    settings,
    dispatchType: String(settings.trip_dispatch_type || defaultTransportRideSettings.trip_dispatch_type) === '2'
      ? 'broadcast'
      : 'one_by_one',
    baseDistanceMeters: Math.round(driverSearchRadiusKm * 1000),
    maxDistanceMeters: Math.round(driverSearchRadiusKm * 1000),
    retryWindowSeconds,
    retryDelayMs: Math.round(retryWindowSeconds * 1000),
    maxSearchSeconds,
    maxAttempts: Math.max(1, Math.ceil(maxSearchSeconds / retryWindowSeconds)),
  };
  dispatchConfigCachedAt = Date.now();
  return dispatchConfigCache;
};
