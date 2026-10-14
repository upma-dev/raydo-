import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { User, Mail, Phone, MapPin, Store, FileText, Loader2, MapPinned, Power, Clock, CheckCircle2, XCircle, ExternalLink } from "lucide-react";
import { franchiseAPI } from "@food/api";

const errMsg = (e, fb) => e?.response?.data?.message || e?.message || fb;
const inputCls = "w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const STATUS = {
  pending: { label: "Waiting for admin", cls: "bg-amber-100 text-amber-800", Icon: Clock },
  approved: { label: "Approved", cls: "bg-emerald-100 text-emerald-800", Icon: CheckCircle2 },
  rejected: { label: "Rejected", cls: "bg-red-100 text-red-800", Icon: XCircle },
};
const TYPE = { zone_change: "Zone change", deactivate: "Deactivate account" };

function Box({ title, icon: Icon, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      <div className="px-5 py-4 border-b border-slate-100 text-sm font-extrabold text-slate-900 flex items-center gap-2"><Icon className="w-4 h-4 text-indigo-600" /> {title}</div>
      <div className="p-5">{children}</div>
    </div>
  );
}

const Row = ({ k, v }) => (
  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 min-w-0">
    <div className="text-[10px] font-bold text-slate-400 uppercase">{k}</div>
    <div className="text-sm font-semibold text-slate-900 mt-0.5 break-words">{v || "-"}</div>
  </div>
);

