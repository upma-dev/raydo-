import React from "react";
import { Copy } from "lucide-react";
import { toast } from "sonner";

const isEmpty = (v) => v === undefined || v === null || String(v).trim() === "";

/** "investmentRange" -> "Investment range" */
export const humanize = (key) =>
  String(key).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_-]+/g, " ").replace(/^./, (c) => c.toUpperCase());

/**
 * Label / value list for reading data quickly. items: [label, value, { copy, mono, href }].
 * Empty values stay visible as "Not provided" so the admin can see what is missing.
 */
export function InfoList({ items, cols = 2 }) {
  const copy = (v) => {
    navigator.clipboard?.writeText(String(v));
    toast.success("Copied");
  };
  return (
    <dl className={`grid grid-cols-1 ${cols === 2 ? "md:grid-cols-2 md:gap-x-8" : ""}`}>
      {items.map(([label, value, opt = {}]) => {
        const empty = isEmpty(value);
        return (
          <div key={label} className="group flex items-start justify-between gap-4 py-2.5 border-b border-slate-100 last:border-b-0 min-h-[44px]">
            <dt className="text-[11px] font-bold text-slate-400 uppercase tracking-wide pt-0.5 shrink-0 w-[42%] sm:w-[38%]">{label}</dt>
            <dd className="flex items-start justify-end gap-1.5 min-w-0 flex-1 text-right">
              {empty ? (
                <span className="text-xs font-semibold text-slate-300 italic">Not provided</span>
              ) : opt.href ? (
                <a href={opt.href} className={`text-sm font-bold text-blue-600 hover:underline break-words min-w-0 ${opt.mono ? "font-mono" : ""}`}>{String(value)}</a>
              ) : (
                <span className={`text-sm font-bold text-slate-900 break-words min-w-0 whitespace-pre-line ${opt.mono ? "font-mono" : ""}`}>{String(value)}</span>
              )}
              {!empty && opt.copy && (
                <button type="button" onClick={() => copy(value)} title="Copy" className="p-1 rounded text-slate-300 hover:text-blue-600 hover:bg-blue-50 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity shrink-0">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              )}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Thin progress bar: paid / total */
export function Progress({ value, total, tone = "bg-emerald-500" }) {
  const pct = total > 0 ? Math.min(100, Math.round((Number(value || 0) / Number(total)) * 100)) : 0;
  return (
    <div className="mt-3">
      <div className="h-2 rounded-full bg-slate-200 overflow-hidden"><div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} /></div>
      <div className="text-[10px] font-bold text-slate-400 mt-1">{pct}% received</div>
    </div>
  );
}

/** Partner profile rows shared by the Summary and Application tabs. */
export function profileSections(app) {
  const known = new Set(["businessType", "investmentRange", "experience"]);
  const extra = Object.entries(app.additionalFields || {})
    .filter(([k]) => !known.has(k))
    .map(([k, v]) => [humanize(k), typeof v === "object" ? JSON.stringify(v) : v]);
  return {
    contact: [
      ["Partner name", app.applicantName, { copy: true }],
      ["Company", app.companyName],
      ["Phone", app.phone, { copy: true, href: app.phone ? `tel:${app.phone}` : undefined }],
      ["Email", app.email, { copy: true, href: app.email ? `mailto:${app.email}` : undefined }],
    ],
    location: [
      ["State", app.state],
      ["City", app.city],
      ["Area", app.area],
      ["Pincode", app.pincode, { copy: true, mono: true }],
    ],
    business: [
      ["Business type", app.businessType],
      ["Investment range", app.investmentRange],
      ["Experience", app.experience],
      ...extra,
    ],
  };
}

const rs = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
const SAMPLE = {
  food: { title: "Food order of ₹500", base: 70, lines: [["Platform fee", 10], ["Restaurant commission", 60]], baseLabel: "Raydo's earning on this order" },
  taxi: { title: "Taxi ride of ₹200", base: 40, lines: [["Raydo's commission from the driver", 40]], baseLabel: "Raydo's earning on this ride" },
};

/**
 * Worked example of how the platform commission is cut. rates = { food, taxi }: a number (the %), "" / NaN while the
 * admin is still typing, or undefined when the franchise does not hold that service (not shown).
 * Illustration only: the server calculates the real amounts on every delivered order / completed ride.
 */
export function CommissionExample({ rates, hint }) {
  const kinds = ["food", "taxi"].filter((k) => rates[k] !== undefined && rates[k] !== null);
  if (!kinds.length) return null;
  return (
    <div className="p-3.5 rounded-xl bg-blue-50/60 border border-blue-100 text-xs space-y-3">
      <div className="font-extrabold text-blue-900">Example: how the commission is cut {hint && <span className="font-medium text-slate-500">· {hint}</span>}</div>
      <div className={`grid grid-cols-1 ${kinds.length > 1 ? "md:grid-cols-2" : ""} gap-3`}>
        {kinds.map((k) => {
          const s = SAMPLE[k];
          const typed = Number(rates[k]);
          const valid = rates[k] !== "" && Number.isFinite(typed) && typed >= 0 && typed <= 100;
          const rate = valid ? typed : 0;
          const cut = Math.round(s.base * rate) / 100;
          return (
            <div key={k} className="bg-white rounded-lg border border-slate-200 p-3">
              <div className="font-bold text-slate-800 mb-2">{s.title}</div>
              <div className="space-y-1 text-slate-600">
                {s.lines.map(([l, v]) => <div key={l} className="flex justify-between"><span>{l}</span><span>{rs(v)}</span></div>)}
                <div className="flex justify-between font-bold text-slate-800 border-t border-slate-100 pt-1"><span>{s.baseLabel}</span><span>{rs(s.base)}</span></div>
                <div className="flex justify-between text-red-600 font-semibold"><span>Raydo keeps {valid ? `${rate}%` : "(enter a % above)"}</span><span>− {rs(cut)}</span></div>
                <div className="flex justify-between font-black text-emerald-700 border-t border-slate-200 pt-1 text-sm"><span>Goes to franchise wallet</span><span>{rs(s.base - cut)}</span></div>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[11px] text-slate-500">The % is applied on <b>Raydo's earning</b> from each order or ride, not on the full amount the customer pays. Amounts above are sample numbers.</p>
    </div>
  );
}
