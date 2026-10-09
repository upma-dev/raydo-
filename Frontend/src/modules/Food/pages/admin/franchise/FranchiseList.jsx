import React, { useState, useEffect, useCallback } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { adminAPI } from "@food/api";
import {
  Building2, Search, Filter, Eye, Trash2, CheckCircle2, Clock, XCircle, AlertCircle,
  MapPin, Phone, Mail, Calendar, ChevronRight, Loader2, RefreshCw, Settings, Plus, X, Copy
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

export default function FranchiseList() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const urlStatus = searchParams.get('status') || 'all';

  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState(urlStatus);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

  useEffect(() => {
    if (urlStatus !== statusFilter) {
      setStatusFilter(urlStatus);
      setPage(1);
    }
  }, [urlStatus]);

  const handleStatusChange = (key) => {
    setStatusFilter(key);
    setPage(1);
    if (key === 'all') {
      setSearchParams({});
    } else {
      setSearchParams({ status: key });
    }
  };

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
    selectedModules: ['food'],
    franchiseFee: '',
    franchiseFeeStatus: 'pending',
    createSubAdmin: true,
    subAdminPassword: '',
  });

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const [appsRes, statsRes] = await Promise.all([
        adminAPI.getFranchiseApplications({ status: statusFilter, search, page, limit: LIMIT }),
        adminAPI.getFranchiseApplicationStats(),
      ]);
      if (appsRes?.data?.data) {
        setApplications(appsRes.data.data.applications || []);
        setTotal(appsRes.data.data.total || 0);
      }
      if (statsRes?.data?.data) setStats(statsRes.data.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, search, page]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this application?')) return;
    await adminAPI.deleteFranchiseApplication(id);
    toast.success('Franchise application deleted');
    fetchData();
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
      fetchData();
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to create application");
    } finally {
      setSubmittingCreate(false);
    }
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 font-sans space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center shadow-xs">
              <Building2 className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">All Franchises & Applications List</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                View all registered franchise partners, verify documents, assign sub-admin access & territories
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
              onClick={fetchData}
              className="px-3.5 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 text-xs font-bold shadow-xs inline-flex items-center gap-2"
            >
              <RefreshCw className={`w-4 h-4 text-slate-500 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        </div>
      </div>

      {/* Filter Tabs & Search Bar */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-4 space-y-4">
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
              onClick={() => handleStatusChange(item.key)}
              className={`px-3.5 py-2 rounded-xl font-bold border transition-all inline-flex items-center gap-1.5 ${
                statusFilter === item.key
                  ? 'bg-slate-900 text-white border-slate-900 shadow-sm'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              <span>{item.label}</span>
              <span className={`px-1.5 py-0.5 rounded-md text-[10px] font-mono ${statusFilter === item.key ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-700'}`}>
                {item.val}
              </span>
            </button>
          ))}
        </div>

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
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center p-16 gap-3 text-slate-500 text-xs">
            <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
            <span>Loading franchise applications...</span>
          </div>
        ) : applications.length === 0 ? (
          <div className="text-center p-16">
            <Building2 className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-base font-semibold text-slate-700">No applications found</p>
            <p className="text-xs text-slate-400 mt-1">Try adjusting search or status filters</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/80 border-b border-slate-200 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3.5 px-6">Applicant & Modules</th>
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
                    <td className="py-4 px-6">
                      <div className="font-bold text-slate-900 text-sm">{app.applicantName}</div>
                      <div className="text-xs font-extrabold text-blue-600 mt-0.5">{app.applicationId}</div>
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

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500">
                        <Calendar className="w-3.5 h-3.5 text-slate-400" />
                        {new Date(app.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                      </div>
                    </td>

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

      {/* CREATE MODAL */}
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
                className="px-5 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold shadow-sm flex items-center gap-2"
              >
                {submittingCreate ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                <span>Create Franchise Partner</span>
              </button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
