/**
 * Which services (taxi / outstation / delivery / pooling) a vehicle type may do.
 * The server sends `allowed_services` on every vehicle type (what the admin saved, else the default rule).
 * The fallback below is the same default rule, for data that has no `allowed_services` yet:
 * a bike / scooter does taxi + delivery only (outstation and pooling are for 4-wheelers), everything else does all.
 */
export const ALL_SERVICES = ['taxi', 'outstation', 'delivery', 'pooling'];

// One vocabulary everywhere (admin, driver, user): Ride / Outstation / Parcel / Car Pooling
export const SERVICE_LABELS = {
  taxi: 'Ride',
  outstation: 'Outstation',
  delivery: 'Parcel',
  pooling: 'Car Pooling',
  all: 'All',
};

/** The legacy transport_type (taxi / delivery / pooling / both) that goes with a set of services. Mirrors the backend rule. */
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

/** The services a vehicle type that has none saved yet is treated as doing, from its old transport_type. */
export const servicesFromTransportType = (transportType, { twoWheeler = false } = {}) => {
  const value = String(transportType || 'taxi').toLowerCase();
  if (value === 'delivery') return ['delivery'];
  if (value === 'pooling') return ['pooling'];
  if (value === 'both' || value === 'all') return twoWheeler ? ['taxi', 'delivery'] : ['taxi', 'outstation', 'delivery'];
  return twoWheeler ? ['taxi'] : ['taxi', 'outstation'];
};

const TWO_WHEELER_RE = /bike|scooter|2[\s_-]?wheeler|two[\s_-]?wheeler|cycle/i;

export const isTwoWheelerVehicle = (vehicle) => {
  if (!vehicle) return false;
  const text = typeof vehicle === 'string'
    ? vehicle
    : `${vehicle.name || ''} ${vehicle.icon_types || ''} ${vehicle.vehicle_type || ''} ${vehicle.label || ''}`;
  return TWO_WHEELER_RE.test(text);
};

export const getAllowedServices = (vehicle) => {
  const saved = Array.isArray(vehicle?.allowed_services) ? vehicle.allowed_services : vehicle?.allowedServices;
  const clean = (Array.isArray(saved) ? saved : [])
    .map((item) => String(item || '').toLowerCase())
    .filter((item) => ALL_SERVICES.includes(item));
  if (clean.length > 0) return clean;
  return isTwoWheelerVehicle(vehicle) ? ['taxi', 'delivery'] : [...ALL_SERVICES];
};

// "all" (and the old "both") means every service the vehicle is allowed to do
export const isAllTransport = (value) => ['all', 'both'].includes(String(value || '').toLowerCase());

export const vehicleCanDo = (vehicle, transport) => {
  if (!vehicle || isAllTransport(transport) || !transport) return true;
  return getAllowedServices(vehicle).includes(String(transport).toLowerCase());
};

/** Transport options a driver on this vehicle may pick: each allowed service, plus "All" when there is more than one. */
export const transportChoicesForVehicle = (vehicle, { poolingEnabled = true } = {}) => {
  const allowed = getAllowedServices(vehicle).filter((item) => poolingEnabled || item !== 'pooling');
  const choices = allowed.map((id) => ({ id, label: SERVICE_LABELS[id] }));
  if (allowed.length > 1) choices.push({ id: 'all', label: SERVICE_LABELS.all });
  return choices;
};

/** Keeps a chosen transport valid for the vehicle (falls back to "All", else the first allowed one). */
export const coerceTransport = (vehicle, transport, options) => {
  const choices = transportChoicesForVehicle(vehicle, options).map((item) => item.id);
  const wanted = isAllTransport(transport) ? 'all' : String(transport || '').toLowerCase();
  if (choices.includes(wanted)) return wanted;
  return choices.includes('all') ? 'all' : (choices[0] || 'taxi');
};
