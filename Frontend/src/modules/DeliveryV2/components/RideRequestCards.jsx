import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import CountdownRing from '@/modules/DeliveryV2/components/CountdownRing';
import FoodOrderRequestCard from '@/modules/DeliveryV2/components/FoodOrderRequestCard';
import api from '@/modules/Taxi/shared/api/axiosInstance';
import { socketService } from '@/modules/Taxi/shared/api/socket';
import { getLocalDriverToken, getDriverPendingDispatch } from '@/modules/Taxi/modules/driver/services/registrationService';
import {
  playRideRequestAlertSound,
  stopRideRequestAlertSound,
  unlockRideRequestAlertSound,
} from '@/modules/Taxi/modules/driver/utils/rideRequestAlertSound';

const DEFAULT_WINDOW_SECONDS = 30;

const unwrap = (response) => response?.data?.data || response?.data || response;

const toRad = (deg) => (deg * Math.PI) / 180;
const haversineKm = (lat1, lng1, lat2, lng2) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
};

const formatKm = (km) => {
  if (!Number.isFinite(km)) return '--';
  if (km < 1) return `${Math.max(50, Math.round((km * 1000) / 10) * 10)} m`;
  return `${km.toFixed(km >= 10 ? 0 : 1)} km`;
};

const readPoint = (point) => {
  const [lng, lat] = point?.coordinates || [];
  return Number.isFinite(Number(lat)) && Number.isFinite(Number(lng)) ? { lat: Number(lat), lng: Number(lng) } : null;
};

const vehicleLabel = (job) => {
  if (String(job.serviceType || job.type).toLowerCase() === 'parcel') return 'Parcel';
  if (String(job.serviceType || job.type).toLowerCase() === 'intercity') return 'Intercity';
  const icon = String(job.vehicleIconType || '').toLowerCase();
  if (icon.includes('bike') || icon.includes('two')) return 'Bike';
  if (icon.includes('auto')) return 'Auto';
  if (icon.includes('car') || icon.includes('taxi') || icon.includes('sedan') || icon.includes('suv')) return 'Car';
  return icon ? icon.charAt(0).toUpperCase() + icon.slice(1) : 'Ride';
};

const expiryMs = (job) => {
  const at = job.requestExpiresAt ? new Date(job.requestExpiresAt).getTime() : NaN;
  if (Number.isFinite(at)) return at;
  return Date.now() + Number(job.acceptRejectDurationSeconds || job.expiresInSeconds || DEFAULT_WINDOW_SECONDS) * 1000;
};

const normalize = (job) => ({
  ...job,
  rideId: String(job.rideId),
  expiresAt: expiryMs(job),
  totalMs: Math.max(5000, expiryMs(job) - Date.now()),
});


const RequestCard = ({ job, now, driverPos, onAccept, onDecline, accepting }) => {
  const pickup = readPoint(job.pickupLocation);
  const drop = readPoint(job.dropLocation);
  const toPickupKm = pickup && driverPos ? haversineKm(driverPos.lat, driverPos.lng, pickup.lat, pickup.lng) : NaN;
  const tripKm = Number(job.estimatedDistanceMeters) > 0
    ? Number(job.estimatedDistanceMeters) / 1000
    : pickup && drop ? haversineKm(pickup.lat, pickup.lng, drop.lat, drop.lng) : NaN;
  const remaining = Math.max(0, job.expiresAt - now);
  const isCashPayment = String(job.paymentMethod || 'cash').toLowerCase().includes('cash');

  return (
    <div className="rounded-2xl border-2 border-green-400 bg-white p-4 shadow-lg">
      <span className="inline-block rounded-full bg-gray-100 px-3 py-1 text-xs font-semibold text-gray-700">
        {vehicleLabel(job)}
      </span>
      <div className="mt-1 flex items-baseline justify-between">
        <div>
          <div className="text-3xl font-extrabold text-gray-900">
            ₹{job.estimatedDriverEarning != null ? Number(job.estimatedDriverEarning) : Number(job.fare || 0)}
          </div>
          {job.estimatedDriverEarning != null && (
            <div className="text-[11px] font-semibold text-green-600">You earn · trip fare ₹{Number(job.fare || 0)}</div>
          )}
        </div>
      </div>
      <div className={`mt-1 inline-block rounded-md px-2 py-0.5 text-xs font-bold ${isCashPayment ? 'bg-amber-100 text-amber-800' : 'bg-green-100 text-green-700'}`}>
        {isCashPayment ? `Cash · collect ₹${Number(job.fare || 0)}` : 'Prepaid (Online) · no cash to collect'}
      </div>

      <div className="mt-3 flex gap-3">
        <div className="flex flex-col items-center pt-2">
          <span className="h-2.5 w-2.5 rounded-full bg-gray-900" />
          <span className="my-1 w-px flex-1 bg-gray-400" />
          <span className="h-0 w-0 border-x-[5px] border-t-[8px] border-x-transparent border-t-gray-900" />
        </div>
        <div className="flex-1 space-y-3 min-w-0">
          <div>
            <div className="text-lg font-bold text-gray-900">{formatKm(toPickupKm)}</div>
            <div className="text-sm text-gray-600 line-clamp-2">
              <span className="font-semibold text-gray-800">Pickup</span> - {job.pickupAddress || 'Pickup location'}
            </div>
          </div>
          <div>
            <div className="text-lg font-bold text-gray-900">{formatKm(tripKm)}</div>
            <div className="text-sm text-gray-600 line-clamp-2">
              <span className="font-semibold text-gray-800">Drop</span> - {job.dropAddress || 'Drop location'}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex items-center gap-3">
        <CountdownRing remainingMs={remaining} totalMs={job.totalMs} onDecline={() => onDecline(job)} />
        <button
          type="button"
          disabled={accepting}
          onClick={() => onAccept(job)}
          className="flex-1 h-12 rounded-xl bg-[#FFC107] text-base font-extrabold text-gray-900 shadow-sm active:scale-[0.98] transition-transform disabled:opacity-60"
        >
          {accepting ? 'Accepting...' : 'Accept'}
        </button>
      </div>
    </div>
  );
};

