import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Bike, Loader2, UtensilsCrossed } from 'lucide-react';
import { deliveryAPI } from '@food/api';
import { apiErrorOf, unwrap } from '@/modules/DeliveryV2/utils/rideModeSession';

/**
 * One panel: going online gives food orders AND ride / parcel requests. This switch lets the partner stop food orders and
 * keep only rides and parcels (and back). Hidden for partners who can not take rides.
 */
const FoodOrdersToggle = ({ hasActiveOrder }) => {
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      setState(unwrap(await deliveryAPI.getRideMode()));
    } catch {
      /* keep what is on screen */
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
