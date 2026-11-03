import mongoose from 'mongoose';
import { ApiError } from '../../../utils/ApiError.js';
import { Driver } from '../driver/models/Driver.js';
import { Zone } from '../driver/models/Zone.js';
import { Ride } from '../user/models/Ride.js';
import { AdminBusinessSetting } from '../admin/models/AdminBusinessSetting.js';
import { findZoneByPickup } from './matchingService.js';

/**
 * RETURN TRIP ("two-way") - a driver who took a ride from Dewas to Indore wants the next ride to take him back to Dewas.
 *
 * The driver turns on Return trip with a destination ZONE (Dewas) and a time limit. While it is on, a ride request whose
 * DROP lies in that zone puts him in front of the other drivers (after pass holders, before the rating order - see
 * dispatchPriority.js). Nothing else about matching changes: he is still only asked for pickups in the zone he is in now,
 * inside the normal 5-15 km search range (his zone follows his live location, so in Indore he is an Indore driver).
 *
 * It turns itself off when he reaches the destination zone, goes offline, accepts a ride that goes there, or the time runs out.
 */

export const DEFAULT_RETURN_TRIP_CONFIG = Object.freeze({
  enabled: true,
  // false = only outstation / intercity rides count as a return ride; true = any ride that ends in the destination zone
  allowCityRides: false,
  expiryHours: 12,
  // Longest return ride (km) by vehicle class
  maxKm: { car: 150, bike: 60 },
});

const CONFIG_TTL_MS = 30 * 1000;
let configCache = { at: 0, value: DEFAULT_RETURN_TRIP_CONFIG };

const toNumber = (value, fallback, { min = 0, max = Number.MAX_SAFE_INTEGER } = {}) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

export const normalizeReturnTripConfig = (raw = {}) => ({
  enabled: raw.enabled === undefined ? DEFAULT_RETURN_TRIP_CONFIG.enabled : Boolean(raw.enabled),
  allowCityRides: Boolean(raw.allowCityRides),
  expiryHours: toNumber(raw.expiryHours, DEFAULT_RETURN_TRIP_CONFIG.expiryHours, { min: 1, max: 72 }),
  maxKm: {
    car: toNumber(raw.maxKm?.car, DEFAULT_RETURN_TRIP_CONFIG.maxKm.car, { min: 1, max: 2000 }),
    bike: toNumber(raw.maxKm?.bike, DEFAULT_RETURN_TRIP_CONFIG.maxKm.bike, { min: 1, max: 2000 }),
  },
});

export const getReturnTripConfig = async ({ fresh = false } = {}) => {
  if (!fresh && Date.now() - configCache.at < CONFIG_TTL_MS) return configCache.value;
  const setting = await AdminBusinessSetting.findOne({ scope: 'default' }, { return_trip: 1, _id: 0 }).lean();
  configCache = { at: Date.now(), value: normalizeReturnTripConfig(setting?.return_trip || {}) };
  return configCache.value;
};

export const updateReturnTripConfig = async (payload = {}) => {
  const value = normalizeReturnTripConfig(payload);
  await AdminBusinessSetting.findOneAndUpdate({ scope: 'default' }, { $set: { return_trip: value } }, { upsert: true });
  configCache = { at: Date.now(), value };
  return value;
};

const TWO_WHEELER_RE = /bike|scooter|scooty|moped|motorcycle/i;
export const vehicleClassOf = (driver = {}) =>
  (TWO_WHEELER_RE.test(`${driver.vehicleType || ''} ${driver.vehicleIconType || ''}`) ? 'bike' : 'car');

const isLive = (returnTrip, now = new Date()) =>
  Boolean(returnTrip?.enabled && returnTrip?.destinationZoneId && returnTrip?.expiresAt && new Date(returnTrip.expiresAt) > now);

/**
 * Does this ride count as a return ride for this driver? dropZoneId = the zone the ride ends in.
 * tripDistanceMeters = 0 means "unknown", which is not held against the driver.
 */
export const isReturnTripMatch = (driver, { dropZoneId, serviceType = 'ride', tripDistanceMeters = 0 } = {}, config, now = new Date()) => {
  if (!config?.enabled || !dropZoneId || !isLive(driver?.returnTrip, now)) return false;
  if (String(driver.returnTrip.destinationZoneId) !== String(dropZoneId)) return false;
  const isIntercity = String(serviceType || '').toLowerCase() === 'intercity';
  if (!isIntercity && !config.allowCityRides) return false;
  const km = Number(tripDistanceMeters || 0) / 1000;
  return km <= config.maxKm[vehicleClassOf(driver)];
};

/* ------------------------------------------------------------------------------------------------------------- */
/* Driver side                                                                                                    */
/* ------------------------------------------------------------------------------------------------------------- */

const SUGGESTION_WINDOW_MS = 6 * 60 * 60 * 1000;

