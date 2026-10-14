import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Bike, Users, CreditCard, Loader2, Search, Eye, CheckCircle2, XCircle, Ban, RotateCcw, FileImage, X, Phone, Car,
} from "lucide-react";
import { franchiseAPI } from "@food/api";
import { Card, StatCard } from "./FranchisePortalPages";

/* Franchise portal: things the partner manages in its own territory (riders, taxi drivers, payments).
   Every list and action is limited to the partner's franchise on the server. */

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const errMsg = (e, fb = "Something went wrong") => e?.response?.data?.message || e?.message || fb;
const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const btn = {
  green: "px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5",
  red: "px-3.5 py-2 rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5",
  amber: "px-3.5 py-2 rounded-xl bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-1.5",
  ghost: "px-3 py-2 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 disabled:opacity-60 text-slate-700 text-xs font-bold inline-flex items-center gap-1.5",
};

const STATE_STYLE = {
  pending: "bg-amber-100 text-amber-800", approved: "bg-emerald-100 text-emerald-800",
  rejected: "bg-red-100 text-red-800", blocked: "bg-slate-800 text-white",
};
const Pill = ({ state }) => <span className={`px-2 py-0.5 rounded-md text-[10px] font-extrabold uppercase ${STATE_STYLE[state] || "bg-slate-100 text-slate-700"}`}>{state || "-"}</span>;

function usePaged(fetcher, filters) {
  const [s, setS] = useState({ items: [], total: 0, page: 1, limit: 20, loading: true, error: "", extra: null });
  const key = JSON.stringify(filters);
  const load = useCallback(async (page = 1) => {
    setS((x) => ({ ...x, loading: true, error: "" }));
    try {
      const res = await fetcher({ page, limit: 20, ...filters });
      const d = res?.data?.data || {};
      setS({ items: d.items || [], total: d.total || 0, page: d.page || page, limit: d.limit || 20, loading: false, error: "", extra: d });
    } catch (e) {
      setS((x) => ({ ...x, loading: false, error: errMsg(e, "Could not load data") }));
    }
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { load(1); }, [load]);
  return [s, load];
}

function useDebounced(value, ms = 400) {
  const [v, setV] = useState(value);
  useEffect(() => { const t = setTimeout(() => setV(value), ms); return () => clearTimeout(t); }, [value, ms]);
  return v;
}

function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil((total || 0) / (limit || 1)));
  return (
    <div className="flex items-center justify-between mt-4 text-xs font-semibold text-slate-500">
      <span>{total || 0} total</span>
      {pages > 1 && (
        <div className="flex items-center gap-2">
          <button disabled={page <= 1} onClick={() => onPage(page - 1)} className={btn.ghost}>Prev</button>
          <span>Page {page} / {pages}</span>
          <button disabled={page >= pages} onClick={() => onPage(page + 1)} className={btn.ghost}>Next</button>
        </div>
      )}
    </div>
  );
}

function DataTable({ head, colSpan, state, empty, children }) {
  return (
    <div className="overflow-x-auto border border-slate-200 rounded-2xl">
      <table className="w-full text-xs text-left min-w-[720px]">
        <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]"><tr>{head.map((h) => <th key={h} className="py-3 px-4">{h}</th>)}</tr></thead>
        <tbody className="divide-y divide-slate-100 font-medium">
          {state.loading ? <tr><td colSpan={colSpan} className="py-12 text-center text-slate-400"><Loader2 className="w-5 h-5 animate-spin inline" /></td></tr>
            : state.error ? <tr><td colSpan={colSpan} className="py-12 text-center text-red-600">{state.error}</td></tr>
            : !state.items.length ? <tr><td colSpan={colSpan} className="py-12 text-center text-slate-400">{empty}</td></tr>
            : children}
        </tbody>
      </table>
    </div>
  );
}

function Tabs({ value, onChange, tabs }) {
  return (
    <div className="flex gap-1.5 flex-wrap">
      {tabs.map(([v, label, count]) => (
        <button key={v} type="button" onClick={() => onChange(v)}
          className={`px-3.5 py-2 rounded-xl text-xs font-bold border ${value === v ? "bg-indigo-600 text-white border-indigo-600" : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"}`}>
          {label}{count !== undefined && <span className={`ml-1.5 px-1.5 rounded-md ${value === v ? "bg-white/20" : "bg-slate-100"}`}>{count}</span>}
        </button>
      ))}
    </div>
  );
}

