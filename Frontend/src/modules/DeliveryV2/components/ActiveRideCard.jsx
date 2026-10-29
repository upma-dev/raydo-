import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bike, ChevronRight, Package } from 'lucide-react';
import { fetchActiveRide, openActiveRide } from '@/modules/DeliveryV2/utils/rideModeSession';

const POLL_MS = 15000;

/**
 * One panel: a ride / parcel the partner already accepted stays visible on the delivery home as a card, so leaving the ride
 * screen (Back, a phone call, a refresh) never loses the running trip. Tapping it opens the trip screen again.
 */
const ActiveRideCard = () => {
  const navigate = useNavigate();
  const [ride, setRide] = useState(null);

  const check = useCallback(async () => {
    const found = await fetchActiveRide();
    // undefined = could not check (slow connection): keep the card that is on screen
    if (found !== undefined) setRide(found);
  }, []);

  useEffect(() => {
    check();
    const timer = window.setInterval(check, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') check();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
    };
  }, [check]);

  if (!ride) return null;

  const isParcel = String(ride.serviceType || '').toLowerCase() === 'parcel' || String(ride.serviceType || '').toLowerCase() === 'delivery';
  const Icon = isParcel ? Package : Bike;

  return (
    <div className="px-4 pt-2">
      <button
        type="button"
        onClick={() => openActiveRide(navigate, ride)}
        className="w-full flex items-center gap-3 rounded-2xl bg-[#FFC107] px-3.5 py-3 text-left text-black shadow-xl shadow-black/20 active:scale-[0.99] transition-transform"
      >
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-black/85 text-[#FFC107]">
          <Icon size={17} strokeWidth={2.5} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[11px] font-black uppercase tracking-widest leading-none">
            {isParcel ? 'Parcel trip in progress' : 'Ride in progress'}
          </span>
          <span className="mt-1 block truncate text-[11px] font-semibold opacity-75">
            Tap to open the trip
          </span>
        </span>
        <ChevronRight size={18} strokeWidth={3} className="shrink-0" />
      </button>
    </div>
  );
};

export default ActiveRideCard;
