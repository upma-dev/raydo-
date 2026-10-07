import React, { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { adminAPI } from "@food/api";
import {
  Building2, Search, Filter, Eye, Trash2, CheckCircle2, Clock, XCircle, AlertCircle,
  MapPin, Phone, Mail, Calendar, ChevronRight, Loader2, RefreshCw, Settings
} from "lucide-react";

const STATUS_CONFIG = {
  pending: { label: 'Pending', color: '#FFC400', bg: 'rgba(255,196,0,0.12)', border: 'rgba(255,196,0,0.25)', icon: Clock },
  under_review: { label: 'Under Review', color: '#60a5fa', bg: 'rgba(96,165,250,0.12)', border: 'rgba(96,165,250,0.25)', icon: AlertCircle },
  approved: { label: 'Approved', color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.25)', icon: CheckCircle2 },
  rejected: { label: 'Rejected', color: '#f87171', bg: 'rgba(248,113,113,0.12)', border: 'rgba(248,113,113,0.25)', icon: XCircle },
};

function StatusBadge({ status }) {
  const cfg = STATUS_CONFIG[status] || STATUS_CONFIG.pending;
  const Icon = cfg.icon;
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 5,
      background: cfg.bg, border: `1px solid ${cfg.border}`,
      color: cfg.color, padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 700,
    }}>
      <Icon size={11} /> {cfg.label}
    </span>
  );
}

export default function FranchiseManagement() {
  const navigate = useNavigate();
  const [applications, setApplications] = useState([]);
  const [stats, setStats] = useState({ total: 0, pending: 0, under_review: 0, approved: 0, rejected: 0 });
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const LIMIT = 20;

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

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDelete = async (id, e) => {
    e.stopPropagation();
    if (!window.confirm('Delete this application?')) return;
    await adminAPI.deleteFranchiseApplication(id);
    fetchData();
  };

  const totalPages = Math.ceil(total / LIMIT);

  return (
    <div style={{ padding: '24px', fontFamily: "'Inter', sans-serif", color: 'white', minHeight: '100vh' }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28, flexWrap: 'wrap', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
          <div style={{ width: 44, height: 44, borderRadius: 14, background: 'linear-gradient(135deg, rgba(49,92,255,0.2), rgba(104,66,245,0.2))', border: '1px solid rgba(49,92,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Building2 size={22} style={{ color: '#6895FF' }} />
          </div>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0, color: 'white' }}>Franchise Applications</h1>
            <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>{total} total applications</p>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={() => navigate('/admin/food/franchise-management/form-config')}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <Settings size={15} /> Form Config
          </button>
          <button onClick={fetchData}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 10, background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
            <RefreshCw size={15} /> Refresh
          </button>
        </div>
      </div>

      {/* Stats Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 14, marginBottom: 24 }}>
        {[
          { key: 'all', label: 'Total', val: stats.total, color: '#6895FF' },
          { key: 'pending', label: 'Pending', val: stats.pending, color: '#FFC400' },
          { key: 'under_review', label: 'In Review', val: stats.under_review, color: '#60a5fa' },
          { key: 'approved', label: 'Approved', val: stats.approved, color: '#34d399' },
          { key: 'rejected', label: 'Rejected', val: stats.rejected, color: '#f87171' },
        ].map(s => (
          <button key={s.key} onClick={() => { setStatusFilter(s.key); setPage(1); }}
            style={{
              padding: '16px', borderRadius: 14, cursor: 'pointer', textAlign: 'left', transition: 'all 0.2s',
              background: statusFilter === s.key ? `rgba(${s.color === '#FFC400' ? '255,196,0' : s.color === '#34d399' ? '52,211,153' : s.color === '#f87171' ? '248,113,113' : s.color === '#60a5fa' ? '96,165,250' : '104,133,255'},0.12)` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${statusFilter === s.key ? `${s.color}40` : 'rgba(255,255,255,0.08)'}`,
            }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: statusFilter === s.key ? s.color : 'white' }}>{s.val}</div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', marginTop: 4, fontWeight: 600 }}>{s.label}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div style={{ position: 'relative', marginBottom: 20 }}>
        <Search size={16} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'rgba(255,255,255,0.35)' }} />
        <input
          type="text"
          placeholder="Search by name, phone, email, city or application ID..."
          value={search}
          onChange={e => { setSearch(e.target.value); setPage(1); }}
          style={{
            width: '100%', padding: '11px 16px 11px 42px', borderRadius: 12,
            background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
            color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box',
          }}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 16, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12, color: 'rgba(255,255,255,0.4)' }}>
            <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#6895FF' }} />
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            Loading applications...
          </div>
        ) : applications.length === 0 ? (
          <div style={{ textAlign: 'center', padding: 60 }}>
            <Building2 size={40} style={{ color: 'rgba(255,255,255,0.15)', marginBottom: 12 }} />
            <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: 14 }}>No applications found</p>
          </div>
        ) : (
          <>
            {/* Table Header */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr 0.8fr 1fr 100px', gap: 12, padding: '12px 20px', borderBottom: '1px solid rgba(255,255,255,0.08)', fontSize: 11, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
              <div>Applicant</div>
              <div>Contact</div>
              <div>Location</div>
              <div>Applied</div>
              <div>Status</div>
              <div>Actions</div>
            </div>

            {/* Table Rows */}
            {applications.map(app => (
              <div
                key={app._id}
                onClick={() => navigate(`/admin/food/franchise-management/${app._id}`)}
                style={{
                  display: 'grid', gridTemplateColumns: '1fr 1fr 0.8fr 0.8fr 1fr 100px', gap: 12,
                  padding: '16px 20px', borderBottom: '1px solid rgba(255,255,255,0.05)',
                  cursor: 'pointer', transition: 'background 0.15s',
                  ':hover': { background: 'rgba(255,255,255,0.03)' },
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.04)'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'white', marginBottom: 2 }}>{app.applicantName}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{app.applicationId}</div>
                  {app.companyName && <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 1 }}>{app.companyName}</div>}
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 3 }}>
                    <Phone size={11} /> {app.phone}
                  </div>
                  {app.email && <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                    <Mail size={10} /> {app.email}
                  </div>}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                  <MapPin size={12} style={{ color: '#6895FF', flexShrink: 0 }} />
                  <span>{app.city}{app.state ? `, ${app.state}` : ''}</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
                  <Calendar size={11} />
                  {new Date(app.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                </div>
                <div><StatusBadge status={app.status} /></div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <button onClick={e => { e.stopPropagation(); navigate(`/admin/food/franchise-management/${app._id}`); }}
                    style={{ padding: '6px', borderRadius: 8, background: 'rgba(104,149,255,0.15)', border: '1px solid rgba(104,149,255,0.25)', color: '#6895FF', cursor: 'pointer' }}>
                    <Eye size={14} />
                  </button>
                  <button onClick={e => handleDelete(app._id, e)}
                    style={{ padding: '6px', borderRadius: 8, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', cursor: 'pointer' }}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 20 }}>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map(p => (
            <button key={p} onClick={() => setPage(p)}
              style={{
                width: 36, height: 36, borderRadius: 8, border: `1px solid ${p === page ? 'rgba(104,149,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
                background: p === page ? 'rgba(104,149,255,0.2)' : 'transparent',
                color: p === page ? '#6895FF' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 600, cursor: 'pointer',
              }}>{p}</button>
          ))}
        </div>
      )}
    </div>
  );
}