function Drawer({ open, title, onClose, children, footer }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/50 flex justify-end" onClick={onClose}>
      <div className="w-full max-w-xl h-full bg-white shadow-2xl flex flex-col" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
          <h3 className="text-base font-extrabold text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100" aria-label="Close"><X className="w-4 h-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto p-6 space-y-5">{children}</div>
        {footer && <div className="px-6 py-4 border-t border-slate-100 flex gap-2 flex-wrap justify-end">{footer}</div>}
      </div>
    </div>
  );
}

const Info = ({ label, value }) => (
  <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 min-w-0">
    <div className="text-[10px] font-bold text-slate-400 uppercase">{label}</div>
    <div className="text-sm font-bold text-slate-900 mt-0.5 break-words">{value || "-"}</div>
  </div>
);

const DOC_LABEL = {
  profilePhoto: "Profile photo", aadharFront: "Aadhaar (front)", aadharBack: "Aadhaar (back)", panFront: "PAN (front)", panBack: "PAN (back)",
  drivingLicenseFront: "Driving licence (front)", drivingLicenseBack: "Driving licence (back)", vehicle: "Vehicle",
};
function Documents({ docs }) {
  const entries = Object.entries(docs || {}).filter(([, url]) => url);
  if (!entries.length) return <p className="text-xs text-slate-400">No documents uploaded.</p>;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {entries.map(([k, url]) => (
        <a key={k} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 hover:border-indigo-400">
          {/\.(pdf)(\?|$)/i.test(url)
            ? <div className="h-24 flex items-center justify-center bg-slate-100"><FileImage className="w-7 h-7 text-indigo-500" /></div>
            : <img src={url} alt={DOC_LABEL[k] || k} className="w-full h-24 object-cover bg-slate-100" loading="lazy" />}
          <div className="px-2 py-1.5 text-[10px] font-bold text-slate-600 truncate">{DOC_LABEL[k] || k}</div>
        </a>
      ))}
    </div>
  );
}

/** Reason prompt used for reject / block. */
function ReasonBox({ label, value, onChange }) {
  return (
    <div>
      <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">{label}</label>
      <textarea rows={2} className={inputCls} value={value} onChange={(e) => onChange(e.target.value)} placeholder="Visible to the admin and saved in the audit log" />
    </div>
  );
}

/* ================================ RIDERS (FOOD) ================================ */

export function RidersPage() {
  const [status, setStatus] = useState("pending");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput);
  const [list, load] = usePaged(franchiseAPI.getRiders, { status: status || undefined, search: search || undefined });
  const [open, setOpen] = useState(null);
  const counts = list.extra?.counts || {};

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard label="Waiting for approval" value={counts.pending ?? "-"} icon={Bike} tone="amber" />
        <StatCard label="Approved riders" value={counts.approved ?? "-"} icon={Users} tone="emerald" />
        <StatCard label="Rejected" value={counts.rejected ?? "-"} icon={XCircle} tone="violet" />
      </div>
      <Card title="Delivery riders in your zone" icon={Bike} right={
        <div className="relative w-64 max-w-full"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input className={`${inputCls} !py-2 pl-9`} placeholder="Name, phone, vehicle no." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} /></div>
      }>
        <div className="mb-4"><Tabs value={status} onChange={setStatus} tabs={[["pending", "Pending", counts.pending], ["approved", "Approved", counts.approved], ["rejected", "Rejected", counts.rejected], ["", "All"]]} /></div>
        <DataTable head={["Rider", "Vehicle", "City / zone", "Status", "Online", "Rating", "Joined", ""]} colSpan={8} state={list}
          empty={status === "pending" ? "No riders waiting for approval." : "No riders found."}>
          {list.items.map((r) => (
            <tr key={r.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(r.id)}>
              <td className="py-3 px-4"><div className="font-bold text-slate-900">{r.name}</div><div className="text-[10px] text-slate-400">{r.phone}</div></td>
              <td className="py-3 px-4"><div className="capitalize">{r.vehicleType || "-"}</div><div className="text-[10px] text-slate-400">{r.vehicleNumber}</div></td>
              <td className="py-3 px-4">{[r.city, r.zoneName].filter(Boolean).join(" · ") || "-"}</td>
              <td className="py-3 px-4"><Pill state={r.status} /></td>
              <td className="py-3 px-4">{r.availability === "online" ? "🟢 Online" : "⚪ Offline"}</td>
              <td className="py-3 px-4">{r.rating ? `${Number(r.rating).toFixed(1)} (${r.totalRatings})` : "-"}</td>
              <td className="py-3 px-4 text-slate-500">{when(r.joinedAt)}</td>
              <td className="py-3 px-4"><button className={btn.ghost}><Eye className="w-3.5 h-3.5" /> View</button></td>
            </tr>
          ))}
        </DataTable>
        <Pager page={list.page} limit={list.limit} total={list.total} onPage={load} />
      </Card>
      {open && <RiderDrawer id={open} onClose={() => setOpen(null)} onChanged={() => load(list.page)} />}
    </div>
  );
}