/** Partner's own profile: all details, restaurants count, and requests to the admin (zone change / deactivate). */
export default function FranchiseProfilePage({ onChanged }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [form, setForm] = useState(null); // { type, reason, territoryId }
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await franchiseAPI.getProfile();
      setData(res?.data?.data || null);
      setError("");
    } catch (e) {
      setError(errMsg(e, "Could not load your profile"));
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  const submit = async () => {
    if (form.type === "zone_change" && !form.territoryId) { toast.error("Choose the zone you want to move to"); return; }
    if ((form.reason || "").trim().length < 5) { toast.error("Please write the reason"); return; }
    setBusy(true);
    try {
      const res = await franchiseAPI.createRequest(form);
      setData(res?.data?.data || data);
      setForm(null);
      toast.success("Request sent to admin");
      onChanged?.();
    } catch (e) {
      toast.error(errMsg(e, "Could not send the request"));
    } finally {
      setBusy(false);
    }
  };

  if (error) return <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-sm font-semibold text-red-700">{error} <button onClick={load} className="ml-3 underline">Retry</button></div>;
  if (!data) return <div className="py-20 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-500 inline" /></div>;

  const f = data.franchise;
  const pending = (type) => data.requests.some((r) => r.type === type && r.status === "pending");

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-4 flex-wrap">
        <div className="w-14 h-14 rounded-2xl bg-indigo-50 flex items-center justify-center"><User className="w-7 h-7 text-indigo-600" /></div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-black truncate">{f.name}</h2>
          <div className="text-xs font-bold text-indigo-600">{f.applicationId}{f.companyName ? ` · ${f.companyName}` : ""}</div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {f.services.map((s) => <span key={s} className="px-3 py-1.5 rounded-lg bg-slate-100 text-xs font-extrabold">{s === "food" ? "Food" : "Taxi"}</span>)}
          <span className="px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-800 text-xs font-extrabold uppercase">{f.accountStatus}</span>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Box title="My details" icon={User}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Row k="Email" v={f.email} /><Row k="Phone" v={f.phone} />
            <Row k="City" v={[f.city, f.state].filter(Boolean).join(", ")} /><Row k="Area / pincode" v={[f.area, f.pincode].filter(Boolean).join(" · ")} />
            <Row k="Joined" v={new Date(f.joinedAt).toLocaleDateString("en-IN")} /><Row k="Payout cycle" v={f.payoutCycle} />
          </div>
        </Box>

        <Box title="My zone & restaurants" icon={MapPinned}>
          <div className="grid grid-cols-2 gap-3">
            <Row k="Current zone" v={data.zone ? `${data.zone.name}${data.zone.city ? ` (${data.zone.city})` : ""}` : "Not set"} />
            <Row k="Restaurants" v={String(data.restaurantCount)} />
          </div>
          <div className="flex gap-2 flex-wrap mt-4">
            <button disabled={pending("zone_change")} onClick={() => setForm({ type: "zone_change", reason: "", territoryId: "" })} className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold inline-flex items-center gap-2">
              <MapPin className="w-4 h-4" /> {pending("zone_change") ? "Zone change requested" : "Request zone change"}
            </button>
            <button disabled={pending("deactivate")} onClick={() => setForm({ type: "deactivate", reason: "" })} className="px-4 py-2.5 rounded-lg bg-white border border-red-300 text-red-600 hover:bg-red-50 disabled:opacity-50 text-xs font-bold inline-flex items-center gap-2">
              <Power className="w-4 h-4" /> {pending("deactivate") ? "Deactivation requested" : "Deactivate my account"}
            </button>
          </div>
          <p className="text-[11px] text-slate-400 mt-2">Both need admin approval. Nothing changes until the admin approves.</p>
        </Box>
      </div>

      {form && (
        <Box title={form.type === "zone_change" ? "Request zone change" : "Request account deactivation"} icon={form.type === "zone_change" ? MapPin : Power}>
          <div className="space-y-3 max-w-xl">
            {form.type === "zone_change" && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1.5">
                <div className="text-[10px] font-bold text-slate-400 uppercase">Your details (cannot be edited here)</div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Name</span><b>{f.name}</b></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Phone / email</span><b className="text-right break-all">{f.phone} · {f.email}</b></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Location</span><b className="text-right">{[f.area, f.city, f.state, f.pincode].filter(Boolean).join(", ") || "-"}</b></div>
                <div className="flex justify-between gap-3"><span className="text-slate-500">Current zone</span><b>{data.zone?.name || "Not set"}</b></div>
              </div>
            )}
            {form.type === "zone_change" && (
              <div>
                <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">New zone</label>
                <select className={inputCls} value={form.territoryId} onChange={(e) => setForm({ ...form, territoryId: e.target.value })}>
                  <option value="">-- Select zone --</option>
                  {data.zoneOptions.map((z) => <option key={z.id} value={z.id}>{z.name}{z.city ? ` (${z.city})` : ""}</option>)}
                </select>
                {!data.zoneOptions.length && <p className="text-[11px] text-amber-700 mt-1">No other zone is available for your services right now.</p>}
              </div>
            )}
            {form.type === "deactivate" && <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-xs font-semibold text-red-800">After approval your login is locked and your restaurants are informed. Your history and money records stay.</div>}
            <div>
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Reason *</label>
              <textarea rows={3} className={inputCls} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Tell the admin why" />
            </div>
            <div className="flex gap-2">
              <button disabled={busy} onClick={submit} className="px-4 py-2.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2">{busy && <Loader2 className="w-4 h-4 animate-spin" />} Send to admin</button>
              <button onClick={() => setForm(null)} className="px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-xs font-bold">Cancel</button>
            </div>
          </div>
        </Box>
      )}

      <Box title={`My requests (${data.requests.length})`} icon={Clock}>
        {data.requests.length ? (
          <div className="space-y-2">
            {data.requests.map((r) => {
              const st = STATUS[r.status] || STATUS.pending;
              return (
                <div key={r.requestId} className="p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                  <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="font-extrabold text-slate-900">{TYPE[r.type]}{r.requestedTerritoryName ? ` → ${r.requestedTerritoryName}` : ""}</div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold inline-flex items-center gap-1 ${st.cls}`}><st.Icon className="w-3 h-3" /> {st.label}</span>
                  </div>
                  <div className="text-slate-600 mt-1">{r.reason}</div>
                  {r.adminNote && <div className="mt-1 text-slate-800"><b>Admin:</b> {r.adminNote}</div>}
                  <div className="text-[10px] text-slate-400 mt-1">{new Date(r.requestedAt).toLocaleString("en-IN")}</div>
                </div>
              );
            })}
          </div>
        ) : <div className="py-6 text-center text-xs font-semibold text-slate-400">No requests yet.</div>}
      </Box>

      <Box title="My documents" icon={FileText}>
        {f.documents.length ? (
          <div className="flex gap-2 flex-wrap">
            {f.documents.map((d) => <a key={d.key} href={d.url} target="_blank" rel="noopener noreferrer" className="px-3 py-2 rounded-lg bg-slate-50 border border-slate-200 text-xs font-bold text-indigo-700 inline-flex items-center gap-1.5">{d.label} <ExternalLink className="w-3 h-3" /></a>)}
          </div>
        ) : <div className="py-4 text-xs font-semibold text-slate-400">No documents on file.</div>}
      </Box>
    </div>
  );
}
