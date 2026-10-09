import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import {
  Loader2, RefreshCw, Store, ShoppingBag, Wallet, UserCog, LayoutDashboard, Ban, CheckCircle2,
  Trash2, Save, ChevronLeft, ChevronRight, Archive, RotateCcw, ShieldAlert, Car, Users, BusFront,
} from "lucide-react";
import { adminAPI } from "@food/api";

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const when = (d) => (d ? new Date(d).toLocaleString("en-IN", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "-");
const errMsg = (e, fb) => e?.response?.data?.message || fb;
const inputCls = "w-full px-3 py-2 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

// Only the modules the franchise holds get tabs: a taxi-only franchise has no restaurants/orders and vice versa
const tabsFor = (modules) => [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  ...(modules.includes("food") ? [
    { id: "restaurants", label: "Restaurants", icon: Store },
    { id: "orders", label: "Food orders", icon: ShoppingBag },
  ] : []),
  ...(modules.includes("taxi") ? [
    { id: "rides", label: "Taxi rides", icon: Car },
    { id: "bus", label: "Bus, pooling & rental", icon: BusFront },
    { id: "drivers", label: "Taxi drivers", icon: Users },
  ] : []),
  { id: "money", label: "Money", icon: Wallet },
  { id: "account", label: "Account & edit", icon: UserCog },
];

const STATUS_STYLE = {
  delivered: "bg-emerald-100 text-emerald-800",
  cancelled: "bg-red-100 text-red-800",
  default: "bg-slate-100 text-slate-700",
};
const statusStyle = (s) => (String(s).startsWith("cancelled") || s === "rejected" ? STATUS_STYLE.cancelled : STATUS_STYLE[s] || STATUS_STYLE.default);

function Stat({ label, value, sub, tone = "text-slate-900" }) {
  return (
    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200">
      <div className="text-[10px] font-bold text-slate-500 uppercase">{label}</div>
      <div className={`text-xl font-black mt-1 ${tone}`}>{value}</div>
      {sub && <div className="text-[11px] text-slate-400 mt-0.5">{sub}</div>}
    </div>
  );
}

function Pager({ page, limit, total, onPage }) {
  const pages = Math.max(1, Math.ceil(total / limit));
  return (
    <div className="flex items-center justify-between mt-3 text-xs font-semibold text-slate-500">
      <span>{total} total</span>
      <div className="flex items-center gap-2">
        <button disabled={page <= 1} onClick={() => onPage(page - 1)} className="p-1.5 rounded-lg bg-slate-100 disabled:opacity-40"><ChevronLeft className="w-4 h-4" /></button>
        <span>Page {page} / {pages}</span>
        <button disabled={page >= pages} onClick={() => onPage(page + 1)} className="p-1.5 rounded-lg bg-slate-100 disabled:opacity-40"><ChevronRight className="w-4 h-4" /></button>
      </div>
    </div>
  );
}

/** Loads one paged list from the API and keeps page / filters in one place. */
function usePaged(fetcher, id, enabled, filters) {
  const [state, setState] = useState({ items: [], total: 0, page: 1, limit: 15, loading: false, extra: null });
  const key = JSON.stringify(filters || {});
  const load = useCallback(async (page = 1) => {
    setState((s) => ({ ...s, loading: true }));
    try {
      const res = await fetcher(id, { page, limit: 15, ...(filters || {}) });
      const d = res?.data?.data || {};
      setState({ items: d.items || [], total: d.total || 0, page: d.page || page, limit: d.limit || 15, loading: false, extra: d });
    } catch (e) {
      toast.error(errMsg(e, "Could not load data"));
      setState((s) => ({ ...s, loading: false }));
    }
  }, [id, key]);
  useEffect(() => { if (enabled) load(1); }, [enabled, load]);
  return [state, load];
}

export default function FranchiseControlCenter({ id, onChanged, onRemoved }) {
  const [tab, setTab] = useState("overview");
  const [ov, setOv] = useState(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const [orderStatus, setOrderStatus] = useState("");
  const [restSearch, setRestSearch] = useState("");

  const [form, setForm] = useState({});
  const [suspendReason, setSuspendReason] = useState("");

  const loadOverview = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getFranchiseOverview(id);
      const d = res?.data?.data;
      setOv(d);
      const f = d?.franchise || {};
      setForm({ applicantName: f.applicantName, phone: f.phone, email: f.email, companyName: f.companyName, state: f.state, city: f.city, area: f.area, pincode: f.pincode });
    } catch (e) {
      toast.error(errMsg(e, "Could not load franchise overview"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { loadOverview(); }, [id]);

  const [rests, loadRests] = usePaged(adminAPI.getFranchiseRestaurants, id, tab === "restaurants", { search: restSearch || undefined });
  const [orders, loadOrders] = usePaged(adminAPI.getFranchiseOrders, id, tab === "orders", { status: orderStatus || undefined });
  const [ledger, loadLedger] = usePaged(adminAPI.getFranchiseLedger, id, tab === "money", {});
  const [rideService, setRideService] = useState("");
  const [rides, loadRides] = usePaged(adminAPI.getFranchiseTaxiRides, id, tab === "rides", { service: rideService || undefined });
  const [drivers, loadDrivers] = usePaged(adminAPI.getFranchiseTaxiDrivers, id, tab === "drivers", {});
  const [bookingService, setBookingService] = useState("bus");
  const [busRows, loadBus] = usePaged(adminAPI.getFranchiseTaxiBus, id, tab === "bus", { service: bookingService });

  const run = async (fn, okMsg) => {
    setBusy(true);
    try {
      const res = await fn();
      if (okMsg) toast.success(okMsg);
      return res;
    } catch (e) {
      toast.error(errMsg(e, "Action failed"));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    const res = await run(() => adminAPI.updateFranchiseProfile(id, form), "Franchise details updated");
    if (res) { setOv(res.data.data); onChanged?.(); }
  };
  const suspend = async () => {
    if (!window.confirm("Suspend this franchise? Their login stops working immediately. Their data and money stay safe.")) return;
    const res = await run(() => adminAPI.suspendFranchise(id, suspendReason), "Franchise suspended");
    if (res) { setOv(res.data.data); setSuspendReason(""); onChanged?.(); }
  };
  const activate = async () => {
    const res = await run(() => adminAPI.activateFranchise(id), "Franchise account activated");
    if (res) {
      setOv(res.data.data);
      if (res.data.data?.note) toast.info(res.data.data.note, { duration: 8000 });
      onChanged?.();
    }
  };
  const restore = async () => {
    const res = await run(() => adminAPI.restoreFranchise(id), "Franchise restored");
    if (res) { setOv(res.data.data); onChanged?.(); }
  };
  const remove = async () => {
    const name = ov?.franchise?.applicantName || "this franchise";
    if (!window.confirm(`Delete ${name}?\n\nIf it has no orders, restaurants or money it is deleted for good. Otherwise it is archived (hidden, login locked, history kept).`)) return;
    const res = await run(() => adminAPI.deleteFranchiseApplication(id));
    if (!res) return;
    const r = res.data.data;
    if (r?.deleted) toast.success("Franchise deleted permanently");
    else toast.info(r?.reason || "Franchise archived", { duration: 9000 });
    onRemoved?.(r);
  };

  if (loading) {
    return <div className="bg-white rounded-xl border border-slate-200 p-8 flex items-center justify-center gap-2 text-slate-500 text-sm"><Loader2 className="w-5 h-5 animate-spin" /> Loading franchise control center...</div>;
  }
  if (!ov) return null;

  const f = ov.franchise;
  const mods = f.selectedModules || ["food"];
  const hasFood = mods.includes("food");
  const hasTaxi = mods.includes("taxi");
  const TABS = tabsFor(mods);
  const suspended = f.accountStatus === "suspended";
  const loginOk = ov.login?.active;

  return (
    <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
      <div className="flex items-start justify-between gap-3 flex-wrap mb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">🛰️ Franchise Control Center</h3>
          <p className="text-xs text-slate-500 mt-0.5">Live view of everything under this franchise. Figures are matched by franchise id only.</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`px-2.5 py-1 rounded-full text-[11px] font-extrabold ${f.archived ? "bg-slate-200 text-slate-700" : suspended ? "bg-red-100 text-red-800" : loginOk ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>
            {f.archived ? "ARCHIVED" : suspended ? "SUSPENDED" : loginOk ? "ACTIVE" : "LOGIN NOT ACTIVE"}
          </span>
          <button onClick={loadOverview} className="px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold inline-flex items-center gap-1.5">
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </button>
        </div>
      </div>

      <div className="flex gap-1.5 flex-wrap mb-5 border-b border-slate-100 pb-3">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold ${tab === t.id ? "bg-blue-600 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200"}`}>
              <Icon className="w-3.5 h-3.5" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "overview" && (
        <div className="space-y-5">
          {hasFood && (
            <div>
              <div className="text-[11px] font-extrabold text-amber-700 uppercase mb-2 flex items-center gap-1.5"><Store className="w-3.5 h-3.5" /> Food</div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Restaurants" value={ov.restaurants.total} sub={`${ov.restaurants.active} active`} tone="text-blue-600" />
                <Stat label="Menu items" value={ov.restaurants.menuItems} />
                <Stat label="Orders (all time)" value={ov.orders.total} sub={`${ov.orders.delivered} delivered`} />
                <Stat label="Orders today" value={ov.orders.today} sub={inr(ov.orders.todayGMV)} tone="text-amber-600" />
                <Stat label="In progress" value={ov.orders.inProgress} />
                <Stat label="Cancelled" value={ov.orders.cancelled} tone="text-red-600" />
                <Stat label="Delivered GMV" value={inr(ov.orders.deliveredGMV)} />
              </div>
            </div>
          )}

          {hasTaxi && (
            <div>
              <div className="text-[11px] font-extrabold text-blue-700 uppercase mb-2 flex items-center gap-1.5"><Car className="w-3.5 h-3.5" /> Taxi {ov.taxi?.zone?.name ? `· ${ov.taxi.zone.name}` : ""}</div>
              {!ov.taxi?.taxiZoneId && <div className="mb-3 p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-800">No taxi zone assigned yet. Choose one in "Zones & login" so this franchise can see and earn from taxi rides.</div>}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Stat label="Drivers" value={ov.taxi?.drivers?.total ?? 0} sub={`${ov.taxi?.drivers?.online ?? 0} online · ${ov.taxi?.drivers?.approved ?? 0} approved`} tone="text-blue-600" />
                <Stat label="Rides completed" value={ov.taxi?.rides?.completed ?? 0} sub={`${ov.taxi?.rides?.today ?? 0} today`} />
                <Stat label="Ride value" value={inr(ov.taxi?.rides?.gmv)} sub={`${inr(ov.taxi?.rides?.todayGMV)} today`} tone="text-amber-600" />
                <Stat label="Taxi earned" value={inr(ov.taxi?.earned)} tone="text-emerald-600" sub={`${ov.taxi?.commissionRate ?? 0}% commission`} />
              </div>
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
                {(ov.taxi?.services || []).map((s) => (
                  <div key={s.key} className="p-3 rounded-xl border border-blue-100 bg-blue-50/50">
                    <div className="text-[10px] font-bold text-blue-700 uppercase">{s.label}</div>
                    <div className="text-lg font-black text-slate-900 mt-0.5">{s.count} <span className="text-[11px] font-semibold text-slate-400">{["bus", "pooling", "rental"].includes(s.key) ? "bookings" : "rides"}</span></div>
                    <div className="text-[11px] text-slate-500">{["bus", "pooling", "rental"].includes(s.key) ? `Earned ${inr(s.earned)}` : s.value ? `Value ${inr(s.value)}` : "-"}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <div className="text-[11px] font-extrabold text-slate-600 uppercase mb-2 flex items-center gap-1.5"><Wallet className="w-3.5 h-3.5" /> Money</div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat label="Franchise earned" value={inr(ov.money.totalEarned)} tone="text-emerald-600" sub={hasFood ? `${f.commissionRate}% commission` : undefined} />
            <Stat label="Wallet balance" value={inr(ov.money.walletBalance)} />
            <Stat label="Paid out" value={inr(ov.money.totalPaidOut)} />
            <Stat label="Pending payouts" value={ov.money.pendingPayoutRequests} sub={inr(ov.money.pendingPayoutAmount)} tone="text-amber-600" />
            <Stat label="Franchise fee" value={inr(f.franchiseFee)} sub={String(f.franchiseFeeStatus).toUpperCase()} />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
              <div className="font-bold text-slate-700 uppercase text-[10px]">Territory & plan</div>
              <div><b>Plan:</b> {(f.selectedModules || []).map((m) => (m === "food" ? "Food" : "Taxi")).join(" + ")}</div>
              <div><b>Location:</b> {f.area ? `${f.area}, ` : ""}{f.city}, {f.state} {f.pincode}</div>
              <div><b>Applied:</b> {when(f.createdAt)}</div>
              <div><b>Fee paid:</b> {when(f.franchiseFeePaidAt)}</div>
            </div>
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
              <div className="font-bold text-slate-700 uppercase text-[10px]">Franchise login</div>
              {ov.login ? (
                <>
                  <div><b>Email:</b> {ov.login.email}</div>
                  <div><b>Status:</b> {loginOk ? "Can log in" : "Locked"}</div>
                  {suspended && <div className="text-red-700"><b>Suspended:</b> {when(f.suspendedAt)} {f.suspendReason ? `- ${f.suspendReason}` : ""}</div>}
                </>
              ) : (
                <div className="text-slate-500">No login created yet (created when the application is approved).</div>
              )}
            </div>
          </div>
        </div>
      )}

      {tab === "restaurants" && (
        <div>
          <input className={`${inputCls} max-w-xs mb-3`} placeholder="Search restaurant name..." value={restSearch} onChange={(e) => setRestSearch(e.target.value)} />
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                <tr><th className="py-2.5 px-3">Restaurant</th><th className="py-2.5 px-3">Owner</th><th className="py-2.5 px-3">Status</th><th className="py-2.5 px-3 text-right">Orders</th><th className="py-2.5 px-3 text-right">Delivered</th><th className="py-2.5 px-3 text-right">GMV</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {rests.loading ? <tr><td colSpan={6} className="py-8 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
                  : rests.items.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-slate-400">No restaurants under this franchise yet.</td></tr>
                  : rests.items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3"><div className="font-bold text-slate-900">{r.name}</div><div className="text-[10px] text-slate-400">{r.city}</div></td>
                      <td className="py-2.5 px-3"><div>{r.ownerName || "-"}</div><div className="text-[10px] text-slate-400">{r.phone}</div></td>
                      <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.isActive ? "bg-emerald-100 text-emerald-800" : "bg-slate-200 text-slate-700"}`}>{r.status || (r.isActive ? "active" : "inactive")}</span></td>
                      <td className="py-2.5 px-3 text-right">{r.orders}</td>
                      <td className="py-2.5 px-3 text-right">{r.delivered}</td>
                      <td className="py-2.5 px-3 text-right font-bold">{inr(r.gmv)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pager page={rests.page} limit={rests.limit} total={rests.total} onPage={loadRests} />
        </div>
      )}

      {tab === "orders" && (
        <div>
          <select className={`${inputCls} max-w-[200px] mb-3`} value={orderStatus} onChange={(e) => setOrderStatus(e.target.value)}>
            <option value="">All statuses</option>
            <option value="delivered">Delivered</option>
            <option value="cancelled">Cancelled</option>
            <option value="created">New</option>
            <option value="confirmed">Confirmed</option>
            <option value="preparing">Preparing</option>
            <option value="picked_up">Picked up</option>
          </select>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                <tr><th className="py-2.5 px-3">Order</th><th className="py-2.5 px-3">Customer</th><th className="py-2.5 px-3">Restaurant</th><th className="py-2.5 px-3">Status</th><th className="py-2.5 px-3 text-right">Total</th><th className="py-2.5 px-3">Payment</th><th className="py-2.5 px-3 text-right">Franchise earned</th><th className="py-2.5 px-3">Date</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {orders.loading ? <tr><td colSpan={8} className="py-8 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
                  : orders.items.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-slate-400">No orders yet.</td></tr>
                  : orders.items.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{o.orderId}</td>
                      <td className="py-2.5 px-3"><div>{o.customerName}</div><div className="text-[10px] text-slate-400">{o.customerPhone}</div></td>
                      <td className="py-2.5 px-3">{o.restaurantName || "-"}</td>
                      <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${statusStyle(o.status)}`}>{o.status}</span></td>
                      <td className="py-2.5 px-3 text-right font-bold">{inr(o.total)}</td>
                      <td className="py-2.5 px-3">{o.paymentMethod} <span className="text-slate-400">({o.paymentStatus})</span></td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">{o.franchiseEarned ? inr(o.franchiseEarned) : "-"}</td>
                      <td className="py-2.5 px-3 text-slate-500">{when(o.createdAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pager page={orders.page} limit={orders.limit} total={orders.total} onPage={loadOrders} />
        </div>
      )}

      {tab === "rides" && (
        <div>
          <select className={`${inputCls} max-w-[200px] mb-3`} value={rideService} onChange={(e) => setRideService(e.target.value)}>
            <option value="">All services</option>
            <option value="ride">City taxi</option>
            <option value="intercity">Outstation</option>
            <option value="parcel">Parcel</option>
          </select>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                <tr><th className="py-2.5 px-3">Ride</th><th className="py-2.5 px-3">Service</th><th className="py-2.5 px-3">Rider</th><th className="py-2.5 px-3">Driver</th><th className="py-2.5 px-3">Status</th><th className="py-2.5 px-3 text-right">Fare</th><th className="py-2.5 px-3">Payment</th><th className="py-2.5 px-3 text-right">Franchise earned</th><th className="py-2.5 px-3">Date</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {rides.loading ? <tr><td colSpan={9} className="py-8 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
                  : rides.items.length === 0 ? <tr><td colSpan={9} className="py-8 text-center text-slate-400">No credited rides yet. Rides appear here after a driver in this franchise's taxi zone completes them.</td></tr>
                  : rides.items.map((r) => (
                    <tr key={r.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{r.rideCode}</td>
                      <td className="py-2.5 px-3"><span className="px-2 py-0.5 rounded bg-blue-50 text-blue-700 text-[10px] font-bold">{r.serviceLabel}</span></td>
                      <td className="py-2.5 px-3"><div>{r.riderName}</div><div className="text-[10px] text-slate-400">{r.riderPhone}</div></td>
                      <td className="py-2.5 px-3">{r.driverName}</td>
                      <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${r.status === "refunded" ? "bg-orange-100 text-orange-800" : "bg-emerald-100 text-emerald-800"}`}>{r.status}</span></td>
                      <td className="py-2.5 px-3 text-right font-bold">{inr(r.fare)}</td>
                      <td className="py-2.5 px-3 uppercase">{r.paymentMethod}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">{r.franchiseEarned ? inr(r.franchiseEarned) : "-"}</td>
                      <td className="py-2.5 px-3 text-slate-500">{when(r.completedAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pager page={rides.page} limit={rides.limit} total={rides.total} onPage={loadRides} />
        </div>
      )}

      {tab === "bus" && (
        <div>
          <select className={`${inputCls} max-w-[200px] mb-2`} value={bookingService} onChange={(e) => setBookingService(e.target.value)}>
            <option value="bus">Bus service</option>
            <option value="pooling">Pooling</option>
            <option value="rental">Rental</option>
          </select>
          <p className="text-[11px] text-slate-500 mb-3">
            {bookingService === "bus" && "Bus trips of buses pinned to this franchise or of operators in its service location. Credited once the travel date has passed."}
            {bookingService === "pooling" && "Completed, paid pooling bookings whose pickup stop lies in this franchise's taxi zone."}
            {bookingService === "rental" && "Completed, paid rentals in this franchise's taxi zone."}
            {" "}Only works if the service is switched on in Franchise → Module Fees.
          </p>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                <tr><th className="py-2.5 px-3">Booking</th><th className="py-2.5 px-3">Route</th><th className="py-2.5 px-3">Operator</th><th className="py-2.5 px-3">Travel date</th><th className="py-2.5 px-3">Seats</th><th className="py-2.5 px-3 text-right">Fare</th><th className="py-2.5 px-3 text-right">Commission base</th><th className="py-2.5 px-3 text-right">Franchise earned</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {busRows.loading ? <tr><td colSpan={8} className="py-8 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
                  : busRows.items.length === 0 ? <tr><td colSpan={8} className="py-8 text-center text-slate-400">No credited bus trips yet.</td></tr>
                  : busRows.items.map((b) => (
                    <tr key={b.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 font-bold text-slate-900">{b.bookingCode}</td>
                      <td className="py-2.5 px-3">{b.route}</td>
                      <td className="py-2.5 px-3">{b.operator}</td>
                      <td className="py-2.5 px-3">{b.travelDate}</td>
                      <td className="py-2.5 px-3">{b.seats}</td>
                      <td className="py-2.5 px-3 text-right font-bold">{inr(b.amount)}</td>
                      <td className="py-2.5 px-3 text-right">{inr(b.platformEarning)}</td>
                      <td className="py-2.5 px-3 text-right text-emerald-700 font-bold">{b.franchiseEarned ? inr(b.franchiseEarned) : "-"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pager page={busRows.page} limit={busRows.limit} total={busRows.total} onPage={loadBus} />
        </div>
      )}

      {tab === "drivers" && (
        <div>
          <div className="overflow-x-auto border border-slate-200 rounded-xl">
            <table className="w-full text-xs text-left">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                <tr><th className="py-2.5 px-3">Driver</th><th className="py-2.5 px-3">Vehicle</th><th className="py-2.5 px-3">Approval</th><th className="py-2.5 px-3">Online</th><th className="py-2.5 px-3 text-right">Rating</th><th className="py-2.5 px-3">Joined</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {drivers.loading ? <tr><td colSpan={6} className="py-8 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
                  : drivers.items.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-slate-400">{ov.taxi?.taxiZoneId ? "No drivers in this taxi zone yet." : "Assign a taxi zone to see its drivers."}</td></tr>
                  : drivers.items.map((d) => (
                    <tr key={d.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3"><div className="font-bold text-slate-900">{d.name}</div><div className="text-[10px] text-slate-400">{d.phone}</div></td>
                      <td className="py-2.5 px-3"><div>{d.vehicleType || "-"}</div><div className="text-[10px] text-slate-400">{d.vehicleNumber}</div></td>
                      <td className="py-2.5 px-3"><span className={`px-2 py-0.5 rounded text-[10px] font-bold ${d.approved ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{d.approved ? "Approved" : "Pending"}</span></td>
                      <td className="py-2.5 px-3">{d.online ? "🟢 Online" : "⚪ Offline"}</td>
                      <td className="py-2.5 px-3 text-right">{d.rating ? Number(d.rating).toFixed(1) : "-"}</td>
                      <td className="py-2.5 px-3 text-slate-500">{when(d.joinedAt)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <Pager page={drivers.page} limit={drivers.limit} total={drivers.total} onPage={loadDrivers} />
        </div>
      )}

      {tab === "money" && (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-bold text-slate-700 uppercase mb-2">Wallet ledger (every credit, reversal and payout)</div>
            <div className="overflow-x-auto border border-slate-200 rounded-xl">
              <table className="w-full text-xs text-left">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                  <tr><th className="py-2.5 px-3">Date</th><th className="py-2.5 px-3">Type</th><th className="py-2.5 px-3">Note</th><th className="py-2.5 px-3 text-right">Base</th><th className="py-2.5 px-3 text-right">Rate</th><th className="py-2.5 px-3 text-right">Amount</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {ledger.loading ? <tr><td colSpan={6} className="py-8 text-center text-slate-400"><Loader2 className="w-4 h-4 animate-spin inline" /></td></tr>
                    : ledger.items.length === 0 ? <tr><td colSpan={6} className="py-8 text-center text-slate-400">No money movement yet.</td></tr>
                    : ledger.items.map((l) => (
                      <tr key={l._id}>
                        <td className="py-2.5 px-3 text-slate-500">{when(l.createdAt)}</td>
                        <td className="py-2.5 px-3 uppercase font-bold text-[10px]">{l.type}</td>
                        <td className="py-2.5 px-3">{l.note}</td>
                        <td className="py-2.5 px-3 text-right">{l.base ? inr(l.base) : "-"}</td>
                        <td className="py-2.5 px-3 text-right">{l.rate ? `${l.rate}%` : "-"}</td>
                        <td className={`py-2.5 px-3 text-right font-bold ${l.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>{l.amount < 0 ? "-" : "+"}{inr(Math.abs(l.amount))}</td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            <Pager page={ledger.page} limit={ledger.limit} total={ledger.total} onPage={loadLedger} />
          </div>

          <div>
            <div className="text-xs font-bold text-slate-700 uppercase mb-2">Payout requests</div>
            {(ledger.extra?.payouts || []).length === 0 ? (
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-500 text-center">No payout requests.</div>
            ) : (
              <div className="space-y-2">
                {ledger.extra.payouts.map((p) => (
                  <div key={p.requestId || p._id} className="flex items-center justify-between gap-3 p-3 rounded-xl border border-slate-200 bg-slate-50 text-xs">
                    <div><b>{inr(p.amount)}</b> <span className="text-slate-400">{p.requestId}</span><div className="text-slate-500">{when(p.requestedAt)} {p.transactionId ? `- Txn ${p.transactionId}` : ""}</div></div>
                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.status === "approved" ? "bg-emerald-100 text-emerald-800" : p.status === "rejected" ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-800"}`}>{p.status}</span>
                  </div>
                ))}
                <p className="text-[11px] text-slate-400">Approve or reject payouts in the "Payout Requests" section lower on this page.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === "account" && (
        <div className="space-y-6">
          <div>
            <div className="text-xs font-bold text-slate-700 uppercase mb-3">Edit franchise details</div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {[
                ["applicantName", "Owner name"], ["companyName", "Company"], ["phone", "Phone"], ["email", "Email (also the login email)"],
                ["state", "State"], ["city", "City"], ["area", "Area"], ["pincode", "Pincode"],
              ].map(([k, label]) => (
                <div key={k}>
                  <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">{label}</label>
                  <input className={inputCls} value={form[k] || ""} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />
                </div>
              ))}
            </div>
            <button onClick={saveProfile} disabled={busy} className="mt-3 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2">
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save details
            </button>
            <p className="text-[11px] text-slate-400 mt-1.5">Name, phone and email are copied to the franchise login automatically. Plan, fee and commission are edited in the sections below.</p>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <div className="text-xs font-bold text-slate-700 uppercase mb-2 flex items-center gap-1.5"><ShieldAlert className="w-4 h-4" /> Account access</div>
            {suspended ? (
              <>
                <p className="text-xs text-red-700 mb-3">This franchise is suspended{f.suspendReason ? `: ${f.suspendReason}` : ""}. They cannot log in.</p>
                <button onClick={activate} disabled={busy || f.archived} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4" /> Activate account
                </button>
              </>
            ) : (
              <>
                <input className={`${inputCls} mb-2`} placeholder="Reason (optional, visible to admins only)" value={suspendReason} onChange={(e) => setSuspendReason(e.target.value)} />
                <button onClick={suspend} disabled={busy} className="px-4 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2">
                  <Ban className="w-4 h-4" /> Suspend account
                </button>
                <p className="text-[11px] text-slate-400 mt-1.5">Login stops immediately. Orders, restaurants and money are not touched.</p>
              </>
            )}
          </div>

          <div className="p-4 rounded-xl border border-red-200 bg-red-50">
            <div className="text-xs font-bold text-red-800 uppercase mb-2 flex items-center gap-1.5"><Trash2 className="w-4 h-4" /> Danger zone</div>
            {f.archived ? (
              <button onClick={restore} disabled={busy} className="px-4 py-2 rounded-lg bg-slate-700 hover:bg-slate-800 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2">
                <RotateCcw className="w-4 h-4" /> Restore from archive
              </button>
            ) : (
              <>
                <button onClick={remove} disabled={busy} className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2">
                  <Trash2 className="w-4 h-4" /> Delete franchise
                </button>
                <p className="text-[11px] text-red-700/80 mt-1.5 flex items-start gap-1.5">
                  <Archive className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                  With no orders, restaurants or money it is deleted for good. Otherwise it is archived (hidden, login locked) so history is never lost.
                </p>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
