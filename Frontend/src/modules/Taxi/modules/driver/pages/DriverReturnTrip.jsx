import React, { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ArrowLeft, Loader2, MapPin, RefreshCw, Repeat } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import api from '../../../shared/api/axiosInstance';
import { getLocalDriverToken } from '../services/registrationService';

const getAuthConfig = () => {
    const token = getLocalDriverToken();
    if (!token) throw new Error('Driver session expired. Please login again.');
    return { headers: { Authorization: `Bearer ${token}` } };
};

const formatTime = (value) =>
    (value ? new Date(value).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '-');

/**
 * Return trip - "I am heading back to Dewas, give me rides that end there first."
 * The driver picks the zone he is going back to; while it is on, ride requests that END in that zone reach him before
 * other drivers. It switches itself off when he reaches the zone, goes offline, accepts such a ride, or the time is up.
 */
const DriverReturnTrip = () => {
    const navigate = useNavigate();
    const [state, setState] = useState(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [zoneId, setZoneId] = useState('');
    const [saving, setSaving] = useState(false);

    const load = useCallback(async () => {
        try {
            setLoading(true);
            setError('');
            const body = await api.get('/drivers/return-trip', getAuthConfig());
            if (!body?.success) throw new Error(body?.message || 'Could not load Return trip');
            setState(body.data);
        } catch (err) {
            setError(err?.message || 'Could not load Return trip');
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load]);

    const save = async (payload) => {
        if (saving) return;
        try {
            setSaving(true);
            const body = await api.put('/drivers/return-trip', payload, getAuthConfig());
            if (!body?.success) throw new Error(body?.message || 'Could not update Return trip');
            setState(body.data);
            toast.success(body.message || 'Updated');
        } catch (err) {
            toast.error(err?.message || 'Could not update Return trip');
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 pb-28 font-sans text-slate-900">
            <div className="sticky top-0 z-20 flex items-center gap-3 bg-white/95 px-4 py-4 shadow-sm backdrop-blur">
                <button type="button" onClick={() => navigate(-1)} aria-label="Back" className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-100 bg-white shadow-sm">
                    <ArrowLeft size={18} />
                </button>
                <h1 className="flex-1 text-lg font-black tracking-tight">Return trip</h1>
                <button type="button" onClick={load} aria-label="Refresh" className="flex h-10 w-10 items-center justify-center rounded-full text-slate-500">
                    <RefreshCw size={16} />
                </button>
            </div>

            <div className="mx-auto max-w-md space-y-4 px-4 pt-4">
                {loading ? (
                    <div className="flex justify-center py-20"><Loader2 className="h-8 w-8 animate-spin text-slate-400" /></div>
                ) : error ? (
                    <div className="rounded-2xl border border-rose-100 bg-white p-6 text-center shadow-sm">
                        <AlertCircle className="mx-auto mb-2 h-8 w-8 text-rose-500" />
                        <p className="text-sm font-bold">{error}</p>
                        <button type="button" onClick={load} className="mt-3 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white">Try again</button>
                    </div>
                ) : !state?.available ? (
                    <div className="rounded-2xl bg-white p-6 text-center shadow-sm">
                        <Repeat className="mx-auto mb-2 h-8 w-8 text-slate-400" />
                        <p className="text-sm font-bold">Return trip is not available right now</p>
                    </div>
                ) : (
                    <>
                        <div className="rounded-2xl bg-white p-4 shadow-sm">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">How it works</p>
                            <p className="mt-1 text-xs font-semibold leading-relaxed text-slate-600">
                                Going back home after a long trip? Choose the zone you are going back to. While Return trip is on, ride requests that end
                                there ({state.allowCityRides ? 'any ride' : 'outstation rides'}, up to {state.maxKm} km) reach you before other drivers.
                                You still get requests only near you. It switches off when you reach that zone, go offline, accept such a ride, or after {state.expiryHours} hours.
                            </p>
                        </div>

                        {state.current ? (
                            <div className="rounded-2xl bg-emerald-600 p-4 text-white shadow-lg">
                                <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-emerald-100"><Repeat size={14} /> Return trip is on</div>
                                <p className="mt-1 flex items-center gap-1 text-lg font-black"><MapPin size={16} /> Going back to {state.current.destinationName}</p>
                                <p className="text-xs font-semibold text-emerald-100">Valid till {formatTime(state.current.expiresAt)}</p>
                                <button type="button" disabled={saving} onClick={() => save({ enabled: false })} className="mt-3 rounded-xl bg-white px-4 py-2 text-xs font-black text-emerald-700 disabled:opacity-50">
                                    Turn off
                                </button>
                            </div>
                        ) : (
                            <>
                                {state.suggestion && (
                                    <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-4">
                                        <p className="text-sm font-black text-emerald-900">Going back to {state.suggestion.zoneName}?</p>
                                        <p className="mt-0.5 text-xs font-semibold text-emerald-800">Your last outstation trip started there.</p>
                                        <button
                                            type="button"
                                            disabled={saving}
                                            onClick={() => save({ enabled: true, destinationZoneId: state.suggestion.zoneId, source: 'suggestion', fromRideId: state.suggestion.fromRideId })}
                                            className="mt-3 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-black text-white disabled:opacity-50"
                                        >
                                            Yes, turn on Return trip
                                        </button>
                                    </div>
                                )}

                                <div className="rounded-2xl bg-white p-4 shadow-sm">
                                    <label className="text-xs font-bold text-slate-600" htmlFor="return-zone">Where are you going back to?</label>
                                    <select id="return-zone" value={zoneId} onChange={(e) => setZoneId(e.target.value)} className="mt-2 w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm font-semibold outline-none">
                                        <option value="">Choose a zone</option>
                                        {state.zones.map((zone) => <option key={zone.id} value={zone.id}>{zone.name}</option>)}
                                    </select>
                                    <button
                                        type="button"
                                        disabled={saving || !zoneId}
                                        onClick={() => save({ enabled: true, destinationZoneId: zoneId })}
                                        className="mt-3 w-full rounded-xl bg-slate-900 py-3 text-sm font-black text-white disabled:opacity-40"
                                    >
                                        {saving ? 'Saving...' : 'Turn on Return trip'}
                                    </button>
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

export default DriverReturnTrip;
