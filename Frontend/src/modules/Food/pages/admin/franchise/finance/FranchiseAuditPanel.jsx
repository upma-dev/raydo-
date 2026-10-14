import React, { useCallback, useEffect, useState } from "react";
import { ScrollText } from "lucide-react";
import { adminAPI } from "@food/api";
import { Card, Loading, ErrorState, Empty, Pager, when, errMsg } from "./ui";

const ACTION = {
  "franchise.create": "Franchise created", "franchise.update_profile": "Details edited", "franchise.update_terms": "Payout terms / zones edited",
  "franchise.change_territory": "Zone changed", "franchise.suspend": "Suspended", "franchise.activate": "Activated", "franchise.terminate": "Terminated",
  "franchise.archive": "Archived", "franchise.restore": "Restored", "charge.confirm_payment": "Payment confirmed", "charge.razorpay_payment": "Razorpay payment",
  "charge.waive": "Due waived", "charge.update_amount": "Amount changed", "deposit.refund": "Deposit refunded", "deposit.deduction": "Deposit deducted",
  "rule.new_version": "Commission changed", "payout.approved": "Payout paid", "payout.rejected": "Payout rejected", "reconcile.fix": "Reconciliation repair",
};

const humanize = (k) => String(k).replace(/([a-z])([A-Z])/g, "$1 $2").replace(/[_.-]+/g, " ").replace(/^./, (c) => c.toUpperCase());
const actionLabel = (a) => ACTION[a] || humanize(a);
const MONEY = /(amount|fee|deposit|payout|outstanding|waived|paid|held|refunded|deducted|balance|commissionPerKm)$/i;

const fmtVal = (k, v) => {
  if (v === null || v === undefined || v === "") return "-";
  if (typeof v === "boolean") return v ? "Yes" : "No";
  if (typeof v === "number" && MONEY.test(k)) return `₹${v.toLocaleString("en-IN")}`;
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
};

// Delivery fee slabs: [{name, minDistance, maxDistance, basePayout, commissionPerKm, status}]
const isSlabs = (v) => Array.isArray(v) && v.length > 0 && v.every((x) => x && typeof x === "object" && "minDistance" in x);
const slabLine = (x) =>
  `${x.name || "Slab"}: ${x.minDistance}-${x.maxDistance ?? "above"} km · payout ₹${x.basePayout ?? 0} · ₹${x.commissionPerKm ?? 0}/km${x.status === false ? " · inactive" : ""}`;

const Side = ({ title, tone, children }) => (
  <div className={`p-2.5 rounded-lg border ${tone}`}>
    <div className="text-[10px] font-extrabold uppercase tracking-wide mb-1.5 opacity-70">{title}</div>
    {children}
  </div>
);

