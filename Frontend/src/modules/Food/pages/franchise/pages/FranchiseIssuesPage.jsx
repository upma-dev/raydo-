import React, { useState, useEffect, useCallback } from "react";
import { toast } from "sonner";
import { Loader2, Send, User, Store, AlertTriangle } from "lucide-react";
import { franchiseAPI } from "@food/api";

const errMsg = (e, fb) => e?.response?.data?.message || e?.message || fb;
const STATUS = {
  open: "bg-amber-100 text-amber-800",
  "in-progress": "bg-blue-100 text-blue-800",
  resolved: "bg-emerald-100 text-emerald-800",
};

/** Issues raised by users and restaurants of this franchise's zone. The admin sees the same tickets and the reply. */
export default function FranchiseIssuesPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState({ status: "", source: "all" });
  const [reply, setReply] = useState({});
  const [busy, setBusy] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await franchiseAPI.getIssues({ status: filter.status || undefined, source: filter.source });
      setData(res?.data?.data || { items: [], total: 0, openCount: 0 });
      setError("");
    } catch (e) {
      setError(errMsg(e, "Could not load issues"));
    }
  }, [filter]);
  useEffect(() => { load(); }, [load]);

  const send = async (t, extra = {}) => {
    const key = `${t.source}:${t.id}`;
    const text = (reply[key] ?? "").trim();
    if (!("status" in extra) && !text) { toast.error("Write a reply first"); return; }
    setBusy(key);
    try {
      await franchiseAPI.respondIssue(t.source, t.id, { ...(text ? { response: text } : {}), ...extra });
      toast.success("Updated. The admin can see this too.");
      setReply((r) => ({ ...r, [key]: "" }));
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Could not update"));
    } finally {
      setBusy("");
    }
  };

  if (error) return <div className="p-6 rounded-2xl bg-red-50 border border-red-200 text-sm font-semibold text-red-700">{error} <button onClick={load} className="ml-3 underline">Retry</button></div>;
  if (!data) return <div className="py-20 text-center"><Loader2 className="w-7 h-7 animate-spin text-indigo-500 inline" /></div>;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-center gap-3 flex-wrap">
        <AlertTriangle className="w-5 h-5 text-amber-500" />
        <div className="flex-1 min-w-0">
          <h2 className="text-lg font-black">Zone issues</h2>
          <p className="text-xs text-slate-500">Problems raised by users and restaurants in your zone. Reply here: the admin sees every issue and your reply.</p>
        </div>
        <span className="px-3 py-1.5 rounded-lg bg-amber-100 text-amber-800 text-xs font-extrabold">{data.openCount} open</span>
        <select value={filter.source} onChange={(e) => setFilter({ ...filter, source: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold bg-white">
          <option value="all">Users + restaurants</option><option value="user">Users only</option><option value="restaurant">Restaurants only</option>
        </select>
        <select value={filter.status} onChange={(e) => setFilter({ ...filter, status: e.target.value })} className="px-3 py-2 rounded-lg border border-slate-300 text-xs font-bold bg-white">
          <option value="">All status</option><option value="open">Open</option><option value="in-progress">In progress</option><option value="resolved">Resolved</option>
        </select>
      </div>

      {data.items.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-sm font-semibold text-slate-400">No issues in your zone.</div>
      ) : data.items.map((t) => {
        const key = `${t.source}:${t.id}`;
        return (
          <div key={key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 space-y-3 text-xs">
            <div className="flex items-start justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-2 min-w-0">
                <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${t.source === "user" ? "bg-blue-50 text-blue-600" : "bg-orange-50 text-orange-600"}`}>
                  {t.source === "user" ? <User className="w-4 h-4" /> : <Store className="w-4 h-4" />}
                </div>
                <div className="min-w-0">
                  <div className="text-sm font-extrabold truncate">{t.issueType}{t.subject ? ` · ${t.subject}` : ""}</div>
                  <div className="text-[11px] text-slate-500">{t.source === "user" ? "Customer" : "Restaurant"}: <b>{t.raisedBy}</b>{t.source === "user" && t.restaurantName ? ` · ${t.restaurantName}` : ""}{t.orderRef ? ` · Order ${t.orderRef}` : ""} · {new Date(t.createdAt).toLocaleString("en-IN")}</div>
                </div>
              </div>
              <span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold uppercase ${STATUS[t.status] || "bg-slate-100"}`}>{t.status}</span>
            </div>
            {t.description && <div className="p-3 rounded-lg bg-slate-50 border border-slate-200 font-medium text-slate-800 whitespace-pre-wrap">{t.description}</div>}
            {t.adminResponse && <div className="p-3 rounded-lg bg-slate-100 border border-slate-200"><b>Admin:</b> {t.adminResponse}</div>}
            {t.franchiseResponse && <div className="p-3 rounded-lg bg-indigo-50 border border-indigo-200"><b>Your reply:</b> {t.franchiseResponse}</div>}
            <div className="flex gap-2 flex-wrap">
              <input value={reply[key] ?? ""} onChange={(e) => setReply({ ...reply, [key]: e.target.value })} placeholder={t.franchiseResponse ? "Update your reply" : "Write a reply"} className="flex-1 min-w-[200px] px-3 py-2 rounded-lg border border-slate-300 text-sm" />
              <button disabled={busy === key} onClick={() => { if (!(reply[key] ?? "").trim()) { toast.error("Write a reply first"); return; } send(t, { status: t.status === "open" ? "in-progress" : t.status }); }} className="px-4 rounded-lg bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white font-bold inline-flex items-center gap-1.5">
                {busy === key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} Reply
              </button>
              {t.status !== "resolved" && <button disabled={busy === key} onClick={() => send(t, { status: "resolved" })} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold">Mark resolved</button>}
              {t.status === "resolved" && <button disabled={busy === key} onClick={() => send(t, { status: "open" })} className="px-4 py-2 rounded-lg bg-white border border-slate-300 font-bold">Reopen</button>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
