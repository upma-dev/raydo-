import React, { useEffect, useMemo, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Building2, Store, Car, MapPinned, Landmark, Percent, KeyRound, Loader2, CheckCircle2, Copy, AlertTriangle, FileText, Upload, X } from "lucide-react";
import { adminAPI, apiClient } from "@food/api";
import { CommissionExample } from "./InfoGrid";
import { Card, Field, Loading, ErrorState, inr2, pct, errMsg, inputCls, btn, isAmount, isPercent } from "./finance/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^\+?\d{10,15}$/;

/**
 * Manual franchise creation by the super admin. Pricing comes from the chosen zone and can be overridden here
 * (with a reason). Nothing here can mark money as paid: payments are recorded afterwards in "Fees & deposit".
 */
export default function FranchiseCreate() {
  const navigate = useNavigate();
  const [territories, setTerritories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [busy, setBusy] = useState(false);
  const [created, setCreated] = useState(null);
  const [touched, setTouched] = useState(false);

  const [f, setF] = useState({
    applicantName: "", companyName: "", phone: "", email: "", state: "", city: "", area: "", pincode: "",
    food: true, taxi: false, territoryId: "",
    joiningFee: "", securityDeposit: "", overrideReason: "",
    commissionMode: "default", foodRate: "", taxiRate: "", combinedRate: "",
    payoutCycle: "weekly", minPayoutThreshold: "5000",
    createSubAdmin: true, subAdminPassword: "", adminNote: "",
  });
  const set = (patch) => setF((s) => ({ ...s, ...patch }));

  // Location auto-fill: GPS -> state/city/area/pincode, and pincode -> state/city
  const [locating, setLocating] = useState(false);
  // Only fills fields that are still empty, so anything the admin typed is never overwritten (unless force)
  const fillLocation = (patch, force = false) =>
    setF((s) => {
      const next = { ...s };
      Object.entries(patch).forEach(([k, v]) => { if (v && (force || !String(s[k] || "").trim())) next[k] = v; });
      return next;
    });

  const detectLocation = (silent = false) => {
    if (!navigator.geolocation) { if (!silent) toast.error("Location is not supported in this browser"); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(async (pos) => {
      try {
        const { latitude, longitude } = pos.coords;
        const res = await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=en`);
        const d = await res.json();
        fillLocation({
          state: d.principalSubdivision || "",
          city: d.city || d.locality || "",
          area: d.locality && d.locality !== d.city ? d.locality : (d.localityInfo?.administrative?.find((a) => a.adminLevel >= 6)?.name || ""),
          pincode: String(d.postcode || "").replace(/\D/g, "").slice(0, 6),
        }, !silent);
        if (!String(d.postcode || "").trim()) await lookupPincode(d.city || d.locality, d.principalSubdivision);
        if (!silent) toast.success("Location filled");
      } catch {
        if (!silent) toast.error("Could not fetch the address. Please enter it manually");
      } finally {
        setLocating(false);
      }
    }, () => {
      setLocating(false);
      if (!silent) toast.error("Location permission denied. Please allow it or enter the address manually");
    }, { enableHighAccuracy: true, timeout: 10000 });
  };
  useEffect(() => { detectLocation(true); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // state + city (district) -> pincode and area, via the India Post directory. Only fills what is still empty.
  const lookupPincode = async (city, state) => {
    if (!city?.trim()) return;
    try {
      const res = await fetch(`https://api.postalpincode.in/postoffice/${encodeURIComponent(city.trim())}`);
      const list = (await res.json())?.[0]?.PostOffice || [];
      const sameState = list.filter((p) => !state || String(p.State).toLowerCase() === String(state).trim().toLowerCase());
      const po = (sameState.length ? sameState : list)[0];
      if (po) fillLocation({ pincode: po.Pincode, area: po.Name, state: po.State });
    } catch { /* manual entry still works */ }
  };

  const onPincode = async (value) => {
    const pin = value.replace(/\D/g, "").slice(0, 6);
    set({ pincode: pin });
    if (pin.length !== 6) return;
    try {
      const res = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
      const po = (await res.json())?.[0]?.PostOffice?.[0];
      // A new pincode means a new place, so replace state/city; area only if empty
      if (po) { fillLocation({ state: po.State, city: po.District }, true); fillLocation({ area: po.Name }); }
    } catch { /* manual entry still works */ }
  };

  // Same questions and documents as the public application form (managed in "Application Form")
  const [formCfg, setFormCfg] = useState({ fields: [], requiredDocuments: [] });
  const [extra, setExtra] = useState({});
  const [docs, setDocs] = useState({});
  const [uploading, setUploading] = useState("");
  useEffect(() => {
    adminAPI.getFranchiseFormConfig().then((res) => {
      const c = res?.data?.data || {};
      setFormCfg({
        fields: (c.fields || []).filter((x) => x.enabled).sort((a, b) => a.order - b.order),
        requiredDocuments: (c.requiredDocuments || []).filter((x) => x.enabled).sort((a, b) => a.order - b.order),
      });
    }).catch(() => {});
  }, []);

  const uploadDoc = async (doc, file) => {
    if (!file) return;
    if (file.size > (doc.maxSizeMB || 5) * 1024 * 1024) { toast.error(`File too large. Max ${doc.maxSizeMB || 5}MB`); return; }
    setUploading(doc.key);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("folder", "franchise-docs");
      const res = await apiClient.post("/uploads/image", fd, { headers: { "Content-Type": "multipart/form-data" } });
      const url = res?.data?.data?.url || res?.data?.url || "";
      if (!url) throw new Error("Upload failed");
      setDocs((d) => ({ ...d, [doc.key]: { key: doc.key, label: doc.label, url } }));
    } catch (e) {
      toast.error(errMsg(e, "Upload failed"));
    } finally {
      setUploading("");
    }
  };

  const load = async () => {
    setLoading(true);
    setLoadError("");
    try {
      const res = await adminAPI.getFranchiseTerritories();
      setTerritories((res?.data?.data || []).filter((t) => t.isActive));
    } catch (e) {
      setLoadError(errMsg(e, "Could not load zones"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const services = [f.food && "food", f.taxi && "taxi"].filter(Boolean);
  const territory = territories.find((t) => t.id === f.territoryId) || null;
  const fits = (t) => (!f.food || t.foodZoneId) && (!f.taxi || t.taxiZoneId);

  // When the zone changes, take its prices as the starting point
  useEffect(() => {
    if (territory) set({ joiningFee: String(territory.joiningFee), securityDeposit: String(territory.securityDeposit) });
  }, [f.territoryId]); // eslint-disable-line react-hooks/exhaustive-deps

  const overridden = territory && (Number(f.joiningFee) !== territory.joiningFee || Number(f.securityDeposit) !== territory.securityDeposit);

  const errors = useMemo(() => {
    const e = {};
    if (f.applicantName.trim().length < 2) e.applicantName = "Required";
    if (!PHONE_RE.test(f.phone.replace(/[\s-]/g, ""))) e.phone = "10-15 digits";
    if (!EMAIL_RE.test(f.email.trim())) e.email = "Valid email required";
    if (!f.state.trim()) e.state = "Required";
    if (!f.city.trim()) e.city = "Required";
    if (f.pincode && !/^\d{6}$/.test(f.pincode)) e.pincode = "6 digits";
    if (!services.length) e.services = "Choose Food, Taxi or both";
    if (!territory) e.territoryId = "Choose the zone";
    else if (!fits(territory)) e.territoryId = `This zone has no ${f.food && !territory.foodZoneId ? "Food" : "Taxi"} zone`;
    if (!isAmount(f.joiningFee)) e.joiningFee = "Enter an amount (0 allowed)";
    if (!isAmount(f.securityDeposit)) e.securityDeposit = "Enter an amount (0 allowed)";
    if (overridden && f.overrideReason.trim().length < 3) e.overrideReason = "Reason required when prices differ from the zone";
    if (f.commissionMode === "separate") {
      if (f.food && !isPercent(f.foodRate)) e.foodRate = "0 - 100";
      if (f.taxi && !isPercent(f.taxiRate)) e.taxiRate = "0 - 100";
    }
    if (f.commissionMode === "combined" && !isPercent(f.combinedRate)) e.combinedRate = "0 - 100";
    formCfg.fields.forEach((x) => { if (x.required && !String(extra[x.key] || "").trim()) e[`x_${x.key}`] = "Required"; });
    formCfg.requiredDocuments.forEach((d) => { if (d.required && !docs[d.key]) e[`d_${d.key}`] = "Upload required"; });
    if (!isAmount(f.minPayoutThreshold)) e.minPayoutThreshold = "Enter an amount";
    if (f.createSubAdmin && f.subAdminPassword && f.subAdminPassword.length < 8) e.subAdminPassword = "At least 8 characters (or leave blank)";
    return e;
  }, [f, territory, overridden, formCfg, extra, docs]); // eslint-disable-line react-hooks/exhaustive-deps

  const err = (k) => (touched ? errors[k] : "");

  const submit = async () => {
    setTouched(true);
    if (Object.keys(errors).length) { toast.error("Please fix the highlighted fields"); return; }
    setBusy(true);
    try {
      const body = {
        applicantName: f.applicantName, companyName: f.companyName, phone: f.phone, email: f.email,
        state: f.state, city: f.city, area: f.area, pincode: f.pincode,
        selectedModules: services, territoryId: f.territoryId,
        businessType: extra.businessType, investmentRange: extra.investmentRange, experience: extra.experience,
        additionalFields: extra, documents: Object.values(docs),
        joiningFee: f.joiningFee, securityDeposit: f.securityDeposit, overrideReason: f.overrideReason,
        payoutCycle: f.payoutCycle, minPayoutThreshold: f.minPayoutThreshold,
        createSubAdmin: f.createSubAdmin, subAdminPassword: f.subAdminPassword || undefined, adminNote: f.adminNote,
      };
      if (f.commissionMode === "separate") {
        body.commission = { mode: "separate", food: { rate: f.food ? f.foodRate : "0" }, taxi: { rate: f.taxi ? f.taxiRate : "0" }, reason: "Set when the franchise was created" };
      } else if (f.commissionMode === "combined") {
        body.commission = { mode: "combined", combinedRate: f.combinedRate, reason: "Set when the franchise was created" };
      }
      const res = await adminAPI.createFranchiseApplication(body);
      setCreated(res?.data?.data || {});
      toast.success("Franchise created");
    } catch (e) {
      toast.error(errMsg(e, "Could not create the franchise"));
    } finally {
      setBusy(false);
    }
  };

  if (created) {
    const creds = created.credentialsInfo;
    const copy = () => {
      navigator.clipboard.writeText(`Raydo Franchise login\nName: ${created.applicantName}\nFranchise ID: ${created.applicationId}\nLogin: ${window.location.origin}/food/franchise/login\nEmail: ${creds?.email}\nPassword: ${creds?.password || "(unchanged)"}`);
      toast.success("Login details copied");
    };
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen max-w-2xl mx-auto">
        <Card>
          <div className="text-center py-4">
            <CheckCircle2 className="w-12 h-12 text-emerald-600 mx-auto mb-3" />
            <h1 className="text-xl font-black">{created.applicantName}</h1>
            <p className="text-xs font-bold text-blue-600 mt-1">{created.applicationId}</p>
            <p className="text-xs text-slate-500 mt-3">The franchise is created. Its login stays locked until the joining fee and deposit are recorded as paid (or waived) in “Fees & deposit”.</p>
          </div>
          {creds?.password && (
            <div className="p-4 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-1.5 mb-4">
              <div className="flex items-center justify-between font-bold text-blue-900"><span>Login details (shown only once)</span>
                <button onClick={copy} className="px-2 py-1 rounded bg-blue-600 text-white text-[10px] inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button></div>
              <div className="font-mono">Email: {creds.email}</div>
              <div className="font-mono">Password: {creds.password}</div>
            </div>
          )}
          <div className="flex gap-2 justify-center flex-wrap">
            <button className={btn.primary} onClick={() => navigate(`/admin/food/franchise-management/${created._id}?tab=fees`)}>Open franchise → Fees & deposit</button>
            <button className={btn.ghost} onClick={() => window.location.reload()}>Create another</button>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 max-w-[1300px] space-y-5">
      <button onClick={() => navigate("/admin/food/franchise-management/list")} className={btn.ghost}><ArrowLeft className="w-4 h-4" /> Franchise list</button>
      <div>
        <h1 className="text-2xl font-black tracking-tight flex items-center gap-2"><Building2 className="w-6 h-6 text-blue-600" /> Create franchise</h1>
        <p className="text-xs text-slate-500 mt-1">Add a franchise partner manually. Fees, deposit and commission start from the zone pricing; change them here only if this partner gets a different deal.</p>
      </div>

      {loading ? <Loading /> : loadError ? <ErrorState message={loadError} onRetry={load} /> : !territories.length ? (
        <Card><div className="text-center py-8">
          <MapPinned className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-semibold text-slate-600">Set up zone pricing first.</p>
          <p className="text-xs text-slate-400 mt-1">Each franchise belongs to a zone that defines its fee, deposit and commission.</p>
          <Link to="/admin/food/franchise-management/territories" className={`${btn.primary} mt-4`}>Go to zone pricing</Link>
        </div></Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 space-y-5">
            <Card title="Partner" icon={Building2}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Partner name *" error={err("applicantName")}><input className={inputCls} value={f.applicantName} onChange={(e) => set({ applicantName: e.target.value })} /></Field>
                <Field label="Company"><input className={inputCls} value={f.companyName} onChange={(e) => set({ companyName: e.target.value })} /></Field>
                <Field label="Phone *" error={err("phone")}><input inputMode="tel" className={inputCls} value={f.phone} onChange={(e) => set({ phone: e.target.value })} /></Field>
                <Field label="Email * (login email)" error={err("email")}><input type="email" className={inputCls} value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
                <Field label="State *" error={err("state")}><input className={inputCls} value={f.state} onChange={(e) => set({ state: e.target.value })} /></Field>
                <Field label="City / district *" error={err("city")} hint="Pincode and area fill automatically from state + city"><input className={inputCls} value={f.city} onChange={(e) => set({ city: e.target.value })} onBlur={() => { if (!f.pincode) lookupPincode(f.city, f.state); }} /></Field>
                <Field label="Area"><input className={inputCls} value={f.area} onChange={(e) => set({ area: e.target.value })} /></Field>
                <Field label="Pincode" error={err("pincode")}><input inputMode="numeric" maxLength={6} className={inputCls} value={f.pincode} onChange={(e) => onPincode(e.target.value)} /></Field>
              </div>
              <button type="button" onClick={() => detectLocation(false)} disabled={locating} className={`${btn.ghost} mt-3`}>
                {locating ? <Loader2 className="w-4 h-4 animate-spin" /> : <MapPinned className="w-4 h-4" />} Use my current location
              </button>
            </Card>

            {formCfg.fields.length > 0 && (
              <Card title="Business details" icon={Building2}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {formCfg.fields.map((x) => (
                    <Field key={x.key} label={`${x.label}${x.required ? " *" : ""}`} error={err(`x_${x.key}`)}>
                      {x.type === "select" ? (
                        <select className={inputCls} value={extra[x.key] || ""} onChange={(e) => setExtra({ ...extra, [x.key]: e.target.value })}>
                          <option value="">-- Select --</option>
                          {(x.options || []).map((o) => <option key={o} value={o}>{o}</option>)}
                        </select>
                      ) : x.type === "textarea" ? (
                        <textarea rows={2} className={inputCls} placeholder={x.placeholder} value={extra[x.key] || ""} onChange={(e) => setExtra({ ...extra, [x.key]: e.target.value })} />
                      ) : (
                        <input type={x.type === "number" ? "number" : x.type === "email" ? "email" : "text"} className={inputCls} placeholder={x.placeholder} value={extra[x.key] || ""} onChange={(e) => setExtra({ ...extra, [x.key]: e.target.value })} />
                      )}
                    </Field>
                  ))}
                </div>
              </Card>
            )}

            {formCfg.requiredDocuments.length > 0 && (
              <Card title="KYC documents" icon={FileText}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {formCfg.requiredDocuments.map((d) => {
                    const up = docs[d.key];
                    return (
                      <div key={d.key} className={`p-3 rounded-xl border ${err(`d_${d.key}`) ? "border-red-300 bg-red-50" : "border-slate-200 bg-slate-50"}`}>
                        <div className="text-xs font-bold text-slate-800">{d.label}{d.required ? " *" : ""}</div>
                        {d.description && <div className="text-[11px] text-slate-400">{d.description}</div>}
                        {up ? (
                          <div className="mt-2 flex items-center justify-between gap-2 text-xs">
                            <a href={up.url} target="_blank" rel="noopener noreferrer" className="text-blue-600 font-bold underline truncate">View uploaded file</a>
                            <button type="button" onClick={() => setDocs((cur) => { const next = { ...cur }; delete next[d.key]; return next; })} className="text-red-600"><X className="w-4 h-4" /></button>
                          </div>
                        ) : (
                          <label className="mt-2 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-slate-300 text-xs font-bold cursor-pointer hover:bg-slate-50">
                            {uploading === d.key ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Upload className="w-3.5 h-3.5" />} Upload
                            <input type="file" hidden accept={d.acceptedFormats || "image/*,.pdf"} onChange={(e) => uploadDoc(d, e.target.files?.[0])} />
                          </label>
                        )}
                        {err(`d_${d.key}`) && <p className="text-[11px] font-semibold text-red-600 mt-1">{errors[`d_${d.key}`]}</p>}
                      </div>
                    );
                  })}
                </div>
              </Card>
            )}

            <Card title="Services & zone" icon={MapPinned}>
              <div className="flex gap-3 flex-wrap mb-4">
                {[["food", "Food", Store], ["taxi", "Taxi", Car]].map(([k, l, Icon]) => (
                  <button key={k} type="button" onClick={() => set({ [k]: !f[k] })}
                    className={`flex-1 min-w-[140px] p-3.5 rounded-xl border-2 text-left ${f[k] ? "border-blue-600 bg-blue-50" : "border-slate-200 bg-white"}`}>
                    <div className="flex items-center gap-2 font-black text-sm"><Icon className="w-4 h-4" /> {l}<input type="checkbox" readOnly checked={f[k]} className="ml-auto" /></div>
                    <div className="text-[11px] text-slate-500 mt-1">{k === "food" ? "Restaurants and food orders of the zone" : "Drivers and rides of the zone"}</div>
                  </button>
                ))}
              </div>
              {err("services") && <p className="text-[11px] font-semibold text-red-600 -mt-2 mb-3">{errors.services}</p>}
              <Field label="Zone *" error={err("territoryId")} hint={territory ? `Food zone: ${territory.foodZoneName || "-"} · Taxi zone: ${territory.taxiZoneName || "-"}` : "The zone decides which orders and rides belong to this franchise."}>
                <select className={inputCls} value={f.territoryId} onChange={(e) => set({ territoryId: e.target.value })}>
                  <option value="">-- Select zone --</option>
                  {territories.map((t) => <option key={t.id} value={t.id} disabled={!fits(t)}>{t.name}{t.city ? ` (${t.city})` : ""} · fee {inr2(t.joiningFee)} · deposit {inr2(t.securityDeposit)}{!fits(t) ? " - missing zone for selected service" : ""}</option>)}
                </select>
              </Field>
            </Card>

            <Card title="Joining fee & deposit" icon={Landmark}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Joining fee (₹)" hint={territory ? `Zone price ${inr2(territory.joiningFee)} · non-refundable` : "Non-refundable"} error={err("joiningFee")}>
                  <input inputMode="decimal" className={inputCls} value={f.joiningFee} onChange={(e) => set({ joiningFee: e.target.value })} disabled={!territory} />
                </Field>
                <Field label="Security deposit (₹)" hint={territory ? `Zone price ${inr2(territory.securityDeposit)} · refundable` : "Refundable"} error={err("securityDeposit")}>
                  <input inputMode="decimal" className={inputCls} value={f.securityDeposit} onChange={(e) => set({ securityDeposit: e.target.value })} disabled={!territory} />
                </Field>
              </div>
              {overridden && (
                <div className="mt-3">
                  <div className="p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-800 flex gap-1.5 mb-2"><AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Different from the zone price: this franchise gets its own amount.</div>
                  <Field label="Reason for the different price *" error={err("overrideReason")}><input className={inputCls} value={f.overrideReason} onChange={(e) => set({ overrideReason: e.target.value })} /></Field>
                </div>
              )}
              <p className="text-[11px] text-slate-400 mt-3">Payments are recorded after creation (with bank reference), never here.</p>
            </Card>

            <Card title="Platform commission" icon={Percent}>
              <div className="flex gap-2 flex-wrap mb-3">
                {[["default", `Use zone / global (${territory?.commission ? (territory.commission.mode === "combined" ? pct(territory.commission.combinedRate) : `Food ${pct(territory.commission.food.rate)} · Taxi ${pct(territory.commission.taxi.rate)}`) : "global default"})`],
                  ["separate", "Own Food / Taxi %"], ...(f.food && f.taxi ? [["combined", "Own single % on total"]] : [])].map(([v, l]) => (
                  <button key={v} type="button" onClick={() => set({ commissionMode: v })}
                    className={`px-3 py-2 rounded-lg text-xs font-bold border ${f.commissionMode === v ? "bg-blue-600 text-white border-blue-600" : "bg-white text-slate-700 border-slate-300"}`}>{l}</button>
                ))}
              </div>
              {f.commissionMode === "separate" && (
                <div className="grid grid-cols-2 gap-3">
                  {f.food && <Field label="Food commission %" error={err("foodRate")}><input inputMode="decimal" className={inputCls} value={f.foodRate} onChange={(e) => set({ foodRate: e.target.value })} /></Field>}
                  {f.taxi && <Field label="Taxi commission %" error={err("taxiRate")}><input inputMode="decimal" className={inputCls} value={f.taxiRate} onChange={(e) => set({ taxiRate: e.target.value })} /></Field>}
                </div>
              )}
              {f.commissionMode === "combined" && (
                <Field label="% of Food + Taxi earnings together" error={err("combinedRate")}><input inputMode="decimal" className={`${inputCls} max-w-[200px]`} value={f.combinedRate} onChange={(e) => set({ combinedRate: e.target.value })} /></Field>
              )}
              <div className="mt-3">
                {(() => {
                  const zc = territory?.commission;
                  const zr = (m) => (zc ? (zc.mode === "combined" ? zc.combinedRate : zc[m].rate) : undefined);
                  return (
                    <CommissionExample
                      hint={f.commissionMode === "default" ? (zc ? "using the zone rate" : "using the global default (sample 10%)") : undefined}
                      rates={{
                        food: f.food ? (f.commissionMode === "combined" ? f.combinedRate : f.commissionMode === "separate" ? f.foodRate : (zr("food") ?? 10)) : undefined,
                        taxi: f.taxi ? (f.commissionMode === "combined" ? f.combinedRate : f.commissionMode === "separate" ? f.taxiRate : (zr("taxi") ?? 10)) : undefined,
                      }}
                    />
                  );
                })()}
              </div>
              <p className="text-[11px] text-slate-400 mt-2">The platform keeps this % of the franchise's daily earnings; the rest is credited to the franchise wallet.</p>
            </Card>

            <Card title="Payouts & login" icon={KeyRound}>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Field label="Payout cycle"><select className={inputCls} value={f.payoutCycle} onChange={(e) => set({ payoutCycle: e.target.value })}><option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option></select></Field>
                <Field label="Minimum payout (₹)" error={err("minPayoutThreshold")}><input inputMode="decimal" className={inputCls} value={f.minPayoutThreshold} onChange={(e) => set({ minPayoutThreshold: e.target.value })} /></Field>
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-700 mt-4"><input type="checkbox" checked={f.createSubAdmin} onChange={(e) => set({ createSubAdmin: e.target.checked })} /> Create the partner's login now</label>
              {f.createSubAdmin && (
                <div className="mt-3 max-w-sm">
                  <Field label="Password (optional)" hint="Leave blank to generate a strong one (shown once)." error={err("subAdminPassword")}>
                    <input type="text" autoComplete="new-password" className={`${inputCls} font-mono`} value={f.subAdminPassword} onChange={(e) => set({ subAdminPassword: e.target.value })} />
                  </Field>
                </div>
              )}
              <div className="mt-3"><Field label="Internal note"><textarea rows={2} className={inputCls} value={f.adminNote} onChange={(e) => set({ adminNote: e.target.value })} /></Field></div>
            </Card>
          </div>

          <div className="lg:sticky lg:top-4 space-y-4">
            <Card title="Summary">
              <dl className="text-xs space-y-2">
                <Sum k="Partner" v={f.applicantName || "-"} />
                <Sum k="Services" v={services.map((s) => (s === "food" ? "Food" : "Taxi")).join(" + ") || "-"} />
                <Sum k="Zone" v={territory?.name || "-"} />
                <Sum k="Joining fee" v={isAmount(f.joiningFee) ? inr2(f.joiningFee) : "-"} />
                <Sum k="Security deposit" v={isAmount(f.securityDeposit) ? inr2(f.securityDeposit) : "-"} />
                <Sum k="Due before login" v={isAmount(f.joiningFee) && isAmount(f.securityDeposit) ? inr2(Number(f.joiningFee) + Number(f.securityDeposit)) : "-"} strong />
                <Sum k="Commission" v={f.commissionMode === "default" ? "Zone / global" : f.commissionMode === "combined" ? `${f.combinedRate || "?"}% on total` : `${f.food ? `Food ${f.foodRate || "?"}%` : ""}${f.food && f.taxi ? " · " : ""}${f.taxi ? `Taxi ${f.taxiRate || "?"}%` : ""}`} />
              </dl>
              <button className={`${btn.primary} w-full mt-5 py-3 text-sm`} disabled={busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Create franchise</button>
            </Card>
          </div>
        </div>
      )}
    </div>
  );
}

function Sum({ k, v, strong }) {
  return <div className="flex justify-between gap-3 border-b border-slate-100 pb-1.5"><dt className="text-slate-500 font-semibold">{k}</dt><dd className={`text-right ${strong ? "font-black text-slate-900" : "font-bold text-slate-700"}`}>{v}</dd></div>;
}
