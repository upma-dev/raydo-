import React from 'react';
import { ChevronLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

/** Navy app bar used by owner sub-screens. */
const OwnerAppBar = ({ title, subtitle, backTo, actions = null }) => {
  const navigate = useNavigate();

  return (
    <header className="sticky top-0 z-30 flex items-center gap-3 bg-gradient-to-r from-[#0A1F44] to-[#1D4E9E] px-4 py-3.5 text-white shadow-[0_8px_20px_rgba(10,31,68,0.25)]">
      <button
        type="button"
        onClick={() => (backTo ? navigate(backTo) : navigate(-1))}
        aria-label="Back"
        className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-white/15 active:scale-95"
      >
        <ChevronLeft size={20} />
      </button>
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-black leading-tight">{title}</h1>
        {subtitle ? (
          <p className="truncate text-[11px] font-semibold text-[#BBD7FF]">{subtitle}</p>
        ) : null}
      </div>
      {actions}
    </header>
  );
};

export default OwnerAppBar;