function RiderDrawer({ id, onClose, onChanged }) {
  const [r, setR] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    franchiseAPI.getRider(id).then((res) => setR(res?.data?.data)).catch((e) => setError(errMsg(e, "Could not load rider")));
  }, [id]);

  const act = async (action) => {
    if (action === "reject" && reason.trim().length < 3) { toast.error("Please give a reason"); return; }
    if (action === "approve" && !window.confirm(`Approve ${r.name}? They can go online and take deliveries in your zone.`)) return;
    setBusy(true);
    try {
      const res = await franchiseAPI.decideRider(id, action, { reason });
      setR(res?.data?.data || r);
      toast.success(action === "approve" ? "Rider approved" : "Rider rejected");
      setRejecting(false);
      setReason("");
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Drawer open title={r ? r.name : "Rider"} onClose={onClose} footer={r && (
      rejecting ? <>
        <button className={btn.ghost} onClick={() => setRejecting(false)}>Cancel</button>
        <button className={btn.red} disabled={busy} onClick={() => act("reject")}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <XCircle className="w-4 h-4" />} Reject rider</button>
      </> : <>
        {r.status !== "rejected" && <button className={btn.ghost} disabled={busy} onClick={() => setRejecting(true)}><XCircle className="w-3.5 h-3.5" /> Reject</button>}
        {r.status !== "approved" && <button className={btn.green} disabled={busy} onClick={() => act("approve")}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Approve</button>}
      </>
    )}>
      {error ? <p className="text-sm text-red-600 font-semibold">{error}</p> : !r ? <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500 inline" /></div> : (
        <>
          <div className="flex items-center gap-2 flex-wrap"><Pill state={r.status} />{r.rejectionReason && <span className="text-xs text-red-600">Reason: {r.rejectionReason}</span>}</div>
          <div className="grid grid-cols-2 gap-3">
            <Info label="Phone" value={<a href={`tel:${r.phone}`} className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{r.phone}</a>} />
            <Info label="Email" value={r.email} />
            <Info label="City" value={r.city} />
            <Info label="Zone" value={r.zoneName} />
            <Info label="Vehicle" value={[r.vehicleType, r.vehicleName].filter(Boolean).join(" · ")} />
            <Info label="Vehicle number" value={r.vehicleNumber} />
            <Info label="Aadhaar" value={r.aadharNumber} />
            <Info label="PAN" value={r.panNumber} />
            <Info label="Driving licence" value={r.drivingLicenseNumber} />
            <Info label="Joined" value={when(r.joinedAt)} />
          </div>
          <div>
            <div className="text-[11px] font-extrabold text-slate-500 uppercase mb-2">Documents</div>
            <Documents docs={r.documents} />
          </div>
          {rejecting && <ReasonBox label="Why is this rider rejected?" value={reason} onChange={setReason} />}
        </>
      )}
    </Drawer>
  );
}

/* ================================ TAXI DRIVERS ================================ */

