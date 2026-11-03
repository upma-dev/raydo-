import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  AlertCircle, ArrowLeft, BadgePercent, Bike, CheckCircle2, Loader2, Package, RefreshCw, UtensilsCrossed, Wallet,
} from 'lucide-react';
import { deliveryAPI } from '@food/api';
import useDeliveryBackNavigation from '../hooks/useDeliveryBackNavigation';
import { apiErrorOf, unwrap } from '../utils/rideModeSession';

const money = (value) => `₹${Number(value || 0).toFixed(Number(value || 0) % 1 === 0 ? 0 : 2)}`;
const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

const SERVICE_META = {
  food: { icon: UtensilsCrossed, tone: 'bg-orange-50 text-orange-600', short: 'Food orders' },
  ride: { icon: Bike, tone: 'bg-sky-50 text-sky-600', short: 'Two-wheeler rides' },
  parcel: { icon: Package, tone: 'bg-violet-50 text-violet-600', short: 'Parcels' },
};

const modeText = (service, mode) => {
  if (mode === 'subscriptionOnly') {
    return service === 'food'
      ? 'You need a running pass to receive and accept food orders.'
      : `You need a running pass to get and accept ${service === 'ride' ? 'rides' : 'parcels'}. No commission is charged while it runs.`;
  }
  if (mode === 'both') {
    return `A pass is optional. With a running pass no commission is charged on your ${service === 'ride' ? 'rides' : 'parcels'}; without one the usual commission applies.`;
  }
  return 'Passes are not needed for this right now.';
};

/**
 * Subscription - passes for food orders, two-wheeler rides and parcels. Which of them need a pass, and the prices, are set
 * by admin (Food admin > Deliveryman > Delivery Subscription). A pass is bought from the Pocket balance.
 */
