import mongoose from 'mongoose';
import { Vehicle } from '../admin/models/Vehicle.js';
import { ApiError } from '../../../utils/ApiError.js';

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
  const misfit = (Array.isArray(serviceCategories) ? serviceCategories : []).find((service) => !vehicleFitsService(vehicle, service));
  if (misfit) {
    throw new ApiError(400, `${vehicle.name || 'This vehicle type'} cannot be used for the ${misfit} service. Choose a vehicle type made for it.`);
  }
  return vehicle;
};
