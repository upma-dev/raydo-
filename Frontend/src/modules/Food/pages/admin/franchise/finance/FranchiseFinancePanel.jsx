import React, { useCallback, useEffect, useState } from "react";
import { RefreshCw, Download, Wallet, Store, Car, Percent, Landmark, ShieldCheck, ListOrdered, CalendarDays } from "lucide-react";
import {
  Card, Stat, Badge, Loading, ErrorState, Empty, Pager, DateRange, inr, inr2, pct, when, dayLabel, errMsg,
  downloadCsv, istDaysAgo, istToday, btn, inputCls,
} from "./ui";

const SOURCE_LABEL = { franchise: "franchise override", territory: "zone setting", global: "global default" };
const ENTRY_GROUPS = [
  ["earnings", "Earnings & commission"],
  ["payouts", "Payouts"],
  ["fees", "Fee & deposit"],
  ["legacy", "Old system"],
  ["", "Everything"],
];

/**
 * Day-wise earnings, platform commission, wallet, fee & deposit of ONE franchise.
 * Every figure comes from the server's ledger; this component only formats it.
 *  load(params)          -> GET finance
 *  loadEntries(params)   -> GET finance entries (admin only; partner gets day rows only)
 */
export default function FranchiseFinancePanel({ load, loadEntries = null, partner = false, onPayoutsClick }) {
  const [range, setRange] = useState({ from: istDaysAgo(29), to: istToday() });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [group, setGroup] = useState("earnings");
  const [service, setService] = useState("");
  const [entries, setEntries] = useState({ items: [], total: 0, page: 1, limit: 25, loading: false });

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await load(range);
      setData(res?.data?.data || null);
    } catch (e) {
      setError(errMsg(e, "Could not load finance"));
    } finally {
      setLoading(false);
    }
  }, [load, range.from, range.to]);

  const fetchEntries = useCallback(async (page = 1) => {
    if (!loadEntries) return;
    setEntries((s) => ({ ...s, loading: true }));
    try {
      const res = await loadEntries({ ...range, group: group || undefined, service: service || undefined, page, limit: 25 });
      const d = res?.data?.data || {};
      setEntries({ items: d.items || [], total: d.total || 0, page: d.page || page, limit: d.limit || 25, loading: false });
    } catch (e) {
      setEntries((s) => ({ ...s, loading: false, error: errMsg(e) }));
    }
  }, [loadEntries, range.from, range.to, group, service]);

  useEffect(() => { fetchData(); }, [fetchData]);
  useEffect(() => { fetchEntries(1); }, [fetchEntries]);

  if (loading && !data) return <Loading text="Loading earnings..." />;
  if (error && !data) return <ErrorState message={error} onRetry={fetchData} />;
  if (!data) return null;

  const services = data.franchise?.services || [];
  const hasFood = services.includes("food");
  const hasTaxi = services.includes("taxi");
  const t = data.totals || {};
  const w = data.wallet || {};
  const r = data.rates || {};
  const joining = data.charges?.find((c) => c.kind === "joining_fee");
  const deposit = data.charges?.find((c) => c.kind === "security_deposit");

  const exportDays = () => downloadCsv(
    `franchise-${data.franchise?.applicationId || "earnings"}-${data.range.from}-to-${data.range.to}.csv`,
    [
      { label: "Date", value: "date" },
      ...(hasFood ? [
        { label: "Food earnings", value: "foodEarning" }, { label: "Food orders", value: "foodCount" },
        { label: "Food commission %", value: "foodRateApplied" }, { label: "Food commission", value: "foodCommission" },
      ] : []),
      ...(hasTaxi ? [
        { label: "Taxi earnings", value: "taxiEarning" }, { label: "Taxi rides/bookings", value: "taxiCount" },
        { label: "Taxi commission %", value: "taxiRateApplied" }, { label: "Taxi commission", value: "taxiCommission" },
      ] : []),
      { label: "Total earnings", value: "totalEarning" },
      { label: "Platform commission", value: "totalCommission" },
      { label: "Franchise net (credited)", value: "franchiseNet" },
      { label: "Refunds reversed", value: "refunds" },
    ],
    data.daily || [],
  );

  return (
    <div className="space-y-5">
      {/* Filters + current rates */}
      <div className="flex items-end justify-between gap-3 flex-wrap">
        <DateRange from={range.from} to={range.to} onChange={setRange} />
        <div className="flex gap-2">
          <button onClick={fetchData} className={btn.ghost} disabled={loading}><RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
          <button onClick={exportDays} className={btn.ghost} disabled={!data.daily?.length}><Download className="w-3.5 h-3.5" /> Export CSV</button>
        </div>
      </div>

      <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-slate-700 flex items-center gap-2 flex-wrap">
        <Percent className="w-4 h-4 text-blue-600 shrink-0" />
        <span className="font-bold text-blue-900">Platform commission now:</span>
        {r.mode === "combined"
          ? <span><b>{pct(r.food?.rate)}</b> of Food + Taxi earnings together</span>
          : (
            <span className="flex gap-3 flex-wrap">
              {hasFood && <span>Food <b>{r.food?.enabled === false ? "off (0%)" : pct(r.food?.rate)}</b></span>}
              {hasTaxi && <span>Taxi <b>{r.taxi?.enabled === false ? "off (0%)" : pct(r.taxi?.rate)}</b></span>}
            </span>
          )}
        {!partner && r.appliedFrom && <span className="text-slate-500">· from {SOURCE_LABEL[r.appliedFrom] || r.appliedFrom} (v{r.version})</span>}
        <span className="text-slate-500 w-full sm:w-auto">Past days keep the rate that applied on that day.</span>
      </div>

      {/* Totals for the range */}
      <div>
        <div className="text-[11px] font-extrabold text-slate-600 uppercase mb-2 flex items-center gap-1.5"><CalendarDays className="w-3.5 h-3.5" /> {dayLabel(data.range.from)} – {dayLabel(data.range.to)}</div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {hasFood && <Stat icon={Store} label="Food earnings" value={inr(t.foodEarning)} sub={`${t.foodCount || 0} orders`} tone="text-amber-700" />}
          {hasFood && <Stat label="Food commission" value={inr(t.foodCommission)} sub={t.foodRateApplied !== null ? `${pct(t.foodRateApplied)} applied` : "-"} tone="text-red-600" />}
          {hasTaxi && <Stat icon={Car} label="Taxi earnings" value={inr(t.taxiEarning)} sub={`${t.taxiCount || 0} rides / bookings`} tone="text-blue-700" />}
          {hasTaxi && <Stat label="Taxi commission" value={inr(t.taxiCommission)} sub={t.taxiRateApplied !== null ? `${pct(t.taxiRateApplied)} applied` : "-"} tone="text-red-600" />}
          <Stat label="Total earnings" value={inr(t.totalEarning)} />
          <Stat label="Platform commission" value={inr(t.totalCommission)} tone="text-red-600" />
          <Stat label={partner ? "Your share (credited)" : "Franchise net (credited)"} value={inr(t.franchiseNet)} tone="text-emerald-700" sub="Earnings − commission" />
          {t.refunds > 0 && <Stat label="Refunds reversed" value={inr(t.refunds)} tone="text-orange-600" />}
        </div>
        {data.legacyCreditsInRange ? <p className="text-[11px] text-slate-400 mt-2">Also in this period: {inr(data.legacyCreditsInRange)} credited under the old commission system.</p> : null}
      </div>

      {/* Wallet + dues */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card title="Wallet (payable to franchise)" icon={Wallet}>
          <div className="space-y-2 text-xs">
            <Row label="Current balance" value={inr2(w.balance)} strong tone="text-emerald-700" />
            <Row label="Available (minus pending requests)" value={inr2(w.available)} />
            <Row label="Credited all time (net)" value={inr2(w.creditedNet)} />
            <Row label="Paid out (settled)" value={inr2(w.paidOut)} />
            <Row label={`Pending payouts (${w.pendingPayoutCount || 0})`} value={inr2(w.pendingPayoutAmount)} tone="text-amber-700" />
            {w.adjustments ? <Row label="Adjustments" value={inr2(w.adjustments)} /> : null}
            {onPayoutsClick && <button onClick={onPayoutsClick} className={`${btn.ghost} w-full mt-2`}>Payout requests</button>}
          </div>
        </Card>
        <Card title="Joining fee" icon={Landmark} right={joining && <Badge status={joining.status} />}>
          {joining ? (
            <div className="space-y-2 text-xs">
              <Row label="Amount" value={inr2(joining.expected)} strong />
              <Row label="Paid" value={inr2(joining.paid)} tone="text-emerald-700" />
              {joining.waived ? <Row label="Waived" value={inr2(joining.waived)} /> : null}
              <Row label="Outstanding" value={inr2(joining.outstanding)} tone={joining.outstanding ? "text-red-600" : ""} />
              <p className="text-[11px] text-slate-400 pt-1">One-time and non-refundable.</p>
            </div>
          ) : <Empty>No joining fee set.</Empty>}
        </Card>
        <Card title="Security deposit" icon={ShieldCheck} right={deposit && <Badge status={deposit.status} />}>
          {deposit ? (
            <div className="space-y-2 text-xs">
              <Row label="Required" value={inr2(deposit.expected)} />
              <Row label="Received" value={inr2(deposit.paid)} />
              <Row label="Held by platform now" value={inr2(deposit.held)} strong tone="text-blue-700" />
              {deposit.refunded ? <Row label="Refunded" value={inr2(deposit.refunded)} /> : null}
              {deposit.deducted ? <Row label="Deducted" value={inr2(deposit.deducted)} tone="text-red-600" /> : null}
              <Row label="Outstanding" value={inr2(deposit.outstanding)} tone={deposit.outstanding ? "text-red-600" : ""} />
              <p className="text-[11px] text-slate-400 pt-1">Refundable. Not counted as earnings or commission.</p>
            </div>
          ) : <Empty>No deposit set.</Empty>}
        </Card>
      </div>

      {/* Day-wise table */}
      <Card title="Day-wise earnings" icon={CalendarDays} right={<span className="text-[11px] text-slate-400 font-semibold">{data.daily?.length || 0} days with activity</span>}>
        {!data.daily?.length ? <Empty>No earnings in this period.</Empty> : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-xs text-left min-w-[760px]">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-2.5 px-3">Date</th>
                  {hasFood && <><th className="py-2.5 px-3 text-right">Food earn.</th><th className="py-2.5 px-3 text-right">Food %</th><th className="py-2.5 px-3 text-right">Food comm.</th></>}
                  {hasTaxi && <><th className="py-2.5 px-3 text-right">Taxi earn.</th><th className="py-2.5 px-3 text-right">Taxi %</th><th className="py-2.5 px-3 text-right">Taxi comm.</th></>}
                  <th className="py-2.5 px-3 text-right">Total earn.</th>
                  <th className="py-2.5 px-3 text-right">Platform comm.</th>
                  <th className="py-2.5 px-3 text-right">{partner ? "Your share" : "Franchise net"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {data.daily.map((d) => (
                  <tr key={d.date} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900 whitespace-nowrap">{dayLabel(d.date)}</td>
                    {hasFood && <><td className="py-2.5 px-3 text-right">{inr2(d.foodEarning)}</td><td className="py-2.5 px-3 text-right text-slate-500">{pct(d.foodRateApplied)}</td><td className="py-2.5 px-3 text-right text-red-600">{inr2(d.foodCommission)}</td></>}
                    {hasTaxi && <><td className="py-2.5 px-3 text-right">{inr2(d.taxiEarning)}</td><td className="py-2.5 px-3 text-right text-slate-500">{pct(d.taxiRateApplied)}</td><td className="py-2.5 px-3 text-right text-red-600">{inr2(d.taxiCommission)}</td></>}
                    <td className="py-2.5 px-3 text-right font-bold">{inr2(d.totalEarning)}</td>
                    <td className="py-2.5 px-3 text-right font-bold text-red-600">{inr2(d.totalCommission)}</td>
                    <td className="py-2.5 px-3 text-right font-black text-emerald-700">{inr2(d.franchiseNet)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-slate-50 font-black text-slate-900">
                <tr>
                  <td className="py-2.5 px-3">Total</td>
                  {hasFood && <><td className="py-2.5 px-3 text-right">{inr2(t.foodEarning)}</td><td className="py-2.5 px-3 text-right text-slate-500">{pct(t.foodRateApplied)}</td><td className="py-2.5 px-3 text-right text-red-600">{inr2(t.foodCommission)}</td></>}
                  {hasTaxi && <><td className="py-2.5 px-3 text-right">{inr2(t.taxiEarning)}</td><td className="py-2.5 px-3 text-right text-slate-500">{pct(t.taxiRateApplied)}</td><td className="py-2.5 px-3 text-right text-red-600">{inr2(t.taxiCommission)}</td></>}
                  <td className="py-2.5 px-3 text-right">{inr2(t.totalEarning)}</td>
                  <td className="py-2.5 px-3 text-right text-red-600">{inr2(t.totalCommission)}</td>
                  <td className="py-2.5 px-3 text-right text-emerald-700">{inr2(t.franchiseNet)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">
          Earnings = what the platform earned on each delivered order (platform fee + restaurant commission − platform discounts) or completed ride (commission from the driver).
          Taxes, restaurant and driver payouts, tips and delivery fees are never counted. Days are in IST.
        </p>
      </Card>

      {/* Transaction drill-down (admin) */}
      {loadEntries && (
        <Card title="Transactions" icon={ListOrdered} right={
          <div className="flex gap-2 flex-wrap">
            <select value={group} onChange={(e) => setGroup(e.target.value)} className={`${inputCls} py-1.5 w-auto`}>
              {ENTRY_GROUPS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
            {hasFood && hasTaxi && (
              <select value={service} onChange={(e) => setService(e.target.value)} className={`${inputCls} py-1.5 w-auto`}>
                <option value="">Food + Taxi</option><option value="food">Food</option><option value="taxi">Taxi</option>
              </select>
            )}
          </div>
        }>
          {entries.loading ? <Loading /> : entries.error ? <ErrorState message={entries.error} onRetry={() => fetchEntries(entries.page)} /> : !entries.items.length ? <Empty>No transactions for this filter.</Empty> : (
            <div className="overflow-x-auto -mx-5">
              <table className="w-full text-xs text-left min-w-[760px]">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                  <tr><th className="py-2.5 px-3">When</th><th className="py-2.5 px-3">Type</th><th className="py-2.5 px-3">Source</th><th className="py-2.5 px-3 text-right">Base</th><th className="py-2.5 px-3 text-right">Rate</th><th className="py-2.5 px-3 text-right">Amount</th><th className="py-2.5 px-3">Note</th></tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {entries.items.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50">
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{when(e.eventAt)}</td>
                      <td className="py-2.5 px-3"><span className="font-bold">{e.typeLabel}</span>{e.service && <div className="text-[10px] uppercase text-slate-400">{e.service}{e.ruleVersion ? ` · ${e.ruleScope} v${e.ruleVersion}` : ""}</div>}</td>
                      <td className="py-2.5 px-3 font-mono text-[10px] text-slate-500">{e.refType} {String(e.sourceId || "").slice(-8)}</td>
                      <td className="py-2.5 px-3 text-right">{e.base ? inr2(e.base) : "-"}</td>
                      <td className="py-2.5 px-3 text-right">{e.rate ? pct(e.rate) : "-"}</td>
                      <td className={`py-2.5 px-3 text-right font-black ${e.amount < 0 ? "text-red-600" : "text-emerald-700"}`}>{e.amount < 0 ? "−" : "+"}{inr2(Math.abs(e.amount))}{e.account !== "wallet" && <div className="text-[9px] font-bold text-slate-400 uppercase">{e.account}</div>}</td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-[260px] truncate" title={e.note}>{e.note}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={entries.page} limit={entries.limit} total={entries.total} onPage={fetchEntries} />
        </Card>
      )}

      {/* Payout history */}
      <Card title="Payout history" icon={Wallet}>
        {!data.payouts?.length ? <Empty>No payout requests yet.</Empty> : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-xs text-left min-w-[560px]">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                <tr><th className="py-2.5 px-3">Requested</th><th className="py-2.5 px-3 text-right">Amount</th><th className="py-2.5 px-3">Status</th><th className="py-2.5 px-3">Paid on</th><th className="py-2.5 px-3">Reference</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {data.payouts.map((p) => (
                  <tr key={p.requestId}>
                    <td className="py-2.5 px-3 text-slate-500">{when(p.requestedAt)}</td>
                    <td className="py-2.5 px-3 text-right font-black">{inr2(p.amount)}</td>
                    <td className="py-2.5 px-3"><Badge status={p.status}>{p.status === "approved" ? "Paid" : p.status}</Badge></td>
                    <td className="py-2.5 px-3 text-slate-500">{p.status === "approved" ? when(p.processedAt) : "-"}</td>
                    <td className="py-2.5 px-3 font-mono text-[11px]">{p.transactionId || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function Row({ label, value, strong = false, tone = "" }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 border-b border-slate-100 last:border-0">
      <span className="text-slate-500 font-semibold">{label}</span>
      <span className={`${strong ? "text-sm font-black" : "font-bold"} ${tone || "text-slate-900"}`}>{value}</span>
    </div>
  );
}
