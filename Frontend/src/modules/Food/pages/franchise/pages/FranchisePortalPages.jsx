import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, Car, Users, IndianRupee, Wallet, Clock, ChevronLeft, ChevronRight, Send, Save, TrendingUp,
  Store, ShoppingBag, MessageSquare, BusFront,
} from "lucide-react";
import { franchiseAPI } from "@food/api";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const errMsg = (e, fb) => e?.response?.data?.message || e?.message || fb;
const inputCls = "w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-1";

export function Card({ title, icon: Icon, right, children }) {
  return (
    <div className="bg-white rounded-[22px] border border-slate-200 shadow-sm">
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 px-6 py-4 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">{Icon && <Icon className="w-4 h-4 text-indigo-600" />} {title}</h3>
          {right}
        </div>
      )}
      <div className="p-6">{children}</div>
    </div>
  );
}

export function StatCard({ label, value, sub, icon: Icon, tone = "indigo" }) {
  const tones = {
    indigo: "bg-indigo-50 text-indigo-600", emerald: "bg-emerald-50 text-emerald-600", amber: "bg-amber-50 text-amber-600",
    blue: "bg-blue-50 text-blue-600", violet: "bg-violet-50 text-violet-600",
  };
  return (
    <div className="bg-white p-5 rounded-[22px] border border-slate-200 shadow-sm flex flex-col gap-3">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center ${tones[tone] || tones.indigo}`}>{Icon && <Icon size={22} />}</div>
      <div>
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">{label}</p>
        <p className="text-2xl font-black text-slate-900 mt-0.5">{value}</p>
        {sub && <p className="text-[11px] font-semibold text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

export const Spinner = () => <div className="flex h-[300px] items-center justify-center"><Loader2 className="animate-spin text-indigo-500 w-9 h-9" /></div>;

function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between mt-4 text-xs font-semibold text-slate-500">
      <span>{total} total</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="p-1.5 rounded-lg bg-slate-100 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
        <span>Page {page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="p-1.5 rounded-lg bg-slate-100 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

function usePagedTaxi(fetcher, filters) {
  const [state, setState] = useState({ items: [], total: 0, page: 1, limit: 15, loading: true, error: "" });
  const key = JSON.stringify(filters || {});
  const load = useCallback(async (page = 1) => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const res = await fetcher({ page, limit: 15, ...(filters || {}) });
      const d = res?.data?.data || {};
      setState({ items: d.items || [], total: d.total || 0, page: d.page || page, limit: d.limit || 15, loading: false, error: "" });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: errMsg(e, "Could not load data") }));
    }
  }, [key]);
  useEffect(() => { load(1); }, [load]);
  return [state, load];
}

const Table = ({ head, children, loading, error, empty, colSpan }) => (
  <div className="overflow-x-auto border border-slate-200 rounded-2xl">
    <table className="w-full text-xs text-left">
      <thead className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]"><tr>{head.map((h) => <th key={h} className="py-3 px-4">{h}</th>)}</tr></thead>
      <tbody className="divide-y divide-slate-100 font-medium">
        {loading ? <tr><td colSpan={colSpan} className="py-10 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
          : error ? <tr><td colSpan={colSpan} className="py-10 text-center text-red-500">{error}</td></tr>
          : empty ? <tr><td colSpan={colSpan} className="py-10 text-center text-slate-400">{empty}</td></tr>
          : children}
      </tbody>
    </table>
  </div>
);

/* ---------------------------------- TAXI ---------------------------------- */

export function TaxiDashboardPage() {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => {
    franchiseAPI.getTaxiOverview().then((r) => setData(r?.data?.data || null)).catch((e) => setError(errMsg(e, "Could not load taxi data")));
  }, []);
  if (error) return <Card><p className="text-sm font-semibold text-red-600">{error}</p></Card>;
  if (!data) return <Spinner />;
  return (
    <div className="space-y-6">
      {!data.taxiZoneId && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-800">
          Your taxi zone has not been assigned yet. Ask the admin to assign one. Until then no taxi rides or drivers can be linked to your franchise.
        </div>
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard label="Drivers" value={data.drivers.total} sub={`${data.drivers.online} online · ${data.drivers.approved} approved`} icon={Users} tone="blue" />
        <StatCard label="Rides completed" value={data.rides.completed} sub={`${data.rides.today} today`} icon={Car} tone="indigo" />
        <StatCard label="Ride value" value={inr(data.rides.gmv)} sub={`${inr(data.rides.todayGMV)} today`} icon={IndianRupee} tone="amber" />
        <StatCard label="Your taxi earnings" value={inr(data.earned)} sub={`${data.commissionRate}% commission${data.zone?.name ? ` · ${data.zone.name}` : ""}`} icon={TrendingUp} tone="emerald" />
      </div>
      <Card title="Earnings by service" icon={TrendingUp}>
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          {(data.services || []).map((s) => (
            <div key={s.key} className="p-4 rounded-2xl border border-slate-200 bg-slate-50">
              <div className="text-[11px] font-bold text-indigo-600 uppercase">{s.label}</div>
              <div className="text-2xl font-black text-slate-900 mt-1">{s.count}</div>
              <div className="text-[11px] font-semibold text-slate-400">{["bus", "pooling", "rental"].includes(s.key) ? "credited bookings" : "completed rides"}</div>
              <div className="text-xs font-bold text-slate-600 mt-1">{["bus", "pooling", "rental"].includes(s.key) ? `Earned ${inr(s.earned)}` : s.value ? `Ride value ${inr(s.value)}` : "-"}</div>
            </div>
          ))}
        </div>
        <p className="text-[11px] font-semibold text-slate-400 mt-3">Which services earn for franchises, and on what base, is set by the admin ({data.rules?.commissionBase === "fare" ? "on what the customer paid" : "on the platform's commission"}). Services that are switched off show 0.</p>
      </Card>
    </div>
  );
}

export function TaxiRidesPage() {
  const [service, setService] = useState("");
  const [rides, load] = usePagedTaxi(franchiseAPI.getTaxiRides, { service: service || undefined });
  return (
    <Card title="Completed rides in your zone" icon={Car} right={
      <select value={service} onChange={(e) => setService(e.target.value)} className={`${inputCls} !w-44 !py-2`}>
        <option value="">All services</option><option value="ride">City taxi</option><option value="intercity">Outstation</option><option value="parcel">Parcel</option>
      </select>
    }>
      <Table head={["Ride", "Service", "Rider", "Driver", "Status", "Fare", "Payment", "You earned", "Date"]} colSpan={9} loading={rides.loading} error={rides.error}
        empty={rides.items.length === 0 ? "No rides yet. Completed rides of drivers in your taxi zone appear here." : ""}>
        {rides.items.map((r) => (
          <tr key={r.id} className="hover:bg-slate-50">
            <td className="py-3 px-4 font-bold text-slate-900">{r.rideCode}</td>
            <td className="py-3 px-4"><span className="px-2 py-0.5 rounded bg-indigo-50 text-indigo-700 text-[10px] font-bold">{r.serviceLabel}</span></td>
            <td className="py-3 px-4"><div>{r.riderName}</div><div className="text-[10px] text-slate-400">{r.riderPhone}</div></td>
            <td className="py-3 px-4">{r.driverName}</td>
            <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.status === "refunded" ? "bg-orange-100 text-orange-800" : "bg-emerald-100 text-emerald-800"}`}>{r.status}</span></td>
            <td className="py-3 px-4 font-bold">{inr(r.fare)}</td>
            <td className="py-3 px-4 uppercase">{r.paymentMethod}</td>
            <td className="py-3 px-4 font-bold text-emerald-700">{r.franchiseEarned ? inr(r.franchiseEarned) : "-"}</td>
            <td className="py-3 px-4 text-slate-500">{when(r.completedAt)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={rides.page} limit={rides.limit} total={rides.total} onPage={load} />
    </Card>
  );
}

