import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bike, Loader2, UtensilsCrossed } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { apiErrorOf, unwrap } from '@/modules/DeliveryV2/utils/rideModeSession';

/**
 * One panel: going online gives food orders AND ride / parcel requests. This switch lets the partner stop food orders and
 * keep only rides and parcels (and back). Hidden for partners who can not take rides.
 */
// The last answer is kept on the device: on a slow or dropped connection the switch still shows (and keeps working) instead
// of disappearing until the next successful request
const CACHE_KEY = 'delivery_ride_mode_food_toggle';
const readCache = () => {
  try {
    const cached = JSON.parse(localStorage.getItem(CACHE_KEY) || 'null');
    return cached && cached.eligible ? cached : null;
  } catch {
    return null;
  }
};

const FoodOrdersToggle = ({ hasActiveOrder }) => {
  const [state, setState] = useState(readCache);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const fresh = unwrap(await deliveryAPI.getRideMode());
        setState(fresh);
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify({ eligible: Boolean(fresh?.eligible), foodOrdersEnabled: fresh?.foodOrdersEnabled !== false }));
        } catch { /* storage unavailable */ }
        return;
      } catch {
        // a slow connection fails the first try now and then: try again before giving up
        if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
      }
    }
  }, []);

  useEffect(() => {
    load();
    window.addEventListener('focus', load);
    return () => window.removeEventListener('focus', load);
  }, [load]);

  if (!state?.eligible) return null;

  const foodOn = state.foodOrdersEnabled !== false;

  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = unwrap(await deliveryAPI.setFoodOrders(!foodOn));
      setState((prev) => ({ ...prev, foodOrdersEnabled: result?.foodOrdersEnabled !== false }));
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify({ eligible: true, foodOrdersEnabled: result?.foodOrdersEnabled !== false }));
      } catch { /* storage unavailable */ }
      toast.success(result?.foodOrdersEnabled === false ? 'Food orders off. You will get rides and parcels only.' : 'Food orders on.');
    } catch (error) {
      toast.error(apiErrorOf(error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-2 flex justify-center">
      <button
        type="button"
        onClick={toggle}
        disabled={busy}
        aria-pressed={foodOn}
        className="flex items-center gap-2 rounded-full bg-[#121212] pl-1.5 pr-2.5 py-1.5 text-white shadow-xl shadow-black/20 border border-white/10 active:scale-95 transition-all disabled:opacity-60"
      >
        <span className={`flex h-7 w-7 items-center justify-center rounded-full ${foodOn ? 'bg-emerald-500' : 'bg-white/10'}`}>
          {busy ? <Loader2 size={13} strokeWidth={2.5} className="animate-spin" /> : <UtensilsCrossed size={13} strokeWidth={2.5} />}
        </span>
        <span className="text-[10px] font-black uppercase tracking-widest">
          Food orders {foodOn ? 'on' : 'off'}
        </span>
        <span className={`relative h-5 w-9 rounded-full transition-colors ${foodOn ? 'bg-emerald-500' : 'bg-white/20'}`}>
          <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${foodOn ? 'left-[18px]' : 'left-0.5'}`} />
        </span>
        <Bike size={13} className="text-[#FFC107]" aria-label="Rides and parcels stay on" />
      </button>
      {hasActiveOrder && <span className="sr-only">A food order is in progress</span>}
    </div>
  );
};

export default FoodOrdersToggle;
