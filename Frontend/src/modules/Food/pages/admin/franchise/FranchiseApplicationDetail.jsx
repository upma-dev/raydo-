import React, { useState, useEffect, useCallback } from "react";
import { useParams, useNavigate, useSearchParams } from "react-router-dom";
import { adminAPI } from "@food/api";
import {
  ArrowLeft, Phone, Mail, MapPin, FileText, Loader2, ExternalLink, Save, CreditCard, Store, Car,
  CheckCircle2, Clock, ShieldCheck, UserCheck, Lock, MessageSquare, Send, Wallet, Building2,
  LayoutDashboard, KeyRound, ClipboardCheck, Percent, AlertTriangle, Copy, IndianRupee, Landmark, ScrollText, MapPinned,
} from "lucide-react";
import { toast } from "sonner";
import FranchiseControlCenter from "./FranchiseControlCenter";
import FranchiseSummary from "./FranchiseSummary";
import FranchiseFinancePanel from "./finance/FranchiseFinancePanel";
import FranchiseChargesPanel from "./finance/FranchiseChargesPanel";
import CommissionRuleEditor from "./finance/CommissionRuleEditor";
import FranchiseAuditPanel from "./finance/FranchiseAuditPanel";
import { Modal } from "./finance/ui";
import { InfoList, profileSections } from "./InfoGrid";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "under_review", label: "Under review", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "approved", label: "Approved", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "rejected", label: "Rejected", color: "bg-red-50 text-red-700 border-red-200" },
];

const FEE_STATUS = {
  pending: { label: "Pending payment", cls: "bg-amber-100 text-amber-800", note: "Portal locked until paid" },
  paid: { label: "Paid", cls: "bg-emerald-100 text-emerald-800", note: "Portal unlocked" },
  waived: { label: "Waived", cls: "bg-blue-100 text-blue-800", note: "Portal unlocked" },
  refund_due: { label: "Refund due", cls: "bg-orange-100 text-orange-800", note: "Rejected after payment - portal locked" },
  refunded: { label: "Refunded", cls: "bg-slate-200 text-slate-700", note: "Portal locked" },
};

const inr = (n) => `₹${Number(n || 0).toLocaleString("en-IN")}`;
const errMsg = (e, fb) => e?.response?.data?.message || e?.message || fb;
const inputCls = "w-full px-3 py-2.5 rounded-lg border border-slate-300 bg-white text-sm font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-slate-100";
const labelCls = "block text-[11px] font-bold text-slate-500 uppercase mb-1";

const modulesOf = (app) => {
  const set = new Set((app?.selectedModules?.length ? app.selectedModules : ["food"]).map((m) => (String(m).startsWith("taxi") ? "taxi" : "food")));
  return ["food", "taxi"].filter((m) => set.has(m));
};
const planKeyOf = (mods) => (mods.length === 2 ? "both" : mods[0]);
const planLabel = (mods) => (mods.length === 2 ? "Food + Taxi" : mods[0] === "taxi" ? "Taxi" : "Food");

function Card({ title, icon: Icon, right, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm">
      {(title || right) && (
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-slate-100">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
            {Icon && <Icon className="w-4 h-4 text-blue-600" />} {title}
          </h3>
          {right}
        </div>
      )}
      <div className="p-5">{children}</div>
    </div>
  );
}

const Empty = ({ children }) => <div className="py-8 text-center text-xs font-semibold text-slate-400">{children}</div>;