export function TaxiBusPage() {
  const [service, setService] = useState("bus");
  const [rows, load] = usePagedTaxi(franchiseAPI.getTaxiBus, { service });
  const note = {
    bus: "Buses pinned to your franchise or run by operators in your service location. Your share is credited after the travel date has passed.",
    pooling: "Completed and paid pooling bookings that start inside your taxi zone.",
    rental: "Completed and paid rentals inside your taxi zone.",
  }[service];
  return (
    <Card title="Bus, pooling & rental" icon={BusFront} right={
      <select value={service} onChange={(e) => setService(e.target.value)} className={`${inputCls} !w-44 !py-2`}>
        <option value="bus">Bus service</option><option value="pooling">Pooling</option><option value="rental">Rental</option>
      </select>
    }>
      <p className="text-[11px] font-semibold text-slate-400 mb-4">{note}</p>
      <Table head={["Booking", "Route", "Operator", "Date", "Seats / hours", "Fare", "Commission base", "You earned"]} colSpan={8} loading={rows.loading} error={rows.error} empty={rows.items.length === 0 ? "Nothing credited yet. The admin decides which services earn for franchises." : ""}>
        {rows.items.map((b) => (
          <tr key={b.id} className="hover:bg-slate-50">
            <td className="py-3 px-4 font-bold text-slate-900">{b.bookingCode}</td>
            <td className="py-3 px-4">{b.route}</td>
            <td className="py-3 px-4">{b.operator}</td>
            <td className="py-3 px-4">{b.travelDate}</td>
            <td className="py-3 px-4">{b.seats}</td>
            <td className="py-3 px-4 font-bold">{inr(b.amount)}</td>
            <td className="py-3 px-4">{inr(b.platformEarning)}</td>
            <td className="py-3 px-4 font-bold text-emerald-700">{b.franchiseEarned ? inr(b.franchiseEarned) : "-"}</td>
          </tr>
        ))}
      </Table>
      <Pager page={rows.page} limit={rows.limit} total={rows.total} onPage={load} />
    </Card>
  );
}

