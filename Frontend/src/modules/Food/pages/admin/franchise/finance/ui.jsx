import React, { useEffect } from "react";
import { Loader2, X, AlertTriangle, Inbox, ChevronLeft, ChevronRight } from "lucide-react";

/* Shared look for the franchise finance screens (matches the existing admin franchise pages). */

export const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
export const inr2 = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
export const pct = (n) => (n === null || n === undefined ? "-" : `${Number(n).toLocaleString("en-IN", { maximumFractionDigits: 2 })}%`);
export const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
export const dayLabel = (d) => (d ? new Date(`${d}T00:00:00+05:30`).toLocaleDateString("en-IN", { weekday: "short", day: "2-digit", month: "short", year: "numeric" }) : "-");
export const errMsg = (e, fb = "Something went wrong") => e?.response?.data?.message || e?.message || fb;

export const inputCls = "w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-500";
export const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-1";
export const btn = {
  primary: "px-4 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-2",
  success: "px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-2",
  danger: "px-4 py-2.5 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-2",
  warn: "px-4 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center justify-center gap-2",
  ghost: "px-3 py-2 rounded-lg bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-bold inline-flex items-center justify-center gap-1.5",
};

/** Today in IST as YYYY-MM-DD (finance days are IST days on the server too). */
export const istToday = () => new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
export const istDaysAgo = (n) => new Date(Date.now() + 330 * 60000 - n * 86400000).toISOString().slice(0, 10);
export const istMonthStart = () => `${istToday().slice(0, 7)}-01`;

