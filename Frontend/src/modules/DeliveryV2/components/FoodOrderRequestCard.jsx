import React, { useEffect, useMemo, useState } from 'react';
import CountdownRing from '@/modules/DeliveryV2/components/CountdownRing';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { getHaversineDistance } from '@/modules/DeliveryV2/utils/geo';

const OFFER_SECONDS = 30;

const num = (value) => {
  const n = parseFloat(value);
  return Number.isFinite(n) ? n : NaN;
};

const formatKm = (km) => {
  if (!Number.isFinite(km)) return '--';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km.toFixed(km >= 10 ? 0 : 1)} km`;
};

const readRestaurantPoint = (order) => {
  const rest = order?.restaurantLocation || order?.restaurantId?.location || {};
  const coords = Array.isArray(rest.coordinates) ? rest.coordinates : [];
  return {
    lat: num(order?.restaurant_lat ?? order?.restaurantLat ?? rest.latitude ?? rest.lat ?? coords[1]),
    lng: num(order?.restaurant_lng ?? order?.restaurantLng ?? rest.longitude ?? rest.lng ?? coords[0]),
  };
};

const readCustomerPoint = (order) => {
  const address = order?.deliveryAddress || {};
  const geo = Array.isArray(address?.location?.coordinates) && address.location.coordinates.length >= 2
    ? { lng: address.location.coordinates[0], lat: address.location.coordinates[1] }
    : null;
  const loc = order?.customerLocation || order?.deliveryLocation || geo || {};
  const coords = Array.isArray(loc.coordinates) ? loc.coordinates : [];
  return {
    lat: num(loc.lat ?? loc.latitude ?? coords[1]),
    lng: num(loc.lng ?? loc.longitude ?? coords[0]),
  };
};

/**
 * A food order offer shown like a ride request: pickup (restaurant) and drop (customer) with live distances and a
 * slide-to-accept. Accepting runs the same accept flow as before; everything after that is unchanged.
 */
const FoodOrderRequestCard = ({ order, onAccept, onReject }) => {
  const riderLocation = useDeliveryStore((s) => s.riderLocation);
  const [secondsLeft, setSecondsLeft] = useState(OFFER_SECONDS);
  const [accepting, setAccepting] = useState(false);
  const orderKey = String(order?.orderId || order?._id || order?.orderMongoId || '');

  // A new offer starts a new 30 s window
  useEffect(() => {
    setSecondsLeft(OFFER_SECONDS);
    setAccepting(false);
  }, [orderKey]);

  useEffect(() => {
    if (accepting) return undefined;
    if (secondsLeft <= 0) {
      onReject(order);
      return undefined;
    }
    const timer = window.setTimeout(() => setSecondsLeft((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [secondsLeft, accepting, onReject, order]);

  const { pickupKm, dropKm } = useMemo(() => {
    const rest = readRestaurantPoint(order);
    const cus = readCustomerPoint(order);
    const riderLat = num(riderLocation?.lat ?? riderLocation?.latitude);
    const riderLng = num(riderLocation?.lng ?? riderLocation?.longitude);

    let toPickup = NaN;
    if ([riderLat, riderLng, rest.lat, rest.lng].every(Number.isFinite)) {
      toPickup = getHaversineDistance(riderLat, riderLng, rest.lat, rest.lng) / 1000;
    }
    if (!Number.isFinite(toPickup) || toPickup > 60) {
      const fromServer = num(order?.pickupDistanceKm ?? order?.distanceKm);
      toPickup = Number.isFinite(fromServer) ? fromServer : NaN;
    }

    let toDrop = NaN;
    if ([rest.lat, rest.lng, cus.lat, cus.lng].every(Number.isFinite)) {
      toDrop = getHaversineDistance(rest.lat, rest.lng, cus.lat, cus.lng) / 1000;
    }
    if (!Number.isFinite(toDrop) || toDrop > 80) {
      const fromPricing = num(order?.pricing?.deliveryFeeBreakdown?.distanceKm);
      toDrop = Number.isFinite(fromPricing) ? fromPricing : NaN;
    }
    return { pickupKm: toPickup, dropKm: toDrop };
  }, [order, riderLocation]);

  const earnings = useMemo(() => {
    const direct = Number(order?.riderEarning ?? order?.earnings ?? 0);
    if (direct > 0) return direct;
    const base = Number(
      order?.pricing?.riderDeliveryEarningAfterAdminCommission ??
      order?.pricing?.deliveryFee ??
      order?.deliveryFee ??
      order?.deliveryCharge ??
      order?.amounts?.riderShare ??
      order?.riderShare ??
      0,
    );
    const surge = Number(order?.pricing?.surgeAmount ?? order?.surgeAmount ?? 0);
    const tip = Number(order?.pricing?.deliveryPartnerTip ?? order?.deliveryPartnerTip ?? 0);
    return base + surge + tip;
  }, [order]);

  const orderTotal = Number(order?.total ?? order?.pricing?.total ?? 0);
  const method = String(order?.paymentMethod || order?.payment?.method || 'cash').toLowerCase();
  const paymentLabel = method === 'cash'
    ? `Cash on delivery · collect ₹${Math.round(orderTotal * 100) / 100}`
    : method === 'razorpay_qr'
      ? 'Online (QR) · no cash'
      : 'Prepaid (Online) · no cash to collect';
  const isCash = method === 'cash';

  const restaurantName =
    order?.restaurantName || order?.restaurant_name || order?.restaurantId?.restaurantName || order?.restaurantId?.name || 'Restaurant';
  const restaurantAddress =
    order?.restaurantAddress ||
    order?.restaurant_address ||
    order?.restaurantId?.location?.formattedAddress ||
    order?.restaurantId?.location?.address ||
    [order?.restaurantId?.addressLine1, order?.restaurantId?.area, order?.restaurantId?.city].filter(Boolean).join(', ') ||
    'Restaurant address';

  const customerAddress = useMemo(() => {
    const a = order?.deliveryAddress || {};
    const parts = [a.street, a.additionalDetails, a.city, a.state, a.zipCode].map((v) => String(v || '').trim()).filter(Boolean);
    return order?.customerAddress || order?.customer_address || (parts.length ? parts.join(', ') : 'Customer address');
  }, [order]);

  const handleAccept = async () => {
    setAccepting(true);
    try {
      await onAccept(order);
    } finally {
      setAccepting(false);
    }
  };

  return (
    <div className="rounded-2xl border-2 border-green-400 bg-white p-4 shadow-lg">
      <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
        Food · #{order?.orderId || ''}
      </span>
      <div className="mt-1 flex items-baseline justify-between">
        <div className="text-3xl font-extrabold text-gray-900">₹{Math.round(orderTotal * 100) / 100}</div>
        {earnings > 0 && <div className="text-xs font-semibold text-green-600">You earn ₹{Math.round(earnings * 100) / 100}</div>}
      </div>
      <div className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-bold ${isCash ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
        {paymentLabel}
      </div>

      <div className="mt-3 flex gap-3">
        <div className="flex flex-col items-center pt-2">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-900" />
          <span className="my-1 w-px flex-1 bg-gray-400" />
          <span className="h-0 w-0 border-x-[5px] border-t-[8px] border-x-transparent border-t-gray-900" />
        </div>
        <div className="flex-1 space-y-3 min-w-0">
          <div>
            <div className="text-lg font-bold text-gray-900">{formatKm(pickupKm)}</div>
            <div className="text-sm text-gray-600 line-clamp-2">
              <span className="font-semibold text-gray-800">{restaurantName}</span> - {restaurantAddress}
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">{formatKm(dropKm)}</div>
            <div className="text-sm text-gray-600 line-clamp-2">
              <span className="font-semibold text-gray-800">Drop</span> - {customerAddress}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <CountdownRing remainingMs={secondsLeft * 1000} totalMs={OFFER_SECONDS * 1000} onDecline={() => onReject(order)} />
        <button
          type="button"
          disabled={accepting}
          onClick={handleAccept}
          className="flex-1 h-12 rounded-xl bg-[#FFC107] text-base font-extrabold text-gray-900 shadow-sm active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {accepting ? 'Accepting...' : 'Accept'}
        </button>
      </div>
    </div>
  );
};

export default FoodOrderRequestCard;
