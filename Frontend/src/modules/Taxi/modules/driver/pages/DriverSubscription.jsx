import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, BadgePercent, CheckCircle2, Clock3, Loader2, RefreshCw, Wallet } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import api from '../../../shared/api/axiosInstance';
import { getLocalDriverToken } from '../services/registrationService';

const money = (value) => `Rs ${Number(value || 0).toFixed(2)}`;

const formatDate = (value) =>
    (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

const getAuthConfig = () => {
    const token = getLocalDriverToken();
    if (!token) {
        throw new Error('Driver session expired. Please login again.');
    }
    return { headers: { Authorization: `Bearer ${token}` } };
};

const MODE_TEXT = {
    subscriptionOnly: 'You need a running plan to go online and accept rides. No commission is charged while your plan runs.',
    both: 'Plans are optional. With a running plan no commission is charged on your rides; without one the usual commission applies.',
};

const DriverSubscription = () => {
    const navigate = useNavigate();
    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [buyingId, setBuyingId] = useState('');

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            // The shared axios instance unwraps the HTTP response, so this is the API body: { success, data }
            const body = await api.get('/drivers/subscriptions/me', getAuthConfig());
            if (!body?.success) {
                throw new Error(body?.message || 'Could not load subscriptions');
            }
            setState(body.data);
        } catch (err) {
            setError(err?.message || 'Could not load subscriptions');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const buy = async (plan) => {
        if (buyingId) return;
        const startsLater = Boolean(state?.current);
        const ok = window.confirm(
            `Buy "${plan.name}" for ${money(plan.amount)}?\n\n${money(plan.amount)} will be taken from your wallet (balance ${money(state?.walletBalance)}).${
                startsLater ? '\nYour current plan keeps running; this one starts when it ends.' : ''
            }`,
        );
        if (!ok) return;

        try {
            setBuyingId(plan.id);
            const body = await api.post('/drivers/subscriptions/purchase', { planId: plan.id }, getAuthConfig());
            if (!body?.success) {
                throw new Error(body?.message || 'Purchase failed');
            }
            toast.success(body.message || 'Subscription activated');
            await load();
        } catch (err) {
            toast.error(err?.message || 'Purchase failed');
        } finally {
            setBuyingId('');
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-28 font-sans text-slate-900">
            <div className="sticky top-0 z-20 flex items-center gap-3 bg-white/95 px-4 py-4 shadow-sm backdrop-blur">
                <button
                    type="button"
                    onClick={() => navigate(-1)}
                    className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-100 bg-white shadow-sm"
                    aria-label="Back"
                >
                    <ArrowLeft size={18} />
                </button>
                <h1 className="flex-1 text-lg font-black tracking-tight">Subscription</h1>
                <button type="button" onClick={load} className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500" aria-label="Refresh">
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="mx-auto max-w-md space-y-4 px-4 pt-4">
                {loading ? (
                    <div className="flex justify-center py-20">
                        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
                    </div>
                ) : error ? (
                    <div className="rounded-2xl border border-rose-100 bg-white p-6 text-center shadow-sm">
                        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-rose-500" />
                        <p className="text-sm font-bold text-slate-900">{error}</p>
                        <button type="button" onClick={load} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">
                            Try again
                        </button>
                    </div>
                ) : !state?.enabled ? (
                    <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
                        <BadgePercent className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                        <p className="text-sm font-bold text-slate-900">Subscriptions are not available right now</p>
                        <p className="mt-1 text-xs font-semibold text-slate-500">The usual commission applies to your rides.</p>
                    </div>
                ) : (
                    <>
                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">How it works</p>
                            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">{MODE_TEXT[state.mode]}</p>
                            <div className="mt-3 flex items-center justify-between rounded-xl bg-slate-50 px-3 py-2">
                                <span className="flex items-center gap-2 text-xs font-bold text-slate-600">
                                    <Wallet size={14} /> Wallet balance
                                </span>
                                <span className="text-sm font-black">{money(state.walletBalance)}</span>
                            </div>
                        </div>

                        {state.current ? (
                            <div className="rounded-2xl bg-emerald-600 p-4 text-white shadow-lg">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-100">
                                    <CheckCircle2 size={14} /> Running plan
                                </div>
                                <p className="mt-1 text-lg font-black">{state.current.name}</p>
                                <p className="text-xs font-semibold text-emerald-100">
                                    {state.current.daysLeft} day{state.current.daysLeft === 1 ? '' : 's'} left, valid till {formatDate(state.current.expiresAt)}
                                </p>
                                <p className="mt-2 text-[11px] font-bold text-emerald-50">No commission is charged on your rides.</p>
                            </div>
                        ) : (
                            <div className={`rounded-2xl p-4 shadow-sm ${state.required ? 'border border-amber-200 bg-amber-50' : 'bg-white'}`}>
                                <div className="flex items-center gap-2 text-sm font-black">
                                    <AlertCircle size={16} className={state.required ? 'text-amber-600' : 'text-slate-400'} />
                                    No running plan
                                </div>
                                <p className="mt-1 text-xs font-semibold text-slate-600">
                                    {state.required ? 'Buy a plan below to go online and accept rides.' : 'You are paying the usual commission on each ride.'}
                                </p>
                            </div>
                        )}

                        {state.upcoming?.length > 0 && (
                            <div className="rounded-2xl bg-white p-4 shadow-sm">
                                <p className="mb-2 flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400">
                                    <Clock3 size={12} /> Starts later
                                </p>
                                {state.upcoming.map((item) => (
                                    <p key={item.id} className="text-xs font-semibold text-slate-600">
                                        {item.name}: {formatDate(item.startedAt)} to {formatDate(item.expiresAt)}
                                    </p>
                                ))}
                            </div>
                        )}

                        <p className="px-1 pt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Available plans</p>
                        {state.plans.length === 0 ? (
                            <div className="rounded-2xl bg-white p-6 text-center text-xs font-semibold text-slate-500 shadow-sm">
                                No plan is available for your vehicle yet.
                            </div>
                        ) : (
                            state.plans.map((plan) => (
                                <div key={plan.id} className="rounded-2xl bg-white p-4 shadow-sm">
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-black">{plan.name}</p>
                                            <p className="text-xs font-semibold text-slate-500">
                                                {plan.duration} days{plan.vehicle_type?.name ? ` - ${plan.vehicle_type.name}` : ''}
                                            </p>
                                        </div>
                                        <p className="text-base font-black">{money(plan.amount)}</p>
                                    </div>
                                    {plan.description ? <p className="mt-2 text-xs font-semibold text-slate-500">{plan.description}</p> : null}
                                    {plan.how_it_works ? <p className="mt-1 text-[11px] font-semibold text-slate-400">{plan.how_it_works}</p> : null}
                                    <button
                                        type="button"
                                        onClick={() => buy(plan)}
                                        disabled={Boolean(buyingId)}
                                        className="mt-3 flex h-11 w-full items-center justify-center rounded-xl bg-slate-900 text-xs font-black uppercase tracking-widest text-white disabled:opacity-60"
                                    >
                                        {buyingId === plan.id ? <Loader2 size={16} className="animate-spin" /> : state.current ? 'Renew' : 'Buy plan'}
                                    </button>
                                    {state.walletBalance < plan.amount ? (
                                        <button
                                            type="button"
                                            onClick={() => navigate('/taxi/driver/wallet')}
                                            className="mt-2 w-full text-center text-[11px] font-bold text-rose-600"
                                        >
                                            Wallet balance is low - top up
                                        </button>
                                    ) : null}
                                </div>
                            ))
                        )}

                        {state.history?.some((item) => item.state === 'expired' || item.state === 'cancelled') && (
                            <>
                                <p className="px-1 pt-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Past plans</p>
                                <div className="rounded-2xl bg-white p-4 shadow-sm">
                                    {state.history
                                        .filter((item) => item.state === 'expired' || item.state === 'cancelled')
                                        .map((item) => (
                                            <div key={item.id} className="flex items-center justify-between border-b border-slate-50 py-2 last:border-0">
                                                <span className="text-xs font-bold text-slate-700">{item.name}</span>
                                                <span className="text-[11px] font-semibold text-slate-400">
                                                    {formatDate(item.startedAt)} - {formatDate(item.expiresAt)}
                                                </span>
                                            </div>
                                        ))}
                                </div>
                            </>
                        )}
                    </>
                )}
            </div>

            <DriverBottomNav />
        </div>
    );
};

export default DriverSubscription;
