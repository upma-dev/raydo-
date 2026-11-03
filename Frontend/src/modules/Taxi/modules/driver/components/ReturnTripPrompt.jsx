import React, { useEffect, useState } from 'react';
import { Repeat, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import api from '../../../shared/api/axiosInstance';
import { getLocalDriverToken } from '../services/registrationService';

const DISMISS_KEY = 'returnTripPromptDismissed';

/**
 * Shown on the driver home after an outstation trip: "Going back to Dewas? Turn on Return trip" - one tap.
 * It appears only when the server has a suggestion (an intercity trip finished in the last 6 hours that started in
 * another zone) and Return trip is not already on. Dismissing hides it for that trip.
 */
const ReturnTripPrompt = () => {
    const navigate = useNavigate();
    const [suggestion, setSuggestion] = useState(null);
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        let cancelled = false;
        (async () => {
            try {
                const token = getLocalDriverToken();
                if (!token) return;
                const config = { headers: { Authorization: `Bearer ${token}` } };
                const body = await api.get('/drivers/return-trip', config);
                const next = body?.data?.suggestion;
                if (cancelled || !body?.success || !next) return;
                let dismissed = '';
                try { dismissed = localStorage.getItem(DISMISS_KEY) || ''; } catch { /* storage may be blocked */ }
                if (dismissed !== next.fromRideId) setSuggestion(next);
            } catch {
                // The prompt is a convenience: stay quiet when it cannot load
            }
        })();
        return () => { cancelled = true; };
    }, []);

    if (!suggestion) return null;

    const dismiss = () => {
        try { localStorage.setItem(DISMISS_KEY, suggestion.fromRideId); } catch { /* ignore */ }
        setSuggestion(null);
    };

    const turnOn = async () => {
        if (busy) return;
        try {
            setBusy(true);
            const token = getLocalDriverToken();
            const body = await api.put(
                '/drivers/return-trip',
                { enabled: true, destinationZoneId: suggestion.zoneId, source: 'suggestion', fromRideId: suggestion.fromRideId },
                { headers: { Authorization: `Bearer ${token}` } },
            );
            if (!body?.success) throw new Error(body?.message || 'Could not turn on Return trip');
            toast.success(body.message || 'Return trip on');
            setSuggestion(null);
        } catch (err) {
            toast.error(err?.message || 'Could not turn on Return trip');
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="mx-4 mt-3 rounded-2xl border border-emerald-200 bg-emerald-50 p-4 shadow-sm">
            <div className="flex items-start gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-emerald-600 text-white"><Repeat size={18} /></div>
                <div className="min-w-0 flex-1">
                    <p className="text-sm font-black text-emerald-900">Going back to {suggestion.zoneName}?</p>
                    <p className="text-xs font-semibold text-emerald-800">Turn on Return trip to get rides that end there first.</p>
                    <div className="mt-2 flex gap-2">
                        <button type="button" disabled={busy} onClick={turnOn} className="rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-black text-white disabled:opacity-50">Turn on</button>
                        <button type="button" onClick={() => navigate('/taxi/driver/return-trip')} className="rounded-xl border border-emerald-300 px-3 py-1.5 text-xs font-bold text-emerald-800">Choose another</button>
                    </div>
                </div>
                <button type="button" onClick={dismiss} aria-label="Dismiss" className="text-emerald-700"><X size={16} /></button>
            </div>
        </div>
    );
};

export default ReturnTripPrompt;