/** After an intercity trip: "go back to where it started?" - the zone the last intercity ride was picked up in. */
const buildSuggestion = async (driver) => {
  const last = await Ride.findOne({
    driverId: driver._id,
    serviceType: 'intercity',
    status: 'completed',
    completedAt: { $gte: new Date(Date.now() - SUGGESTION_WINDOW_MS) },
  })
    .sort({ completedAt: -1 })
    .select('_id pickupLocation completedAt')
    .lean();
  if (!last?.pickupLocation?.coordinates?.length) return null;

  const zone = await findZoneByPickup(last.pickupLocation.coordinates).catch(() => null);
  if (!zone || String(zone._id) === String(driver.zoneId || '')) return null;
  return { zoneId: String(zone._id), zoneName: zone.name, fromRideId: String(last._id) };
};

export const getDriverReturnTripState = async (driverId) => {
  const [config, driver] = await Promise.all([
    getReturnTripConfig(),
    Driver.findById(driverId).select('zoneId returnTrip vehicleType vehicleIconType').lean(),
  ]);
  if (!driver) throw new ApiError(404, 'Driver not found');

  const live = isLive(driver.returnTrip);
  const [zones, suggestion] = await Promise.all([
    Zone.find({}).select('_id name').sort({ name: 1 }).lean(),
    config.enabled && !live ? buildSuggestion(driver) : null,
  ]);

  return {
    available: config.enabled,
    allowCityRides: config.allowCityRides,
    expiryHours: config.expiryHours,
    maxKm: config.maxKm[vehicleClassOf(driver)],
    current: live
      ? {
        enabled: true,
        destinationZoneId: String(driver.returnTrip.destinationZoneId),
        destinationName: driver.returnTrip.label || '',
        expiresAt: driver.returnTrip.expiresAt,
        source: driver.returnTrip.source || 'manual',
      }
      : null,
    suggestion,
    zones: zones
      .filter((zone) => String(zone._id) !== String(driver.zoneId || ''))
      .map((zone) => ({ id: String(zone._id), name: zone.name })),
  };
};

export const setDriverReturnTrip = async (driverId, { enabled, destinationZoneId, source = 'manual', fromRideId = null } = {}) => {
  const config = await getReturnTripConfig();

  if (!enabled) {
    await Driver.updateOne({ _id: driverId }, { $set: { 'returnTrip.enabled': false } });
    return getDriverReturnTripState(driverId);
  }

  if (!config.enabled) throw new ApiError(400, 'Return trip is not available right now');
  if (!mongoose.Types.ObjectId.isValid(String(destinationZoneId || ''))) throw new ApiError(400, 'Choose where you are going back to');

  const [driver, zone] = await Promise.all([
    Driver.findById(driverId).select('zoneId').lean(),
    Zone.findById(destinationZoneId).select('_id name').lean(),
  ]);
  if (!driver) throw new ApiError(404, 'Driver not found');
  if (!zone) throw new ApiError(404, 'Destination zone not found');
  if (String(zone._id) === String(driver.zoneId || '')) throw new ApiError(400, 'You are already in this zone. Choose where you are going back to.');

  const now = new Date();
  await Driver.updateOne(
    { _id: driverId },
    {
      $set: {
        returnTrip: {
          enabled: true,
          destinationZoneId: zone._id,
          label: zone.name,
          startedAt: now,
          expiresAt: new Date(now.getTime() + config.expiryHours * 60 * 60 * 1000),
          source: source === 'suggestion' ? 'suggestion' : 'manual',
          fromRideId: mongoose.Types.ObjectId.isValid(String(fromRideId || '')) ? fromRideId : null,
        },
      },
    },
  );
  return getDriverReturnTripState(driverId);
};

/* ------------------------------------------------------------------------------------------------------------- */
/* Switching itself off                                                                                           */
/* ------------------------------------------------------------------------------------------------------------- */

/** Driver reached the destination zone (called with the driver's current zone on every location update). */
export const turnOffReturnTripIfArrived = async (driver, currentZoneId) => {
  if (!driver?.returnTrip?.enabled || !currentZoneId) return false;
  if (String(driver.returnTrip.destinationZoneId) !== String(currentZoneId)) return false;
  await Driver.updateOne({ _id: driver._id }, { $set: { 'returnTrip.enabled': false } });
  return true;
};

/** Called while a driver accepts a ride: accepting a ride that goes to the destination ends the return trip mode. */
export const turnOffReturnTripIfRideGoesThere = async (driver, ride) => {
  if (!driver?.returnTrip?.enabled || !ride?.dropLocation?.coordinates?.length) return false;
  const dropZone = await findZoneByPickup(ride.dropLocation.coordinates).catch(() => null);
  if (!dropZone || String(dropZone._id) !== String(driver.returnTrip.destinationZoneId)) return false;
  driver.returnTrip.enabled = false; // the caller saves the driver
  return true;
};
