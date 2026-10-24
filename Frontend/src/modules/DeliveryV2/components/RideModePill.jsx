import React from 'react';
import { ArrowLeftRight, Bike, Loader2, UtensilsCrossed, XCircle } from 'lucide-react';

/**
 * The one Food <-> Ride & Parcel switch button, used on the delivery home and on the ride home so both sides look the same.
 * `target` is the mode the tap moves to.
 */
const RideModePill = ({ target = 'taxi', busy = false, disabled = false, attention = false, label, onClick, className = '' }) => {
  const toFood = target === 'food';
  const text = label || (toFood ? 'Switch to Food' : 'Switch to Ride');
  return (
    <button
      type="button"
      disabled={disabled || busy}
      onClick={onClick}
      aria-busy={busy}
      className={`flex items-center gap-2 rounded-full bg-[#121212] pl-1.5 pr-3.5 py-1.5 text-white shadow-xl shadow-black/20 border border-white/10 active:scale-95 transition-all disabled:opacity-60 ${className}`}
    >
      <span className={`flex h-7 w-7 items-center justify-center rounded-full ${attention ? 'bg-rose-500' : toFood ? 'bg-emerald-500' : 'bg-[#FFC107]'}`}>
        {busy ? <Loader2 size={13} strokeWidth={2.5} className="animate-spin" />
          : attention ? <XCircle size={13} strokeWidth={2.5} />
            : toFood ? <UtensilsCrossed size={13} strokeWidth={2.5} />
              : <Bike size={13} strokeWidth={2.5} className="text-black" />}
      </span>
      <span className="text-[10px] font-black uppercase tracking-widest">
        {busy ? 'Switching…' : text}
      </span>
      <ArrowLeftRight size={12} className="text-white/50" />
    </button>
  );
};

export default RideModePill;
