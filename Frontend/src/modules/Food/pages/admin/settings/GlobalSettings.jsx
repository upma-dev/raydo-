import React, { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Loader2, Save, Globe2, Palette, ShieldCheck, Upload, CheckCircle2, AlertTriangle, Eye, Pencil, Wrench, Plug } from "lucide-react";
import api, { adminAPI, uploadAPI } from "@food/api";
import { legalHtmlToPlainText, plainTextToLegalHtml } from "@food/utils/legalContentFormat";

const TABS = [
  { id: "brand", label: "Brand & Contact", icon: Globe2 },
  { id: "appearance", label: "Appearance", icon: Palette },
  { id: "legal", label: "Privacy & Legal", icon: ShieldCheck },
  { id: "maintenance", label: "Maintenance", icon: Wrench },
  { id: "integrations", label: "Integrations & Payments", icon: Plug },
];

const input = "w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";
const labelCls = "block text-xs font-bold text-slate-600 uppercase mb-1.5";
const errMsg = (e, fallback) => e?.response?.data?.message || fallback;

function Field({ label, hint, children }) {
  return (
    <div>
      <label className={labelCls}>{label}</label>
      {children}
      {hint && <p className="text-[11px] text-slate-400 mt-1">{hint}</p>}
    </div>
  );
}

function ImageField({ label, value, onChange, folder }) {
  const [busy, setBusy] = useState(false);
  const pick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 2 * 1024 * 1024) return toast.error("Image must be under 2 MB");
    setBusy(true);
    try {
      const res = await uploadAPI.uploadMedia(file, { folder });
      const url = res?.data?.data?.url || res?.data?.url || "";
      if (!url) throw new Error("no url");
      onChange(url);
      toast.success(`${label} uploaded. Click Save to apply it.`);
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setBusy(false);
      e.target.value = "";
    }
  };
  return (
    <Field label={label}>
      <div className="flex items-center gap-3">
        <div className="w-16 h-16 rounded-xl border border-slate-200 bg-slate-50 flex items-center justify-center overflow-hidden shrink-0">
          {value ? <img src={value} alt={label} className="max-w-full max-h-full object-contain" /> : <span className="text-[10px] text-slate-400">No image</span>}
        </div>
        <label className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold cursor-pointer">
          {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
          {busy ? "Uploading..." : "Choose image"}
          <input type="file" accept="image/*" className="hidden" onChange={pick} disabled={busy} />
        </label>
      </div>
    </Field>
  );
}


// ---------------------------------------------------------------------------------------------
// Maintenance: one switch per app (All / Food / Taxi). Uses the shared /maintenance API.
// ---------------------------------------------------------------------------------------------
const DEFAULT_MSG = "Service is currently under maintenance. Please try again later.";
const MAINT_ROWS = [
  { module: "all", title: "Whole platform", sub: "Food + Taxi together" },
  { module: "food", title: "Food app", sub: "Customers, restaurants, delivery partners" },
  { module: "taxi", title: "Taxi app", sub: "Riders, drivers, owners" },
];