export function Card({ title, icon: Icon, right, children, className = "" }) {
  return (
    <div className={`bg-white rounded-2xl border border-slate-200 shadow-sm ${className}`}>
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 px-5 py-3.5 border-b border-slate-100 flex-wrap">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-blue-600" />}{title}</h3>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

export function Stat({ label, value, sub, tone = "text-slate-900", icon: Icon }) {
  return (
    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 min-w-0">
      <div className="text-[10px] font-bold text-slate-500 uppercase flex items-center gap-1">{Icon && <Icon className="w-3 h-3" />}{label}</div>
      <div className={`text-lg sm:text-xl font-black mt-1 truncate ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

const BADGE = {
  paid: "bg-emerald-100 text-emerald-800",
  approved: "bg-emerald-100 text-emerald-800",
  active: "bg-emerald-100 text-emerald-800",
  waived: "bg-blue-100 text-blue-800",
  not_required: "bg-slate-100 text-slate-600",
  partially_paid: "bg-amber-100 text-amber-800",
  pending: "bg-amber-100 text-amber-800",
  suspended: "bg-orange-100 text-orange-800",
  terminated: "bg-red-100 text-red-800",
  rejected: "bg-red-100 text-red-800",
  refund_due: "bg-orange-100 text-orange-800",
};
const LABEL = { not_required: "Not required", partially_paid: "Partly paid", refund_due: "Refund due" };
export function Badge({ status, children }) {
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase tracking-wide ${BADGE[status] || "bg-slate-100 text-slate-700"}`}>
      {children || LABEL[status] || String(status || "-").replace(/_/g, " ")}
    </span>
  );
}

export function ServiceChips({ services = [] }) {
  return (
    <div className="flex gap-1 flex-wrap">
      {services.includes("food") && <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-50 text-amber-800 border border-amber-200">FOOD</span>}
      {services.includes("taxi") && <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-blue-50 text-blue-800 border border-blue-200">TAXI</span>}
    </div>
  );
}

export function Modal({ open, title, onClose, children, footer, wide = false }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose?.();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-slate-900/50 p-0 sm:p-4" onClick={onClose}>
      <div className={`bg-white w-full ${wide ? "sm:max-w-3xl" : "sm:max-w-lg"} rounded-t-2xl sm:rounded-2xl shadow-xl max-h-[92vh] flex flex-col`} onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="p-5 overflow-y-auto space-y-4">{children}</div>
        {footer && <div className="px-5 py-4 border-t border-slate-100 flex justify-end gap-2 flex-wrap">{footer}</div>}
      </div>
    </div>
  );
}

export function Field({ label, hint, error, children }) {
  return (
    <div>
      {label && <label className={labelCls}>{label}</label>}
      {children}
      {error ? <p className="text-[11px] font-semibold text-red-600 mt-1">{error}</p> : hint ? <p className="text-[11px] text-slate-400 mt-1">{hint}</p> : null}
    </div>
  );
}

export function Loading({ text = "Loading..." }) {
  return <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500"><Loader2 className="w-5 h-5 animate-spin text-blue-600" /> {text}</div>;
}

export function ErrorState({ message, onRetry }) {
  return (
    <div className="p-6 rounded-xl border border-red-200 bg-red-50 text-center">
      <AlertTriangle className="w-6 h-6 text-red-500 mx-auto mb-2" />
      <p className="text-sm font-semibold text-red-800">{message || "Could not load data"}</p>
      {onRetry && <button onClick={onRetry} className={`${btn.ghost} mt-3`}>Try again</button>}
    </div>
  );
}

export function Empty({ children, icon: Icon = Inbox }) {
  return (
    <div className="py-10 text-center text-slate-400">
      <Icon className="w-7 h-7 mx-auto mb-2 opacity-60" />
      <p className="text-xs font-semibold">{children}</p>
    </div>
  );
}

export function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  if (pages <= 1) return <div className="mt-3 text-xs font-semibold text-slate-500">{total || 0} total</div>;
  return (
    <div className="flex items-center justify-between mt-3 text-xs font-semibold text-slate-500">
      <span>{total} total</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="p-1.5 rounded-lg bg-slate-100 disabled:opacity-40" aria-label="Previous page"><ChevronLeft className="w-4 h-4" /></button>
        <span>Page {page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="p-1.5 rounded-lg bg-slate-100 disabled:opacity-40" aria-label="Next page"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

const PRESETS = [
  ["Today", () => [istToday(), istToday()]],
  ["7 days", () => [istDaysAgo(6), istToday()]],
  ["30 days", () => [istDaysAgo(29), istToday()]],
  ["This month", () => [istMonthStart(), istToday()]],
];

export function DateRange({ from, to, onChange }) {
  return (
    <div className="flex items-end gap-2 flex-wrap">
      <div>
        <label className={labelCls}>From</label>
        <input type="date" value={from} max={to} onChange={(e) => onChange({ from: e.target.value, to })} className={`${inputCls} py-2`} />
      </div>
      <div>
        <label className={labelCls}>To</label>
        <input type="date" value={to} min={from} max={istToday()} onChange={(e) => onChange({ from, to: e.target.value })} className={`${inputCls} py-2`} />
      </div>
      <div className="flex gap-1 flex-wrap">
        {PRESETS.map(([label, fn]) => {
          const [f, t] = fn();
          const active = f === from && t === to;
          return (
            <button key={label} type="button" onClick={() => onChange({ from: f, to: t })}
              className={`px-2.5 py-2 rounded-lg text-[11px] font-bold border ${active ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-600 border-slate-300 hover:bg-slate-50"}`}>
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

/** CSV export of what the server returned (no client-side recalculation). */
export function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v === null || v === undefined ? "" : String(v);
    // Neutralise spreadsheet formulas (CSV injection) and quote everything
    const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
    return `"${safe.replace(/"/g, '""')}"`;
  };
  const lines = [columns.map((c) => esc(c.label)).join(",")];
  rows.forEach((r) => lines.push(columns.map((c) => esc(typeof c.value === "function" ? c.value(r) : r[c.value])).join(",")));
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Validates a rupee amount the same way the server does (positive, max 2 decimals). */
export const isAmount = (v, { allowZero = true } = {}) => /^\d+(\.\d{1,2})?$/.test(String(v ?? "").trim()) && (allowZero || Number(v) > 0);
export const isPercent = (v) => /^\d+(\.\d{1,2})?$/.test(String(v ?? "").trim()) && Number(v) <= 100;
