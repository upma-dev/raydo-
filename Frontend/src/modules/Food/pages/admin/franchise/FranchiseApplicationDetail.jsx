import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { adminAPI } from "@food/api";
import {
  ArrowLeft, Building2, Phone, Mail, MapPin, FileText, Calendar, User,
  CheckCircle2, Clock, XCircle, AlertCircle, Loader2, ExternalLink, Save,
  DollarSign, Percent, CreditCard, ShoppingBag, TrendingUp, Store, RefreshCw
} from "lucide-react";

const STATUS_OPTIONS = [
  { value: 'pending', label: 'Pending', color: '#FFC400' },
  { value: 'under_review', label: 'Under Review', color: '#60a5fa' },
  { value: 'approved', label: 'Approved', color: '#34d399' },
  { value: 'rejected', label: 'Rejected', color: '#f87171' },
];

const GMAPS_KEY = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

export default function FranchiseApplicationDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [analytics, setAnalytics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [adminNote, setAdminNote] = useState('');
  const [savingStatus, setSavingStatus] = useState(false);
  const [statusSaved, setStatusSaved] = useState(false);

  // Commission Settings state
  const [commissionRate, setCommissionRate] = useState(10);
  const [royaltyFeeRate, setRoyaltyFeeRate] = useState(2);
  const [payoutCycle, setPayoutCycle] = useState('weekly');
  const [minPayoutThreshold, setMinPayoutThreshold] = useState(5000);
  const [paymentAccountInfo, setPaymentAccountInfo] = useState({
    bankName: '',
    accountNumber: '',
    ifscCode: '',
    upiId: '',
    accountHolderName: ''
  });
  const [savingCommission, setSavingCommission] = useState(false);
  const [commissionSaved, setCommissionSaved] = useState(false);

  const fetchApplicationDetails = async () => {
    try {
      const res = await adminAPI.getFranchiseApplicationById(id);
      if (res?.data?.data) {
        const data = res.data.data;
        setApp(data);
        setStatus(data.status || 'pending');
        setAdminNote(data.adminNote || '');
        setCommissionRate(data.commissionRate ?? 10);
        setRoyaltyFeeRate(data.royaltyFeeRate ?? 2);
        setPayoutCycle(data.payoutCycle || 'weekly');
        setMinPayoutThreshold(data.minPayoutThreshold ?? 5000);
        if (data.paymentAccountInfo) {
          setPaymentAccountInfo({
            bankName: data.paymentAccountInfo.bankName || '',
            accountNumber: data.paymentAccountInfo.accountNumber || '',
            ifscCode: data.paymentAccountInfo.ifscCode || '',
            upiId: data.paymentAccountInfo.upiId || '',
            accountHolderName: data.paymentAccountInfo.accountHolderName || ''
          });
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    setAnalyticsLoading(true);
    try {
      const res = await adminAPI.getFranchiseAnalytics(id);
      if (res?.data?.data) {
        setAnalytics(res.data.data.analytics);
      }
    } catch (err) {
      console.error('Analytics fetch error:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  };

  useEffect(() => {
    fetchApplicationDetails();
    fetchAnalytics();
  }, [id]);

  const handleSaveStatus = async () => {
    setSavingStatus(true);
    try {
      await adminAPI.updateFranchiseApplicationStatus(id, { status, adminNote });
      setStatusSaved(true);
      setTimeout(() => setStatusSaved(false), 2000);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingStatus(false);
    }
  };

  const handleSaveCommission = async () => {
    setSavingCommission(true);
    try {
      await adminAPI.updateFranchiseCommission(id, {
        commissionRate,
        royaltyFeeRate,
        payoutCycle,
        minPayoutThreshold,
        paymentAccountInfo
      });
      setCommissionSaved(true);
      setTimeout(() => setCommissionSaved(false), 2000);
      fetchAnalytics();
    } catch (err) {
      console.error(err);
    } finally {
      setSavingCommission(false);
    }
  };

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '60vh', gap: 12, color: 'rgba(255,255,255,0.4)' }}>
      <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#6895FF' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      Loading application...
    </div>
  );

  if (!app) return (
    <div style={{ textAlign: 'center', padding: 60, color: 'rgba(255,255,255,0.4)' }}>Application not found</div>
  );

  const isImage = (url) => url && /\.(jpg|jpeg|png|gif|webp)$/i.test(url);

  return (
    <div style={{ padding: '24px', fontFamily: "'Inter', sans-serif", color: 'white', maxWidth: 1100 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      {/* Back button */}
      <button onClick={() => navigate('/admin/food/franchise-management')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
        <ArrowLeft size={15} /> Back to Franchise List
      </button>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: 24, alignItems: 'start' }}>

        {/* Main Content */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Header Card */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 52, height: 52, borderRadius: 16, background: 'rgba(49,92,255,0.2)', border: '1px solid rgba(49,92,255,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <User size={24} style={{ color: '#6895FF' }} />
                </div>
                <div>
                  <h2 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: 'white' }}>{app.applicantName}</h2>
                  <span style={{ fontSize: 12, color: '#6895FF', fontWeight: 700 }}>{app.applicationId}</span>
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)' }}>
                Applied: {new Date(app.createdAt).toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' })}
              </span>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Phone size={14} style={{ color: '#6895FF' }} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{app.phone}</span>
              </div>
              {app.email && <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Mail size={14} style={{ color: '#6895FF' }} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{app.email}</span>
              </div>}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <MapPin size={14} style={{ color: '#6895FF' }} />
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.7)' }}>{app.city}, {app.state}</span>
              </div>
            </div>
          </div>

          {/* Franchise Territory Order Analytics (Super Admin View) */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(104,149,255,0.25)', borderRadius: 20, padding: 24 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
              <h3 style={{ fontSize: 15, fontWeight: 800, color: '#6895FF', margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <TrendingUp size={16} /> Franchise Territory Food Business Analytics
              </h3>
              <button onClick={fetchAnalytics} disabled={analyticsLoading}
                style={{ padding: '6px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', fontSize: 12, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
                <RefreshCw size={12} className={analyticsLoading ? 'animate-spin' : ''} /> Refresh Stats
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12, marginBottom: 20 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700 }}>Total Territory Orders</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: 'white', marginTop: 4 }}>{analytics?.totalOrders || 0}</div>
                <div style={{ fontSize: 11, color: '#34d399', marginTop: 2 }}>{analytics?.deliveredCount || 0} Delivered</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700 }}>Territory GMV</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#FFC400', marginTop: 4 }}>₹{(analytics?.totalGMV || 0).toLocaleString('en-IN')}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Gross Sales Volume</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700 }}>Franchise Commission</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#34d399', marginTop: 4 }}>₹{(analytics?.franchiseEarnings || 0).toLocaleString('en-IN')}</div>
                <div style={{ fontSize: 11, color: '#34d399', marginTop: 2 }}>({commissionRate}% Share)</div>
              </div>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 14, padding: 14 }}>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', fontWeight: 700 }}>Active Food Outlets</div>
                <div style={{ fontSize: 22, fontWeight: 900, color: '#6895FF', marginTop: 4 }}>{analytics?.activeOutletsCount || 0}</div>
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>in {app.city}</div>
              </div>
            </div>

            {/* Recent Orders in Territory */}
            {analytics?.recentOrders?.length > 0 && (
              <div>
                <h4 style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 10 }}>Recent Territory Orders</h4>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {analytics.recentOrders.map(o => (
                    <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 10, border: '1px solid rgba(255,255,255,0.05)', fontSize: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <ShoppingBag size={14} style={{ color: '#6895FF' }} />
                        <span style={{ fontWeight: 700, color: 'white' }}>{o.orderId}</span>
                        <span style={{ color: 'rgba(255,255,255,0.4)' }}>{o.customerName}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                        <span style={{ fontWeight: 700, color: '#FFC400' }}>₹{o.total}</span>
                        <span style={{ padding: '2px 8px', borderRadius: 10, background: 'rgba(52,211,153,0.15)', color: '#34d399', fontSize: 11, fontWeight: 700 }}>{o.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Payment & Commission Settings (Admin Control) */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,196,0,0.25)', borderRadius: 20, padding: 24 }}>
            <h3 style={{ fontSize: 15, fontWeight: 800, color: '#FFC400', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Percent size={16} /> Admin Commission & Payment Settings
            </h3>
            
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Franchise Commission Rate (%)</label>
                <input
                  type="number"
                  value={commissionRate}
                  onChange={e => setCommissionRate(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Royalty Fee Rate (%)</label>
                <input
                  type="number"
                  value={royaltyFeeRate}
                  onChange={e => setRoyaltyFeeRate(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Payout Cycle</label>
                <select
                  value={payoutCycle}
                  onChange={e => setPayoutCycle(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: '#1c1f26', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                >
                  <option value="weekly">Weekly (Every Monday)</option>
                  <option value="biweekly">Bi-weekly (1st & 15th)</option>
                  <option value="monthly">Monthly (1st of Month)</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6 }}>Min Payout Threshold (₹)</label>
                <input
                  type="number"
                  value={minPayoutThreshold}
                  onChange={e => setMinPayoutThreshold(e.target.value)}
                  style={{ width: '100%', padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}
                />
              </div>
            </div>

            {/* Bank Details */}
            <h4 style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>Franchise Bank Account Details</h4>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 18 }}>
              <input
                type="text"
                placeholder="Bank Name (e.g. HDFC Bank)"
                value={paymentAccountInfo.bankName}
                onChange={e => setPaymentAccountInfo({ ...paymentAccountInfo, bankName: e.target.value })}
                style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 13, outline: 'none' }}
              />
              <input
                type="text"
                placeholder="Account Number"
                value={paymentAccountInfo.accountNumber}
                onChange={e => setPaymentAccountInfo({ ...paymentAccountInfo, accountNumber: e.target.value })}
                style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 13, outline: 'none' }}
              />
              <input
                type="text"
                placeholder="IFSC Code"
                value={paymentAccountInfo.ifscCode}
                onChange={e => setPaymentAccountInfo({ ...paymentAccountInfo, ifscCode: e.target.value })}
                style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 13, outline: 'none' }}
              />
              <input
                type="text"
                placeholder="UPI ID (e.g. user@okhdfcbank)"
                value={paymentAccountInfo.upiId}
                onChange={e => setPaymentAccountInfo({ ...paymentAccountInfo, upiId: e.target.value })}
                style={{ padding: '10px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 13, outline: 'none' }}
              />
            </div>

            <button onClick={handleSaveCommission} disabled={savingCommission}
              style={{
                padding: '10px 20px', borderRadius: 10,
                background: commissionSaved ? 'rgba(52,211,153,0.2)' : 'linear-gradient(135deg, #FFC400, #E69500)',
                border: commissionSaved ? '1px solid rgba(52,211,153,0.4)' : 'none',
                color: commissionSaved ? '#34d399' : '#111827', fontSize: 13, fontWeight: 800,
                cursor: savingCommission ? 'wait' : 'pointer', transition: 'all 0.2s',
                display: 'inline-flex', alignItems: 'center', gap: 6,
              }}>
              {savingCommission ? <Loader2 size={14} className="animate-spin" /> : commissionSaved ? <CheckCircle2 size={14} /> : <Save size={14} />}
              {savingCommission ? 'Saving...' : commissionSaved ? 'Commission Saved!' : 'Save Commission & Payment Terms'}
            </button>
          </div>

          {/* Business Details */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <Building2 size={14} /> Business Information
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {[
                { label: 'Company Name', value: app.companyName },
                { label: 'Business Type', value: app.businessType },
                { label: 'Investment Range', value: app.investmentRange },
                { label: 'Experience', value: app.experience },
                ...(app.additionalFields ? Object.entries(app.additionalFields).map(([k, v]) => ({ label: k, value: v })) : []),
              ].filter(item => item.value).map(item => (
                <div key={item.label} style={{ padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.06)' }}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Location & Map */}
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <MapPin size={14} /> Location Details
            </h3>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: app.coordinates?.lat ? 16 : 0 }}>
              {[
                { label: 'State', value: app.state },
                { label: 'City', value: app.city },
                { label: 'Area', value: app.area },
                { label: 'Pincode', value: app.pincode },
              ].filter(i => i.value).map(item => (
                <div key={item.label}>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, marginBottom: 3, textTransform: 'uppercase' }}>{item.label}</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: 'white' }}>{item.value}</div>
                </div>
              ))}
            </div>
            {app.coordinates?.lat && GMAPS_KEY && (
              <div style={{ borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
                <iframe
                  title="franchise-location"
                  width="100%" height="200"
                  frameBorder="0" style={{ display: 'block' }}
                  src={`https://www.google.com/maps/embed/v1/view?key=${GMAPS_KEY}&center=${app.coordinates.lat},${app.coordinates.lng}&zoom=13&maptype=roadmap`}
                />
              </div>
            )}
          </div>

          {/* Documents */}
          {app.documents?.length > 0 && (
            <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 }}>
              <h3 style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <FileText size={14} /> Submitted Documents
              </h3>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 12 }}>
                {app.documents.map(doc => (
                  <a key={doc.key} href={doc.url} target="_blank" rel="noopener noreferrer"
                    style={{ textDecoration: 'none', display: 'block', borderRadius: 14, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.03)', transition: 'border-color 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'rgba(104,149,255,0.4)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'}
                  >
                    {isImage(doc.url) ? (
                      <img src={doc.url} alt={doc.label} style={{ width: '100%', height: 110, objectFit: 'cover' }} />
                    ) : (
                      <div style={{ height: 110, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(255,255,255,0.04)' }}>
                        <FileText size={32} style={{ color: '#6895FF' }} />
                      </div>
                    )}
                    <div style={{ padding: '8px 10px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>{doc.label}</span>
                      <ExternalLink size={11} style={{ color: 'rgba(255,255,255,0.35)' }} />
                    </div>
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Right Sidebar — Status Management */}
        <div style={{ position: 'sticky', top: 20 }}>
          <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 }}>
            <h3 style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 20px' }}>Review Application</h3>

            {/* Status Selector */}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Application Status</label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {STATUS_OPTIONS.map(opt => (
                  <button key={opt.value} onClick={() => setStatus(opt.value)}
                    style={{
                      padding: '10px 14px', borderRadius: 10, border: `1px solid ${status === opt.value ? opt.color + '50' : 'rgba(255,255,255,0.08)'}`,
                      background: status === opt.value ? `${opt.color}15` : 'rgba(255,255,255,0.03)',
                      color: status === opt.value ? opt.color : 'rgba(255,255,255,0.5)',
                      fontSize: 13, fontWeight: status === opt.value ? 700 : 500,
                      cursor: 'pointer', textAlign: 'left', transition: 'all 0.15s',
                      display: 'flex', alignItems: 'center', gap: 8,
                    }}>
                    <div style={{ width: 8, height: 8, borderRadius: '50%', background: opt.color, opacity: status === opt.value ? 1 : 0.4 }} />
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Admin Note */}
            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.45)', marginBottom: 8, display: 'block', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Admin Note</label>
              <textarea
                value={adminNote}
                onChange={e => setAdminNote(e.target.value)}
                rows={4}
                placeholder="Add a note for this applicant (will be visible to them)..."
                style={{
                  width: '100%', padding: '12px', borderRadius: 12, resize: 'vertical',
                  background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
                  color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box',
                  lineHeight: 1.5,
                }}
              />
            </div>

            {/* Save Button */}
            <button onClick={handleSaveStatus} disabled={savingStatus}
              style={{
                width: '100%', padding: '13px', borderRadius: 12,
                background: statusSaved ? 'rgba(52,211,153,0.2)' : 'linear-gradient(135deg, #315CFF, #6842F5)',
                border: statusSaved ? '1px solid rgba(52,211,153,0.4)' : 'none',
                color: statusSaved ? '#34d399' : 'white', fontSize: 14, fontWeight: 700,
                cursor: savingStatus ? 'wait' : 'pointer', transition: 'all 0.2s',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}>
              {savingStatus ? <Loader2 size={16} className="animate-spin" /> : statusSaved ? <CheckCircle2 size={16} /> : <Save size={16} />}
              {savingStatus ? 'Saving...' : statusSaved ? 'Saved!' : 'Save Application Status'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