export function TaxiDriversPage() {
  const [search, setSearch] = useState("");
  const [drivers, load] = usePagedTaxi(franchiseAPI.getTaxiDrivers, { search: search || undefined });
  return (
    <Card title="Drivers in your zone" icon={Users} right={<input className={`${inputCls} !w-56 !py-2`} placeholder="Search name / phone" value={search} onChange={(e) => setSearch(e.target.value)} />}>
      <Table head={["Driver", "Vehicle", "Approval", "Online", "Rating", "Joined"]} colSpan={6} loading={drivers.loading} error={drivers.error} empty={drivers.items.length === 0 ? "No drivers found in your taxi zone." : ""}>
        {drivers.items.map((d) => (
          <tr key={d.id} className="hover:bg-slate-50">
            <td className="py-3 px-4"><div className="font-bold text-slate-900">{d.name}</div><div className="text-[10px] text-slate-400">{d.phone}</div></td>
            <td className="py-3 px-4"><div>{d.vehicleType || "-"}</div><div className="text-[10px] text-slate-400">{d.vehicleNumber}</div></td>
            <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{d.approved ? "Approved" : "Pending"}</span></td>
            <td className="py-3 px-4">{d.online ? "🟢 Online" : "⚪ Offline"}</td>
            <td className="py-3 px-4">{d.rating ? Number(d.rating).toFixed(1) : "-"}</td>
            <td className="py-3 px-4 text-slate-500">{when(d.joinedAt)}</td>
          </tr>
        ))}
      </Table>
      <Pager page={drivers.page} limit={drivers.limit} total={drivers.total} onPage={load} />
    </Card>
  );
}

/* --------------------------------- MONEY ---------------------------------- */

const MODULE_LABEL = { food: "Food", taxi: "Taxi" };

