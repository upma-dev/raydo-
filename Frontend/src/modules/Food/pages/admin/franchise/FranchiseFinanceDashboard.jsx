import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { IndianRupee, RefreshCw, Download, Search, ArrowLeft, Store, Car, Wallet, ShieldCheck, AlertTriangle } from "lucide-react";
import { adminAPI } from "@food/api";
import {
  Card, Stat, Badge, ServiceChips, Loading, ErrorState, Empty, Pager, DateRange, inr, inr2, pct, errMsg, inputCls, btn,
  downloadCsv, istToday,
} from "./finance/ui";

const STATUS = [["", "All"], ["active", "Active"], ["suspended", "Suspended"], ["terminated", "Terminated"], ["dues", "Fee / deposit due"], ["clear", "No dues"]];

/**
 * Super admin: every franchise's earnings, platform commission, wallet, fee and deposit for a date range.
 * Numbers come from the server ledger. Click a row for the full franchise page.
 */
export default function FranchiseFinanceDashboard() {
  const navigate = useNavigate();
  const [range, setRange] = useState({ from: istToday(), to: istToday() });
  const [filters, setFilters] = useState({ territoryId: "", service: "", status: "", search: "" });
  const [searchInput, setSearchInput] = useState("");
  const [territories, setTerritories] = useState([]);
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    adminAPI.getFranchiseTerritories().then((r) => setTerritories(r?.data?.data || [])).catch(() => {});
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setFilters((f) => ({ ...f, search: searchInput.trim() })), 400);
    return () => clearTimeout(t);
  }, [searchInput]);

  const params = useCallback((p = page, limit = 25) => ({
    ...range, page: p, limit,
    territoryId: filters.territoryId || undefined, service: filters.service || undefined,
    status: filters.status || undefined, search: filters.search || undefined,
  }), [range, filters, page]);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const res = await adminAPI.getFranchiseFinanceSummary(params());
      setState({ loading: false, error: "", data: res?.data?.data });
    } catch (e) {
      setState((s) => ({ ...s, loading: false, error: errMsg(e, "Could not load finance") }));
    }
  }, [params]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [range, filters]);

  const exportAll = async () => {
    setExporting(true);
    try {
      const rows = [];
      for (let p = 1; p < 50; p += 1) {
        const res = await adminAPI.getFranchiseFinanceSummary(params(p, 200));
        const d = res?.data?.data;
        rows.push(...(d?.items || []));
        if (!d || rows.length >= d.total) break;
      }
      downloadCsv(`franchise-finance-${range.from}-to-${range.to}.csv`, [
        { label: "Franchise ID", value: "applicationId" }, { label: "Name", value: "name" }, { label: "Zone", value: (r) => r.territory?.name || "" },
        { label: "Services", value: (r) => r.services.join("+") }, { label: "Status", value: "accountStatus" },
        { label: "Food earnings", value: "foodEarning" }, { label: "Food commission %", value: "foodRateApplied" }, { label: "Food commission", value: "foodCommission" },
        { label: "Taxi earnings", value: "taxiEarning" }, { label: "Taxi commission %", value: "taxiRateApplied" }, { label: "Taxi commission", value: "taxiCommission" },
        { label: "Total earnings", value: "totalEarning" }, { label: "Platform commission", value: "totalCommission" }, { label: "Franchise net", value: "franchiseNet" },
        { label: "Wallet balance", value: "walletBalance" }, { label: "Pending payouts", value: "pendingPayoutAmount" },
        { label: "Joining fee status", value: (r) => r.joiningFee?.status || "" }, { label: "Joining fee outstanding", value: (r) => r.joiningFee?.outstanding ?? "" },
        { label: "Deposit held", value: (r) => r.deposit?.held ?? "" }, { label: "Deposit outstanding", value: (r) => r.deposit?.outstanding ?? "" },
        { label: "Total outstanding", value: "outstanding" },
      ], rows);
    } catch (e) {
      toast.error(errMsg(e, "Export failed"));
    } finally {
      setExporting(false);
    }
  };

  const d = state.data;
  const t = d?.totals || {};

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 space-y-5 max-w-[1600px]">
      <button onClick={() => navigate("/admin/food/franchise-management")} className={btn.ghost}><ArrowLeft className="w-4 h-4" /> Franchise dashboard</button>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><IndianRupee className="w-6 h-6 text-blue-600" /> Franchise earnings & commission</h1>
          <p className="text-xs text-slate-500 mt-1">What every franchise earned, what the platform kept, what is credited, paid out and still due. Days are in IST.</p>
        </div>
        <div className="flex gap-2">
          <button className={btn.ghost} onClick={load} disabled={state.loading}><RefreshCw className={`w-3.5 h-3.5 ${state.loading ? "animate-spin" : ""}`} /> Refresh</button>
          <button className={btn.ghost} onClick={exportAll} disabled={exporting || !d?.total}><Download className="w-3.5 h-3.5" /> {exporting ? "Exporting..." : "Export CSV"}</button>
        </div>
      </div>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <DateRange from={range.from} to={range.to} onChange={setRange} />
          <div className="min-w-[160px]">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Zone</label>
            <select className={`${inputCls} py-2`} value={filters.territoryId} onChange={(e) => setFilters({ ...filters, territoryId: e.target.value })}>
              <option value="">All zones</option>{territories.map((z) => <option key={z.id} value={z.id}>{z.name}</option>)}
            </select>
          </div>
          <div className="min-w-[130px]">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Service</label>
            <select className={`${inputCls} py-2`} value={filters.service} onChange={(e) => setFilters({ ...filters, service: e.target.value })}>
              <option value="">Food & Taxi</option><option value="food">Has Food</option><option value="taxi">Has Taxi</option>
            </select>
          </div>
          <div className="min-w-[150px]">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Status</label>
            <select className={`${inputCls} py-2`} value={filters.status} onChange={(e) => setFilters({ ...filters, status: e.target.value })}>
              {STATUS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </div>
          <div className="flex-1 min-w-[180px]">
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Franchise</label>
            <div className="relative"><Search className="w-4 h-4 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input className={`${inputCls} py-2 pl-8`} placeholder="Name, ID or city" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} /></div>
          </div>
        </div>
      </Card>

      {d && (
        <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-8 gap-3">
          <Stat icon={Store} label="Food earnings" value={inr(t.foodEarning)} tone="text-amber-700" />
          <Stat label="Food commission" value={inr(t.foodCommission)} tone="text-red-600" />
          <Stat icon={Car} label="Taxi earnings" value={inr(t.taxiEarning)} tone="text-blue-700" />
          <Stat label="Taxi commission" value={inr(t.taxiCommission)} tone="text-red-600" />
          <Stat label="Platform commission" value={inr(t.totalCommission)} tone="text-red-700" sub={`on ${inr(t.totalEarning)} earnings`} />
          <Stat label="Franchise net" value={inr(t.franchiseNet)} tone="text-emerald-700" sub="credited to wallets" />
          <Stat icon={Wallet} label="Wallets payable" value={inr(t.walletBalance)} sub={`${inr(t.pendingPayoutAmount)} requested`} />
          <Stat icon={ShieldCheck} label="Deposits held" value={inr(t.depositHeld)} sub={t.outstanding ? `${inr(t.outstanding)} fees/deposit due` : "No dues"} tone={t.outstanding ? "text-amber-700" : "text-slate-900"} />
        </div>
      )}

      <Card>
        {state.loading && !d ? <Loading /> : state.error ? <ErrorState message={state.error} onRetry={load} /> : !d?.items?.length ? (
          <Empty>No franchises match these filters.</Empty>
        ) : (
          <>
            <div className="overflow-x-auto -mx-5 -mt-5">
              <table className="w-full text-xs text-left min-w-[1250px]">
                <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                  <tr>
                    <th className="py-3 px-3">Franchise</th><th className="py-3 px-3">Zone</th>
                    <th className="py-3 px-3 text-right">Food earn.</th><th className="py-3 px-3 text-right">Food comm.</th>
                    <th className="py-3 px-3 text-right">Taxi earn.</th><th className="py-3 px-3 text-right">Taxi comm.</th>
                    <th className="py-3 px-3 text-right">Total earn.</th><th className="py-3 px-3 text-right">Platform comm.</th><th className="py-3 px-3 text-right">Franchise net</th>
                    <th className="py-3 px-3 text-right">Wallet</th><th className="py-3 px-3">Joining fee</th><th className="py-3 px-3">Deposit</th><th className="py-3 px-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {d.items.map((r) => (
                    <tr key={r.id} onClick={() => navigate(`/admin/food/franchise-management/${r.id}?tab=finance`)} className="hover:bg-blue-50/40 cursor-pointer">
                      <td className="py-3 px-3"><div className="font-black text-slate-900">{r.name}</div><div className="flex items-center gap-1.5 mt-0.5"><span className="text-[10px] font-bold text-blue-600">{r.applicationId}</span><ServiceChips services={r.services} /></div></td>
                      <td className="py-3 px-3 text-slate-600">{r.territory?.name || <span className="text-slate-300">-</span>}</td>
                      <Money v={r.services.includes("food") ? r.foodEarning : null} />
                      <Money v={r.services.includes("food") ? r.foodCommission : null} sub={r.foodRateApplied !== null ? pct(r.foodRateApplied) : r.currentRates ? `${pct(r.currentRates.food.rate)} now` : null} red />
                      <Money v={r.services.includes("taxi") ? r.taxiEarning : null} />
                      <Money v={r.services.includes("taxi") ? r.taxiCommission : null} sub={r.taxiRateApplied !== null ? pct(r.taxiRateApplied) : r.currentRates ? `${pct(r.currentRates.taxi.rate)} now` : null} red />
                      <Money v={r.totalEarning} bold />
                      <Money v={r.totalCommission} bold red />
                      <Money v={r.franchiseNet} bold green />
                      <Money v={r.walletBalance} sub={r.pendingPayoutAmount ? `${inr(r.pendingPayoutAmount)} requested` : null} />
                      <td className="py-3 px-3">{r.joiningFee ? <><Badge status={r.joiningFee.status} />{r.joiningFee.outstanding > 0 && <div className="text-[10px] text-red-600 font-bold mt-0.5">{inr(r.joiningFee.outstanding)} due</div>}</> : "-"}</td>
                      <td className="py-3 px-3">{r.deposit ? <><div className="font-bold">{inr(r.deposit.held)} held</div>{r.deposit.outstanding > 0 ? <div className="text-[10px] text-red-600 font-bold">{inr(r.deposit.outstanding)} due</div> : <Badge status={r.deposit.status} />}</> : "-"}</td>
                      <td className="py-3 px-3"><Badge status={r.accountStatus} />{r.hasDues && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline ml-1" />}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pager page={d.page} limit={d.limit} total={d.total} onPage={setPage} />
            <p className="text-[11px] text-slate-400 mt-2">Commission % shown under a figure is the rate actually applied in the period; "now" means no activity yet, so today's rate is shown.</p>
          </>
        )}
      </Card>
    </div>
  );
}

function Money({ v, sub, bold, red, green }) {
  if (v === null || v === undefined) return <td className="py-3 px-3 text-right text-slate-300">-</td>;
  return (
    <td className={`py-3 px-3 text-right whitespace-nowrap ${bold ? "font-black" : "font-semibold"} ${red ? "text-red-600" : green ? "text-emerald-700" : "text-slate-900"}`}>
      {inr2(v)}{sub && <div className="text-[10px] font-semibold text-slate-400">{sub}</div>}
    </td>
  );
}
