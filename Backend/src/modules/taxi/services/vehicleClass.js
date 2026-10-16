/**
 * Vehicle classes used to keep two-wheelers away from heavy / large parcels (and trucks away from small rides).
 * Matching is case-insensitive on purpose: the driver's vehicleType is saved as the admin typed it ("Bike", "bike"...).
 */
export const TWO_WHEELER_KEYS = ['bike', 'scooter', '2wheeler', '2-wheeler', '2_wheeler', 'two_wheeler', 'twowheeler'];
export const TRUCK_MOVER_KEYS = ['truck', 'lcv', 'hcv', 'mcv', 'loader', 'mover', 'movers', 'packers'];

export const TWO_WHEELER_RE = new RegExp(TWO_WHEELER_KEYS.join('|'), 'i');
export const TRUCK_MOVER_RE = new RegExp(TRUCK_MOVER_KEYS.join('|'), 'i');

const HEAVY_PARCEL_CATEGORIES = new Set(['truck', 'trucks', 'mover', 'movers', 'packers', 'heavy', 'heavy_trucks', 'heavy_movers']);

/**
 * A parcel booked under the Trucks or Packers & Movers category is heavy / large: a two-wheeler must never get it,
 * whatever vehicle the booking happened to list.
 */
export const isHeavyParcel = (ride) => {
  const parcel = ride?.parcel || {};
  const values = [parcel.deliveryCategory, parcel.delivery_category, parcel.goodsTypeFor, parcel.goods_type_for, parcel.category, ride?.deliveryCategory]
    .map((value) => String(value || '').trim().toLowerCase());
  return values.some((value) => HEAVY_PARCEL_CATEGORIES.has(value));
};