/** Earnings: where the money came from. `modules` limits it to what this franchise holds. */
export function EarningsPage({ dash, modules }) {
  const [filter, setFilter] = useState("all");
  if (!dash) return <Spinner />;
  const by = dash.earningsByModule || {};
  const ledger = (dash.ledger || []).filter((l) => filter === "all" || l.module === filter);
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
        <StatCard label="Total earned" value={inr((by.food || 0) + (by.taxi || 0))} icon={TrendingUp} tone="emerald" />
        {modules.includes("food") && <StatCard label="Food earnings" value={inr(by.food)} sub={`${dash.territoryMetrics?.deliveredOrders || 0} delivered orders`} icon={Store} tone="amber" />}
        {modules.includes("taxi") && <StatCard label="Taxi earnings" value={inr(by.taxi)} sub={`${dash.taxi?.rides?.completed || 0} rides`} icon={Car} tone="blue" />}
        <StatCard label="Wallet balance" value={inr(dash.financialSettings?.walletBalance)} sub={`Available ${inr(dash.financialSettings?.availableBalance)}`} icon={Wallet} tone="indigo" />
      </div>

      <Card title="Earning history" icon={IndianRupee} right={
        modules.length > 1 && (
          <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${inputCls} !w-40 !py-2`}>
            <option value="all">All</option>{modules.map((m) => <option key={m} value={m}>{MODULE_LABEL[m]}</option>)}
          </select>
        )
      }>
        <Table head={["Date", "Type", "Module", "Note", "Base", "Rate", "Amount"]} colSpan={7} empty={ledger.length === 0 ? "Nothing here yet. You earn when orders are delivered or rides are completed." : ""}>
          {ledger.map((l) => (
            <tr key={l._id}>
              <td className="py-3 px-4 text-slate-500">{when(l.createdAt)}</td>
              <td className="py-3 px-4 uppercase font-bold text-[10px]">{l.type}</td>
              <td className="py-3 px-4">{MODULE_LABEL[l.module] || "-"}</td>
              <td className="py-3 px-4">{l.note}</td>
              <td className="py-3 px-4">{l.base ? inr(l.base) : "-"}</td>
              <td className="py-3 px-4">{l.rate ? `${l.rate}%` : "-"}</td>
              <td className={`py-3 px-4 font-bold ${l.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>{l.amount < 0 ? "-" : "+"}{inr(Math.abs(l.amount))}</td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/** Wallet: balance, payout requests and the bank / UPI details used for payouts. */
export function WalletPage({ dash, reload }) {
  const fin = dash?.financialSettings || {};
  const bank = fin.paymentAccountInfo || {};
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState("bank");
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState(bank);
  const [savingBank, setSavingBank] = useState(false);
  useEffect(() => { setForm(dash?.financialSettings?.paymentAccountInfo || {}); }, [dash]);
  if (!dash) return <Spinner />;

  const feePending = fin.franchiseFeeStatus === "pending";
  const hasDetails = method === "upi" ? Boolean(bank.upiId) : Boolean(bank.accountNumber && bank.ifscCode);

  const requestPayout = async () => {
    const amt = Number(amount);
    if (!(amt > 0)) { toast.error("Enter an amount"); return; }
    setBusy(true);
    try {
      await franchiseAPI.requestWithdrawal({ amount: amt, payoutMethod: method });
      toast.success("Payout request sent to the admin");
      setAmount("");
      reload?.();
    } catch (e) {
      toast.error(errMsg(e, "Could not send the request"));
    } finally {
      setBusy(false);
    }
  };

  const saveBank = async () => {
    setSavingBank(true);
    try {
      await franchiseAPI.updateBankDetails(form);
      toast.success("Bank details saved");
      reload?.();
    } catch (e) {
      toast.error(errMsg(e, "Could not save bank details"));
    } finally {
      setSavingBank(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        <StatCard label="Wallet balance" value={inr(fin.walletBalance)} icon={Wallet} tone="indigo" />
        <StatCard label="Available to withdraw" value={inr(fin.availableBalance)} sub="After pending payout requests" icon={IndianRupee} tone="emerald" />
        <StatCard label="Minimum payout" value={inr(fin.minPayoutThreshold)} sub={`Cycle: ${fin.payoutCycle || "weekly"}`} icon={Clock} tone="amber" />
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <Card title="Request a payout" icon={Send}>
          {feePending && <div className="mb-4 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">Pay the franchise fee before requesting payouts.</div>}
          <div className="grid grid-cols-2 gap-3 mb-3">
            <div><label className={labelCls}>Amount (₹)</label><input type="number" min={0} className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 5000" /></div>
            <div><label className={labelCls}>Send to</label>
              <select className={inputCls} value={method} onChange={(e) => setMethod(e.target.value)}><option value="bank">Bank account</option><option value="upi">UPI</option></select>
            </div>
          </div>
          {!hasDetails && <p className="text-[11px] font-semibold text-amber-700 mb-3">Save your {method === "upi" ? "UPI ID" : "bank details"} first (form on the right).</p>}
          <button onClick={requestPayout} disabled={busy || feePending || !hasDetails} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-extrabold inline-flex items-center gap-2">
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Request payout
          </button>
        </Card>

        <Card title="Bank / UPI details" icon={Wallet}>
          <div className="grid grid-cols-2 gap-3">
            {[["accountHolderName", "Account holder"], ["bankName", "Bank name"], ["accountNumber", "Account number"], ["ifscCode", "IFSC"], ["upiId", "UPI ID"]].map(([k, label]) => (
              <div key={k} className={k === "upiId" || k === "accountHolderName" ? "col-span-2" : ""}>
                <label className={labelCls}>{label}</label>
                <input className={inputCls} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
              </div>
            ))}
          </div>
          <button onClick={saveBank} disabled={savingBank} className="mt-4 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-2">
            {savingBank ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save details
          </button>
        </Card>
      </div>

      <Card title="Payout history" icon={ShoppingBag}>
        <Table head={["Request", "Date", "Amount", "Method", "Status"]} colSpan={5} empty={(dash.payoutRequests || []).length === 0 ? "No payout requests yet." : ""}>
          {(dash.payoutRequests || []).map((p) => (
            <tr key={p.requestId}>
              <td className="py-3 px-4 font-bold text-indigo-600">#{String(p.requestId).slice(-8)}</td>
              <td className="py-3 px-4 text-slate-500">{when(p.requestedAt)}</td>
              <td className="py-3 px-4 font-black text-emerald-700">{inr(p.amount)}</td>
              <td className="py-3 px-4 uppercase">{p.payoutMethod}</td>
              <td className="py-3 px-4"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.status === "approved" ? "bg-emerald-100 text-emerald-800" : p.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{p.status === "approved" ? "Paid" : p.status}</span></td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

/* --------------------------------- SUPPORT -------------------------------- */

export function SupportPage({ dash, reload }) {
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  if (!dash) return <Spinner />;

  const send = async () => {
    if (!message.trim()) { toast.error("Write your message"); return; }
    setBusy(true);
    try {
      await franchiseAPI.sendSupportMessage({ subject: subject.trim() || "General inquiry", message: message.trim() });
      toast.success("Message sent to the admin");
      setSubject(""); setMessage("");
      reload?.();
    } catch (e) {
      toast.error(errMsg(e, "Could not send the message"));
    } finally {
      setBusy(false);
    }
  };

  const messages = [...(dash.supportMessages || [])].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  return (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 items-start">
      <Card title="Contact the admin" icon={MessageSquare}>
        <label className={labelCls}>Subject</label>
        <input className={`${inputCls} mb-3`} value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="e.g. Payout question" />
        <label className={labelCls}>Message</label>
        <textarea rows={5} className={`${inputCls} mb-3`} value={message} onChange={(e) => setMessage(e.target.value)} />
        <button onClick={send} disabled={busy} className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white text-xs font-extrabold inline-flex items-center gap-2">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />} Send
        </button>
      </Card>
      <div className="xl:col-span-2">
        <Card title={`Your messages (${messages.length})`} icon={MessageSquare}>
          {messages.length === 0 ? <p className="py-8 text-center text-xs font-semibold text-slate-400">No messages yet.</p> : (
            <div className="space-y-4">
              {messages.map((m, i) => (
                <div key={m.messageId || i} className="p-4 rounded-2xl border border-slate-200 bg-slate-50 text-xs space-y-2">
                  <div className="flex items-center justify-between gap-2"><b className="text-sm">{m.subject}</b><span className="text-slate-400">{when(m.createdAt)}</span></div>
                  <p className="text-slate-700 font-medium">{m.message}</p>
                  {m.reply ? <div className="p-3 rounded-xl bg-indigo-50 border border-indigo-200"><div className="font-bold text-indigo-900 mb-0.5">Admin reply</div><p className="text-slate-800 font-semibold">{m.reply}</p></div>
                    : <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-bold text-[10px]">Waiting for reply</span>}
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
