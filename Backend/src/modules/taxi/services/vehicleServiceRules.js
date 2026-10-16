import mongoose from 'mongoose';
import { Vehicle } from '../admin/models/Vehicle.js';
import { ApiError } from '../../../utils/ApiError.js';
import { TWO_WHEELER_RE } from './vehicleClass.js';

/**
 * Which vehicle types may be used for which driver service.
 *   service            vehicle transport_type that fits
 *   taxi, outstation   taxi, both
 *   delivery           delivery, both
 *   pooling            pooling, both
 * A driver (or the admin) can no longer attach a disabled / unknown vehicle type, or a vehicle that does not belong to the
 * service the driver works in (a goods truck on a taxi account, a taxi on a delivery account).
 */
export const TRANSPORT_FOR_SERVICE = {
  taxi: ['taxi', 'both'],
  outstation: ['taxi', 'both'],
  delivery: ['delivery', 'both'],
  pooling: ['pooling', 'both'],
};

export const ALL_SERVICES = ['taxi', 'outstation', 'delivery', 'pooling'];

/**
 * The admin picks the SERVICES a vehicle type can do; the legacy transport_type (taxi / delivery / pooling / both) is
 * derived from that choice so older code and filters keep working.
 *   one group of services (ride+outstation = taxi, parcel = delivery, pooling) -> that group
 *   more than one group                                                       -> both
 */
export const transportTypeForServices = (services = []) => {
  const list = Array.isArray(services) ? services : [];
  const groups = [
    list.some((item) => item === 'taxi' || item === 'outstation') ? 'taxi' : '',
    list.includes('delivery') ? 'delivery' : '',
    list.includes('pooling') ? 'pooling' : '',
  ].filter(Boolean);
  if (groups.length > 1) return 'both';
  return groups[0] || 'taxi';
};

const TWO_WHEELER_DEFAULT_SERVICES = ['taxi', 'delivery'];
const CYCLE_RE = /cycle|bicycle/i;

export const isTwoWheelerRecord = (vehicle = {}) => {
  const text = `${vehicle?.name || ''} ${vehicle?.icon_types || ''} ${vehicle?.vehicle_type || ''}`;
  return TWO_WHEELER_RE.test(text) || CYCLE_RE.test(text);
};

/**
 * The services a driver on this vehicle type may work in.
 * What the admin saved on the vehicle type wins; otherwise a bike / scooter gets taxi + delivery only (no outstation,
 * no pooling: those are for 4-wheelers) and every other vehicle gets all services.
 */
export const effectiveServicesForVehicle = (vehicle) => {
  const saved = (Array.isArray(vehicle?.allowed_services) ? vehicle.allowed_services : [])
    .map((item) => String(item || '').toLowerCase())
    .filter((item) => ALL_SERVICES.includes(item));
  if (saved.length > 0) return [...new Set(saved)];
  return isTwoWheelerRecord(vehicle) ? [...TWO_WHEELER_DEFAULT_SERVICES] : [...ALL_SERVICES];
};

/** A driver's chosen services, cut down to what the vehicle type is allowed to do. */
export const narrowServicesForVehicle = (vehicle, services = []) => {
  if (!vehicle) return services;
  const allowed = effectiveServicesForVehicle(vehicle);
  const narrowed = (Array.isArray(services) ? services : []).filter((item) => allowed.includes(String(item).toLowerCase()));
  return narrowed.length > 0 ? narrowed : allowed.slice(0, 1);
};

export const vehicleFitsService = (vehicle, service) => {
  const allowed = TRANSPORT_FOR_SERVICE[String(service || '').toLowerCase()];
  if (!allowed) return true;
  return allowed.includes(String(vehicle?.transport_type || 'taxi').toLowerCase());
};

export const isVehicleActive = (vehicle) => vehicle && vehicle.active !== false && Number(vehicle.status ?? 1) !== 0;

/**
 * Returns the vehicle record (or null when no vehicle type was given). Throws a 400 for an unknown / disabled vehicle type
 * or one that does not fit one of the services.
 */
export const assertVehicleTypeFitsServices = async ({ vehicleTypeId, serviceCategories = [] }) => {
  const raw = vehicleTypeId?._id || vehicleTypeId?.id || vehicleTypeId;
  if (!raw) return null;
  if (!mongoose.Types.ObjectId.isValid(String(raw))) {
    throw new ApiError(400, 'Select a valid vehicle type');
  }
  const vehicle = await Vehicle.findById(raw).lean();
  if (!vehicle) {
    throw new ApiError(400, 'This vehicle type does not exist. Please choose another one.');
  }
  if (!isVehicleActive(vehicle)) {
    throw new ApiError(400, `${vehicle.name || 'This vehicle type'} is currently disabled. Please choose another one.`);
  }
  // A driver on "All" works in several services, so the vehicle only has to suit at least ONE of them (a car on an "All"
  // account is fine for taxi); a driver with a single service still needs a vehicle made for exactly that service.
  const services = Array.isArray(serviceCategories) ? serviceCategories : [];
  // e.g. a bike can never be put on outstation / pooling
  const allowedHere = effectiveServicesForVehicle(vehicle);
  const notAllowed = services.filter((service) => !allowedHere.includes(String(service).toLowerCase()));
  if (services.length > 0 && notAllowed.length === services.length) {
    throw new ApiError(400, `${vehicle.name || 'This vehicle type'} cannot do ${notAllowed.join(' / ')}. It can only do: ${allowedHere.join(', ')}.`);
  }
  if (services.length > 0 && !services.some((service) => vehicleFitsService(vehicle, service))) {
    throw new ApiError(400, `${vehicle.name || 'This vehicle type'} cannot be used for the ${services.join(' / ')} service. Choose a vehicle type made for it.`);
  }
  return vehicle;
};
