import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { MapPinned, Plus, Pencil, Percent, Loader2, ArrowLeft, RefreshCw } from "lucide-react";
import { adminAPI } from "@food/api";
import {
  Card, Badge, Modal, Field, Loading, ErrorState, Empty, inr2, pct, errMsg, inputCls, btn, isAmount, isPercent,
} from "./finance/ui";
import CommissionRuleEditor from "./finance/CommissionRuleEditor";
import { CommissionExample } from "./InfoGrid";

/**
 * Zone-wise franchise pricing: each zone (territory = Food zone and/or Taxi zone of one area) has its own
 * joining fee, refundable security deposit and commission. New franchises take these as defaults; the admin can
 * still override them per franchise. Changing a price never changes what existing franchises owe.
 */
export default function FranchiseTerritories() {
  const navigate = useNavigate();
  const [rows, setRows] = useState([]);
  const [zones, setZones] = useState({ food: [], taxi: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [edit, setEdit] = useState(null);          // territory or {} for new
  const [commissionFor, setCommissionFor] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [t, z] = await Promise.all([adminAPI.getFranchiseTerritories(), adminAPI.getFranchiseZoneOptions()]);
      setRows(t?.data?.data || []);
      setZones(z?.data?.data || { food: [], taxi: [] });
    } catch (e) {
      setError(errMsg(e, "Could not load zones"));
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 space-y-5 max-w-[1400px]">
      <button onClick={() => navigate("/admin/food/franchise-management")} className={btn.ghost}><ArrowLeft className="w-4 h-4" /> Franchise dashboard</button>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><MapPinned className="w-6 h-6 text-blue-600" /> Zone pricing</h1>
          <p className="text-xs text-slate-500 mt-1">Joining fee, security deposit and platform commission for each zone. New franchises in a zone start with these values.</p>
        </div>
        <div className="flex gap-2">
          <button className={btn.ghost} onClick={load} disabled={loading}><RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh</button>
          <button className={btn.primary} onClick={() => setEdit({})}><Plus className="w-4 h-4" /> Add zone pricing</button>
        </div>
      </div>

      <Card>
        {loading && !rows.length ? <Loading /> : error ? <ErrorState message={error} onRetry={load} /> : !rows.length ? (
          <Empty icon={MapPinned}>No zone pricing yet. Add one for each area where you sell franchises.</Empty>
        ) : (
          <div className="overflow-x-auto -mx-5 -my-5">
            <table className="w-full text-xs text-left min-w-[900px]">
              <thead className="bg-slate-100 text-slate-600 font-bold uppercase text-[10px]">
                <tr>
                  <th className="py-3 px-4">Zone</th><th className="py-3 px-4">Food zone</th><th className="py-3 px-4">Taxi zone</th>
                  <th className="py-3 px-4 text-right">Joining fee</th><th className="py-3 px-4 text-right">Deposit</th>
                  <th className="py-3 px-4">Commission</th><th className="py-3 px-4 text-right">Franchises</th><th className="py-3 px-4">Status</th><th className="py-3 px-4" />
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {rows.map((t) => (
                  <tr key={t.id} className="hover:bg-slate-50">
                    <td className="py-3 px-4"><div className="font-black text-slate-900">{t.name}</div><div className="text-[10px] text-slate-400">{[t.code, t.city].filter(Boolean).join(" · ")}</div></td>
                    <td className="py-3 px-4">{t.foodZoneName || <span className="text-slate-300">-</span>}</td>
                    <td className="py-3 px-4">{t.taxiZoneName || <span className="text-slate-300">-</span>}</td>
                    <td className="py-3 px-4 text-right font-bold">{inr2(t.joiningFee)}</td>
                    <td className="py-3 px-4 text-right font-bold">{inr2(t.securityDeposit)}</td>
                    <td className="py-3 px-4">{t.commission
                      ? (t.commission.mode === "combined" ? `${pct(t.commission.combinedRate)} on total` : `Food ${t.commission.food.enabled ? pct(t.commission.food.rate) : "off"} · Taxi ${t.commission.taxi.enabled ? pct(t.commission.taxi.rate) : "off"}`)
                      : <span className="text-slate-400">Global default</span>}</td>
                    <td className="py-3 px-4 text-right">{t.activeFranchises}/{t.franchises}</td>
                    <td className="py-3 px-4"><Badge status={t.isActive ? "active" : "not_required"}>{t.isActive ? "Active" : "Inactive"}</Badge></td>
                    <td className="py-3 px-4">
                      <div className="flex gap-1.5 justify-end">
                        <button className={btn.ghost} onClick={() => setEdit(t)}><Pencil className="w-3.5 h-3.5" /> Edit</button>
                        <button className={btn.ghost} onClick={() => setCommissionFor(t)}><Percent className="w-3.5 h-3.5" /> Commission</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {edit && <TerritoryDialog territory={edit} zones={zones} onClose={() => setEdit(null)} onSaved={() => { setEdit(null); load(); }} />}
      {commissionFor && (
        <Modal open wide title={`Commission · ${commissionFor.name}`} onClose={() => { setCommissionFor(null); load(); }}>
          <CommissionRuleEditor scope="territory" scopeId={commissionFor.id}
            services={[commissionFor.foodZoneId && "food", commissionFor.taxiZoneId && "taxi"].filter(Boolean)} />
        </Modal>
      )}
    </div>
  );
}

function TerritoryDialog({ territory, zones, onClose, onSaved }) {
  const isNew = !territory.id;
  const [f, setF] = useState({
    name: territory.name || "", code: territory.code || "", city: territory.city || "", notes: territory.notes || "",
    foodZoneId: territory.foodZoneId || "", taxiZoneId: territory.taxiZoneId || "",
    joiningFee: territory.joiningFee !== undefined ? String(territory.joiningFee) : "",
    securityDeposit: territory.securityDeposit !== undefined ? String(territory.securityDeposit) : "",
    isActive: territory.isActive !== false, reason: "",
    commissionMode: "global", foodRate: "", taxiRate: "", combinedRate: "",
  });
  const [busy, setBusy] = useState(false);
  const [locating, setLocating] = useState(false);

  // New zone: city comes from the device location (BigDataCloud reverse geocoding); the admin can still edit it
  const detectCity = (silent = false) => {
    if (!navigator.geolocation) return;
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
        const d = await res.json();
        const city = d.city || d.locality || "";
        if (city) setF((x) => ({ ...x, city: silent && x.city ? x.city : city }));
        else if (!silent) toast.error("Could not detect the city. Please type it");
      } catch { if (!silent) toast.error("Could not fetch the location"); }
      finally { setLocating(false); }
    }, () => { setLocating(false); if (!silent) toast.error("Location permission denied. Please type the city"); }, { timeout: 10000 });
  };
  useEffect(() => { if (isNew) detectCity(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const priceChanged = !isNew && (Number(f.joiningFee) !== territory.joiningFee || Number(f.securityDeposit) !== territory.securityDeposit);

  const errors = {
    name: f.name.trim().length < 2 ? "Required" : "",
    zones: !f.foodZoneId && !f.taxiZoneId ? "Choose a Food zone, a Taxi zone, or both" : "",
    joiningFee: !isAmount(f.joiningFee) ? "Enter an amount (0 allowed)" : "",
    securityDeposit: !isAmount(f.securityDeposit) ? "Enter an amount (0 allowed)" : "",
    reason: priceChanged && f.reason.trim().length < 3 ? "Required when prices change" : "",
    foodRate: isNew && f.commissionMode === "separate" && f.foodZoneId && !isPercent(f.foodRate) ? "0 - 100" : "",
    taxiRate: isNew && f.commissionMode === "separate" && f.taxiZoneId && !isPercent(f.taxiRate) ? "0 - 100" : "",
    combinedRate: isNew && f.commissionMode === "combined" && !isPercent(f.combinedRate) ? "0 - 100" : "",
  };
  const valid = Object.values(errors).every((e) => !e);

  const submit = async () => {
    if (!valid) { toast.error("Please fix the highlighted fields"); return; }
    setBusy(true);
    try {
      const body = {
        name: f.name, code: f.code, city: f.city, notes: f.notes, isActive: f.isActive,
        foodZoneId: f.foodZoneId || null, taxiZoneId: f.taxiZoneId || null,
        joiningFee: f.joiningFee, securityDeposit: f.securityDeposit, reason: f.reason,
      };
      if (isNew) {
        if (f.commissionMode === "separate") body.commission = { mode: "separate", food: { rate: f.foodRate || "0" }, taxi: { rate: f.taxiRate || "0" } };
        if (f.commissionMode === "combined") body.commission = { mode: "combined", combinedRate: f.combinedRate };
        await adminAPI.createFranchiseTerritory(body);
      } else {
        await adminAPI.updateFranchiseTerritory(territory.id, body);
      }
      toast.success(isNew ? "Zone pricing created" : "Zone pricing updated");
      onSaved();
    } catch (e) {
      toast.error(errMsg(e, "Could not save"));
    } finally {
      setBusy(false);
    }
  };

  const zoneOption = (z) => {
    const taken = z.territoryId && String(z.territoryId) !== String(territory.id || "");
    return <option key={z.id} value={z.id} disabled={taken}>{z.name}{taken ? ` (used by ${z.territoryName})` : ""}</option>;
  };

  return (
    <Modal open wide title={isNew ? "Add zone pricing" : `Edit ${territory.name}`} onClose={onClose} footer={<>
      <button className={btn.ghost} onClick={onClose}>Cancel</button>
      <button className={btn.primary} disabled={busy} onClick={submit}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{isNew ? "Create" : "Save"}</button>
    </>}>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <Field label="Zone name *" error={errors.name && f.name !== "" ? errors.name : ""}><input className={inputCls} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Indore Central" /></Field>
        <Field label="Code"><input className={inputCls} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value })} placeholder="IND-C" /></Field>
        <Field label="City" hint={isNew ? <button type="button" onClick={() => detectCity(false)} className="text-blue-600 font-bold underline">{locating ? "Detecting..." : "Use my current location"}</button> : undefined}><input className={inputCls} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} /></Field>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Food zone" hint="Orders of restaurants in this zone belong to the franchise here.">
          <select className={inputCls} value={f.foodZoneId} onChange={(e) => setF({ ...f, foodZoneId: e.target.value })}>
            <option value="">- none -</option>{zones.food.map(zoneOption)}
          </select>
        </Field>
        <Field label="Taxi zone" hint="Rides of drivers in this zone belong to the franchise here." error={errors.zones}>
          <select className={inputCls} value={f.taxiZoneId} onChange={(e) => setF({ ...f, taxiZoneId: e.target.value })}>
            <option value="">- none -</option>{zones.taxi.map(zoneOption)}
          </select>
        </Field>
        <Field label="Joining fee (₹) *" hint="One-time, non-refundable." error={f.joiningFee !== "" && errors.joiningFee}><input inputMode="decimal" className={inputCls} value={f.joiningFee} onChange={(e) => setF({ ...f, joiningFee: e.target.value })} /></Field>
        <Field label="Security deposit (₹) *" hint="Refundable. Never counted as earnings." error={f.securityDeposit !== "" && errors.securityDeposit}><input inputMode="decimal" className={inputCls} value={f.securityDeposit} onChange={(e) => setF({ ...f, securityDeposit: e.target.value })} /></Field>
      </div>

      {isNew && (
        <div className="p-3 rounded-xl border border-slate-200 space-y-3">
          <div className="text-[11px] font-bold text-slate-500 uppercase">Platform commission in this zone</div>
          <div className="flex gap-2 flex-wrap">
            {[["global", "Use global default"], ["separate", "Separate Food / Taxi %"], ["combined", "One % on total"]].map(([v, l]) => (
              <button key={v} type="button" onClick={() => setF({ ...f, commissionMode: v })}
                className={`px-3 py-2 rounded-lg text-xs font-bold border ${f.commissionMode === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-300"}`}>{l}</button>
            ))}
          </div>
          {f.commissionMode === "separate" && (
            <div className="grid grid-cols-2 gap-3">
              {f.foodZoneId && <Field label="Food %" error={f.foodRate !== "" && errors.foodRate}><input inputMode="decimal" className={inputCls} value={f.foodRate} onChange={(e) => setF({ ...f, foodRate: e.target.value })} /></Field>}
              {f.taxiZoneId && <Field label="Taxi %" error={f.taxiRate !== "" && errors.taxiRate}><input inputMode="decimal" className={inputCls} value={f.taxiRate} onChange={(e) => setF({ ...f, taxiRate: e.target.value })} /></Field>}
            </div>
          )}
          {f.commissionMode === "combined" && (
            <Field label="% on Food + Taxi total" error={f.combinedRate !== "" && errors.combinedRate}><input inputMode="decimal" className={`${inputCls} max-w-[200px]`} value={f.combinedRate} onChange={(e) => setF({ ...f, combinedRate: e.target.value })} /></Field>
          )}
          {f.commissionMode === "global" ? (
            <p className="text-[11px] text-slate-500">This zone will use the platform's global commission %. Choose "Separate" or "One %" to set a rate for this zone only.</p>
          ) : (
            <CommissionExample rates={{
              // only the services this zone really has: Food zone -> Food, Taxi zone -> Taxi, both -> both
              food: f.foodZoneId ? (f.commissionMode === "combined" ? f.combinedRate : f.foodRate) : undefined,
              taxi: f.taxiZoneId ? (f.commissionMode === "combined" ? f.combinedRate : f.taxiRate) : undefined,
            }} />
          )}
        </div>
      )}

      {!isNew && (
        <>
          <label className="flex items-center gap-2 text-xs font-bold text-slate-700"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Active (new franchises can be created in this zone)</label>
          {priceChanged && (
            <Field label="Reason for the price change *" hint="Existing franchises keep the amounts they were given." error={f.reason && errors.reason}>
              <input className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
            </Field>
          )}
          <p className="text-[11px] text-slate-400">Commission of this zone is changed with the "Commission" button (it is versioned).</p>
        </>
      )}
      <Field label="Notes"><textarea rows={2} className={inputCls} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </Modal>
  );
}
