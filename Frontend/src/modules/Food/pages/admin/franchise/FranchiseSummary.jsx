import React, { useState, useEffect, useCallback } from "react";
import { adminAPI } from "@food/api";
import { Landmark, IndianRupee, Percent, Store, KeyRound, Copy, Loader2, MapPinned, RefreshCw, UserRound } from "lucide-react";
import { InfoList, Progress, profileSections } from "./InfoGrid";
import { toast } from "sonner";
import { Card, Stat, Badge, Loading, ErrorState, Empty, inr, pct, errMsg, btn } from "./finance/ui";

const SOURCE_LABEL = { franchise: "This franchise (special rate)", territory: "Zone rate", global: "Global rate" };
const randomPassword = () => {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(bytes, (b) => chars[b % chars.length]).join("");
};

/** One simple page with everything the admin needs about a franchise: money, restaurants, commission, login. */
export default function FranchiseSummary({ app, id, mods, onOpenTab, onChanged, canShareLogin }) {
  const [fin, setFin] = useState(null);
  const [rests, setRests] = useState({ items: [], total: 0 });
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [sharing, setSharing] = useState(false);
  const [creds, setCreds] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [f, r] = await Promise.all([
        adminAPI.getFranchiseFinance(id),
        mods.includes("food") ? adminAPI.getFranchiseRestaurants(id, { limit: 8 }) : Promise.resolve(null),
      ]);
      setFin(f?.data?.data || null);
      setRests(r?.data?.data || { items: [], total: 0 });
      setError("");
    } catch (e) {
      setError(errMsg(e, "Could not load the summary"));
    } finally {
      setLoading(false);
    }
  }, [id, mods]);

  useEffect(() => { load(); }, [load]);

  const shareLogin = async () => {
    if (!window.confirm("This sets a NEW password for the franchise login. The old password will stop working. Continue?")) return;
    setSharing(true);
    try {
      const password = randomPassword();
      await adminAPI.syncFranchiseSubAdmin(id, { password });
      setCreds({ email: app.subAdminId?.email || app.email, password });
      toast.success("New password set. Copy and share it.");
      onChanged?.();
    } catch (e) {
      toast.error(errMsg(e, "Could not reset the login"));
    } finally {
      setSharing(false);
    }
  };

  const copyCreds = () => {
    const text = `Raydo Franchise login\nName: ${app.applicantName}\nLogin: ${window.location.origin}/food/franchise/login\nEmail: ${creds.email}\nPassword: ${creds.password}`;
    navigator.clipboard.writeText(text);
    toast.success("Login details copied");
  };

  if (loading) return <Loading text="Loading summary..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const dues = fin?.dues || {};
  const joining = dues.joiningFee;
  const deposit = dues.deposit;
  const wallet = fin?.wallet || {};
  const rates = fin?.rates;
  const territory = fin?.franchise?.territory;
  const hasLogin = Boolean(app.subAdminId);

  return (
    <div className="space-y-5">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Stat label="Wallet balance" value={inr(wallet.balance)} icon={IndianRupee} tone="text-emerald-700" sub={`Available ${inr(wallet.available)}`} />
        <Stat label="Total earnings" value={inr(wallet.lifetimeEarnings)} sub={`Platform commission ${inr(wallet.lifetimeCommission)}`} />
        <Stat label="Paid out" value={inr(wallet.paidOut)} sub={wallet.pendingPayoutCount ? `${wallet.pendingPayoutCount} request(s) waiting` : "No pending requests"} />
        <Stat label="Still to collect" value={inr(dues.outstanding)} tone={dues.hasDues ? "text-amber-700" : "text-slate-900"} sub="Fee + deposit not yet received" />
      </div>

      <Card title="Partner profile" icon={UserRound} right={<button onClick={() => onOpenTab("review")} className={btn.ghost}>Full application</button>}>
        {(() => {
          const p = profileSections(app);
          return (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-x-8">
              <div><div className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider mb-1">Contact</div><InfoList cols={1} items={p.contact} /></div>
              <div><div className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider mb-1">Location</div><InfoList cols={1} items={p.location} /></div>
              <div><div className="text-[10px] font-extrabold text-blue-600 uppercase tracking-wider mb-1">Business</div><InfoList cols={1} items={p.business.slice(0, 5)} /></div>
            </div>
          );
        })()}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        <Card title="Franchise fee & security deposit" icon={Landmark} right={<button onClick={() => onOpenTab("fees")} className={btn.ghost}>Manage</button>}>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between"><span className="font-bold text-slate-700">Franchise fee (joining)</span>{joining && <Badge status={joining.status} />}</div>
              {joining ? (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div><div className="text-[10px] text-slate-400 uppercase font-bold">Total</div><div className="font-black text-sm">{inr(joining.expected)}</div></div>
                  <div><div className="text-[10px] text-slate-400 uppercase font-bold">Paid</div><div className="font-black text-sm text-emerald-700">{inr(joining.paid)}</div></div>
                  <div><div className="text-[10px] text-slate-400 uppercase font-bold">Pending</div><div className="font-black text-sm text-amber-700">{inr(joining.outstanding)}</div></div>
                </div>
              ) : <div className="text-slate-400 mt-1">No joining fee on record.</div>}
              {joining && <Progress value={joining.paid} total={joining.expected} />}
            </div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
              <div className="flex items-center justify-between"><span className="font-bold text-slate-700">Security deposit</span>{deposit && <Badge status={deposit.status} />}</div>
              {deposit ? (
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div><div className="text-[10px] text-slate-400 uppercase font-bold">Total</div><div className="font-black text-sm">{inr(deposit.expected)}</div></div>
                  <div><div className="text-[10px] text-slate-400 uppercase font-bold">Held by Raydo</div><div className="font-black text-sm text-emerald-700">{inr(deposit.held)}</div></div>
                  <div><div className="text-[10px] text-slate-400 uppercase font-bold">Pending</div><div className="font-black text-sm text-amber-700">{inr(deposit.outstanding)}</div></div>
                </div>
              ) : <div className="text-slate-400 mt-1">No security deposit on record.</div>}
              {deposit && <Progress value={deposit.held} total={deposit.expected} />}
              {deposit && (deposit.refunded > 0 || deposit.deducted > 0) && (
                <div className="text-[11px] text-slate-500 mt-2">Refunded {inr(deposit.refunded)} · Deducted {inr(deposit.deducted)}</div>
              )}
            </div>
          </div>
        </Card>

        <Card title="Commission" icon={Percent} right={<button onClick={() => onOpenTab("commission")} className={btn.ghost}>Change</button>}>
          <div className="space-y-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2">
              <MapPinned className="w-4 h-4 text-blue-600" />
              <span>Zone: <b>{territory?.name || "Not set"}</b>{territory?.city ? ` (${territory.city})` : ""}</span>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {mods.map((m) => (
                <div key={m} className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-[10px] text-slate-400 uppercase font-bold">{m === "food" ? "Food" : "Taxi"} share</div>
                  <div className="font-black text-lg">{rates?.[m]?.enabled === false ? "Off" : pct(rates?.[m]?.rate)}</div>
                </div>
              ))}
            </div>
            <div className="text-[11px] text-slate-500">Using: <b>{SOURCE_LABEL[rates?.appliedFrom] || "Global rate"}</b>. Each zone can have its own rate in <button onClick={() => window.open("/admin/food/franchise-management/commission", "_self")} className="text-blue-600 font-bold underline">Platform Commission</button>; one franchise can be given a special rate in the Commission tab.</div>
          </div>
        </Card>
      </div>

      {mods.includes("food") && (
        <Card title={`Restaurants under this franchise (${rests.total || 0})`} icon={Store} right={<button onClick={() => onOpenTab("overview")} className={btn.ghost}>See all</button>}>
          {rests.items?.length ? (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead><tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]"><th className="py-2.5 px-3">Restaurant</th><th className="py-2.5 px-3">Owner</th><th className="py-2.5 px-3">Orders</th><th className="py-2.5 px-3">Sales</th><th className="py-2.5 px-3">Status</th></tr></thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {rests.items.map((r) => (
                    <tr key={r.id}>
                      <td className="py-2.5 px-3 font-bold text-slate-900">{r.name}</td>
                      <td className="py-2.5 px-3">{r.ownerName || "-"}<div className="text-[10px] text-slate-400">{r.phone}</div></td>
                      <td className="py-2.5 px-3">{r.orders ?? r.totalOrders ?? 0}</td>
                      <td className="py-2.5 px-3">{inr(r.gmv ?? r.sales ?? 0)}</td>
                      <td className="py-2.5 px-3"><Badge status={r.status}>{r.status || "-"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <Empty>No restaurants have joined under this franchise yet.</Empty>}
        </Card>
      )}

      <Card title="Login & credentials" icon={KeyRound}>
        <div className="text-xs space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><div className="text-[10px] text-slate-400 uppercase font-bold">Login email</div><div className="font-bold mt-0.5 break-all">{app.subAdminId?.email || app.email || "-"}</div></div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><div className="text-[10px] text-slate-400 uppercase font-bold">Login status</div><div className={`font-bold mt-0.5 ${!hasLogin ? "text-amber-700" : app.subAdminId.active === false ? "text-red-600" : "text-emerald-700"}`}>{!hasLogin ? "Not created yet" : app.subAdminId.active === false ? "Locked (fee pending / suspended)" : "Can log in"}</div></div>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200"><div className="text-[10px] text-slate-400 uppercase font-bold">Login page</div><div className="font-mono mt-0.5 break-all">{window.location.origin}/food/franchise/login</div></div>
          </div>
          {canShareLogin ? (
            <button onClick={shareLogin} disabled={sharing} className={btn.primary}>
              {sharing ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Generate new password to share
            </button>
          ) : <p className="text-slate-500">Create the login from the "Zones & login" tab first.</p>}
          <p className="text-[11px] text-slate-400">Passwords are stored encrypted, so an old one cannot be shown. A new password is generated and shown once so you can copy and send it.</p>
          {creds && (
            <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 space-y-1.5">
              <div className="flex items-center justify-between font-bold text-blue-900"><span>New login details (shown once)</span>
                <button onClick={copyCreds} className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
              </div>
              <div className="font-mono text-slate-700">Email: {creds.email}</div>
              <div className="font-mono text-slate-700">Password: {creds.password}</div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}