export function TaxiDriversManagePage() {
  const [state, setState] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const search = useDebounced(searchInput);
  const [list, load] = usePaged(franchiseAPI.getTaxiDrivers, { state: state || undefined, search: search || undefined });
  const [open, setOpen] = useState(null);

  return (
    <Card title="Drivers in your taxi zone" icon={Users} right={
      <div className="relative w-64 max-w-full"><Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        <input className={`${inputCls} !py-2 pl-9`} placeholder="Name, phone, vehicle no." value={searchInput} onChange={(e) => setSearchInput(e.target.value)} /></div>
    }>
      <div className="mb-4"><Tabs value={state} onChange={setState} tabs={[["", "All"], ["pending", "Pending"], ["approved", "Approved"], ["blocked", "Blocked"], ["rejected", "Rejected"]]} /></div>
      <DataTable head={["Driver", "Vehicle", "Status", "Online", "Rating", "Joined", ""]} colSpan={7} state={list}
        empty={state === "pending" ? "No drivers waiting for approval." : "No drivers found in your taxi zone."}>
        {list.items.map((d) => (
          <tr key={d.id} className="hover:bg-slate-50 cursor-pointer" onClick={() => setOpen(d.id)}>
            <td className="py-3 px-4"><div className="font-bold text-slate-900">{d.name}</div><div className="text-[10px] text-slate-400">{d.phone}</div></td>
            <td className="py-3 px-4"><div>{d.vehicleType || "-"}</div><div className="text-[10px] text-slate-400">{d.vehicleNumber}</div></td>
            <td className="py-3 px-4"><Pill state={d.state} /></td>
            <td className="py-3 px-4">{d.online ? "🟢 Online" : "⚪ Offline"}</td>
            <td className="py-3 px-4">{d.rating ? Number(d.rating).toFixed(1) : "-"}</td>
            <td className="py-3 px-4 text-slate-500">{when(d.joinedAt)}</td>
            <td className="py-3 px-4"><button className={btn.ghost}><Eye className="w-3.5 h-3.5" /> View</button></td>
          </tr>
        ))}
      </DataTable>
      <Pager page={list.page} limit={list.limit} total={list.total} onPage={load} />
      {open && <DriverDrawer id={open} onClose={() => setOpen(null)} onChanged={() => load(list.page)} />}
    </Card>
  );
}