/** Readable before/after: slabs as lines, objects as changed fields only, everything else as plain text. */
function Changes({ before, after }) {
  const empty = (v) => v === null || v === undefined || (Array.isArray(v) && !v.length) || (typeof v === "object" && !Array.isArray(v) && !Object.keys(v).length);

  if (isSlabs(before) || isSlabs(after)) {
    const list = (v) => (isSlabs(v) ? <ul className="space-y-1">{v.map((x, i) => <li key={i} className="font-semibold">{slabLine(x)}</li>)}</ul> : <span className="text-slate-400 italic">Nothing</span>);
    return (
      <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2.5 text-xs">
        <Side title="Before" tone="bg-red-50 border-red-100 text-red-900">{list(before)}</Side>
        <Side title="After" tone="bg-emerald-50 border-emerald-100 text-emerald-900">{list(after)}</Side>
      </div>
    );
  }

  const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);
  if ((isObj(before) || empty(before)) && (isObj(after) || empty(after))) {
    const b = isObj(before) ? before : {};
    const a = isObj(after) ? after : {};
    const keys = [...new Set([...Object.keys(b), ...Object.keys(a)])].filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k]));
    if (!keys.length) return null;
    return (
      <div className="mt-2.5 rounded-lg border border-slate-200 bg-white divide-y divide-slate-100 text-xs">
        {keys.map((k) => (
          <div key={k} className="grid grid-cols-[110px_1fr] sm:grid-cols-[160px_1fr] gap-3 px-3 py-2 items-center">
            <span className="font-bold text-slate-500">{humanize(k)}</span>
            <span className="flex items-center gap-2 flex-wrap font-semibold">
              <span className="px-2 py-0.5 rounded bg-red-50 text-red-700 line-through decoration-red-300">{fmtVal(k, b[k])}</span>
              <span className="text-slate-400">→</span>
              <span className="px-2 py-0.5 rounded bg-emerald-50 text-emerald-800">{fmtVal(k, a[k])}</span>
            </span>
          </div>
        ))}
      </div>
    );
  }

  const txt = (v) => (empty(v) ? <span className="text-slate-400 italic">Nothing</span> : <span className="font-semibold break-words">{typeof v === "object" ? JSON.stringify(v) : String(v)}</span>);
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2.5 text-xs">
      <Side title="Before" tone="bg-red-50 border-red-100 text-red-900">{txt(before)}</Side>
      <Side title="After" tone="bg-emerald-50 border-emerald-100 text-emerald-900">{txt(after)}</Side>
    </div>
  );
}

const tone = (action = "") =>
  /terminate|suspend|reject|deduct|reset|archive/.test(action) ? "bg-red-100 text-red-700"
    : /create|activate|confirm|paid|approved|restore|waive/.test(action) ? "bg-emerald-100 text-emerald-700"
      : "bg-blue-100 text-blue-700";

/** Read-only trail of every money / configuration change on this franchise. */
export default function FranchiseAuditPanel({ franchiseId }) {
  const [s, setS] = useState({ items: [], total: 0, page: 1, limit: 30, loading: true, error: "" });
  const load = useCallback(async (page = 1) => {
    setS((x) => ({ ...x, loading: true, error: "" }));
    try {
      const res = await adminAPI.getFranchiseAudit(franchiseId, { page, limit: 30 });
      const d = res?.data?.data || {};
      setS({ items: d.items || [], total: d.total || 0, page: d.page || page, limit: d.limit || 30, loading: false, error: "" });
    } catch (e) {
      setS((x) => ({ ...x, loading: false, error: errMsg(e) }));
    }
  }, [franchiseId]);
  useEffect(() => { load(1); }, [load]);

  return (
    <Card title="Audit trail" icon={ScrollText} right={<span className="text-[11px] text-slate-400 font-semibold">Records cannot be edited or deleted</span>}>
      {s.loading && !s.items.length ? <Loading /> : s.error ? <ErrorState message={s.error} onRetry={() => load(s.page)} /> : !s.items.length ? <Empty>No changes recorded yet.</Empty> : (
        <ul className="space-y-2.5">
          {s.items.map((a) => (
            <li key={a._id} className="p-4 rounded-xl border border-slate-200 bg-white shadow-sm text-xs">
              <div className="flex justify-between gap-2 flex-wrap items-start">
                <span className={`px-2.5 py-1 rounded-md text-[11px] font-extrabold ${tone(a.action)}`}>{actionLabel(a.action)}</span>
                <span className="text-slate-500 font-semibold text-right">{when(a.createdAt)}<br className="sm:hidden" /><span className="sm:before:content-['_·_']">By {a.actor?.name || a.actor?.email || "system"}</span></span>
              </div>
              {a.reason && <div className="text-slate-700 mt-2 font-medium"><span className="text-slate-400 font-bold">Reason: </span>{a.reason}</div>}
              {(a.before || a.after) && <Changes before={a.before} after={a.after} />}
            </li>
          ))}
        </ul>
      )}
      <Pager page={s.page} limit={s.limit} total={s.total} onPage={load} />
    </Card>
  );
}
