import React, { useCallback, useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { toast } from 'sonner';
import { Bike, Package, XCircle } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { socketService } from '@/modules/Taxi/shared/api/socket';
import { apiErrorOf, openRideApp, startRideSession, unwrap } from '@/modules/DeliveryV2/utils/rideModeSession';

const RIDE_ACCENT = '#FFC107';

/**
 * Food | Ride & Parcel switch on the delivery home. Only one mode is active at a time: switching to rides takes the
 * partner offline for food orders and opens the ride screens; the ride screens have the switch back.
 */
const CACHE_KEY = 'rideModeCard';
// Last known state: the card is drawn right away on open instead of popping in after the request (no layout jump)
const readCache = () => {
  try {
    return JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
  } catch {
    return null;
  }
};
const writeCache = (value) => {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(value));
  } catch { /* storage blocked: the card just loads from the server */ }
};

const RideModeSwitch = ({ isOnline, hasActiveOrder, riderLocation, onLeaveFood }) => {
  const navigate = useNavigate();
  const [state, setState] = useState(readCache);
  const [loaded, setLoaded] = useState(false);
  const [isSwitching, setIsSwitching] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const load = useCallback(async () => {
    try {
      const fresh = unwrap(await deliveryAPI.getRideMode());
      setState(fresh);
      writeCache({ eligible: fresh?.eligible, status: fresh?.status, activeMode: fresh?.activeMode });
    } catch {
      /* keep what is on screen */
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  const handleError = (error) => {
    const { code, message } = apiErrorOf(error);
    if (code === 'RIDE_WALLET_DUES') {
      toast.error(message, {
        duration: 8000,
        action: { label: 'Add money', onClick: () => openRideApp(navigate, '/taxi/driver/wallet').catch(() => {}) },
      });
      return;
    }
    if (code === 'DRIVING_LICENSE_REQUIRED' || code === 'VEHICLE_NUMBER_REQUIRED') {
      toast.error(message, { duration: 8000, action: { label: 'Open profile', onClick: () => navigate('/food/delivery/profile/documents') } });
      return;
    }
    toast.error(message);
  };

  const switchToRides = async () => {
    setConfirmOpen(false);
    setIsSwitching(true);
    try {
      const lat = Number(riderLocation?.lat ?? riderLocation?.latitude);
      const lng = Number(riderLocation?.lng ?? riderLocation?.longitude);
      const result = unwrap(await deliveryAPI.switchRideMode('taxi', Number.isFinite(lat) && Number.isFinite(lng) ? { latitude: lat, longitude: lng } : {}));
      startRideSession(result.taxiToken);
      writeCache({ eligible: true, status: 'approved', activeMode: 'taxi' });
      onLeaveFood?.();
      toast.success('Ride & Parcel mode on. Go online to get ride requests.');
      navigate('/taxi/driver/home');
    } catch (error) {
      handleError(error);
      load();
    } finally {
      setIsSwitching(false);
    }
  };

  const switchToFood = async () => {
    setIsSwitching(true);
    try {
      await deliveryAPI.switchRideMode('food');
      socketService.disconnect();
      toast.success('Back on Food delivery. Go online to get orders.');
      await load();
    } catch (error) {
      handleError(error);
    } finally {
      setIsSwitching(false);
    }
  };

  const onRideTap = () => {
    if (hasActiveOrder) {
      toast.error('Finish your current food order before switching to Ride & Parcel.');
      return;
    }
    if (isOnline) setConfirmOpen(true);
    else switchToRides();
  };

  // Loaded and not an approved delivery partner: nothing to show
  if (loaded && (!state || !state.eligible)) return null;

  const status = state?.status || 'none';
  const approved = status === 'approved';
  const inRideMode = approved && state?.activeMode === 'taxi';
  const needsAttention = status === 'rejected' || status === 'blocked';

  const copy = {
    none: { title: 'Rides & Parcels', sub: 'Switch on to take bike rides' },
    pending: { title: 'Rides & Parcels', sub: 'Switch on to take bike rides' },
    rejected: { title: 'Ride & Parcel: rejected', sub: 'Tap to see why and apply again' },
    blocked: { title: 'Ride account blocked', sub: 'Contact support for help' },
    approved: inRideMode
      ? { title: 'Ride & Parcel mode', sub: 'Taking rides & parcels' }
      : { title: 'Rides & Parcels', sub: 'Switch on to take bike rides' },
  }[status] || { title: 'Rides & Parcels', sub: '' };

  // Same toggle as Online / Offline, in blue. No application: the first switch registers the partner's bike for rides.
  const onToggle = () => {
    if (!state) return;
    if (needsAttention) return navigate('/food/delivery/ride-mode');
    return inRideMode ? switchToFood() : onRideTap();
  };

  return (
    <>
      <div className="mx-4 mt-2 flex items-center gap-3 rounded-2xl bg-white/5 border border-white/10 px-3.5 py-2.5">
        <button
          type="button"
          onClick={() => (approved || needsAttention ? navigate('/food/delivery/ride-mode') : onToggle())}
          className="flex flex-1 min-w-0 items-center gap-3 text-left"
        >
          <span className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
            {needsAttention ? <XCircle className="w-4 h-4 text-rose-400" />
                : <Bike className="w-4 h-4" style={{ color: RIDE_ACCENT }} />}
          </span>
          <span className="flex-1 min-w-0">
            <span className="block text-white text-[11px] font-black uppercase tracking-wider truncate">{copy.title}</span>
            <span className="block text-gray-400 text-[10px] font-bold truncate">{copy.sub}</span>
          </span>
        </button>

        <button
          type="button"
          disabled={isSwitching || !state}
          onClick={onToggle}
          aria-label={inRideMode ? 'Switch to Food delivery' : 'Switch to Ride and Parcel'}
          className={`relative w-[92px] h-8 rounded-full p-1 transition-all duration-500 flex items-center shrink-0 ${inRideMode ? 'shadow-lg shadow-blue-500/30' : ''} ${isSwitching ? 'opacity-70' : ''}`}
          style={{ background: inRideMode ? '#2563EB' : 'rgba(37,99,235,0.35)' }}
        >
          <div className="flex items-center justify-between w-full px-2 text-[8.5px] font-black uppercase tracking-widest text-white">
            <span>{inRideMode ? 'Ride' : ''}</span>
            <span>{!inRideMode ? 'Food' : ''}</span>
          </div>
          <motion.div animate={{ x: inRideMode ? 59 : 0 }} className="absolute left-1 w-6 h-6 bg-white rounded-full shadow-sm" />
        </button>
      </div>

      {/* Portal: the header has backdrop-blur, which would trap and clip fixed children */}
      {createPortal(
      <AnimatePresence>
        {confirmOpen && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[1000] bg-black/60 backdrop-blur-sm"
              onClick={() => setConfirmOpen(false)}
            />
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '100%' }}
              transition={{ type: 'spring', damping: 30, stiffness: 300 }}
              className="fixed bottom-0 inset-x-0 z-[1001] mx-auto max-w-md rounded-t-[28px] bg-white p-6 pb-[calc(2rem+env(safe-area-inset-bottom))]"
            >
              <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-4" style={{ background: `${RIDE_ACCENT}33` }}>
                <Package className="w-6 h-6 text-amber-600" />
              </div>
              <h3 className="text-lg font-black text-gray-900">Switch to Ride & Parcel?</h3>
              <p className="mt-1.5 text-sm font-medium text-gray-500 leading-relaxed">
                You will go offline for food orders and start getting ride and parcel requests instead. You can switch back any time you are not on a trip.
              </p>
              <div className="mt-6 grid grid-cols-2 gap-3">
                <button type="button" onClick={() => setConfirmOpen(false)} className="h-12 rounded-2xl border border-gray-200 bg-gray-50 text-xs font-black uppercase tracking-wider text-gray-500">
                  Stay on Food
                </button>
                <button type="button" onClick={switchToRides} className="h-12 rounded-2xl text-xs font-black uppercase tracking-wider text-black shadow-lg" style={{ background: RIDE_ACCENT }}>
                  Switch
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>,
        document.body,
      )}
    </>
  );
};

export default RideModeSwitch;