export default function FranchiseApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [tab, setTab] = useState(null);

  // review
  const [status, setStatus] = useState("pending");
  const [adminNote, setAdminNote] = useState("");
  const [savingStatus, setSavingStatus] = useState(false);

  // access
  const [foodZones, setFoodZones] = useState([]);
  const [taxiZones, setTaxiZones] = useState([]);
  const [foodZoneId, setFoodZoneId] = useState("");
  const [taxiZoneId, setTaxiZoneId] = useState("");
  const [password, setPassword] = useState("");
  const [issuing, setIssuing] = useState(false);
  const [savingZones, setSavingZones] = useState(false);
  const [creds, setCreds] = useState(null);

  // plan & fees
  const [searchParams] = useSearchParams();
  const [territories, setTerritories] = useState([]);
  const [newTerritoryId, setNewTerritoryId] = useState("");
  const [territoryReason, setTerritoryReason] = useState("");
  const [savingTerritory, setSavingTerritory] = useState(false);
  const [payoutDialog, setPayoutDialog] = useState(null); // { requestId, amount }
  const [payoutRef, setPayoutRef] = useState("");
  const [payoutNote, setPayoutNote] = useState("");
  const [payoutBusy, setPayoutBusy] = useState(false);
  const [payoutCycle, setPayoutCycle] = useState("weekly");
  const [minPayout, setMinPayout] = useState(0);
  const [savingTerms, setSavingTerms] = useState(false);

  // support
  const [reply, setReply] = useState({});
  const [replyingId, setReplyingId] = useState(null);

  // partner requests (zone change / deactivate)
  const [reqNote, setReqNote] = useState({});
  const [reqBusy, setReqBusy] = useState("");

  const mods = modulesOf(app);
  const hasFood = mods.includes("food");
  const hasTaxi = mods.includes("taxi");
  const approved = app?.status === "approved";

  const hydrate = (data) => {
    setApp(data);
    setStatus(data.status || "pending");
    setAdminNote(data.adminNote || "");
    setFoodZoneId(data.zoneId?._id || data.zoneId || "");
    setTaxiZoneId(data.taxiZoneId?._id || data.taxiZoneId || "");
    setPayoutCycle(data.payoutCycle || "weekly");
    setMinPayout(Number(data.minPayoutThreshold) || 0);
  };

  const load = useCallback(async () => {
    try {
      const res = await adminAPI.getFranchiseApplicationById(id);
      const data = res?.data?.data;
      if (!data) throw new Error("Application not found");
      hydrate(data);
      setLoadError("");
      return data;
    } catch (e) {
      setLoadError(errMsg(e, "Could not load this application"));
      return null;
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    load().then((data) => {
      if (data) setTab((t) => t || searchParams.get("tab") || (data.status === "approved" ? "summary" : "review"));
    });
  }, [load]);

  useEffect(() => {
    adminAPI.getZones({ limit: 500 })
      .then((res) => setFoodZones(res?.data?.data?.zones || res?.data?.data || []))
      .catch(() => {});
    adminAPI.getFranchiseTaxiZones(id)
      .then((res) => setTaxiZones(res?.data?.data || []))
      .catch(() => {});
    adminAPI.getFranchiseTerritories()
      .then((res) => setTerritories(res?.data?.data || []))
      .catch(() => {});
  }, [id]);

  const saveStatus = async () => {
    setSavingStatus(true);
    try {
      await adminAPI.updateFranchiseApplicationStatus(id, { status, adminNote });
      toast.success("Application status updated");
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to update status"));
    } finally {
      setSavingStatus(false);
    }
  };

  // Fees, deposit and commission have their own audited tabs; this only saves payout terms
  const termsBody = (extra = {}) => ({
    payoutCycle,
    minPayoutThreshold: String(minPayout),
    ...extra,
  });

  const saveTerms = async (extra = {}, okMsg = "Payout terms saved") => {
    setSavingTerms(true);
    try {
      await adminAPI.updateFranchiseCommission(id, termsBody(extra));
      toast.success(okMsg);
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Failed to save"));
    } finally {
      setSavingTerms(false);
    }
  };

  const changeTerritory = async () => {
    if (!newTerritoryId || territoryReason.trim().length < 3) { toast.error("Choose the zone and enter a reason"); return; }
    if (!window.confirm("Move this franchise to the new zone? New orders/rides of the new zone go to this franchise and the new zone's commission applies from now on. Past transactions are not changed.")) return;
    setSavingTerritory(true);
    try {
      await adminAPI.changeFranchiseTerritory(id, { territoryId: newTerritoryId, reason: territoryReason });
      toast.success("Zone changed");
      setNewTerritoryId("");
      setTerritoryReason("");
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Could not change the zone"));
    } finally {
      setSavingTerritory(false);
    }
  };

  const zonesReady = () => {
    if (hasFood && !foodZoneId) { toast.error("Select the Food zone for this franchise"); return false; }
    if (hasTaxi && !taxiZoneId) { toast.error("Select the Taxi zone for this franchise"); return false; }
    return true;
  };

  const saveZones = async () => {
    if (!zonesReady()) return;
    setSavingZones(true);
    try {
      await adminAPI.updateFranchiseCommission(id, {
        ...(hasFood ? { zoneId: foodZoneId } : {}),
        ...(hasTaxi ? { taxiZoneId } : {}),
      });
      toast.success("Zones saved");
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Could not save zones"));
    } finally {
      setSavingZones(false);
    }
  };

  const approveAndIssue = async () => {
    if (!zonesReady()) return;
    setIssuing(true);
    try {
      await adminAPI.updateFranchiseApplicationStatus(id, { status: "approved", adminNote });
      await adminAPI.updateFranchiseCommission(id, termsBody());
      const res = await adminAPI.syncFranchiseSubAdmin(id, {
        password: password || undefined,
        ...(hasFood ? { zoneId: foodZoneId } : {}),
        ...(hasTaxi ? { taxiZoneId } : {}),
      });
      setCreds(res?.data?.data?.credentialsInfo || null);
      toast.success("Franchise approved and login issued");
      const data = await load();
      if (data) setTab("access");
    } catch (e) {
      toast.error(errMsg(e, "Could not approve and issue the login"));
    } finally {
      setIssuing(false);
    }
  };

  const copyCreds = () => {
    const email = creds?.email || app.email;
    const pass = creds?.password || "(existing password - unchanged)";
    const text = `Raydo Franchise login\nName: ${app.applicantName}\nApplication: ${app.applicationId}\nPlan: ${planLabel(mods)}\nLogin: ${window.location.origin}/food/franchise/login\nEmail: ${email}\nPassword: ${pass}`;
    navigator.clipboard.writeText(text);
    toast.success("Login details copied");
  };

  const sendReply = async (messageId) => {
    const text = (reply[messageId] || "").trim();
    if (!text) { toast.error("Type a reply first"); return; }
    setReplyingId(messageId);
    try {
      const res = await adminAPI.replyFranchiseSupportMessage(id, messageId, { reply: text, status: "replied" });
      if (res?.data?.data) { hydrate(res.data.data); setReply((r) => ({ ...r, [messageId]: "" })); toast.success("Reply sent"); }
    } catch (e) {
      toast.error(errMsg(e, "Failed to send reply"));
    } finally {
      setReplyingId(null);
    }
  };

  const decideRequest = async (requestId, decision) => {
    const label = decision === "approve" ? "Approve" : "Reject";
    if (!window.confirm(`${label} this request?`)) return;
    setReqBusy(requestId);
    try {
      await adminAPI.decideFranchiseRequest(id, requestId, { decision, note: reqNote[requestId] || "" });
      toast.success(decision === "approve" ? "Request approved" : "Request rejected");
      await load();
    } catch (e) {
      toast.error(errMsg(e, "Could not update the request"));
    } finally {
      setReqBusy("");
    }
  };

  const payoutAction = async (requestId, nextStatus, extra = {}) => {
    setPayoutBusy(true);
    try {
      const res = await adminAPI.updateFranchisePayoutStatus(id, requestId, { status: nextStatus, ...extra });
      if (res?.data?.data) { hydrate(res.data.data); toast.success(nextStatus === "approved" ? "Payout marked as paid" : "Payout rejected"); }
      setPayoutDialog(null);
      setPayoutRef("");
      setPayoutNote("");
    } catch (e) {
      toast.error(errMsg(e, "Could not update the payout"));
    } finally {
      setPayoutBusy(false);
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh] gap-3 text-slate-500"><Loader2 className="w-6 h-6 animate-spin text-blue-600" /> Loading application...</div>;
  }
  if (!app) {
    return (
      <div className="p-6">
        <button onClick={() => navigate("/admin/food/franchise-management")} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-sm font-semibold mb-4"><ArrowLeft className="w-4 h-4" /> Back</button>
        <div className="text-center p-16 text-slate-500 font-semibold">{loadError || "Application not found"}</div>
      </div>
    );
  }

  const bank = app.paymentAccountInfo || {};
  const hasBank = Boolean(bank.accountNumber || bank.upiId);
  const pendingPayouts = (app.payoutRequests || []).filter((p) => p.status === "pending").length;
  const pendingRequests = (app.changeRequests || []).filter((r) => r.status === "pending").length;
  const unreadSupport = (app.supportMessages || []).filter((m) => m.status !== "replied" && m.status !== "resolved").length;
  const feeInfo = FEE_STATUS[app.franchiseFeeStatus] || FEE_STATUS.pending;
  const isImage = (url) => url && /\.(jpg|jpeg|png|gif|webp)$/i.test(url);

  const TABS = [
    ...(approved ? [
      { id: "summary", label: "Summary", icon: ClipboardCheck },
      { id: "overview", label: "Restaurants & orders", icon: LayoutDashboard },
      { id: "finance", label: "Earnings & commission", icon: IndianRupee },
    ] : []),
    { id: "fees", label: "Fees & deposit", icon: Landmark, badge: app.franchiseFeeStatus === "pending" ? 1 : 0 },
    { id: "commission", label: "Commission", icon: Percent },
    { id: "review", label: "Application", icon: ClipboardCheck },
    { id: "access", label: "Zones & login", icon: KeyRound },
    { id: "plan", label: "Zone & payout terms", icon: MapPinned },
    { id: "payouts", label: "Bank & payouts", icon: Wallet, badge: pendingPayouts },
    { id: "requests", label: "Partner requests", icon: ClipboardCheck, badge: pendingRequests },
    { id: "support", label: "Support", icon: MessageSquare, badge: unreadSupport },
    { id: "audit", label: "Audit", icon: ScrollText },
  ];
  const currentTerritory = territories.find((t) => String(t.id) === String(app.territoryId?._id || app.territoryId || ""));
  const activeTab = TABS.some((t) => t.id === tab) ? tab : TABS[0].id;

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 space-y-5 max-w-[1400px]">
      <button onClick={() => navigate("/admin/food/franchise-management")} className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50">
        <ArrowLeft className="w-4 h-4 text-slate-500" /> Back to franchise list
      </button>

      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-14 h-14 rounded-2xl bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
              <Building2 className="w-7 h-7 text-blue-600" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl font-black tracking-tight truncate">{app.applicantName}</h1>
              <div className="text-xs font-bold text-blue-600 mt-0.5">{app.applicationId}{app.companyName ? ` · ${app.companyName}` : ""}</div>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {mods.map((m) => (
              <span key={m} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-extrabold border ${m === "food" ? "bg-amber-50 text-amber-800 border-amber-200" : "bg-blue-50 text-blue-800 border-blue-200"}`}>
                {m === "food" ? <Store className="w-3.5 h-3.5" /> : <Car className="w-3.5 h-3.5" />} {m === "food" ? "Food" : "Taxi"}
              </span>
            ))}
            <span className={`px-3 py-1.5 rounded-lg text-xs font-extrabold border ${(STATUS_OPTIONS.find((s) => s.value === app.status) || STATUS_OPTIONS[0]).color}`}>
              {(STATUS_OPTIONS.find((s) => s.value === app.status) || STATUS_OPTIONS[0]).label}
            </span>
            <span className={`px-3 py-1.5 rounded-lg text-xs font-extrabold ${feeInfo.cls}`}>Fee: {feeInfo.label}</span>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-slate-100 text-xs text-slate-600 font-semibold">
          <div className="flex items-center gap-2"><Phone className="w-4 h-4 text-blue-600" />{app.phone}</div>
          <div className="flex items-center gap-2 min-w-0"><Mail className="w-4 h-4 text-blue-600 shrink-0" /><span className="truncate">{app.email || "-"}</span></div>
          <div className="flex items-center gap-2"><MapPin className="w-4 h-4 text-blue-600" />{[app.city, app.state].filter(Boolean).join(", ") || "-"}</div>
          <div className="flex items-center gap-2"><Clock className="w-4 h-4 text-blue-600" />Applied {new Date(app.createdAt).toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" })}</div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1.5 overflow-x-auto pb-1 sticky top-0 z-20 bg-slate-50/95 backdrop-blur py-2 -my-2">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = activeTab === t.id;
          return (
            <button key={t.id} onClick={() => setTab(t.id)} className={`inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-xs font-extrabold whitespace-nowrap shrink-0 transition-colors ${active ? "bg-blue-600 text-white shadow" : "bg-white border border-slate-200 text-slate-700 hover:bg-slate-100"}`}>
              <Icon className="w-4 h-4" /> {t.label}
              {t.badge > 0 && <span className={`min-w-[18px] h-[18px] px-1 rounded-full text-[10px] flex items-center justify-center ${active ? "bg-white text-blue-700" : "bg-red-500 text-white"}`}>{t.badge}</span>}
            </button>
          );
        })}
      </div>

      {/* SUMMARY (approved franchises): fee, deposit, earnings, restaurants, commission, login in one place */}
      {activeTab === "summary" && approved && (
        <FranchiseSummary app={app} id={id} mods={mods} onOpenTab={setTab} onChanged={load} canShareLogin={Boolean(app.subAdminId)} />
      )}

      {/* LIVE OVERVIEW (approved franchises) */}
      {activeTab === "overview" && approved && (
        <FranchiseControlCenter id={id} onChanged={load} onRemoved={() => navigate("/admin/food/franchise-management")} />
      )}

      {/* EARNINGS & COMMISSION */}
      {activeTab === "finance" && approved && (
        <FranchiseFinancePanel
          load={(params) => adminAPI.getFranchiseFinance(id, params)}
          loadEntries={(params) => adminAPI.getFranchiseFinanceEntries(id, params)}
          onPayoutsClick={() => setTab("payouts")}
        />
      )}

      {/* FEES & DEPOSIT */}
      {activeTab === "fees" && (
        <FranchiseChargesPanel franchiseId={id} accountStatus={app.accountStatus || "active"} archived={Boolean(app.archived)} onChanged={load} />
      )}

      {/* COMMISSION OVERRIDE */}
      {activeTab === "commission" && (
        <CommissionRuleEditor scope="franchise" scopeId={id} services={mods} />
      )}

      {/* AUDIT */}
      {activeTab === "audit" && <FranchiseAuditPanel franchiseId={id} />}

      {/* APPLICATION REVIEW */}
      {activeTab === "review" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <div className="lg:col-span-2 space-y-5">
            {(() => {
              const p = profileSections(app);
              return (
                <>
                  <Card title="Contact" icon={Phone}><InfoList items={p.contact} /></Card>
                  <Card title="Location" icon={MapPin}><InfoList items={p.location} /></Card>
                  <Card title="Business information" icon={Building2}><InfoList items={p.business} /></Card>
                </>
              );
            })()}

            <Card title={`KYC documents (${app.documents?.length || 0})`} icon={FileText}>
              {app.documents?.length ? (
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {app.documents.map((doc) => (
                    <a key={doc.key} href={doc.url} target="_blank" rel="noopener noreferrer" className="block rounded-xl overflow-hidden border border-slate-200 bg-slate-50 hover:border-blue-400 transition-colors">
                      {isImage(doc.url) ? <img src={doc.url} alt={doc.label} className="w-full h-24 object-cover" /> : <div className="h-24 flex items-center justify-center bg-slate-100"><FileText className="w-8 h-8 text-blue-600" /></div>}
                      <div className="p-2 flex items-center justify-between text-xs"><span className="font-semibold text-slate-700 truncate">{doc.label}</span><ExternalLink className="w-3 h-3 text-slate-400 shrink-0" /></div>
                    </a>
                  ))}
                </div>
              ) : <Empty>No documents uploaded.</Empty>}
            </Card>
          </div>

          <Card title="Review decision" icon={ClipboardCheck}>
            <div className="space-y-2 mb-4">
              {STATUS_OPTIONS.map((opt) => (
                <button key={opt.value} onClick={() => setStatus(opt.value)} className={`w-full p-2.5 rounded-lg border text-left text-xs font-bold flex items-center justify-between ${status === opt.value ? `${opt.color} ring-2 ring-blue-500/20` : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}`}>
                  <span>{opt.label}</span>{status === opt.value && <CheckCircle2 className="w-4 h-4" />}
                </button>
              ))}
            </div>
            {status === "rejected" && app.franchiseFeeStatus === "paid" && (
              <div className="mb-3 p-3 rounded-lg bg-orange-50 border border-orange-200 text-[11px] font-semibold text-orange-800 flex gap-2"><AlertTriangle className="w-4 h-4 shrink-0" /> The applicant already paid. Rejecting locks the login and marks the fee as "refund due".</div>
            )}
            <label className={labelCls}>Note for the applicant</label>
            <textarea value={adminNote} onChange={(e) => setAdminNote(e.target.value)} rows={3} placeholder="Optional message..." className={`${inputCls} mb-3 font-medium`} />
            <button onClick={saveStatus} disabled={savingStatus} className="w-full py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs inline-flex items-center justify-center gap-2">
              {savingStatus ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save status
            </button>
            {!approved && <p className="text-[11px] text-slate-400 mt-2">To approve AND create the login in one step, use the "Zones & login" tab.</p>}
          </Card>
        </div>
      )}

      {/* ZONES & LOGIN */}
      {activeTab === "access" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Card title="Territory" icon={MapPin}>
            <div className="space-y-4">
              {hasFood && (
                <div>
                  <label className={labelCls}>Food zone *</label>
                  <select value={foodZoneId} onChange={(e) => setFoodZoneId(e.target.value)} className={inputCls}>
                    <option value="">-- Select food zone --</option>
                    {foodZones.map((z) => <option key={z._id} value={z._id}>{z.name || z.zoneName}{z.serviceLocation ? ` (${z.serviceLocation})` : ""}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">Restaurants and orders in this zone are credited to this franchise.</p>
                </div>
              )}
              {hasTaxi && (
                <div>
                  <label className={labelCls}>Taxi zone *</label>
                  <select value={taxiZoneId} onChange={(e) => setTaxiZoneId(e.target.value)} className={inputCls}>
                    <option value="">-- Select taxi zone --</option>
                    {taxiZones.map((z) => <option key={z.id} value={z.id} disabled={Boolean(z.takenBy)}>{z.name}{z.takenBy ? ` - taken by ${z.takenBy}` : ""}</option>)}
                  </select>
                  <p className="text-[11px] text-slate-400 mt-1">Drivers in this zone and their completed rides earn commission for this franchise. One zone can belong to only one franchise.</p>
                  {!taxiZoneId && <p className="text-[11px] font-bold text-amber-700 mt-1">Without a taxi zone this franchise cannot see or earn from any taxi rides.</p>}
                </div>
              )}
              {approved && (
                <button onClick={saveZones} disabled={savingZones} className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-bold text-xs inline-flex items-center gap-2">
                  {savingZones ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save zones
                </button>
              )}
            </div>
          </Card>

          <Card title="Login access" icon={ShieldCheck}>
            <div className="mb-4 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div className="font-bold text-slate-700 uppercase text-[10px]">This franchise can use</div>
              <div className="flex gap-2 flex-wrap">
                {mods.map((m) => <span key={m} className="px-2.5 py-1 rounded-md bg-white border border-slate-200 font-bold">{m === "food" ? "Food portal" : "Taxi portal"}</span>)}
                {(hasFood ? ["taxi"] : ["food"]).filter((x) => !mods.includes(x)).map((m) => (
                  <span key={m} className="px-2.5 py-1 rounded-md bg-slate-100 text-slate-400 font-bold line-through">{m === "food" ? "Food portal" : "Taxi portal"}</span>
                ))}
              </div>
              <p className="text-[11px] text-slate-400">Access always follows the plan the franchise bought. It cannot open the other module.</p>
            </div>

            {app.subAdminId ? (
              <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs mb-4">
                <div className="font-bold text-emerald-800 flex items-center gap-1.5"><UserCheck className="w-4 h-4" /> Login account exists</div>
                <div className="text-slate-600 mt-1">Email: <b className="text-slate-900">{app.subAdminId.email || app.email}</b></div>
                <div className="text-slate-600">Status: <b className={app.subAdminId.active === false ? "text-red-600" : "text-emerald-700"}>{app.subAdminId.active === false ? "Locked" : "Can log in"}</b></div>
              </div>
            ) : (
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs mb-4 flex gap-2">
                <Lock className="w-4 h-4 text-amber-600 shrink-0" /> <span><b className="text-amber-800">No login yet.</b> <span className="text-slate-600">Choose the zone(s), then approve below.</span></span>
              </div>
            )}

            <label className={labelCls}>Password (optional)</label>
            <input value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Leave blank to auto-generate" className={`${inputCls} font-mono mb-3`} />
            <button onClick={approveAndIssue} disabled={issuing} className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-extrabold text-sm inline-flex items-center justify-center gap-2">
              {issuing ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />} {approved ? "Update login & access" : "Approve & issue login"}
            </button>
            {app.franchiseFeeStatus === "pending" && <p className="text-[11px] text-amber-700 font-semibold mt-2">The fee is still pending, so the login stays locked until the fee is paid or waived (Plan & fees tab).</p>}

            {creds && (
              <div className="mt-4 p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs space-y-1.5">
                <div className="flex items-center justify-between font-bold text-blue-900">
                  <span>Login details (shown once)</span>
                  <button onClick={copyCreds} className="px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] inline-flex items-center gap-1"><Copy className="w-3 h-3" /> Copy</button>
                </div>
                <div className="font-mono text-slate-700">Email: {creds.email || app.email}</div>
                <div className="font-mono text-slate-700">Password: {creds.password || "(unchanged)"}</div>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* ZONE & PAYOUT TERMS */}
      {activeTab === "plan" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
          <Card title="Pricing zone" icon={MapPinned}>
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs mb-4 space-y-1">
              <div>Current zone: <b>{currentTerritory ? currentTerritory.name : "Not set (created before zone pricing)"}</b></div>
              {currentTerritory && <div className="text-slate-500">Zone price: joining fee {inr(currentTerritory.joiningFee)} · deposit {inr(currentTerritory.securityDeposit)}</div>}
              <div className="text-slate-500">This franchise's own amounts are in "Fees & deposit"; its commission in "Commission".</div>
            </div>
            <label className={labelCls}>Move to zone</label>
            <select className={`${inputCls} mb-3`} value={newTerritoryId} onChange={(e) => setNewTerritoryId(e.target.value)}>
              <option value="">-- Select zone --</option>
              {territories.filter((t) => t.isActive && String(t.id) !== String(currentTerritory?.id || "")).map((t) => (
                <option key={t.id} value={t.id} disabled={(hasFood && !t.foodZoneId) || (hasTaxi && !t.taxiZoneId)}>
                  {t.name}{(hasFood && !t.foodZoneId) || (hasTaxi && !t.taxiZoneId) ? " (missing zone for this franchise's services)" : ""}
                </option>
              ))}
            </select>
            <label className={labelCls}>Reason</label>
            <input className={`${inputCls} mb-3`} value={territoryReason} onChange={(e) => setTerritoryReason(e.target.value)} placeholder="Why is the zone changing?" />
            <button onClick={changeTerritory} disabled={savingTerritory} className="px-4 py-2.5 rounded-lg bg-slate-800 hover:bg-slate-900 disabled:opacity-60 text-white font-bold text-xs inline-flex items-center gap-2">
              {savingTerritory ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Change zone
            </button>
            <p className="text-[11px] text-slate-400 mt-2">Only future orders and rides are affected. Amounts already owed or paid stay as they are.</p>
          </Card>

          <Card title="Payout terms" icon={Wallet}>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className={labelCls}>Payout cycle</label>
                <select value={payoutCycle} onChange={(e) => setPayoutCycle(e.target.value)} className={inputCls}>
                  <option value="weekly">Weekly</option><option value="biweekly">Every 2 weeks</option><option value="monthly">Monthly</option>
                </select>
              </div>
              <div>
                <label className={labelCls}>Minimum payout (₹)</label>
                <input type="number" min={0} value={minPayout} onChange={(e) => setMinPayout(Number(e.target.value))} className={inputCls} />
              </div>
            </div>
            <button onClick={() => saveTerms()} disabled={savingTerms} className="mt-4 px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs inline-flex items-center gap-2">
              {savingTerms ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save payout terms
            </button>
          </Card>
        </div>
      )}

      {/* BANK & PAYOUTS */}
      {activeTab === "payouts" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 items-start">
          <Card title="Settlement account" icon={CreditCard} right={<span className={`px-2.5 py-1 rounded-full text-[10px] font-extrabold ${hasBank ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}`}>{hasBank ? "Provided by partner" : "Not provided yet"}</span>}>
            <InfoList cols={1} items={[
              ["Account holder", bank.accountHolderName, { copy: true }],
              ["Bank", bank.bankName],
              ["Account no.", bank.accountNumber, { copy: true, mono: true }],
              ["IFSC", bank.ifscCode, { copy: true, mono: true }],
              ["UPI ID", bank.upiId, { copy: true, mono: true }],
            ]} />
            <div className="mt-3 p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">Wallet balance: <b className="text-emerald-700">{inr(app.walletBalance)}</b></div>
          </Card>

          <div className="lg:col-span-2">
            <Card title={`Payout requests (${app.payoutRequests?.length || 0})`} icon={Wallet}>
              {app.payoutRequests?.length ? (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead><tr className="bg-slate-50 text-slate-500 font-bold uppercase text-[10px]"><th className="py-2.5 px-3">Request</th><th className="py-2.5 px-3">Amount</th><th className="py-2.5 px-3">Method</th><th className="py-2.5 px-3">Status</th></tr></thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {[...app.payoutRequests].sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)).map((p) => (
                        <tr key={p.requestId}>
                          <td className="py-2.5 px-3"><div className="font-bold text-blue-600">#{String(p.requestId).slice(-8)}</div><div className="text-[10px] text-slate-400">{new Date(p.requestedAt).toLocaleDateString("en-IN")}</div></td>
                          <td className="py-2.5 px-3 font-black text-emerald-700 text-sm">{inr(p.amount)}</td>
                          <td className="py-2.5 px-3"><div className="font-bold uppercase">{p.payoutMethod || "bank"}</div><div className="text-[10px] text-slate-500 font-mono">{p.accountDetails?.upiId || p.accountDetails?.accountNumber || ""}</div></td>
                          <td className="py-2.5 px-3">
                            {p.status === "pending" ? (
                              <div className="flex gap-1.5">
                                <button onClick={() => setPayoutDialog({ requestId: p.requestId, amount: p.amount, status: "approved" })} className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-[10px]">Mark paid</button>
                                <button onClick={() => setPayoutDialog({ requestId: p.requestId, amount: p.amount, status: "rejected" })} className="px-2.5 py-1 rounded bg-white border border-slate-300 text-red-600 hover:bg-red-50 font-bold text-[10px]">Reject</button>
                              </div>
                            ) : (
                              <div>
                                <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${p.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{p.status === "approved" ? "Paid" : "Rejected"}</span>
                                {p.transactionId && <div className="text-[10px] text-slate-500 font-mono mt-0.5">Ref {p.transactionId}</div>}
                              </div>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <Empty>No payout requests yet.</Empty>}
            </Card>
          </div>
        </div>
      )}

      {/* PARTNER REQUESTS */}
      {activeTab === "requests" && (
        <Card title={`Requests from this partner (${app.changeRequests?.length || 0})`} icon={ClipboardCheck}>
          {app.changeRequests?.length ? (
            <div className="space-y-3">
              {[...app.changeRequests].sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt)).map((r) => {
                const target = territories.find((t) => String(t.id) === String(r.requestedTerritoryId));
                return (
                  <div key={r.requestId} className="p-4 rounded-xl border border-slate-200 bg-slate-50 text-xs space-y-2">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="font-extrabold text-sm">{r.type === "zone_change" ? `Zone change${target ? ` to ${target.name}` : ""}` : "Deactivate account"}</div>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${r.status === "pending" ? "bg-amber-100 text-amber-800" : r.status === "approved" ? "bg-emerald-100 text-emerald-800" : "bg-red-100 text-red-800"}`}>{r.status}</span>
                    </div>
                    <div className="p-3 bg-white rounded-lg border border-slate-200 font-medium">{r.reason}</div>
                    <div className="text-[10px] text-slate-400">{new Date(r.requestedAt).toLocaleString("en-IN")}{r.decidedAt ? ` · decided ${new Date(r.decidedAt).toLocaleString("en-IN")}` : ""}</div>
                    {r.status === "pending" ? (
                      <div className="space-y-2">
                        {r.type === "deactivate" && <p className="text-[11px] font-semibold text-red-700">Approving locks this franchise's login and sends a notification to all its restaurants.</p>}
                        {r.type === "zone_change" && <p className="text-[11px] font-semibold text-slate-500">Approving moves the franchise now. Only future orders and rides use the new zone.</p>}
                        <input className={inputCls} placeholder="Note for the partner (optional)" value={reqNote[r.requestId] || ""} onChange={(e) => setReqNote({ ...reqNote, [r.requestId]: e.target.value })} />
                        <div className="flex gap-2">
                          <button disabled={reqBusy === r.requestId} onClick={() => decideRequest(r.requestId, "approve")} className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-60 text-white font-bold text-xs">Approve</button>
                          <button disabled={reqBusy === r.requestId} onClick={() => decideRequest(r.requestId, "reject")} className="px-4 py-2 rounded-lg bg-white border border-slate-300 text-red-600 hover:bg-red-50 disabled:opacity-60 font-bold text-xs">Reject</button>
                        </div>
                      </div>
                    ) : r.adminNote ? <div className="text-slate-700"><b>Your note:</b> {r.adminNote}</div> : null}
                  </div>
                );
              })}
            </div>
          ) : <Empty>This partner has not sent any request.</Empty>}
        </Card>
      )}

      {/* SUPPORT */}
      {activeTab === "support" && (
        <Card title={`Partner messages (${app.supportMessages?.length || 0})`} icon={MessageSquare}>
          {app.supportMessages?.length ? (
            <div className="space-y-4">
              {app.supportMessages.map((m, i) => (
                <div key={m.messageId || i} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3 text-xs">
                  <div className="flex items-start justify-between gap-2 flex-wrap">
                    <div>
                      <div className="font-extrabold text-sm">{m.subject}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">{new Date(m.createdAt).toLocaleString("en-IN")} · {String(m.priority || "normal").toUpperCase()}</div>
                    </div>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${m.status === "replied" ? "bg-emerald-100 text-emerald-800" : m.status === "resolved" ? "bg-blue-100 text-blue-800" : "bg-amber-100 text-amber-800"}`}>{m.status === "replied" ? "Replied" : m.status === "resolved" ? "Resolved" : "Needs reply"}</span>
                  </div>
                  <div className="p-3 bg-white rounded-lg border border-slate-200 font-medium text-slate-800">{m.message}</div>
                  {m.reply && <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg"><div className="font-bold text-blue-900 mb-1">Your reply</div><p className="text-slate-800 font-semibold">{m.reply}</p></div>}
                  <div className="flex gap-2">
                    <input value={reply[m.messageId] || ""} onChange={(e) => setReply({ ...reply, [m.messageId]: e.target.value })} placeholder="Type a reply..." className={inputCls} />
                    <button onClick={() => sendReply(m.messageId)} disabled={replyingId === m.messageId} className="px-4 rounded-lg bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-bold text-xs inline-flex items-center gap-1.5 shrink-0">
                      {replyingId === m.messageId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />} {m.reply ? "Update" : "Send"}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : <Empty>No messages from this partner yet.</Empty>}
        </Card>
      )}

      {payoutDialog && (
        <Modal open title={payoutDialog.status === "approved" ? `Mark payout of ${inr(payoutDialog.amount)} as paid` : "Reject payout request"} onClose={() => setPayoutDialog(null)} footer={<>
          <button onClick={() => setPayoutDialog(null)} className="px-4 py-2.5 rounded-lg bg-white border border-slate-300 text-xs font-bold">Cancel</button>
          <button
            disabled={payoutBusy || (payoutDialog.status === "approved" && payoutRef.trim().length < 4)}
            onClick={() => payoutAction(payoutDialog.requestId, payoutDialog.status, payoutDialog.status === "approved" ? { transactionId: payoutRef.trim(), adminNote: payoutNote } : { adminNote: payoutNote })}
            className={`px-4 py-2.5 rounded-lg text-white text-xs font-bold inline-flex items-center gap-2 disabled:opacity-60 ${payoutDialog.status === "approved" ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}>
            {payoutBusy && <Loader2 className="w-4 h-4 animate-spin" />}{payoutDialog.status === "approved" ? "Confirm paid" : "Reject"}
          </button>
        </>}>
          {payoutDialog.status === "approved" ? (
            <>
              <p className="text-xs text-slate-500">Send the money to the partner's account first, then record the bank / UPI reference here. The wallet is debited once; it can never go negative.</p>
              <label className={labelCls}>Transfer reference (UTR / txn id)</label>
              <input className={`${inputCls} font-mono`} value={payoutRef} onChange={(e) => setPayoutRef(e.target.value)} />
            </>
          ) : <p className="text-xs text-slate-500">The reserved amount goes back to the partner's available balance.</p>}
          <label className={labelCls}>Note (optional)</label>
          <input className={inputCls} value={payoutNote} onChange={(e) => setPayoutNote(e.target.value)} />
        </Modal>
      )}
    </div>
  );
}