function DriverDrawer({ id, onClose, onChanged }) {
  const [d, setD] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [pending, setPending] = useState(null); // 'reject' | 'block'
  const [reason, setReason] = useState("");

  useEffect(() => {
    franchiseAPI.getTaxiDriver(id).then((res) => setD(res?.data?.data)).catch((e) => setError(errMsg(e, "Could not load driver")));
  }, [id]);

  const act = async (action) => {
    if ((action === "reject" || action === "block") && reason.trim().length < 3) { toast.error("Please give a reason"); return; }
    if ((action === "approve" || action === "unblock") && !window.confirm(`${action === "approve" ? "Approve" : "Unblock"} ${d.name}? They can go online and take rides.`)) return;
    setBusy(true);
    try {
      const res = await franchiseAPI.decideTaxiDriver(id, action, { reason });
      setD(res?.data?.data || d);
      toast.success({ approve: "Driver approved", reject: "Driver rejected", block: "Driver blocked", unblock: "Driver unblocked" }[action]);
      setPending(null);
      setReason("");
      onChanged();
    } catch (e) {
      toast.error(errMsg(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  };

  const footer = d && (pending ? <>
    <button className={btn.ghost} onClick={() => setPending(null)}>Cancel</button>
    <button className={pending === "block" ? btn.amber : btn.red} disabled={busy} onClick={() => act(pending)}>
      {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : pending === "block" ? <Ban className="w-4 h-4" /> : <XCircle className="w-4 h-4" />} {pending === "block" ? "Block driver" : "Reject driver"}
    </button>
  </> : <>
    {d.state === "pending" && <button className={btn.ghost} disabled={busy} onClick={() => setPending("reject")}><XCircle className="w-3.5 h-3.5" /> Reject</button>}
    {d.state === "approved" && <button className={btn.amber} disabled={busy || d.onRide} title={d.onRide ? "On a ride now" : ""} onClick={() => setPending("block")}><Ban className="w-4 h-4" /> Block</button>}
    {d.state === "blocked" && <button className={btn.green} disabled={busy} onClick={() => act("unblock")}><RotateCcw className="w-4 h-4" /> Unblock</button>}
    {(d.state === "pending" || d.state === "rejected") && <button className={btn.green} disabled={busy} onClick={() => act("approve")}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Approve</button>}
  </>);

  return (
    <Drawer open title={d ? d.name : "Driver"} onClose={onClose} footer={footer}>
      {error ? <p className="text-sm text-red-600 font-semibold">{error}</p> : !d ? <div className="py-16 text-center"><Loader2 className="w-6 h-6 animate-spin text-indigo-500 inline" /></div> : (
        <>
          <div className="flex items-center gap-2 flex-wrap"><Pill state={d.state} />{d.onRide && <span className="text-[10px] font-bold text-blue-700 bg-blue-50 px-2 py-0.5 rounded">ON A RIDE</span>}{d.blockReason && <span className="text-xs text-red-600">Reason: {d.blockReason}</span>}</div>
          <div className="grid grid-cols-2 gap-3">
            <Info label="Phone" value={<a href={`tel:${d.phone}`} className="inline-flex items-center gap-1"><Phone className="w-3 h-3" />{d.phone}</a>} />
            <Info label="Email" value={d.email} />
            <Info label="Vehicle" value={<span className="inline-flex items-center gap-1"><Car className="w-3 h-3" />{[d.vehicleType, d.vehicleMake, d.vehicleModel].filter(Boolean).join(" · ")}</span>} />
            <Info label="Vehicle number" value={d.vehicleNumber} />
            <Info label="Colour" value={d.vehicleColor} />
            <Info label="City" value={d.city} />
            <Info label="Rating" value={d.rating ? `${Number(d.rating).toFixed(1)} (${d.ratingCount})` : "-"} />
            <Info label="Joined" value={when(d.joinedAt)} />
          </div>
          <div>
            <div className="text-[11px] font-extrabold text-slate-500 uppercase mb-2">Documents</div>
            <Documents docs={d.documents} />
          </div>
          {pending && <ReasonBox label={pending === "block" ? "Why is this driver blocked?" : "Why is this driver rejected?"} value={reason} onChange={setReason} />}
        </>
      )}
    </Drawer>
  );
}

/* ================================ PAYMENTS (FOOD) ================================ */

const METHOD = { cash: "Cash", razorpay: "Online", razorpay_qr: "QR", wallet: "Wallet" };
const PAY_STYLE = { paid: "bg-emerald-100 text-emerald-800", cod_pending: "bg-amber-100 text-amber-800", failed: "bg-red-100 text-red-800", refunded: "bg-orange-100 text-orange-800" };

export function FoodPaymentsPage() {
  const [filters, setFilters] = useState({ from: "", to: "", method: "", status: "", refund: "" });
  const [list, load] = usePaged(franchiseAPI.getFoodPayments, Object.fromEntries(Object.entries(filters).filter(([, v]) => v)));
  const sum = list.extra?.summary;

  return (
    <div className="space-y-5">
      {sum && (
        <div className="grid grid-cols-2 xl:grid-cols-5 gap-4">
          <StatCard label="Orders" value={sum.totalOrders} icon={CreditCard} tone="indigo" />
          <StatCard label="Order value" value={inr(sum.totalAmount)} icon={CreditCard} tone="violet" />
          <StatCard label="Online" value={inr((sum.byMethod.razorpay?.amount || 0) + (sum.byMethod.razorpay_qr?.amount || 0))} icon={CreditCard} tone="blue" />
          <StatCard label="Cash" value={inr(sum.byMethod.cash?.amount)} icon={CreditCard} tone="amber" />
          <StatCard label="Refunded" value={inr(sum.totalRefunded)} icon={RotateCcw} tone="emerald" />
        </div>
      )}
      <Card title="Order payments" icon={CreditCard}>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-4">
          <input type="date" className={`${inputCls} !py-2`} value={filters.from} max={filters.to || undefined} onChange={(e) => setFilters({ ...filters, from: e.target.value })} aria-label="From" />
          <input type="date" className={`${inputCls} !py-2`} value={filters.to} min={filters.from || undefined} onChange={(e) => setFilters({ ...filters, to: e.target.value })} aria-label="To" />
          <select className={`${inputCls} !py-2`} value={filters.method} onChange={(e) => setFilters({ ...filters, method: e.target.value })}>
            <option value="">All methods</option>{Object.entries(METHOD).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select className={`${inputCls} !py-2`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
            <option value="">All payment states</option><option value="paid">Paid</option><option value="cod_pending">Cash pending</option><option value="failed">Failed</option><option value="refunded">Refunded</option>
          </select>
          <select className={`${inputCls} !py-2`} value={filters.refund} onChange={(e) => setFilters({ ...filters, refund: e.target.value })}>
            <option value="">With or without refund</option><option value="yes">Refunded orders only</option>
          </select>
        </div>
        <DataTable head={["Order", "Restaurant", "Total", "Method", "Payment", "Refund", "Restaurant share", "Rider share", "Platform earning", "Date"]} colSpan={10} state={list} empty="No payments for these filters.">
          {list.items.map((p) => (
            <tr key={p.id} className="hover:bg-slate-50">
              <td className="py-3 px-4 font-bold text-slate-900">{p.orderId}<div className="text-[10px] text-slate-400 font-medium">{p.orderStatus}</div></td>
              <td className="py-3 px-4">{p.restaurantName}</td>
              <td className="py-3 px-4 font-black">{inr(p.total)}</td>
              <td className="py-3 px-4">{METHOD[p.method] || p.method || "-"}</td>
              <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${PAY_STYLE[p.paymentStatus] || "bg-slate-100 text-slate-600"}`}>{p.paymentStatus || "-"}</span></td>
              <td className="py-3 px-4">{p.refundStatus !== "none" ? <span className="text-orange-700 font-bold">{inr(p.refundAmount)} {p.refundStatus}</span> : "-"}</td>
              <td className="py-3 px-4">{inr(p.restaurantShare)}{p.restaurantSettled && <div className="text-[10px] text-emerald-600 font-bold">settled</div>}</td>
              <td className="py-3 px-4">{inr(p.riderShare)}</td>
              <td className="py-3 px-4 font-bold text-indigo-700">{inr(p.platformEarning)}</td>
              <td className="py-3 px-4 text-slate-500">{when(p.createdAt)}</td>
            </tr>
          ))}
        </DataTable>
        <Pager page={list.page} limit={list.limit} total={list.total} onPage={load} />
        <p className="text-[11px] text-slate-400 mt-2">"Platform earning" is what your franchise earnings are calculated on (the platform keeps its commission %, the rest is credited to you). Restaurant and rider payouts are made by the platform.</p>
      </Card>
    </div>
  );
}

/* ================================ DELIVERY FEE (FOOD) ================================ */

const blankSlab = (from = 0) => ({ minDistance: String(from), maxDistance: "", basePayout: "0", commissionPerKm: "0" });
const toForm = (s) => ({
  minDistance: String(s.minDistance ?? 0),
  maxDistance: s.maxDistance === null || s.maxDistance === undefined ? "" : String(s.maxDistance),
  basePayout: String(s.basePayout ?? 0),
  commissionPerKm: String(s.commissionPerKm ?? 0),
});
const money = (v) => /^\d+(\.\d{1,2})?$/.test(String(v ?? "").trim());

/** Fee a customer pays for a delivery of `km` with these slabs (same formula as the server; preview only). */
function previewFee(slabs, km) {
  const rows = slabs.map((s) => ({ min: Number(s.minDistance), max: s.maxDistance === "" ? null : Number(s.maxDistance), base: Number(s.basePayout), perKm: Number(s.commissionPerKm) }))
    .filter((r) => Number.isFinite(r.min)).sort((a, b) => a.min - b.min);
  if (!rows.length) return null;
  const slab = rows.find((r) => km >= r.min && (r.max === null || km < r.max)) || [...rows].reverse().find((r) => km >= r.min) || rows[0];
  const baseSlab = rows.find((r) => r.min <= 0) || rows[0];
  if (slab.min <= 0) return Math.round((slab.base + slab.perKm * km) * 100) / 100;
  const excess = baseSlab.max === null ? km : Math.max(0, km - baseSlab.max);
  return Math.round((baseSlab.base + slab.perKm * excess) * 100) / 100;
}

export function DeliveryFeePage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [slabs, setSlabs] = useState([]);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const res = await franchiseAPI.getDeliveryFees();
      const d = res?.data?.data;
      setData(d);
      const source = d?.zoneSlabs?.length ? d.zoneSlabs : d?.platformSlabs || [];
      setSlabs(source.length ? source.map(toForm) : [blankSlab(0)]);
    } catch (e) {
      setError(errMsg(e, "Could not load delivery fees"));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const set = (i, patch) => setSlabs((list) => list.map((s, j) => (j === i ? { ...s, ...patch } : s)));
  const addSlab = () => setSlabs((list) => {
    const last = list[list.length - 1];
    const from = last && last.maxDistance !== "" ? last.maxDistance : String(Number(last?.minDistance || 0) + 5);
    const fixed = last && last.maxDistance === "" ? list.map((s, j) => (j === list.length - 1 ? { ...s, maxDistance: from } : s)) : list;
    return [...fixed, blankSlab(from)];
  });
  const removeSlab = (i) => setSlabs((list) => list.filter((_, j) => j !== i));

  const problems = [];
  slabs.forEach((s, i) => {
    if (![s.minDistance, s.basePayout, s.commissionPerKm].every(money) || (s.maxDistance !== "" && !money(s.maxDistance))) problems.push(`Row ${i + 1}: use numbers only (max 2 decimals)`);
    else if (s.maxDistance !== "" && Number(s.maxDistance) <= Number(s.minDistance)) problems.push(`Row ${i + 1}: "To" must be more than "From"`);
  });
  const sorted = [...slabs].sort((a, b) => Number(a.minDistance) - Number(b.minDistance));
  if (sorted.length && Number(sorted[0].minDistance) !== 0) problems.push("The first slab must start at 0 km");
  sorted.forEach((s, i) => {
    if (i > 0) {
      const prev = sorted[i - 1];
      if (prev.maxDistance === "" || Number(s.minDistance) < Number(prev.maxDistance)) problems.push(`Slabs ${i} and ${i + 1} overlap`);
    }
  });

  const save = async () => {
    if (problems.length) { toast.error(problems[0]); return; }
    if (!window.confirm("Save these delivery fees for your zone? New orders from restaurants in your zone will use them right away.")) return;
    setBusy(true);
    try {
      const res = await franchiseAPI.saveDeliveryFees({ slabs: slabs.map((s) => ({ ...s, maxDistance: s.maxDistance === "" ? null : s.maxDistance })), reason });
      setData(res?.data?.data);
      setReason("");
      toast.success("Delivery fees saved for your zone");
    } catch (e) {
      toast.error(errMsg(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    if (!window.confirm("Go back to the platform delivery fee for your zone?")) return;
    setBusy(true);
    try {
      const res = await franchiseAPI.resetDeliveryFees();
      setData(res?.data?.data);
      setSlabs((res?.data?.data?.platformSlabs || []).map(toForm));
      toast.success("Platform delivery fee applies again");
    } catch (e) {
      toast.error(errMsg(e, "Could not reset"));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <Card title="Delivery fee" icon={Bike}><p className="text-sm text-red-600 font-semibold">{error}</p><button className={`${btn.ghost} mt-3`} onClick={load}>Try again</button></Card>;
  if (!data) return <div className="py-20 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-500 inline" /></div>;

  const valid = !problems.length;
  return (
    <div className="space-y-5">
      <div className={`p-4 rounded-2xl border text-sm font-semibold ${data.usingZoneFees ? "bg-emerald-50 border-emerald-200 text-emerald-900" : "bg-slate-50 border-slate-200 text-slate-700"}`}>
        {data.usingZoneFees
          ? <>Your zone <b>{data.zone.name}</b> uses <b>your own</b> delivery fee below.</>
          : <>Your zone <b>{data.zone.name}</b> uses the <b>platform delivery fee</b>. Edit the table and save to set your own.</>}
        <div className="text-xs font-medium mt-1 opacity-80">The delivery fee is paid by the customer and goes fully to the rider. It does not change your earnings or the platform commission.</div>
      </div>

      <Card title="Delivery fee slabs" icon={Bike} right={<button className={btn.ghost} onClick={addSlab} disabled={slabs.length >= (data.limits?.maxSlabs || 10)}>+ Add slab</button>}>
        <div className="overflow-x-auto">
          <table className="w-full text-xs min-w-[640px]">
            <thead className="text-[10px] font-bold uppercase text-slate-500 text-left">
              <tr><th className="py-2 pr-2">From (km)</th><th className="py-2 pr-2">To (km)</th><th className="py-2 pr-2">Base fee (₹)</th><th className="py-2 pr-2">Per km (₹)</th><th className="py-2 pr-2">Example</th><th /></tr>
            </thead>
            <tbody>
              {slabs.map((s, i) => {
                const exampleKm = s.maxDistance !== "" ? Math.max(Number(s.minDistance), Number(s.maxDistance) - 0.5) : Number(s.minDistance) + 2;
                const fee = valid ? previewFee(slabs, exampleKm) : null;
                return (
                  <tr key={i} className="border-t border-slate-100">
                    <td className="py-2 pr-2"><input inputMode="decimal" className={`${inputCls} !py-2`} value={s.minDistance} onChange={(e) => set(i, { minDistance: e.target.value })} aria-label="From km" /></td>
                    <td className="py-2 pr-2"><input inputMode="decimal" className={`${inputCls} !py-2`} value={s.maxDistance} placeholder="No limit" onChange={(e) => set(i, { maxDistance: e.target.value })} aria-label="To km" /></td>
                    <td className="py-2 pr-2"><input inputMode="decimal" className={`${inputCls} !py-2`} value={s.basePayout} onChange={(e) => set(i, { basePayout: e.target.value })} aria-label="Base fee" /></td>
                    <td className="py-2 pr-2"><input inputMode="decimal" className={`${inputCls} !py-2`} value={s.commissionPerKm} onChange={(e) => set(i, { commissionPerKm: e.target.value })} aria-label="Per km fee" /></td>
                    <td className="py-2 pr-2 text-slate-500 whitespace-nowrap">{fee !== null && Number.isFinite(exampleKm) ? `${exampleKm} km → ${inr(fee)}` : "-"}</td>
                    <td className="py-2">{slabs.length > 1 && <button className={btn.ghost} onClick={() => removeSlab(i)} aria-label="Remove slab"><X className="w-3.5 h-3.5" /></button>}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {problems.length > 0 && <ul className="mt-3 text-[11px] font-semibold text-red-600 list-disc pl-4">{problems.slice(0, 4).map((p) => <li key={p}>{p}</li>)}</ul>}
        <p className="text-[11px] text-slate-400 mt-3">How it works: inside the first slab the customer pays base fee + per-km x distance. Beyond it: the first slab base fee + that slab per-km x the extra distance. Leave "To" empty on the last slab for no limit.</p>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
          <div className="sm:col-span-2">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Note (optional)</label>
            <input className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Monsoon pricing" />
          </div>
          <div className="flex gap-2 flex-wrap">
            <button className={btn.green} disabled={busy || !valid} onClick={save}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Save for my zone</button>
            {data.usingZoneFees && <button className={btn.ghost} disabled={busy} onClick={reset}><RotateCcw className="w-3.5 h-3.5" /> Use platform fee</button>}
          </div>
        </div>
      </Card>

      <Card title="Platform delivery fee (for reference)" icon={CreditCard}>
        {!data.platformSlabs?.length ? <p className="text-xs text-slate-400">The platform has no delivery fee slabs configured.</p> : (
          <table className="w-full text-xs">
            <thead className="text-[10px] font-bold uppercase text-slate-500 text-left"><tr><th className="py-2">Distance</th><th>Base fee</th><th>Per km</th></tr></thead>
            <tbody>{data.platformSlabs.map((s) => (
              <tr key={s.id} className="border-t border-slate-100"><td className="py-2">{s.minDistance} – {s.maxDistance ?? "∞"} km</td><td>{inr(s.basePayout)}</td><td>{inr(s.commissionPerKm)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