/**
 * Ride, bike and parcel requests shown as cards inside the delivery partner screen (no full-screen popup): several can
 * be listed together, each with live distance to pickup, trip distance and a slide-to-accept.
 */
const RideRequestCards = ({ inline = false, foodOrder = null, onFoodAccept, onFoodReject, ridesDisabled = false }) => {
  const navigate = useNavigate();
  const [requests, setRequests] = useState([]);
  const [acceptingId, setAcceptingId] = useState('');
  const [now, setNow] = useState(Date.now());
  const acceptingRef = useRef('');
  const requestsRef = useRef([]);
  const riderLocation = useDeliveryStore((s) => s.riderLocation);

  const driverPos = useMemo(() => {
    const lat = Number(riderLocation?.lat ?? riderLocation?.latitude);
    const lng = Number(riderLocation?.lng ?? riderLocation?.longitude);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }, [riderLocation]);

  useEffect(() => {
    requestsRef.current = requests;
  }, [requests]);

  useEffect(() => {
    const unlock = () => unlockRideRequestAlertSound();
    window.addEventListener('pointerdown', unlock, { passive: true });
    return () => window.removeEventListener('pointerdown', unlock);
  }, []);

  // The Orders tab badge follows the number of waiting requests
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('ride-requests-count', { detail: requests.length + (foodOrder ? 1 : 0) }));
  }, [requests.length, foodOrder]);
  useEffect(() => () => window.dispatchEvent(new CustomEvent('ride-requests-count', { detail: 0 })), []);

  // Ring while at least one request is waiting
  useEffect(() => {
    if (requests.length > 0) playRideRequestAlertSound();
    else stopRideRequestAlertSound();
  }, [requests.length]);
  useEffect(() => () => stopRideRequestAlertSound(), []);

  // Countdown tick; expired requests drop off and are reported to the server as timed out
  useEffect(() => {
    if (requests.length === 0) return undefined;
    const timer = window.setInterval(() => {
      const t = Date.now();
      setNow(t);
      const expired = requestsRef.current.filter((job) => job.expiresAt <= t && job.rideId !== acceptingRef.current);
      if (expired.length > 0) {
        expired.forEach((job) => socketService.emit('rejectRide', { rideId: job.rideId, reason: 'timeout' }));
        setRequests((list) => list.filter((job) => !expired.some((e) => e.rideId === job.rideId)));
      }
    }, 500);
    return () => window.clearInterval(timer);
  }, [requests.length]);

  const addRequest = useCallback((data) => {
    if (!data?.rideId) return;
    const job = normalize(data);
    setRequests((list) => (list.some((item) => item.rideId === job.rideId)
      ? list.map((item) => (item.rideId === job.rideId ? { ...item, ...job } : item))
      : [...list, job]));
  }, []);

  // A request opened from a push notification is not on the socket yet: fetch it
  useEffect(() => {
    let active = true;
    const check = async () => {
      if (ridesDisabled || !getLocalDriverToken()) return;
      try {
        const params = new URLSearchParams(window.location.search);
        const rideId = params.get('rideId') || params.get('openRideId') || '';
        const data = unwrap(await getDriverPendingDispatch(rideId ? { rideId } : {}));
        if (active && data?.rideId) addRequest(data);
      } catch {
        // nothing pending
      }
    };
    check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    window.addEventListener('focus', check);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      active = false;
      window.removeEventListener('focus', check);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [addRequest, ridesDisabled]);

  useEffect(() => {
    if (ridesDisabled) return undefined;
    const socket = socketService.connect({ role: 'driver' });
    if (!socket) return undefined;

    const onClosed = (payload = {}) => {
      const { rideId } = payload;
      if (payload.reason === 'user-cancelled' && rideId && requestsRef.current.some((j) => j.rideId === String(rideId))) {
        toast.error('Cancelled by customer');
      }
      if (acceptingRef.current && acceptingRef.current === String(rideId)) return;
      setRequests((list) => list.filter((job) => job.rideId !== String(rideId)));
    };

    const onError = ({ message } = {}) => {
      if (String(message || '').toLowerCase().includes('no longer available') && acceptingRef.current) {
        const failed = acceptingRef.current;
        setRequests((list) => list.filter((job) => job.rideId !== failed));
      }
      acceptingRef.current = '';
      setAcceptingId('');
    };

    const onAccepted = async (payload) => {
      if (!payload?.rideId || String(payload.rideId) !== acceptingRef.current) return;
      const job = requestsRef.current.find((item) => item.rideId === String(payload.rideId));
      const type = String(job?.serviceType || job?.type || 'ride').toLowerCase() === 'parcel' ? 'parcel' : 'ride';
      let current = null;
      try {
        const token = getLocalDriverToken();
        current = unwrap(await api.get(type === 'parcel' ? '/deliveries/active/me' : '/rides/active/me', {
          ...(token ? { headers: { Authorization: `Bearer ${token}` } } : {}),
          params: { t: Date.now(), type },
        }));
      } catch {
        current = null;
      }
      // Every other pending card is released: the partner is now on this trip
      requestsRef.current.forEach((other) => {
        if (other.rideId !== String(payload.rideId)) socketService.emit('rejectRide', { rideId: other.rideId, reason: 'rejected' });
      });
      setRequests([]);
      acceptingRef.current = '';
      setAcceptingId('');
      stopRideRequestAlertSound();
      navigate('/taxi/driver/active-trip', {
        state: {
          type,
          rideId: current?.rideId || payload.rideId,
          otp: current?.otp || payload?.otp || job?.otp || '',
          request: {
            ...job,
            rideId: current?.rideId || payload.rideId,
            raw: current || { ...(job || {}), status: payload.status, liveStatus: payload.liveStatus },
          },
        },
      });
    };

    socketService.on('rideRequest', addRequest);
    socketService.on('rideRequestClosed', onClosed);
    socketService.on('errorMessage', onError);
    socketService.on('rideAccepted', onAccepted);
    return () => {
      socketService.off('rideRequest', addRequest);
      socketService.off('rideRequestClosed', onClosed);
      socketService.off('errorMessage', onError);
      socketService.off('rideAccepted', onAccepted);
    };
  }, [addRequest, navigate, ridesDisabled]);

  const handleAccept = useCallback((job) => {
    if (acceptingRef.current) return Promise.resolve();
    acceptingRef.current = job.rideId;
    setAcceptingId(job.rideId);
    stopRideRequestAlertSound();
    socketService.emit('acceptRide', { rideId: job.rideId });
    return Promise.resolve();
  }, []);

  const handleDecline = useCallback((job) => {
    socketService.emit('rejectRide', { rideId: job.rideId, reason: 'rejected' });
    setRequests((list) => list.filter((item) => item.rideId !== job.rideId));
  }, []);

  if (requests.length === 0 && !foodOrder && !inline) return null;

  return (
    <div className={inline
      ? "fixed inset-x-0 top-[120px] bottom-[76px] z-[150] overflow-y-auto bg-gray-50 px-3 py-3"
      : "fixed inset-x-0 bottom-20 z-[60] px-3 pointer-events-none"}>
      <div className={inline
        ? "mx-auto max-w-md space-y-3 pb-4"
        : "pointer-events-auto mx-auto max-h-[65vh] max-w-md space-y-3 overflow-y-auto pb-2"}>
        {inline && (
          <div className="flex items-center justify-between px-1 pt-1">
            <div className="text-xl font-extrabold text-gray-900">
              {requests.length + (foodOrder ? 1 : 0)} {requests.length + (foodOrder ? 1 : 0) === 1 ? 'Order' : 'Orders'}
            </div>
          </div>
        )}
        {foodOrder && onFoodAccept && onFoodReject && (
          <FoodOrderRequestCard
            key={String(foodOrder?.orderId || foodOrder?._id || foodOrder?.orderMongoId || 'food')}
            order={foodOrder}
            onAccept={onFoodAccept}
            onReject={onFoodReject}
          />
        )}
        {requests.length === 0 && !foodOrder ? (
          <div className="pt-16 text-center text-sm font-medium text-gray-500">
            No requests right now. New bike, ride and parcel requests will show here, and the first partner to accept gets the trip.
          </div>
        ) : requests.length === 0 ? null : (
        <div className="px-1 text-sm font-bold text-gray-900 drop-shadow">
          {requests.length} {requests.length === 1 ? "new request" : "new requests"}
        </div>
        )}
        {requests.map((job) => (
          <RequestCard
            key={job.rideId}
            job={job}
            now={now}
            driverPos={driverPos}
            accepting={acceptingId === job.rideId}
            onAccept={handleAccept}
            onDecline={handleDecline}
          />
        ))}
      </div>
    </div>
  );
};

export default RideRequestCards;
