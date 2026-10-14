import mongoose from 'mongoose';
import { SetPrice } from '../admin/models/SetPrice.js';
import { ApiError } from '../../../utils/ApiError.js';
import { getDrivingRoute } from './routeMetricsService.js';

/**
 * OUTSTATION (intercity) FARE, calculated on the server from the real map distance.
 *
 *   distance  = Google road distance pickup -> drop (Round Trip: there and back = x2, same for the time)
 *   subtotal  = base price                                   (covers the free distance and free time)
 *             + extra km   x price per km                    (km above the free distance)
 *             + extra min  x price per minute                (minutes above the free time)
 *   tax       = subtotal x service tax %
 *   total     = subtotal + tax, rounded to a whole rupee
 *
 * The prices come from the admin's package row (SetPrices > package) of the chosen vehicle. The fare is NOT multiplied
 * by passengers: a cab costs the same for 1 or 4 people.
 * Waiting at the pickup: the package's waiting charge + free minutes (else the vehicle's normal rule) are returned so
 * the rider and the driver are shown the same terms, and the waiting amount is added at completion.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const num = (v, d = 0) => (Number.isFinite(Number(v)) ? Number(v) : d);

const normalizeTripType = (value = '') => (/round/i.test(String(value)) ? 'Round Trip' : 'One Way');

export const computeIntercityFare = ({ vehiclePrice = {}, distanceKm = 0, durationMinutes = 0, tripType = 'One Way' }) => {
  const trip = normalizeTripType(tripType);
  const legs = trip === 'Round Trip' ? 2 : 1;
  const km = round2(Math.max(0, distanceKm) * legs);
  const minutes = Math.round(Math.max(0, durationMinutes) * legs);

  const basePrice = Math.max(0, num(vehiclePrice.base_price));
  const freeDistance = Math.max(0, num(vehiclePrice.free_distance));
  const pricePerKm = Math.max(0, num(vehiclePrice.distance_price));
  const freeTime = Math.max(0, num(vehiclePrice.free_time));
  const pricePerMinute = Math.max(0, num(vehiclePrice.time_price));
  const taxPercent = Math.max(0, Math.min(100, num(vehiclePrice.service_tax)));

  const extraKm = round2(Math.max(0, km - freeDistance));
  const extraMinutes = Math.max(0, minutes - freeTime);
  const distanceCharge = round2(extraKm * pricePerKm);
  const timeCharge = round2(extraMinutes * pricePerMinute);
  const subtotal = round2(basePrice + distanceCharge + timeCharge);
  const tax = round2((subtotal * taxPercent) / 100);

  return {
    tripType: trip,
    distanceKm: km,
    durationMinutes: minutes,
    basePrice, freeDistance, pricePerKm, extraKm, distanceCharge,
    freeTime, pricePerMinute, extraMinutes, timeCharge,
    subtotal, taxPercent, tax,
    fare: Math.round(subtotal + tax),
  };
};

/**
 * { fare, distanceMeters, durationMinutes, distanceSource, breakdown, waiting, commission }
 * Throws a 404 for an unknown / unavailable package or vehicle.
 */
export const quoteIntercityFare = async ({ packageId, vehicleTypeId, tripType = 'One Way', pickup, drop, rideRule = null }) => {
  if (!mongoose.Types.ObjectId.isValid(String(packageId || ''))) {
    throw new ApiError(404, 'This outstation package is not available');
  }
  const pkg = await SetPrice.findOne({ _id: packageId, pricing_scope: 'package', active: 1, status: 'active' }).lean();
  if (!pkg || String(pkg.package_availability || 'available').toLowerCase() !== 'available') {
    throw new ApiError(404, 'This outstation package is not available');
  }
  const row = (Array.isArray(pkg.package_vehicle_prices) ? pkg.package_vehicle_prices : [])
    .find((item) => String(item.vehicle_type || '') === String(vehicleTypeId || ''));
  if (!row) {
    throw new ApiError(404, 'This vehicle is not available for the selected outstation package');
  }

  const route = await getDrivingRoute({ origin: pickup, destination: drop });
  if (!route) {
    throw new ApiError(400, 'Pickup and drop locations are required to price an outstation trip');
  }

  const breakdown = computeIntercityFare({
    vehiclePrice: { ...row, service_tax: row.service_tax ?? pkg.service_tax },
    distanceKm: route.distanceMeters / 1000,
    durationMinutes: route.durationMinutes,
    tripType,
  });

  const waitingRate = num(pkg.waiting_charge) > 0 ? num(pkg.waiting_charge) : num(rideRule?.waiting_charge);
  const freeWaiting = num(pkg.waiting_charge) > 0 ? num(pkg.free_waiting_before) : num(rideRule?.free_waiting_before);

  return {
    fare: breakdown.fare,
    distanceMeters: route.distanceMeters,
    durationMinutes: route.durationMinutes,
    distanceSource: route.source,
    breakdown,
    waiting: { ratePerMinute: waitingRate, freeMinutes: freeWaiting },
    commission: {
      type: Number(row.admin_commission_type_from_driver ?? 1),
      value: Number(row.admin_commission_from_driver ?? 0),
    },
    packageId: String(pkg._id),
    packageTypeName: '',
    destination: pkg.package_destination || '',
  };
};
