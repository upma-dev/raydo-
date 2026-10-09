import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { adminAPI } from "@food/api";
import {
  Building2, Search, Filter, Eye, Trash2, CheckCircle2, Clock, XCircle, AlertCircle,
  MapPin, Phone, Mail, Calendar, ChevronRight, Loader2, RefreshCw, Settings, Plus, X, User, Check, Copy,
  MessageSquare, DollarSign, Send, ShieldCheck, Zap, Percent, LayoutDashboard, ShoppingBag, Store, Award, TrendingUp, Save
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

export default function FranchiseManagement() {
  const navigate = useNavigate();
  const location = useLocation();
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 });
  const [zonesList, setZonesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  // Sync active main tab with location pathname
  const getTabFromPath = (pathname) => {
    if (pathname.endsWith('/list')) return 'directory';
    if (pathname.endsWith('/support')) return 'support';
    if (pathname.endsWith('/fees')) return 'fees';
    return 'dashboard';
  };

  const activeMainTab = getTabFromPath(location.pathname);

  const setActiveMainTab = (tab) => {
    if (tab === 'dashboard') navigate('/admin/food/franchise-management');
    else if (tab === 'directory') navigate('/admin/food/franchise-management/list');
    else if (tab === 'support') navigate('/admin/food/franchise-management/support');
    else if (tab === 'fees') navigate('/admin/food/franchise-management/fees');
  };

  // Support messages reply state
  const [replyInput, setReplyInput] = useState({});
  const [replyingMessageId, setReplyingMessageId] = useState(null);
  const [supportStatusFilter, setSupportStatusFilter] = useState('all');

  // Module Onboarding Fees & Commissions config state
  const [moduleFees, setModuleFees] = useState({ food: 50000, taxi: 50000, both: 80000 });
  const [moduleComms, setModuleComms] = useState({ food: 10, taxi: 10, both: 10 });
  const [paymentDetails, setPaymentDetails] = useState({ upiId: '', bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '', qrCodeUrl: '' });
  const [savingConfig, setSavingConfig] = useState(false);

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
      const [appsRes, statsRes, zonesRes] = await Promise.all([
        adminAPI.getFranchiseApplications({ status: statusFilter, search, page, limit: LIMIT }),
        adminAPI.getFranchiseApplicationStats(),
        adminAPI.getZones({ limit: 500 }).catch(() => null),
      ]);
      if (appsRes?.data?.data) {
        setApplications(appsRes.data.data.applications || []);
        setTotal(appsRes.data.data.total || 0);
      }
      if (statsRes?.data?.data) setStats(statsRes.data.data);
      if (zonesRes?.data?.data) {
        const list = zonesRes.data.data.zones || zonesRes.data.data || [];
        setZonesList(list);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page]);

  const fetchFormConfig = async () => {
    try {
      const res = await adminAPI.getFranchiseFormConfig();
      if (res?.data?.data) {
        const cfg = res.data.data;
        if (cfg.moduleFranchiseFees) setModuleFees(cfg.moduleFranchiseFees);
        if (cfg.moduleCommissions) setModuleComms(cfg.moduleCommissions);
        if (cfg.paymentDetails) setPaymentDetails(cfg.paymentDetails);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
    fetchFormConfig();
  }, [fetchData]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this application?')) return;
    await adminAPI.deleteFranchiseApplication(id);
    fetchData();
  };

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

  const handleSaveModuleFeesConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await adminAPI.updateFranchiseFormConfig({
        moduleFranchiseFees: moduleFees,
        moduleCommissions: moduleComms,
        paymentDetails: paymentDetails,
      });
      toast.success("🎉 Global Module Onboarding Fees & Commissions Saved!");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save module fee config");
    } finally {
      setSavingConfig(false);
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
      console.error(err);
      toast.error(err?.response?.data?.message || "Failed to create application");
    } finally {
      setSubmittingCreate(false);
    }
  };

  // Collect all support messages across all franchise applications
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
  const pendingSupportCount = allSupportMessages.filter(m => m.status === 'pending' || m.status === 'open').length;

  const filteredSupportMessages = allSupportMessages.filter(m => {
    if (supportStatusFilter === 'pending') return m.status === 'pending' || m.status === 'open';
    if (supportStatusFilter === 'replied') return m.status === 'replied';
    if (supportStatusFilter === 'resolved') return m.status === 'resolved';
    return true;
  });

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 font-sans space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-xs">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Franchise Management Hub</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                Manage partner onboarding, territory scopes, support inquiries & module pricing
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => window.open('/food/franchise/apply', '_blank')}
              className="px-4 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-xs font-extrabold shadow-md inline-flex items-center gap-2 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Add Franchise Partner</span>
            </button>
            <button
              onClick={() => setActiveMainTab('fees')}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs inline-flex items-center gap-2"
            >
              <Settings className="w-4 h-4 text-amber-600" />
              <span>Set Module Fees</span>
            </button>
            <button
              onClick={fetchData}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs inline-flex items-center gap-2"
            >
              <RefreshCw className="w-4 h-4 text-slate-500" />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Dashboard Overview Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 mt-6">
          
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/60">
            <div className="flex items-center justify-between text-slate-500 text-xs font-bold uppercase tracking-wider mb-1">
              <span>Total Franchises</span>
              <Building2 className="w-4 h-4 text-blue-600" />
            </div>
            <div className="text-2xl font-black text-slate-900">{stats.total}</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Registered Partners</div>
          </div>

          <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40">
            <div className="flex items-center justify-between text-emerald-700 text-xs font-bold uppercase tracking-wider mb-1">
              <span>Approved & Active</span>
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            </div>
            <div className="text-2xl font-black text-emerald-700">{stats.approved}</div>
            <div className="text-[11px] font-bold text-emerald-600 mt-0.5">SubAdmin Access Live</div>
          </div>

          <div className="p-4 rounded-xl border border-amber-200 bg-amber-50/40">
            <div className="flex items-center justify-between text-amber-700 text-xs font-bold uppercase tracking-wider mb-1">
              <span>Pending Approval</span>
              <Clock className="w-4 h-4 text-amber-600" />
            </div>
            <div className="text-2xl font-black text-amber-700">{stats.pending}</div>
            <div className="text-[11px] text-amber-800 mt-0.5">Requires Verification</div>
          </div>

          <button
            onClick={() => setActiveMainTab('support')}
            className={`p-4 rounded-xl border text-left transition-all ${
              pendingSupportCount > 0 ? 'border-red-300 bg-red-50/70 text-red-900 ring-2 ring-red-500/20' : 'border-blue-200 bg-blue-50/40 text-blue-900'
            }`}
          >
            <div className="flex items-center justify-between text-xs font-bold uppercase tracking-wider mb-1">
              <span>Support Inquiries</span>
              <MessageSquare className="w-4 h-4 text-red-600" />
            </div>
            <div className="text-2xl font-black text-slate-900 flex items-center gap-2">
              <span>{allSupportMessages.length}</span>
              {pendingSupportCount > 0 && (
                <span className="px-2 py-0.5 rounded-full bg-red-600 text-white text-[10px] font-extrabold animate-pulse">
                  {pendingSupportCount} Pending
                </span>
              )}
            </div>
            <div className="text-[11px] font-bold text-blue-600 mt-0.5">Open Support Ticket Desk →</div>
          </button>

        </div>
      </div>

      {/* Support Message Alert Banner if pending tickets exist */}
      {pendingSupportCount > 0 && activeMainTab !== 'support' && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-red-800 flex items-center justify-between flex-wrap gap-4 shadow-xs">
          <div className="flex items-center gap-3">
            <MessageSquare className="w-5 h-5 text-red-600 shrink-0" />
            <div>
              <div className="text-xs font-extrabold uppercase tracking-wider">💬 Pending Franchise Support Inquiries ({pendingSupportCount})</div>
              <div className="text-xs font-medium text-red-700 mt-0.5">
                Franchise partners have submitted support questions that require your admin reply.
              </div>
            </div>
          </div>

          <button
            onClick={() => setActiveMainTab('support')}
            className="px-4 py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white font-bold text-xs shadow-xs inline-flex items-center gap-1.5"
          >
            <span>View & Reply Inquiries →</span>
          </button>
        </div>
      )}

      {/* Main Section Navigation Bar */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-1 flex-wrap">
        {[
          { id: 'dashboard', label: '📊 Dashboard' },
          { id: 'directory', label: '🏢 Franchise List', badge: stats.total },
          { id: 'support', label: '💬 Support Tickets', badge: pendingSupportCount, badgeColor: pendingSupportCount > 0 ? 'bg-red-500 text-white' : 'bg-slate-200 text-slate-700' },
          { id: 'fees', label: '⚙️ Module Fees & Rates', badge: 'CONFIG' },
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveMainTab(tab.id)}
            className={`px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
              activeMainTab === tab.id
                ? 'bg-blue-600 text-white shadow-md shadow-blue-500/20'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{tab.label}</span>
            {tab.badge !== undefined && (
              <span className={`px-2 py-0.5 rounded-full text-[10px] ${tab.badgeColor || (activeMainTab === tab.id ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-700')}`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}

        <button
          onClick={() => navigate('/admin/food/franchise-management/form-config')}
          className="px-4 py-2.5 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 bg-white border border-slate-200 text-purple-700 hover:bg-purple-50"
        >
          <span>📝 Form Configuration</span>
        </button>
      </div>

      {/* TAB 0: DASHBOARD OVERVIEW */}
      {activeMainTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Quick Action Modules Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            
            <div
              onClick={() => setActiveMainTab('directory')}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-blue-400 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Building2 className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-slate-900 text-sm">Franchise List</div>
              <div className="text-xs text-slate-500 mt-1">Manage all partner applications, assigned zones & sub-admin access</div>
              <div className="text-xs font-bold text-blue-600 mt-3 flex items-center gap-1 group-hover:gap-2 transition-all">
                <span>View All ({stats.total})</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => setActiveMainTab('support')}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-red-400 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform relative">
                <MessageSquare className="w-5 h-5" />
                {pendingSupportCount > 0 && (
                  <span className="absolute -top-1 -right-1 w-3 h-3 bg-red-600 rounded-full animate-ping" />
                )}
              </div>
              <div className="font-extrabold text-slate-900 text-sm flex items-center justify-between">
                <span>Support Ticket Desk</span>
                {pendingSupportCount > 0 && (
                  <span className="px-2 py-0.5 rounded-full bg-red-100 text-red-700 text-[10px] font-bold">
                    {pendingSupportCount} Pending
                  </span>
                )}
              </div>
              <div className="text-xs text-slate-500 mt-1">Respond to partner support questions & urgent help inquiries</div>
              <div className="text-xs font-bold text-red-600 mt-3 flex items-center gap-1 group-hover:gap-2 transition-all">
                <span>Open Support Desk</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => setActiveMainTab('fees')}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-amber-400 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <DollarSign className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-slate-900 text-sm">Module Fees & Rates</div>
              <div className="text-xs text-slate-500 mt-1">Configure base onboarding fees & commission rates for Food & Taxi</div>
              <div className="text-xs font-bold text-amber-600 mt-3 flex items-center gap-1 group-hover:gap-2 transition-all">
                <span>Configure Rates</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

            <div
              onClick={() => navigate('/admin/food/franchise-management/form-config')}
              className="p-5 rounded-2xl bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-purple-400 transition-all cursor-pointer group"
            >
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Settings className="w-5 h-5" />
              </div>
              <div className="font-extrabold text-slate-900 text-sm">Form Configuration</div>
              <div className="text-xs text-slate-500 mt-1">Customize multi-step application questions & required documents</div>
              <div className="text-xs font-bold text-purple-600 mt-3 flex items-center gap-1 group-hover:gap-2 transition-all">
                <span>Manage Form Config</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </div>
            </div>

          </div>

          {/* Recent Applications & Module Base Pricing Overview */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            
            {/* Recent Registered Applications (2 cols) */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-blue-600" />
                  <h2 className="text-sm font-black text-slate-900">Recent Franchise Registrations</h2>
                </div>
                <button
                  onClick={() => setActiveMainTab('directory')}
                  className="text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline flex items-center gap-1"
                >
                  <span>View All Applications ({stats.total})</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>

              {applications.length === 0 ? (
                <div className="text-center py-8 text-slate-400 text-xs">No registered franchise applications found</div>
              ) : (
                <div className="divide-y divide-slate-100">
                  {applications.slice(0, 5).map(app => (
                    <div
                      key={app._id}
                      onClick={() => navigate(`/admin/food/franchise-management/${app._id}`)}
                      className="py-3.5 flex items-center justify-between gap-4 hover:bg-slate-50 p-2 rounded-lg cursor-pointer transition-colors"
                    >
                      <div>
                        <div className="font-bold text-slate-900 text-xs flex items-center gap-2">
                          <span>{app.applicantName}</span>
                          <span className="text-[10px] text-slate-400 font-mono">({app.applicationId})</span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-3">
                          <span>📍 {app.city}{app.state ? `, ${app.state}` : ''}</span>
                          <span>📞 {app.phone}</span>
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

            {/* Active Module Base Pricing Summary Card (1 col) */}
            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div className="flex items-center gap-2">
                  <Percent className="w-5 h-5 text-amber-600" />
                  <h2 className="text-sm font-black text-slate-900">Module Pricing & Rates</h2>
                </div>
                <button
                  onClick={() => setActiveMainTab('fees')}
                  className="text-xs font-bold text-amber-600 hover:underline"
                >
                  Edit Rates →
                </button>
              </div>

              <div className="space-y-2 text-xs">
                {[
                  { label: '🍔 Food Delivery', fee: moduleFees.food, comm: moduleComms.food },
                  { label: '🚕 Taxi', fee: moduleFees.taxi, comm: moduleComms.taxi },
                  { label: '🤝 Food + Taxi (Both)', fee: moduleFees.both, comm: moduleComms.both },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between p-2.5 rounded-lg bg-slate-50 border border-slate-100">
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
      )}

      {/* TAB 1: ALL FRANCHISES DIRECTORY */}
      {activeMainTab === 'directory' && (
        <div className="space-y-6">
          
          {/* Status Filter Tabs & Search Bar */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-4 space-y-4">
            
            {/* Status Filter Badges */}
            <div className="flex items-center gap-2 flex-wrap text-xs">
              {[
                { key: 'all', label: 'All Franchises', val: stats.total },
                { key: 'approved', label: '🟢 Approved & Active', val: stats.approved },
                { key: 'pending', label: '🟡 Pending Approval', val: stats.pending },
                { key: 'under_review', label: '🔵 Under Review', val: stats.under_review },
                { key: 'rejected', label: '🔴 Rejected', val: stats.rejected },
              ].map(item => (
                <button
                  key={item.key}
                  onClick={() => { setStatusFilter(item.key); setPage(1); }}
                  className={`px-3.5 py-2 rounded-lg font-bold border transition-all inline-flex items-center gap-1.5 ${
                    statusFilter === item.key
                      ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <span>{item.label}</span>
                  <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono ${statusFilter === item.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                    {item.val}
                  </span>
                </button>
              ))}
            </div>

            {/* Search Input */}
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input
                type="text"
                placeholder="Search by applicant name, phone, email, city or application ID..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(1); }}
                className="pl-10 pr-4 py-2.5 w-full text-xs rounded-xl border border-slate-300 bg-white text-slate-900 font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>

          {/* Applications Table */}
          <div className="bg-white rounded-xl shadow-sm border border-slate-200 overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center p-16 gap-3 text-slate-500">
                <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                <span>Loading applications...</span>
              </div>
            ) : applications.length === 0 ? (
              <div className="text-center p-16">
                <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                <p className="text-base font-semibold text-slate-700">No applications found</p>
                <p className="text-sm text-slate-400 mt-1">Try adjusting search or status filters</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-slate-50 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                      <th className="py-3.5 px-6">Applicant</th>
                      <th className="py-3.5 px-6">Contact Info</th>
                      <th className="py-3.5 px-6">Territory / Zone</th>
                      <th className="py-3.5 px-6">Applied Date</th>
                      <th className="py-3.5 px-6">Fee & Status</th>
                      <th className="py-3.5 px-6 text-center">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {applications.map(app => (
                      <tr
                        key={app._id}
                        onClick={() => navigate(`/admin/food/franchise-management/${app._id}`)}
                        className="hover:bg-slate-50/80 cursor-pointer transition-colors"
                      >
                        {/* Applicant & Modules */}
                        <td className="py-4 px-6">
                          <div className="font-bold text-slate-900 text-sm">{app.applicantName}</div>
                          <div className="text-xs font-bold text-blue-600 mt-0.5">{app.applicationId}</div>
                          {app.companyName && <div className="text-xs text-slate-500 mt-0.5">{app.companyName}</div>}
                          {app.selectedModules?.length > 0 && (
                            <div className="flex flex-wrap gap-1 mt-1.5">
                              {app.selectedModules.map(m => (
                                <span key={m} className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                  {m === 'food' ? '🍔 Food' : String(m).startsWith('taxi') ? '🚕 Taxi' : m}
                                </span>
                              ))}
                            </div>
                          )}
                        </td>

                        {/* Contact Info */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
                            <Phone className="w-3.5 h-3.5 text-slate-400" /> {app.phone}
                          </div>
                          {app.email && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 mt-1">
                              <Mail className="w-3.5 h-3.5 text-slate-400" /> {app.email}
                            </div>
                          )}
                        </td>

                        {/* Location & Zone */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-1.5 text-xs font-medium text-slate-700">
                            <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                            <span>{app.city}{app.state ? `, ${app.state}` : ''}</span>
                          </div>
                          {app.zoneId && (
                            <span className="inline-block mt-1 px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                              Zone: {app.zoneId.name || app.zoneId.zoneName || 'Assigned'}
                            </span>
                          )}
                        </td>

                        {/* Applied Date */}
                        <td className="py-4 px-6">
                          <div className="flex items-center gap-1.5 text-xs text-slate-500">
                            <Calendar className="w-3.5 h-3.5 text-slate-400" />
                            {new Date(app.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </div>
                        </td>

                        {/* Status & Fee */}
                        <td className="py-4 px-6">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={app.status} />
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded border ${
                              app.franchiseFeeStatus === 'paid' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                              app.franchiseFeeStatus === 'waived' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              'bg-amber-50 text-amber-700 border-amber-200'
                            }`}>
                              Fee: {app.franchiseFeeStatus?.toUpperCase() || 'PENDING'} (₹{app.franchiseFee || 50000})
                            </span>
                            {app.subAdminId && (
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                                🛡️ SubAdmin Active
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Actions */}
                        <td className="py-4 px-6 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <button
                              onClick={e => {
                                e.stopPropagation();
                                const url = `${window.location.origin}/food/franchise/dashboard?appId=${app.applicationId}&phone=${app.phone}`;
                                navigator.clipboard.writeText(url);
                                toast.success(`Partner CRM Link copied for ${app.applicantName}!`);
                              }}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-600 hover:text-emerald-600 border border-slate-200 transition-colors"
                              title="Copy Partner CRM Link"
                            >
                              <Copy className="w-4 h-4" />
                            </button>
                            <button
                              onClick={e => { e.stopPropagation(); navigate(`/admin/food/franchise-management/${app._id}`); }}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-600 border border-slate-200 transition-colors"
                              title="View Details"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              onClick={e => handleDelete(app._id, e)}
                              className="p-1.5 rounded-lg bg-slate-100 hover:bg-red-50 text-slate-600 hover:text-red-600 border border-slate-200 transition-colors"
                              title="Delete"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </td>

                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex justify-center gap-2 mt-6">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-9 h-9 rounded-lg font-medium text-sm border ${
                    p === page ? 'bg-blue-600 text-white border-blue-600 shadow-sm' : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p}
                </button>
              ))}
            </div>
          )}

        </div>
      )}

      {/* TAB 2: PARTNER SUPPORT TICKET DESK */}
      {activeMainTab === 'support' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-4 border-b border-slate-200 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center text-red-600">
                <MessageSquare className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">💬 Franchise Partner Support Desk</h3>
                <p className="text-xs text-slate-500">View and respond to inquiries submitted by franchise partners</p>
              </div>
            </div>

            {/* Filter by status */}
            <div className="flex items-center gap-2 text-xs">
              {['all', 'pending', 'replied', 'resolved'].map(st => (
                <button
                  key={st}
                  onClick={() => setSupportStatusFilter(st)}
                  className={`px-3 py-1.5 rounded-lg font-bold capitalize border transition-all ${
                    supportStatusFilter === st ? 'bg-blue-600 text-white border-blue-600' : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4">
            {filteredSupportMessages.map((msg, idx) => (
              <div key={msg.messageId || idx} className="p-5 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3 text-xs">
                <div className="flex items-start justify-between flex-wrap gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-bold text-slate-900 text-sm">{msg.subject}</span>
                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                        msg.priority === 'urgent' ? 'bg-red-100 text-red-800' : msg.priority === 'high' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-700'
                      }`}>
                        {msg.priority?.toUpperCase()}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-3">
                      <span>Applicant: <strong className="text-slate-900">{msg.applicantName}</strong> ({msg.applicationId})</span>
                      <span>City: <strong>{msg.city}</strong></span>
                      <span>Phone: <strong>{msg.phone}</strong></span>
                      <span className="text-slate-400">{new Date(msg.createdAt).toLocaleString('en-IN')}</span>
                    </div>
                  </div>

                  <span className={`px-2.5 py-1 rounded-full text-xs font-bold border ${
                    msg.status === 'replied' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : msg.status === 'resolved' ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-amber-50 text-amber-700 border-amber-200'
                  }`}>
                    {msg.status === 'replied' ? '🟢 Replied' : msg.status === 'resolved' ? '🔵 Resolved' : '🟡 Pending Reply'}
                  </span>
                </div>

                <div className="p-3.5 bg-white rounded-lg border border-slate-200 text-slate-800 font-medium">
                  {msg.message}
                </div>

                {/* Existing Reply */}
                {msg.reply && (
                  <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg text-xs space-y-1">
                    <div className="font-bold text-blue-900 flex items-center gap-1">
                      <ShieldCheck className="w-4 h-4 text-blue-600" /> Admin Reply:
                    </div>
                    <p className="text-slate-800 font-semibold">{msg.reply}</p>
                  </div>
                )}

                {/* Reply Form */}
                <div className="pt-2 border-t border-slate-200/80 flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Type response to franchise partner..."
                    value={replyInput[msg.messageId] || ''}
                    onChange={e => setReplyInput({ ...replyInput, [msg.messageId]: e.target.value })}
                    className="flex-1 px-3.5 py-2 rounded-lg border border-slate-300 font-semibold text-slate-900 bg-white"
                  />
                  <button
                    onClick={() => handleReplyMessage(msg.appId, msg.messageId)}
                    disabled={replyingMessageId === msg.messageId}
                    className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs shadow-sm inline-flex items-center gap-1.5 shrink-0"
                  >
                    {replyingMessageId === msg.messageId ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                    <span>{msg.reply ? 'Update Reply' : 'Send Reply'}</span>
                  </button>
                </div>
              </div>
            ))}

            {filteredSupportMessages.length === 0 && (
              <div className="text-center py-12 text-slate-400 font-medium text-xs">
                No support inquiries found in this category.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: MODULE ONBOARDING FEES & COMMISSION CONFIG */}
      {activeMainTab === 'fees' && (
        <form onSubmit={handleSaveModuleFeesConfig} className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-wrap gap-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600">
                <Percent className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">⚙️ Module Onboarding Fees & Default Commission Rates</h3>
                <p className="text-xs text-slate-500">Configure standard base fees and commission percentages for each business module</p>
              </div>
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2"
            >
              {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {savingConfig ? 'Saving...' : 'Save Global Module Config'}
            </button>
          </div>

          {/* Module Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            
            {[
              { key: 'food', icon: '🍔', name: 'Food Only' },
              { key: 'taxi', icon: '🚕', name: 'Taxi Only' },
              { key: 'both', icon: '🤝', name: 'Food + Taxi (Both)' },
            ].map(mod => (
              <div key={mod.key} className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-3">
                <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <span>{mod.icon}</span>
                  <span>{mod.name}</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Standard Base Onboarding Fee (₹)</label>
                  <input
                    type="number"
                    value={moduleFees[mod.key] ?? 50000}
                    onChange={e => setModuleFees({ ...moduleFees, [mod.key]: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Default Franchise Commission Rate (%)</label>
                  <input
                    type="number"
                    value={moduleComms[mod.key] ?? 10}
                    onChange={e => setModuleComms({ ...moduleComms, [mod.key]: Number(e.target.value) })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-300 font-bold bg-white text-slate-900"
                  />
                </div>
              </div>
            ))}

          </div>

          {/* UTR Payment Details Section */}
          <div className="pt-4 border-t border-slate-200 space-y-4">
            <h4 className="text-xs font-extrabold text-slate-900 uppercase tracking-wider">Raydo Bank & UPI Account Details for Manual UTR Transfer</h4>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Bank Name</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Bank"
                  value={paymentDetails.bankName || ''}
                  onChange={e => setPaymentDetails({ ...paymentDetails, bankName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Account Number</label>
                <input
                  type="text"
                  placeholder="e.g. 50200018291029"
                  value={paymentDetails.accountNumber || ''}
                  onChange={e => setPaymentDetails({ ...paymentDetails, accountNumber: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">IFSC Code</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC0001234"
                  value={paymentDetails.ifscCode || ''}
                  onChange={e => setPaymentDetails({ ...paymentDetails, ifscCode: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-mono uppercase bg-white"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">UPI ID</label>
                <input
                  type="text"
                  placeholder="e.g. raydo@hdfcbank"
                  value={paymentDetails.upiId || ''}
                  onChange={e => setPaymentDetails({ ...paymentDetails, upiId: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-300 font-semibold bg-white"
                />
              </div>
            </div>
          </div>
        </form>
      )}

      {/* Modal: Add Franchise Partner (Admin Manual Create) */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-2xl p-0 overflow-hidden bg-white rounded-xl shadow-xl">
          <DialogHeader className="px-6 py-4 border-b border-slate-200 bg-slate-50">
            <DialogTitle className="text-lg font-bold text-slate-900 flex items-center gap-2">
              <Building2 className="w-5 h-5 text-blue-600" /> Register New Franchise Partner
            </DialogTitle>
          </DialogHeader>

          <form onSubmit={handleCreateSubmit} className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
            
            {/* Modules Checkboxes */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="block text-xs font-bold text-slate-700 uppercase mb-2">Select Intended Franchise Vertical Modules *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {[
                  { key: 'food', icon: '🍔', label: 'Food Delivery' },
                  { key: 'taxi', icon: '🚕', label: 'Taxi' },
                ].map(m => {
                  const isChecked = createForm.selectedModules.includes(m.key);
                  return (
                    <label key={m.key} className={`flex items-center gap-2 p-2.5 rounded-lg border text-xs font-semibold cursor-pointer transition-all ${
                      isChecked ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}>
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => toggleCreateModule(m.key)}
                        className="hidden"
                      />
                      <span>{m.icon}</span>
                      <span>{m.label}</span>
                    </label>
                  );
                })}
              </div>
            </div>

            {/* Applicant Details */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Applicant Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Rahul Sharma"
                  value={createForm.applicantName}
                  onChange={e => setCreateForm({ ...createForm, applicantName: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Mobile Phone *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. 9876543210"
                  value={createForm.phone}
                  onChange={e => setCreateForm({ ...createForm, phone: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Email Address</label>
                <input
                  type="email"
                  placeholder="rahul@example.com"
                  value={createForm.email}
                  onChange={e => setCreateForm({ ...createForm, email: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Company / Firm Name</label>
                <input
                  type="text"
                  placeholder="e.g. Sharma Enterprises"
                  value={createForm.companyName}
                  onChange={e => setCreateForm({ ...createForm, companyName: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">State *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Maharashtra"
                  value={createForm.state}
                  onChange={e => setCreateForm({ ...createForm, state: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">City Hub *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Pune"
                  value={createForm.city}
                  onChange={e => setCreateForm({ ...createForm, city: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Food Zone & Taxi Territory */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Assign Food Zone</label>
                <select
                  value={createForm.zoneId}
                  onChange={e => setCreateForm({ ...createForm, zoneId: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 bg-white text-slate-900 font-semibold"
                >
                  <option value="">-- Select Zone --</option>
                  {zonesList.map(z => (
                    <option key={z._id} value={z._id}>{z.name || z.zoneName} ({z.serviceLocation || 'Zone'})</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase mb-1">Taxi Operating Territory</label>
                <input
                  type="text"
                  placeholder="e.g. Pune Central Territory"
                  value={createForm.taxiTerritory}
                  onChange={e => setCreateForm({ ...createForm, taxiTerritory: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
            </div>

            {/* Fee & Payment Status */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-amber-50/60 p-4 rounded-xl border border-amber-200">
              <div>
                <label className="block text-xs font-bold text-amber-900 uppercase mb-1">Total Franchise Fee (₹)</label>
                <input
                  type="number"
                  value={createForm.franchiseFee}
                  onChange={e => setCreateForm({ ...createForm, franchiseFee: Number(e.target.value) })}
                  className="w-full px-3.5 py-2 text-sm font-bold rounded-lg border border-amber-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-amber-900 uppercase mb-1">Initial Fee Payment Status</label>
                <select
                  value={createForm.franchiseFeeStatus}
                  onChange={e => setCreateForm({ ...createForm, franchiseFeeStatus: e.target.value })}
                  className="w-full px-3.5 py-2 text-sm font-bold rounded-lg border border-amber-300 text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                >
                  <option value="pending">🟡 Pending (Portal Locked until Paid)</option>
                  <option value="paid">🟢 Paid & Verified (Full Access)</option>
                  <option value="waived">🔵 Waived (Full Access)</option>
                </select>
              </div>
            </div>

            {/* Auto Create SubAdmin account toggle */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={createForm.createSubAdmin}
                  onChange={e => setCreateForm({ ...createForm, createSubAdmin: e.target.checked })}
                  className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
                <div>
                  <span className="text-sm font-bold text-slate-900">Automatically Create SubAdmin Login Account</span>
                  <p className="text-xs text-slate-500">Will provision a SubAdmin login using email/phone with default password</p>
                </div>
              </label>

              {createForm.createSubAdmin && (
                <div className="mt-3">
                  <label className="block text-xs font-semibold text-slate-600 mb-1">SubAdmin Password</label>
                  <input
                    type="text"
                    value={createForm.subAdminPassword}
                    onChange={e => setCreateForm({ ...createForm, subAdminPassword: e.target.value })}
                    className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono text-slate-900"
                  />
                </div>
              )}
            </div>

            {/* Footer Buttons */}
            <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="px-4 py-2 rounded-lg border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submittingCreate}
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold shadow-sm inline-flex items-center gap-2"
              >
                {submittingCreate ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                {submittingCreate ? 'Saving Partner...' : 'Create Franchise Partner'}
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
