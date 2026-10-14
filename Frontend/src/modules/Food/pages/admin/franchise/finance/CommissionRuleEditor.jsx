import React, { useCallback, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Percent, Save, Loader2, History, Undo2, Info } from "lucide-react";
import { adminAPI } from "@food/api";
import { CommissionExample } from "../InfoGrid";
import { Card, Field, Loading, ErrorState, Badge, when, pct, inr2, errMsg, inputCls, btn, isPercent } from "./ui";

const SCOPE_TEXT = {
  global: "Global default: used by every franchise that has no zone or franchise setting.",
  territory: "Zone setting: used by every franchise in this zone unless the franchise has its own override.",
  franchise: "Franchise override: used only for this franchise, before the zone and global settings.",
};
const APPLIED = { franchise: "this franchise's override", territory: "the zone setting", global: "the global default" };

const blank = { mode: "separate", foodEnabled: true, foodRate: "", taxiEnabled: true, taxiRate: "", combinedRate: "", when: "now", effectiveFrom: "", reason: "" };
const fromRule = (r) => (r && !r.inherit ? {
  ...blank,
  mode: r.mode,
  foodEnabled: r.food.enabled, foodRate: String(r.food.rate ?? ""),
  taxiEnabled: r.taxi.enabled, taxiRate: String(r.taxi.rate ?? ""),
  combinedRate: String(r.mode === "combined" ? r.combinedRate : ""),
} : blank);

/**
 * Versioned platform-commission rule of one scope. Saving never edits the old version: it adds a new one,
 * so past transactions keep the rate they were calculated with.
 */