const SubscriptionV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [buyingId, setBuyingId] = useState('');

  const load = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      setState(unwrap(await deliveryAPI.getSubscriptions()));
    } catch (err) {
      setError(apiErrorOf(err).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const buy = async (service, plan) => {
    if (buyingId) return;
    const running = Boolean(service.current);
    const ok = window.confirm(
      `Buy "${plan.name}" for ${money(plan.amount)}?\n\n${money(plan.amount)} will be taken from your Pocket (balance ${money(state?.pocketBalance)}).${
        running ? '\nYour current pass keeps running; this one starts when it ends.' : ''
      }`,
    );
    if (!ok) return;
    try {
      setBuyingId(plan.id);
      const response = await deliveryAPI.purchaseSubscription(plan.id);
      toast.success(response?.data?.message || 'Subscription activated');
      await load();
    } catch (err) {
      toast.error(apiErrorOf(err).message);
    } finally {
      setBuyingId('');
    }
  };

  const visible = (state?.services || []).filter((item) => item.enabled);

  return (
    <div className="min-h-screen bg-gray-50 pb-24 font-sans text-gray-900">
      <div className="sticky top-0 z-20 flex items-center gap-3 bg-white px-4 py-4 shadow-sm">
        <button type="button" onClick={goBack} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-gray-100 bg-white shadow-sm">
          <ArrowLeft size={18} />
        </button>
        <h1 className="flex-1 text-lg font-black tracking-tight">Subscription</h1>
        <button type="button" onClick={load} aria-label="Refresh" className="flex h-10 w-10 items-center justify-center rounded-full text-gray-500">
          <RefreshCw size={16} />
        </button>
      </div>

      <div className="mx-auto max-w-md space-y-4 px-4 pt-4">
        {loading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-gray-400" /></div>
        ) : error ? (
          <div className="rounded-2xl border border-rose-100 bg-white p-6 text-center shadow-sm">
            <AlertCircle className="mx-auto mb-2 h-8 w-8 text-rose-500" />
            <p className="text-sm font-bold">{error}</p>
            <button type="button" onClick={load} className="mt-3 rounded-xl bg-black px-4 py-2 text-xs font-bold text-white">Try again</button>
          </div>
        ) : !state?.enabled ? (
          <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
            <BadgePercent className="mx-auto mb-2 h-8 w-8 text-gray-400" />
            <p className="text-sm font-bold">Subscriptions are not available right now</p>
            <p className="mt-1 text-xs font-semibold text-gray-500">You do not need a pass. The usual earnings and commission apply.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between rounded-2xl bg-white px-4 py-3 shadow-sm">
              <span className="flex items-center gap-2 text-xs font-bold text-gray-600"><Wallet size={14} /> Pocket balance</span>
              <span className="text-sm font-black">{money(state.pocketBalance)}</span>
            </div>

            {visible.map((service) => {
              const meta = SERVICE_META[service.service] || SERVICE_META.food;
              const Icon = meta.icon;
              return (
                <section key={service.service} className="overflow-hidden rounded-2xl bg-white shadow-sm">
                  <div className="flex items-start gap-3 p-4">
                    <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${meta.tone}`}><Icon size={20} /></div>
                    <div className="min-w-0">
                      <p className="text-sm font-black">{service.label}</p>
                      <p className="mt-0.5 text-[11px] font-semibold leading-relaxed text-gray-500">{modeText(service.service, service.mode)}</p>
                    </div>
                  </div>

                  {service.current ? (
                    <div className="mx-4 mb-3 rounded-xl bg-emerald-600 p-3 text-white">
                      <div className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-widest text-emerald-100"><CheckCircle2 size={13} /> Running pass</div>
                      <p className="mt-0.5 text-sm font-black">{service.current.name}</p>
                      <p className="text-[11px] font-semibold text-emerald-100">
                        {service.current.daysLeft} day{service.current.daysLeft === 1 ? '' : 's'} left, valid till {formatDate(service.current.expiresAt)}
                      </p>
                      {service.commissionWaived && <p className="mt-1 text-[11px] font-bold text-emerald-50">No commission is charged.</p>}
                    </div>
                  ) : (
                    <div className={`mx-4 mb-3 rounded-xl px-3 py-2 text-xs font-bold ${service.required ? 'border border-amber-200 bg-amber-50 text-amber-800' : 'bg-gray-50 text-gray-600'}`}>
                      {service.required ? `No running pass. Buy one to get ${meta.short.toLowerCase()}.` : 'No running pass. The usual commission applies.'}
                    </div>
                  )}

                  {service.upcoming?.length > 0 && (
                    <p className="mx-4 mb-3 text-[11px] font-semibold text-sky-700">
                      Next: {service.upcoming[0].name} starts {formatDate(service.upcoming[0].startedAt)}
                    </p>
                  )}

                  {service.needsRideProfile ? (
                    <div className="border-t border-gray-50 p-4">
                      <p className="text-xs font-semibold text-gray-600">Join Ride &amp; Parcel first to buy a {service.service === 'ride' ? 'ride' : 'parcel'} pass.</p>
                      <button type="button" onClick={() => navigate('/food/delivery/ride-mode')} className="mt-2 rounded-xl bg-black px-4 py-2 text-xs font-bold text-white">
                        Open Ride &amp; Parcel
                      </button>
                    </div>
                  ) : service.plans.length === 0 ? (
                    <p className="border-t border-gray-50 p-4 text-xs font-semibold text-gray-400">No plans are on sale right now.</p>
                  ) : (
                    <div className="divide-y divide-gray-50 border-t border-gray-50">
                      {service.plans.map((plan) => (
                        <div key={plan.id} className="flex items-center justify-between gap-3 p-4">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-bold">{plan.name}</p>
                            <p className="text-[11px] font-semibold text-gray-400">{plan.duration} day{plan.duration === 1 ? '' : 's'}{plan.description ? ` · ${plan.description}` : ''}</p>
                          </div>
                          <button
                            type="button"
                            disabled={Boolean(buyingId)}
                            onClick={() => buy(service, plan)}
                            className="shrink-0 rounded-xl bg-black px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                          >
                            {buyingId === plan.id ? <Loader2 size={14} className="animate-spin" /> : `${money(plan.amount)} · ${service.current ? 'Renew' : 'Buy'}`}
                          </button>
                        </div>
                      ))}
                    </div>
                  )}
                </section>
              );
            })}
          </>
        )}
      </div>
    </div>
  );
};

export default SubscriptionV2;
