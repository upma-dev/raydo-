import React from 'react';

export const CountdownRing = ({ remainingMs, totalMs, onDecline }) => {
  const size = 52;
  const stroke = 4;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const ratio = Math.max(0, Math.min(1, remainingMs / totalMs));
  return (
    <button
      type="button"
      onClick={onDecline}
      aria-label="Decline request"
      className="relative shrink-0 flex items-center justify-center"
      style={{ width: size, height: size }}
    >
      <svg width={size} height={size} className="-rotate-90 absolute inset-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#16a34a"
          strokeWidth={stroke}
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          strokeLinecap="round"
        />
      </svg>
      <span className="text-gray-700 text-2xl font-bold leading-none">–</span>
    </button>
  );
};

export default CountdownRing;