export default function CommissionRuleEditor({ scope, scopeId = null, services = ["food", "taxi"], effective = null, onSaved }) {
  const [state, setState] = useState({ loading: true, error: "", data: null });
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const [eff, setEff] = useState(effective);

  const hasFood = services.includes("food");
  const hasTaxi = services.includes("taxi");

  const load = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, error: "" }));
    try {
      const [res, effRes] = await Promise.all([
        adminAPI.getFranchiseCommissionRules(scope, scopeId),
        scope === "franchise" ? adminAPI.getFranchiseEffectiveCommission(scopeId) : Promise.resolve(null),
      ]);
      const data = res?.data?.data;
      setState({ loading: false, error: "", data });
      if (effRes) setEff(effRes?.data?.data || null);
      setF(fromRule(data?.current));
    } catch (e) {
      setState({ loading: false, error: errMsg(e, "Could not load commission"), data: null });
    }
  }, [scope, scopeId]);
  useEffect(() => { load(); }, [load]);

  const errors = useMemo(() => {
    const e = {};
    if (f.mode === "combined") {
      if (!isPercent(f.combinedRate)) e.combinedRate = "0 - 100, max 2 decimals";
    } else {
      if (hasFood && f.foodEnabled && !isPercent(f.foodRate)) e.foodRate = "0 - 100, max 2 decimals";
      if (hasTaxi && f.taxiEnabled && !isPercent(f.taxiRate)) e.taxiRate = "0 - 100, max 2 decimals";
    }
    if (f.when === "later") {
      const d = new Date(f.effectiveFrom);
      if (!f.effectiveFrom || Number.isNaN(d.getTime()) || d.getTime() < Date.now()) e.effectiveFrom = "Pick a future date and time";
    }
    if (f.reason.trim().length < 3) e.reason = "Required for the audit trail";
    return e;
  }, [f, hasFood, hasTaxi]);

  const save = async (inherit = false) => {
    if (!inherit && Object.keys(errors).length) { toast.error("Please fix the highlighted fields"); return; }
    if (inherit && f.reason.trim().length < 3) { toast.error("Enter a reason first"); return; }
    if (!window.confirm(inherit ? "Remove this override? The franchise will use the zone / global commission from now on." : "Save these commission rates? They apply to transactions from the effective time onward. Past transactions are not changed.")) return;
    setBusy(true);
    try {
      const body = inherit
        ? { inherit: true, reason: f.reason }
        : {
          mode: f.mode,
          food: { enabled: f.foodEnabled, rate: f.foodEnabled ? f.foodRate || "0" : undefined },
          taxi: { enabled: f.taxiEnabled, rate: f.taxiEnabled ? f.taxiRate || "0" : undefined },
          combinedRate: f.mode === "combined" ? f.combinedRate : undefined,
          effectiveFrom: f.when === "later" ? new Date(f.effectiveFrom).toISOString() : undefined,
          reason: f.reason,
        };
      // a franchise / zone holding one service still sends a valid rate for the other one
      if (!inherit && body.mode === "separate") {
        if (!hasFood) body.food = { enabled: true, rate: f.foodRate || "0" };
        if (!hasTaxi) body.taxi = { enabled: true, rate: f.taxiRate || "0" };
      }
      await adminAPI.createFranchiseCommissionRule(scope, scopeId, body);
      toast.success(inherit ? "Override removed" : "Commission saved as a new version");
      await load();
      onSaved?.();
    } catch (e) {
      toast.error(errMsg(e, "Could not save commission"));
    } finally {
      setBusy(false);
    }
  };

  if (state.loading && !state.data) return <Loading text="Loading commission..." />;
  if (state.error) return <ErrorState message={state.error} onRetry={load} />;
  const { current, scheduled = [], versions = [] } = state.data || {};
  const now = Date.now();

  return (
    <div className="space-y-5">
      {scope === "franchise" && eff && (
        <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-100 text-xs text-slate-700">
          <div className="font-bold text-blue-900 mb-1">In force now (from {APPLIED[eff.appliedFrom] || eff.appliedFrom}, v{eff.version})</div>
          {eff.mode === "combined"
            ? <span>One rate on Food + Taxi: <b>{pct(eff.food.rate)}</b></span>
            : <span className="flex gap-4 flex-wrap">{hasFood && <span>Food <b>{eff.food.enabled ? pct(eff.food.rate) : "off"}</b></span>}{hasTaxi && <span>Taxi <b>{eff.taxi.enabled ? pct(eff.taxi.rate) : "off"}</b></span>}</span>}
          <div className="text-[11px] text-slate-500 mt-1">Priority: franchise override → zone setting → global default.</div>
        </div>
      )}

      <Card title={scope === "franchise" ? "Franchise commission override" : scope === "territory" ? "Zone commission" : "Global default commission"} icon={Percent}
        right={current && !current.inherit ? <Badge status="active">v{current.version} active</Badge> : <Badge status="not_required">{scope === "global" ? "-" : "Not set"}</Badge>}>
        <p className="text-xs text-slate-500 mb-4 flex gap-1.5"><Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />{SCOPE_TEXT[scope]} The platform keeps this % of the franchise's eligible earnings.</p>

        {hasFood && hasTaxi && (
          <div className="flex gap-2 mb-4 flex-wrap">
            {[["separate", "Separate Food & Taxi %"], ["combined", "One % on total (Food + Taxi)"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setF({ ...f, mode: v })}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${f.mode === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"}`}>{l}</button>
            ))}
          </div>
        )}

        {f.mode === "combined" ? (
          <div className="max-w-xs">
            <Field label="Platform commission on total earnings (%)" error={f.combinedRate !== "" && errors.combinedRate}>
              <input inputMode="decimal" className={inputCls} value={f.combinedRate} onChange={(e) => setF({ ...f, combinedRate: e.target.value })} placeholder="e.g. 10" />
            </Field>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {hasFood && <RateInput label="Food commission (%)" enabled={f.foodEnabled} rate={f.foodRate} error={f.foodRate !== "" && errors.foodRate}
              onToggle={(v) => setF({ ...f, foodEnabled: v })} onRate={(v) => setF({ ...f, foodRate: v })} />}
            {hasTaxi && <RateInput label="Taxi commission (%)" enabled={f.taxiEnabled} rate={f.taxiRate} error={f.taxiRate !== "" && errors.taxiRate}
              onToggle={(v) => setF({ ...f, taxiEnabled: v })} onRate={(v) => setF({ ...f, taxiRate: v })} />}
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <Field label="Applies from" error={f.when === "later" && errors.effectiveFrom}>
            <div className="flex gap-2">
              <select className={inputCls} value={f.when} onChange={(e) => setF({ ...f, when: e.target.value })}>
                <option value="now">Immediately</option><option value="later">A future date & time</option>
              </select>
              {f.when === "later" && <input type="datetime-local" className={inputCls} value={f.effectiveFrom} onChange={(e) => setF({ ...f, effectiveFrom: e.target.value })} />}
            </div>
          </Field>
          <Field label="Reason (required)" error={f.reason && errors.reason}>
            <input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. New agreement signed 01-Oct" />
          </Field>
        </div>

        <div className="mt-4">
          <CommissionExample rates={{
            food: hasFood ? (f.mode === "combined" ? f.combinedRate : f.foodEnabled ? f.foodRate : 0) : undefined,
            taxi: hasTaxi ? (f.mode === "combined" ? f.combinedRate : f.taxiEnabled ? f.taxiRate : 0) : undefined,
          }} />
        </div>

        <div className="flex gap-2 mt-4 flex-wrap">
          <button className={btn.primary} disabled={busy} onClick={() => save(false)}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save as new version</button>
          {scope !== "global" && current && !current.inherit && (
            <button className={btn.ghost} disabled={busy} onClick={() => save(true)}><Undo2 className="w-3.5 h-3.5" /> Remove override (use {scope === "franchise" ? "zone / global" : "global"})</button>
          )}
        </div>
      </Card>

      <Card title="Version history" icon={History} right={scheduled.length ? <Badge status="pending">{scheduled.length} scheduled</Badge> : null}>
        {!versions.length ? <p className="text-xs text-slate-400">No versions yet.</p> : (
          <div className="overflow-x-auto -mx-5">
            <table className="w-full text-xs text-left min-w-[680px]">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                <tr><th className="py-2.5 px-3">Ver.</th><th className="py-2.5 px-3">Rates</th><th className="py-2.5 px-3">From</th><th className="py-2.5 px-3">State</th><th className="py-2.5 px-3">By</th><th className="py-2.5 px-3">Reason</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {versions.map((v) => {
                  const future = new Date(v.effectiveFrom).getTime() > now;
                  const isCurrent = current && String(current.id) === String(v.id);
                  return (
                    <tr key={v.id} className={isCurrent ? "bg-emerald-50/50" : ""}>
                      <td className="py-2.5 px-3 font-black">v{v.version}</td>
                      <td className="py-2.5 px-3">{v.inherit ? <span className="text-slate-500">No override</span> : v.mode === "combined" ? `${pct(v.combinedRate)} on total` : `Food ${v.food.enabled ? pct(v.food.rate) : "off"} · Taxi ${v.taxi.enabled ? pct(v.taxi.rate) : "off"}`}</td>
                      <td className="py-2.5 px-3 text-slate-500 whitespace-nowrap">{new Date(v.effectiveFrom).getTime() <= 0 ? "Always" : when(v.effectiveFrom)}</td>
                      <td className="py-2.5 px-3">{isCurrent ? <Badge status="active">Current</Badge> : future ? <Badge status="pending">Scheduled</Badge> : <Badge status="not_required">Past</Badge>}</td>
                      <td className="py-2.5 px-3 text-slate-500">{v.createdByName || "system"}</td>
                      <td className="py-2.5 px-3 text-slate-600 max-w-[240px] truncate" title={v.reason}>{v.reason}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>
  );
}

function RateInput({ label, enabled, rate, error, onToggle, onRate }) {
  return (
    <div className="p-3 rounded-xl border border-slate-200">
      <div className="flex items-center justify-between mb-2">
        <span className="text-[11px] font-bold text-slate-500 uppercase">{label}</span>
        <label className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
          <input type="checkbox" checked={enabled} onChange={(e) => onToggle(e.target.checked)} /> Charge commission
        </label>
      </div>
      <input inputMode="decimal" disabled={!enabled} className={inputCls} value={enabled ? rate : ""} onChange={(e) => onRate(e.target.value)} placeholder={enabled ? "e.g. 10" : "0% (off)"} />
      {error && <p className="text-[11px] font-semibold text-red-600 mt-1">{error}</p>}
    </div>
  );
}
