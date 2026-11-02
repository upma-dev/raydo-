import React, { useCallback, useEffect, useState } from 'react';
import { Target } from 'lucide-react';
import { toast } from 'sonner';
import { deliveryAPI } from '@food/api';

const REFRESH_MS = 60000;

const readOffer = (response) =>
  response?.data?.data?.activeOffer || response?.data?.activeOffer || null;

/**
 * Admin-set incentive on top of the screen: "complete N orders, earn Rs X", with a live counter. It moves the moment an order
 * is delivered (the server pushes `earning_addon_progress`), and a toast shows when the bonus (or a referral bonus) lands.
 */
const IncentiveProgressStrip = () => {
  const [offer, setOffer] = useState(null);

  const load = useCallback(async () => {
    try {
      const response = await deliveryAPI.getActiveEarningAddons();
      setOffer(readOffer(response));
    } catch {
      // keep what is on screen
    }
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    const onProgress = (event) => {
      const next = event?.detail?.activeOffer;
      if (next !== undefined) setOffer(next || null);
      else load();
    };
    const onCredited = (event) => {
      const amount = Number(event?.detail?.amount || 0);
      toast.success(amount > 0 ? `Incentive credited: ₹${amount} added to your pocket` : 'Incentive credited');
      load();
    };
    const onReferral = (event) => {
      const message = event?.detail?.message || 'Referral bonus added to your pocket';
      toast.success(message);
    };
    window.addEventListener('earning-addon-progress', onProgress);
    window.addEventListener('earning-addon-credited', onCredited);
    window.addEventListener('referral-credited', onReferral);
    window.addEventListener('focus', load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('earning-addon-progress', onProgress);
      window.removeEventListener('earning-addon-credited', onCredited);
      window.removeEventListener('referral-credited', onReferral);
      window.removeEventListener('focus', load);
    };
  }, [load]);

  if (!offer || !(Number(offer.targetOrders) > 0)) return null;

  const target = Number(offer.targetOrders);
  const current = Math.min(Number(offer.currentOrders || 0), target);
  const percent = Math.round((current / target) * 100);
  const done = current >= target;

  return (
    <div className="px-4 pt-2">
      <div className="rounded-2xl bg-white/10 border border-white/10 px-3.5 py-2.5 text-white">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <Target className="h-4 w-4 shrink-0 text-[#FFC107]" />
            <span className="truncate text-[11px] font-bold">
              {done ? 'Bonus earned' : `Complete ${target} orders, earn ₹${Number(offer.targetAmount || 0)}`}
            </span>
          </div>
          <span className="shrink-0 text-xs font-extrabold text-[#FFC107]">{current}/{target}</span>
        </div>
        <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-white/15">
          <div className="h-full rounded-full bg-[#FFC107] transition-all duration-500" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </div>
  );
};

export default IncentiveProgressStrip;