function MaintenanceTab() {
  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState({});
  const [savingKey, setSavingKey] = useState("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await api.get("/maintenance", { contextModule: "admin" });
      const list = Array.isArray(res?.data?.data) ? res.data.data : [];
      const next = {};
      MAINT_ROWS.forEach((r) => {
        const found = list.find((s) => s.module === r.module && (s.serviceType || "all") === "all" && !s.zoneId);
        next[r.module] = { id: found?._id || null, isMaintenance: Boolean(found?.isMaintenance), message: found?.maintenanceMessage || DEFAULT_MSG };
      });
      setRows(next);
    } catch (e) {
      toast.error(errMsg(e, "Could not load maintenance settings"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const save = async (module, patch = {}) => {
    const cur = { ...rows[module], ...patch };
    if (!String(cur.message || "").trim()) return toast.error("Please write the message users will see");
    setSavingKey(module);
    try {
      await api.put("/maintenance", { module, serviceType: "all", zoneId: null, isMaintenance: cur.isMaintenance, maintenanceMessage: cur.message }, { contextModule: "admin" });
      setRows((r) => ({ ...r, [module]: cur }));
      toast.success(`${MAINT_ROWS.find((x) => x.module === module).title}: ${cur.isMaintenance ? "maintenance ON" : "maintenance OFF"} (saved)`);
    } catch (e) {
      toast.error(errMsg(e, "Could not save"));
    } finally {
      setSavingKey("");
    }
  };

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading...</div>;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-2 p-4 rounded-xl bg-emerald-50 border border-emerald-300 text-emerald-900 text-xs font-semibold">
        <CheckCircle2 className="w-4 h-4 mt-0.5 shrink-0 text-emerald-600" />
        <div>
          <div className="font-extrabold mb-0.5">Maintenance Mode is LIVE & ENFORCED</div>
          When enabled, non-admin API requests for the selected service (Whole platform, Food, or Taxi) will be blocked immediately, displaying your custom maintenance message to users.
        </div>
      </div>

      {MAINT_ROWS.map((r) => {
        const row = rows[r.module] || { isMaintenance: false, message: DEFAULT_MSG };
        return (
          <div key={r.module} className={`bg-white rounded-2xl border shadow-sm p-5 ${row.isMaintenance ? "border-red-300" : "border-slate-200"}`}>
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div>
                <div className="font-extrabold text-slate-900">{r.title}</div>
                <div className="text-xs text-slate-500">{r.sub}</div>
              </div>
              <label className="inline-flex items-center gap-2 cursor-pointer select-none">
                <span className={`text-xs font-extrabold ${row.isMaintenance ? "text-red-600" : "text-emerald-600"}`}>{row.isMaintenance ? "MAINTENANCE ON" : "LIVE"}</span>
                <input type="checkbox" className="w-5 h-5" checked={row.isMaintenance} disabled={savingKey === r.module}
                  onChange={(e) => setRows({ ...rows, [r.module]: { ...row, isMaintenance: e.target.checked } })} />
              </label>
            </div>
            <textarea className={`${input} mt-3 min-h-[70px] font-normal`} value={row.message} onChange={(e) => setRows({ ...rows, [r.module]: { ...row, message: e.target.value } })} />
            <div className="mt-3 flex justify-end">
              <button onClick={() => save(r.module)} disabled={savingKey === r.module} className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-bold inline-flex items-center gap-2">
                {savingKey === r.module ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save
              </button>
            </div>
          </div>
        );
      })}

      <p className="text-xs text-slate-500">
        Need zone-wise or service-wise rules (for example only Taxi pooling in one zone)? Use the{" "}
        <a className="text-blue-600 font-bold underline" href="/admin/food/maintenance-mode">advanced maintenance rules</a>.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------------------------
// Integrations & payments: read-only status of services shared by Food and Taxi.
// ---------------------------------------------------------------------------------------------
function Badge({ ok, yes = "Configured", no = "Not set" }) {
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${ok ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{ok ? yes : no}</span>;
}

function IntegrationsTab() {
  const [loading, setLoading] = useState(true);
  const [d, setD] = useState(null);
  const load = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getGlobalIntegrations();
      setD(res?.data?.data || null);
    } catch (e) {
      toast.error(errMsg(e, "Could not load integrations"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center justify-center gap-2 py-16 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading...</div>;
  if (!d) return null;
  const r = d.razorpay;

  return (
    <div className="space-y-5">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-center justify-between flex-wrap gap-2 mb-4">
          <div>
            <div className="font-extrabold text-slate-900">Razorpay (online payments)</div>
            <div className="text-xs text-slate-500">All customer money first lands in this account.</div>
          </div>
          {r.sameAccount === true && <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800">Food & Taxi use the SAME account</span>}
          {r.sameAccount === false && <span className="px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-red-100 text-red-800">DIFFERENT accounts</span>}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
            <div className="font-bold uppercase text-[10px] text-slate-500">Food</div>
            <div><Badge ok={r.food.configured} /></div>
            <div><b>Key:</b> {r.food.keyId || "-"} {r.food.mode && <span className="uppercase text-slate-500">({r.food.mode})</span>}</div>
            <div><b>Read from:</b> {r.food.source}</div>
          </div>
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
            <div className="font-bold uppercase text-[10px] text-slate-500">Taxi</div>
            <div><Badge ok={r.taxi.configured} yes="Razorpay active" no={r.taxi.activeGateway ? `Using ${r.taxi.activeGateway}` : "No gateway active"} /></div>
            <div><b>Key:</b> {r.taxi.keyId || "-"} {r.taxi.mode && <span className="uppercase text-slate-500">({r.taxi.mode})</span>}</div>
            <div><b>Read from:</b> {r.taxi.source || "-"}</div>
          </div>
        </div>
        <div className="mt-3 text-xs flex items-center gap-2"><b>Webhook secret:</b> <Badge ok={r.webhookSecretSet} /></div>
        {r.warnings.length > 0 && (
          <div className="mt-4 p-3 rounded-xl bg-amber-50 border border-amber-300 text-amber-900 text-xs font-semibold space-y-1">
            {r.warnings.map((w, i) => <div key={i} className="flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> <span>{w}</span></div>)}
          </div>
        )}
        <p className="text-[11px] text-slate-400 mt-3">Food keys are set in the server .env. Taxi has its own screen (Taxi &gt; Third-party Settings &gt; Payment Gateway Settings) for payment methods. Secrets are never shown here.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {d.services.map((s) => (
          <div key={s.key} className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-extrabold text-slate-900 text-sm">{s.label}</div>
                <div className="text-xs text-slate-500">{s.provider || "-"}</div>
              </div>
              <Badge ok={s.configured} />
            </div>
            <div className="text-xs text-slate-600 mt-3 space-y-0.5">
              <div><b>Used by:</b> {s.usedBy}</div>
              <div><b>Managed in:</b> {s.managedIn}</div>
            </div>
            {s.warning && <div className="mt-3 p-2.5 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold">{s.warning}</div>}
          </div>
        ))}
      </div>
      <p className="text-xs text-slate-500">These services are shared by Food and Taxi, so there is one setup for both. The old Taxi screens for SMS, Firebase, Maps and Mail saved values that nothing in the backend ever read, so they were removed.</p>
    </div>
  );
}

export default function GlobalSettings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialTab = TABS.some((t) => t.id === searchParams.get("tab")) ? searchParams.get("tab") : "brand";
  const [tab, setTab] = useState(initialTab);
  // keep the tab in step with the URL (sidebar links use ?tab=legal)
  useEffect(() => {
    const t = searchParams.get("tab");
    if (t && TABS.some((x) => x.id === t) && t !== tab) setTab(t);
  }, [searchParams]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [data, setData] = useState(null);
  const [brand, setBrand] = useState({});
  const [appearance, setAppearance] = useState({});
  const [applyLogoEverywhere, setApplyLogoEverywhere] = useState(true);

  // legal editor
  const [docKey, setDocKey] = useState("privacy");
  const [doc, setDoc] = useState({ title: "", content: "" });
  const [docLoading, setDocLoading] = useState(false);
  const [docSaving, setDocSaving] = useState(false);
  const [preview, setPreview] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getGlobalSettings();
      const d = res?.data?.data;
      setData(d);
      setBrand(d?.brand || {});
      setAppearance(d?.appearance || {});
    } catch (e) {
      toast.error(errMsg(e, "Could not load global settings"));
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { load(); }, []);

  const loadDoc = async (key) => {
    setDocLoading(true);
    setPreview(false);
    try {
      const res = await adminAPI.getGlobalLegalDocument(key);
      const d = res?.data?.data || {};
      setDoc({ title: d.title || "", content: legalHtmlToPlainText(d.content || "") });
    } catch (e) {
      toast.error(errMsg(e, "Could not load this document"));
    } finally {
      setDocLoading(false);
    }
  };
  useEffect(() => { if (tab === "legal") loadDoc(docKey); }, [tab, docKey]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminAPI.saveGlobalSettings({ brand, appearance, applyLogoEverywhere });
      const d = res?.data?.data;
      setData(d);
      setBrand(d?.brand || brand);
      setAppearance(d?.appearance || appearance);
      toast.success("Saved. Food and Taxi are both updated.");
    } catch (e) {
      toast.error(errMsg(e, "Could not save settings"));
    } finally {
      setSaving(false);
    }
  };

  const saveDoc = async () => {
    setDocSaving(true);
    try {
      await adminAPI.saveGlobalLegalDocument(docKey, { title: doc.title, content: plainTextToLegalHtml(doc.content) });
      toast.success("Document saved. It is live in all apps that show it.");
    } catch (e) {
      toast.error(errMsg(e, "Could not save the document"));
    } finally {
      setDocSaving(false);
    }
  };

  const groups = useMemo(() => {
    const m = new Map();
    (data?.legalDocuments || []).forEach((d) => {
      if (!m.has(d.audience)) m.set(d.audience, []);
      m.get(d.audience).push(d);
    });
    return [...m.entries()];
  }, [data]);

  const b = (k) => (e) => setBrand({ ...brand, [k]: e.target.value });
  const a = (k) => (e) => setAppearance({ ...appearance, [k]: e.target.value });
  const drift = data && Object.values(data.inSync || {}).some((v) => !v);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[60vh] gap-3 text-slate-500">
        <Loader2 className="w-6 h-6 animate-spin text-blue-600" /> Loading global settings...
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900">
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600"><Globe2 className="w-6 h-6" /></div>
          <div>
            <h1 className="text-2xl font-black tracking-tight">Global Settings</h1>
            <p className="text-xs font-semibold text-slate-500 mt-0.5">One place for Food + Taxi. Whatever you save here updates both apps together.</p>
          </div>
        </div>
        {drift && (
          <div className="mt-4 flex items-start gap-2 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-xs font-semibold">
            <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
            Food and Taxi currently have different values for some fields (name, phone or logo). Press <b className="mx-1">Save</b> once to make them identical.
          </div>
        )}
      </div>

      <div className="flex gap-2 mb-6 flex-wrap">
        {TABS.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.id}
              onClick={() => { setTab(t.id); setSearchParams(t.id === 'brand' ? {} : { tab: t.id }); }}
              className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold border transition-all ${tab === t.id ? "bg-blue-600 text-white border-blue-600 shadow" : "bg-white text-slate-700 border-slate-200 hover:bg-slate-100"}`}
            >
              <Icon className="w-4 h-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "brand" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <Field label="App / Company name *" hint="Shown in both apps, emails and the About page"><input className={input} value={brand.appName || ""} onChange={b("appName")} /></Field>
            <Field label="Support email"><input className={input} type="email" value={brand.email || ""} onChange={b("email")} /></Field>
            <Field label="Support phone" hint="Digits only">
              <div className="flex gap-2">
                <input className={`${input} w-24`} value={brand.phoneCountryCode || "+91"} onChange={b("phoneCountryCode")} />
                <input className={input} inputMode="numeric" value={brand.phone || ""} onChange={b("phone")} />
              </div>
            </Field>
            <Field label="Taxi booking phone" hint="Used on Taxi screens"><input className={input} inputMode="numeric" value={brand.bookingPhone || ""} onChange={b("bookingPhone")} /></Field>
            <Field label="Address"><input className={input} value={brand.address || ""} onChange={b("address")} /></Field>
            <div className="grid grid-cols-3 gap-3">
              <Field label="State"><input className={input} value={brand.state || ""} onChange={b("state")} /></Field>
              <Field label="Pincode"><input className={input} value={brand.pincode || ""} onChange={b("pincode")} /></Field>
              <Field label="Country"><input className={input} value={brand.region || ""} onChange={b("region")} /></Field>
            </div>
            <Field label="Footer text"><input className={input} value={brand.footerText || ""} onChange={b("footerText")} /></Field>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-100">
            <div>
              <ImageField label="Logo" value={brand.logo} onChange={(url) => setBrand({ ...brand, logo: url })} folder="business/logos" />
              <label className="mt-3 flex items-center gap-2 text-xs font-semibold text-slate-600">
                <input type="checkbox" checked={applyLogoEverywhere} onChange={(e) => setApplyLogoEverywhere(e.target.checked)} />
                Use this logo in every app (customer, restaurant, delivery, driver, admin)
              </label>
            </div>
            <ImageField label="Favicon" value={brand.favicon} onChange={(url) => setBrand({ ...brand, favicon: url })} folder="business/favicons" />
          </div>
        </div>
      )}

      {tab === "appearance" && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {[
              { k: "primaryColor", label: "Primary colour", hint: "Admin theme" },
              { k: "accentColor", label: "Accent colour", hint: "Landing / highlights" },
            ].map((c) => (
              <Field key={c.k} label={c.label} hint={c.hint}>
                <div className="flex gap-2">
                  <input type="color" className="h-11 w-14 rounded-lg border border-slate-300 bg-white p-1" value={appearance[c.k] || "#000000"} onChange={a(c.k)} />
                  <input className={input} value={appearance[c.k] || ""} onChange={a(c.k)} />
                </div>
              </Field>
            ))}
            <Field label="Currency symbol"><input className={input} maxLength={3} value={appearance.currencySymbol || ""} onChange={a("currencySymbol")} /></Field>
          </div>
          <p className="text-xs text-slate-500">Colours and currency are applied to the Taxi app. The Food app does not read colours from the server yet, so its screens keep their built-in theme.</p>
        </div>
      )}

      {tab === "brand" || tab === "appearance" ? (
        <div className="mt-6 flex justify-end">
          <button onClick={save} disabled={saving} className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-extrabold text-sm shadow-md inline-flex items-center gap-2">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            {saving ? "Saving..." : "Save for Food + Taxi"}
          </button>
        </div>
      ) : null}

      {tab === "maintenance" && <MaintenanceTab />}
      {tab === "integrations" && <IntegrationsTab />}

      {tab === "legal" && (
        <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-4 space-y-4 h-fit">
            {groups.map(([audience, docs]) => (
              <div key={audience}>
                <div className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider mb-1.5">{audience}</div>
                <div className="space-y-1">
                  {docs.map((d) => (
                    <button
                      key={d.key}
                      onClick={() => setDocKey(d.key)}
                      className={`w-full text-left px-3 py-2 rounded-lg text-sm font-semibold ${docKey === d.key ? "bg-blue-50 text-blue-700 border border-blue-200" : "text-slate-700 hover:bg-slate-50 border border-transparent"}`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>

          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            {docLoading ? (
              <div className="flex items-center gap-2 text-slate-500 text-sm py-10 justify-center"><Loader2 className="w-5 h-5 animate-spin" /> Loading...</div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-3 flex-wrap mb-4">
                  <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    One copy, shown in every app that uses it. Editing here changes it everywhere.
                  </div>
                  <button onClick={() => setPreview(!preview)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-xs font-bold text-slate-700">
                    {preview ? <><Pencil className="w-3.5 h-3.5" /> Edit</> : <><Eye className="w-3.5 h-3.5" /> Preview</>}
                  </button>
                </div>
                <Field label="Title"><input className={input} value={doc.title} onChange={(e) => setDoc({ ...doc, title: e.target.value })} /></Field>
                <div className="mt-4">
                  <label className={labelCls}>Content</label>
                  {preview ? (
                    <div className="min-h-[320px] p-4 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-800 whitespace-pre-wrap">{doc.content || "Nothing written yet."}</div>
                  ) : (
                    <textarea className={`${input} min-h-[320px] font-normal leading-relaxed`} value={doc.content} onChange={(e) => setDoc({ ...doc, content: e.target.value })} placeholder="Write the policy here. Use blank lines between paragraphs." />
                  )}
                </div>
                <div className="mt-5 flex justify-end">
                  <button onClick={saveDoc} disabled={docSaving} className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-extrabold text-sm shadow-md inline-flex items-center gap-2">
                    {docSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                    {docSaving ? "Saving..." : "Save document"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
