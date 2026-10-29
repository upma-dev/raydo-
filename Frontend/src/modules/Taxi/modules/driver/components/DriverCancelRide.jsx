import React, { useCallback, useEffect, useState } from 'react';
import { X } from 'lucide-react';
import toast from 'react-hot-toast';
import { cancelDriverRide, getDriverRideCancelPolicy } from '../services/registrationService';

// "Passenger no-show" is matched by the backend (no-show rule), keep the wording
const REASONS = [
    'Passenger no-show',
    'Passenger asked me to cancel',
    'Wrong pickup location',
    'Vehicle problem',
    'Other',
];

/**
 * Cancel button for the driver, from accepting the ride until the trip ends. The admin decides whether it exists
 * (Set Prices > Cancellation policy > Allow driver to cancel the ride): the backend answers per ride, so turning the
 * switch off hides the button without an app update. A weak connection never shows it by mistake.
 */
const DriverCancelRide = ({ rideId, phase, onCancelled }) => {
    const [policy, setPolicy] = useState(null);
    const [open, setOpen] = useState(false);
    const [reason, setReason] = useState(REASONS[0]);
    const [busy, setBusy] = useState(false);

    const loadPolicy = useCallback(async () => {
        if (!rideId) return;
        try {
            const response = await getDriverRideCancelPolicy(rideId);
            setPolicy(response?.data?.data || null);
        } catch {
            setPolicy(null);
        }
    }, [rideId]);

    // Re-asked on every step of the trip: the button goes away as soon as the ride is completed or cancelled
    useEffect(() => {
        loadPolicy();
    }, [loadPolicy, phase]);

    if (!policy?.allowed) return null;

    const confirm = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const response = await cancelDriverRide(rideId, { reason });
            setOpen(false);
            toast.success('Ride cancelled');
            onCancelled?.(response?.data?.data?.cancellationBill || null);
        } catch (error) {
            toast.error(error?.response?.data?.message || 'Could not cancel the ride. Please try again.');
        } finally {
            setBusy(false);
        }
    };

    return (
        <>
            <button
                type="button"
                onClick={() => setOpen(true)}
                className="fixed left-3 z-[60] flex items-center gap-1.5 rounded-full border border-rose-100 bg-white px-3.5 py-2 text-[11px] font-black uppercase tracking-wider text-rose-600 shadow-lg active:scale-95 transition-transform"
                style={{ top: 'calc(env(safe-area-inset-top, 0px) + 64px)' }}
            >
                <X size={13} strokeWidth={3} /> Cancel ride
            </button>

            {open && (
                <div className="fixed inset-0 z-[9998] flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={() => !busy && setOpen(false)}>
                    <div className="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl" onClick={(event) => event.stopPropagation()}>
                        <h3 className="text-[17px] font-black tracking-tight text-slate-900">Cancel this ride?</h3>
                        <p className="mt-1 text-[12px] font-semibold leading-relaxed text-slate-500">
                            {policy.penalty > 0
                                ? `A penalty of ₹${policy.penalty} may be deducted from your wallet.`
                                : 'The passenger will be told you cancelled.'}
                        </p>
                        <div className="mt-3 space-y-2">
                            {REASONS.map((item) => (
                                <label key={item} className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2.5 text-[13px] font-bold ${reason === item ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-200 text-slate-700'}`}>
                                    <input type="radio" name="driver-cancel-reason" className="accent-rose-600" checked={reason === item} onChange={() => setReason(item)} />
                                    {item}
                                </label>
                            ))}
                        </div>
                        <div className="mt-4 grid grid-cols-2 gap-3">
                            <button type="button" disabled={busy} onClick={() => setOpen(false)} className="h-11 rounded-xl border border-slate-200 bg-slate-50 text-[12px] font-black uppercase tracking-wider text-slate-500 disabled:opacity-60">
                                Keep ride
                            </button>
                            <button type="button" disabled={busy} onClick={confirm} className="h-11 rounded-xl bg-rose-600 text-[12px] font-black uppercase tracking-wider text-white disabled:opacity-60">
                                {busy ? 'Cancelling…' : 'Cancel ride'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </>
    );
};

export default DriverCancelRide;
