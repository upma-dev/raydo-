import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { adminAPI } from "@food/api";
import {
  Building2, CheckCircle2, Clock, XCircle, AlertCircle, MapPin, Phone, Mail, Calendar,
  ChevronRight, Loader2, RefreshCw, Settings, Plus, X, MessageSquare, DollarSign, Send,
  ShieldCheck, Zap, Percent, LayoutDashboard, ArrowUpRight
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@food/components/ui/dialog";
import { toast } from "sonner";

const STATUS_CONFIG = {
  pending: { label: 'Pending Approval', color: 'text-amber-700 bg-amber-50 border-amber-200', icon: Clock },
  under_review: { label: 'Under Review', color: 'text-blue-700 bg-blue-50 border-blue-200', icon: AlertCircle },
  approved: { label: 'Approved & Active', color: 'text-emerald-700 bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: 'text-red-700 bg-red-50 border-red-200', icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${cfg.color}`}>
      <Icon className="w-3.5 h-3.5" /> {cfg.label}
    </span>
  );
}

export default function FranchiseDashboard() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 });
  const [zonesList, setZonesList] = useState([]);
  const [loading, setLoading] = useState(true);

  // Module Onboarding Fees & Commissions config state
  const [moduleFees, setModuleFees] = useState({ food: 50000, taxi: 50000, both: 80000 });
  const [moduleComms, setModuleComms] = useState({ food: 10, taxi: 10, both: 10 });

  // Support messages reply state
  const [replyInput, setReplyInput] = useState({});
  const [replyingMessageId, setReplyingMessageId] = useState(null);

  // Add Partner Modal state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [submittingCreate, setSubmittingCreate] = useState(false);
  const [createForm, setCreateForm] = useState({
    applicantName: '',
    phone: '',
    email: '',
    companyName: '',
    businessType: 'Proprietorship',
    investmentRange: '10-25 Lakhs',
    experience: 'Fresher',
    state: '',
    city: '',
    area: '',
    pincode: '',
    zoneId: '',
    taxiTerritory: '',
    selectedModules: ['food'],
    franchiseFee: '',
    franchiseFeeStatus: 'pending',
    createSubAdmin: true,
    subAdminPassword: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, statsRes, zonesRes, configRes] = await Promise.all([
        adminAPI.getFranchiseApplications({ limit: 50 }),
        adminAPI.getFranchiseApplicationStats(),
        adminAPI.getZones({ limit: 500 }).catch(() => null),
        adminAPI.getFranchiseFormConfig().catch(() => null),
      ]);
      if (appsRes?.data?.data) {
        setApplications(appsRes.data.data.applications || []);
      }
      if (statsRes?.data?.data) setStats(statsRes.data.data);
      if (zonesRes?.data?.data) {
        setZonesList(zonesRes.data.data.zones || zonesRes.data.data || []);
      }
      if (configRes?.data?.data) {
        const cfg = configRes.data.data;
        if (cfg.moduleFranchiseFees) setModuleFees(cfg.moduleFranchiseFees);
        if (cfg.moduleCommissions) setModuleComms(cfg.moduleCommissions);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Collect all pending support messages across all franchise applications
  const allSupportMessages = applications.flatMap(app => 
    (app.supportMessages || []).map(msg => ({
      ...msg,
      appId: app._id,
      applicationId: app.applicationId,
      applicantName: app.applicantName,
      city: app.city,
      phone: app.phone,
    }))
  );
  const pendingSupportMessages = allSupportMessages.filter(m => m.status === 'pending' || m.status === 'open');

  const handleReplyMessage = async (appId, messageId) => {
    const text = replyInput[messageId];
    if (!text || !text.trim()) {
      toast.error('Please enter reply text');
      return;
    }
    setReplyingMessageId(messageId);
    try {
      await adminAPI.replyFranchiseSupportMessage(appId, messageId, {
        reply: text.trim(),
        status: 'replied',
      });
      toast.success("Reply sent to Franchise Partner!");
      setReplyInput(prev => ({ ...prev, [messageId]: '' }));
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to send reply');
    } finally {
      setReplyingMessageId(null);
    }
  };

  const toggleCreateModule = (key) => {
    setCreateForm(prev => {
      const current = prev.selectedModules || [];
      const updated = current.includes(key)
        ? (current.length > 1 ? current.filter(m => m !== key) : current)
        : [...current, key];
      let sumFee = 0;
      updated.forEach(m => { sumFee += (moduleFees[m] || 50000); });
      return { ...prev, selectedModules: updated, franchiseFee: sumFee };
    });
  };

  const handleCreateSubmit = async (e) => {
    e.preventDefault();
    if (!createForm.applicantName.trim() || !createForm.phone.trim()) {
      toast.error("Applicant name and phone are required");
      return;
    }
    setSubmittingCreate(true);
    try {
      const created = await adminAPI.createFranchiseApplication(createForm);
      const creds = created?.data?.data?.credentialsInfo;
      toast.success("Franchise partner application registered successfully!");
      if (creds?.password) toast.info(`Login: ${creds.email} / Password: ${creds.password} (shown once - copy it now)`, { duration: 60000 });
      setShowCreateModal(false);
      setCreateForm({
        applicantName: '', phone: '', email: '', companyName: '', businessType: 'Proprietorship',
        investmentRange: '10-25 Lakhs', experience: 'Fresher', state: '', city: '', area: '',
        pincode: '', zoneId: '', taxiTerritory: '', selectedModules: ['food'], franchiseFee: '',
        franchiseFeeStatus: 'pending', createSubAdmin: true, subAdminPassword: '',
      });
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to create application");
    } finally {
      setSubmittingCreate(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 font-sans space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 rounded-2xl shadow-xl p-6 text-white relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-blue-500/10 blur-3xl pointer-events-none" />
        
        <div className="flex flex-wrap items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center shadow-inner">
              <Building2 className="w-7 h-7 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-black text-white tracking-tight">Franchise Management Dashboard</h1>
                <span className="px-2.5 py-0.5 rounded-full bg-blue-500/20 text-blue-300 text-[10px] font-extrabold border border-blue-400/30 uppercase tracking-wider">
                  Live Hub
                </span>
              </div>
              <p className="text-xs font-medium text-slate-300 mt-1">
                Monitor franchise partner onboarding, territory scopes, pending support tickets & module rates
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5 flex-wrap">
            <button
              onClick={() => window.open('/food/franchise/apply', '_blank')}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white text-xs font-extrabold shadow-lg shadow-blue-600/30 inline-flex items-center gap-2 transition-all hover:scale-105"
            >
              <Plus className="w-4 h-4" />
              <span>Add Franchise Partner</span>
            </button>
            <button
              onClick={fetchData}
              className="px-3.5 py-2.5 rounded-xl bg-white/10 hover:bg-white/20 text-white border border-white/15 text-xs font-bold shadow-xs inline-flex items-center gap-2 backdrop-blur-md transition-all"
            >
              <RefreshCw className={`w-4 h-4 text-slate-300 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Dashboard Top KPI Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          
          <div
            onClick={() => navigate('/admin/food/franchise-management/list?status=all')}
            className="p-4 rounded-xl border border-white/15 bg-white/5 backdrop-blur-md cursor-pointer hover:bg-white/10 hover:border-white/30 transition-all group"
          >
            <div className="flex items-center justify-between text-slate-300 text-xs font-bold uppercase tracking-wider mb-1">
              <span>Total Franchises</span>
              <Building2 className="w-4 h-4 text-blue-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-white">{stats.total}</div>
            <div className="text-[11px] text-slate-400 mt-0.5 flex items-center gap-1 group-hover:text-blue-300">
              <span>Registered Partners</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </div>

          <div
            onClick={() => navigate('/admin/food/franchise-management/list?status=approved')}
            className="p-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 backdrop-blur-md cursor-pointer hover:bg-emerald-500/20 hover:border-emerald-500/50 transition-all group"
          >
            <div className="flex items-center justify-between text-emerald-300 text-xs font-bold uppercase tracking-wider mb-1">
              <span>Approved & Active</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-emerald-400">{stats.approved}</div>
            <div className="text-[11px] font-bold text-emerald-300/80 mt-0.5 flex items-center gap-1 group-hover:text-emerald-200">
              <span>SubAdmin Access Live</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </div>

          <div
            onClick={() => navigate('/admin/food/franchise-management/list?status=pending')}
            className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 backdrop-blur-md cursor-pointer hover:bg-amber-500/20 hover:border-amber-500/50 transition-all group"
          >
            <div className="flex items-center justify-between text-amber-300 text-xs font-bold uppercase tracking-wider mb-1">
              <span>Pending Approval</span>
              <Clock className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-amber-400">{stats.pending}</div>
            <div className="text-[11px] text-amber-300/80 mt-0.5 flex items-center gap-1 group-hover:text-amber-200">
              <span>Requires Verification</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </div>

          <div
            onClick={() => navigate('/admin/food/franchise-management/support')}
            className="p-4 rounded-xl border border-red-500/30 bg-red-500/10 backdrop-blur-md cursor-pointer hover:bg-red-500/20 hover:border-red-500/50 transition-all group"
          >
            <div className="flex items-center justify-between text-red-300 text-xs font-bold uppercase tracking-wider mb-1">
              <span>Support Inquiries</span>
              <MessageSquare className="w-4 h-4 text-red-400 group-hover:scale-110 transition-transform" />
            </div>
            <div className="text-3xl font-black text-white flex items-center gap-2">
              <span>{allSupportMessages.length}</span>
              {pendingSupportMessages.length > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-extrabold animate-pulse">
                  {pendingSupportMessages.length} Pending
                </span>
              )}
            </div>
            <div className="text-[11px] font-bold text-red-300 mt-0.5 flex items-center gap-1 group-hover:text-white">
              <span>Open Support Desk</span>
              <ArrowUpRight className="w-3 h-3" />
            </div>
          </div>

        </div>
      </div>

      {/* Quick Action Navigation Grid (4 Separate Section Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        <div
          onClick={() => navigate('/admin/food/franchise-management/list')}
          className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:border-blue-400 transition-all cursor-pointer group"
        >
          <div className="w-11 h-11 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Building2 className="w-6 h-6" />
          </div>
          <div className="font-extrabold text-slate-900 text-sm">Franchise List</div>
          <div className="text-xs text-slate-500 mt-1">View all partner applications, assigned territory zones & sub-admin permissions</div>
          <div className="text-xs font-bold text-blue-600 mt-4 flex items-center gap-1 group-hover:gap-2 transition-all">
            <span>View All ({stats.total})</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        <div
          onClick={() => navigate('/admin/food/franchise-management/support')}
          className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:border-red-400 transition-all cursor-pointer group"
        >
          <div className="w-11 h-11 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform relative">
            <MessageSquare className="w-6 h-6" />
            {pendingSupportMessages.length > 0 && (
              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-600 rounded-full animate-ping" />
            )}
          </div>
          <div className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
            <span>Support Tickets Desk</span>
            {pendingSupportMessages.length > 0 && (
              <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                {pendingSupportMessages.length} Pending
              </span>
            )}
          </div>
          <div className="text-xs text-slate-500 mt-1">Reply to franchise partner questions, urgent inquiries & issues</div>
          <div className="text-xs font-bold text-red-600 mt-4 flex items-center gap-1 group-hover:gap-2 transition-all">
            <span>Open Support Desk</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        <div
          onClick={() => navigate('/admin/food/franchise-management/fees')}
          className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:border-amber-400 transition-all cursor-pointer group"
        >
          <div className="w-11 h-11 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <DollarSign className="w-6 h-6" />
          </div>
          <div className="font-extrabold text-slate-900 text-sm">Module Fees & Rates</div>
          <div className="text-xs text-slate-500 mt-1">Configure base onboarding fees & commission rates for Food & Taxi modules</div>
          <div className="text-xs font-bold text-amber-600 mt-4 flex items-center gap-1 group-hover:gap-2 transition-all">
            <span>Configure Rates</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

        <div
          onClick={() => navigate('/admin/food/franchise-management/form-config')}
          className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-lg hover:border-purple-400 transition-all cursor-pointer group"
        >
          <div className="w-11 h-11 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Settings className="w-6 h-6" />
          </div>
          <div className="font-extrabold text-slate-900 text-sm">Form Configuration</div>
          <div className="text-xs text-slate-500 mt-1">Customize multi-step form questions, required documents & terms</div>
          <div className="text-xs font-bold text-purple-600 mt-4 flex items-center gap-1 group-hover:gap-2 transition-all">
            <span>Manage Form Config</span>
            <ChevronRight className="w-4 h-4" />
          </div>
        </div>

      </div>

      {/* Main Two Column Section: Recent Registrations & Support Inquiries + Pricing */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column (2 Cols): Recent Franchise Partner Registrations */}
        <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
                <Building2 className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 tracking-tight">Recent Franchise Applications</h2>
                <p className="text-xs text-slate-500">Latest registered partners awaiting verification or active</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/admin/food/franchise-management/list')}
              className="px-3 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-extrabold inline-flex items-center gap-1 transition-colors"
            >
              <span>View All Applications →</span>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center p-12 gap-3 text-slate-500 text-xs">
              <Loader2 className="w-5 h-5 animate-spin text-blue-600" />
              <span>Loading recent registrations...</span>
            </div>
          ) : applications.length === 0 ? (
            <div className="text-center py-12 text-slate-400 text-xs">No registered franchise applications found</div>
          ) : (
            <div className="divide-y divide-slate-100">
              {applications.slice(0, 6).map(app => (
                <div
                  key={app._id}
                  onClick={() => navigate(`/admin/food/franchise-management/${app._id}`)}
                  className="py-3.5 px-3 flex items-center justify-between gap-4 hover:bg-slate-50/90 rounded-xl cursor-pointer transition-colors"
                >
                  <div className="space-y-1">
                    <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <span>{app.applicantName}</span>
                      <span className="text-xs text-blue-600 font-extrabold">({app.applicationId})</span>
                    </div>
                    <div className="text-xs text-slate-500 flex items-center gap-3">
                      <span>📍 {app.city}{app.state ? `, ${app.state}` : ''}</span>
                      <span>📞 {app.phone}</span>
                      <span className="text-slate-400">📅 {new Date(app.createdAt).toLocaleDateString('en-IN')}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={app.status} />
                    <ChevronRight className="w-4 h-4 text-slate-400" />
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Right Column (1 Col): Pending Support Tickets & Configured Pricing */}
        <div className="space-y-6">
          
          {/* Pending Support Tickets Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-5 h-5 text-red-600" />
                <h2 className="text-sm font-black text-slate-900">Pending Support Tickets</h2>
              </div>
              <button
                onClick={() => navigate('/admin/food/franchise-management/support')}
                className="text-xs font-bold text-red-600 hover:underline"
              >
                Support Desk →
              </button>
            </div>

            {pendingSupportMessages.length === 0 ? (
              <div className="text-center py-6 text-slate-400 text-xs font-medium">
                ✅ All partner support tickets are replied!
              </div>
            ) : (
              <div className="space-y-3">
                {pendingSupportMessages.slice(0, 3).map((msg, idx) => (
                  <div key={msg.messageId || idx} className="p-3.5 rounded-xl border border-red-100 bg-red-50/40 text-xs space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-extrabold text-slate-900">{msg.applicantName}</span>
                      <span className="px-1.5 py-0.5 rounded bg-red-100 text-red-800 text-[10px] font-bold">
                        {msg.priority?.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-slate-700 font-semibold line-clamp-2">"{msg.subject}": {msg.message}</p>
                    
                    {/* Quick reply field */}
                    <div className="flex items-center gap-1.5 pt-1">
                      <input
                        type="text"
                        placeholder="Type reply..."
                        value={replyInput[msg.messageId] || ''}
                        onChange={e => setReplyInput({ ...replyInput, [msg.messageId]: e.target.value })}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-300 text-xs font-semibold bg-white text-slate-900"
                      />
                      <button
                        onClick={() => handleReplyMessage(msg.appId, msg.messageId)}
                        disabled={replyingMessageId === msg.messageId}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-[11px] shrink-0"
                      >
                        {replyingMessageId === msg.messageId ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Reply'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Module Base Pricing Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Percent className="w-5 h-5 text-amber-600" />
                <h2 className="text-sm font-black text-slate-900">Module Onboarding Rates</h2>
              </div>
              <button
                onClick={() => navigate('/admin/food/franchise-management/fees')}
                className="text-xs font-bold text-amber-600 hover:underline"
              >
                Edit Rates →
              </button>
            </div>

            <div className="space-y-2.5 text-xs">
              {[
                { label: '🍔 Food Delivery', fee: moduleFees.food, comm: moduleComms.food },
                { label: '🚕 Taxi', fee: moduleFees.taxi, comm: moduleComms.taxi },
                { label: '🤝 Food + Taxi (Both)', fee: moduleFees.both, comm: moduleComms.both },
              ].map((item, i) => (
                <div key={i} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 border border-slate-100">
                  <span className="font-bold text-slate-700">{item.label}</span>
                  <div className="text-right">
                    <div className="font-black text-slate-900">₹{item.fee?.toLocaleString('en-IN') || 0}</div>
                    <div className="text-[10px] text-slate-500 font-semibold">Comm: {item.comm || 0}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>

      </div>

      {/* CREATE FRANCHISE PARTNER MODAL */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl bg-white p-6 rounded-2xl shadow-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
              <Building2 className="w-6 h-6 text-blue-600" />
              <span>Register New Franchise Partner</span>
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="space-y-4 mt-2 text-xs">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Applicant Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={createForm.applicantName}
                  onChange={e => setCreateForm({ ...createForm, applicantName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Phone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 9876543210"
                  value={createForm.phone}
                  onChange={e => setCreateForm({ ...createForm, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="partner@example.com"
                  value={createForm.email}
                  onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Company / Firm Name</label>
                <input
                  type="text"
                  placeholder="e.g. Raydo Enterprises Pvt Ltd"
                  value={createForm.companyName}
                  onChange={e => setCreateForm({ ...createForm, companyName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">City / Location *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Jaipur"
                  value={createForm.city}
                  onChange={e => setCreateForm({ ...createForm, city: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">State</label>
                <input
                  type="text"
                  placeholder="e.g. Rajasthan"
                  value={createForm.state}
                  onChange={e => setCreateForm({ ...createForm, state: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900"
                />
              </div>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">Select Business Modules</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: 'food', label: '🍔 Food Delivery' },
                  { key: 'taxi', label: '🚕 Taxi' },
                ].map(mod => {
                  const active = (createForm.selectedModules || []).includes(mod.key);
                  return (
                    <button
                      key={mod.key}
                      type="button"
                      onClick={() => toggleCreateModule(mod.key)}
                      className={`p-2.5 rounded-lg border font-extrabold text-xs transition-all flex items-center justify-between ${
                        active ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-slate-50 text-slate-700 border-slate-200'
                      }`}
                    >
                      <span>{mod.label}</span>
                      <span>{active ? '✓' : '+'}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 font-bold hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingCreate}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm inline-flex items-center gap-2"
              >
                {submittingCreate ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>{submittingCreate ? 'Saving Partner...' : 'Create Franchise Partner'}</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
