import React, { useState, useEffect } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import { franchiseAPI } from "@food/api";
import {
  Building2, MapPin, Phone, Mail, Award, TrendingUp, DollarSign,
  ShoppingBag, Store, CheckCircle2, ShieldCheck, Lock, Search, Loader2, ArrowRight
} from "lucide-react";

export default function FranchisePartnerDashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [appIdInput, setAppIdInput] = useState(searchParams.get('appId') || '');
  const [phoneInput, setPhoneInput] = useState(searchParams.get('phone') || '');

  const [dashboardData, setDashboardData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const fetchDashboard = async (appId, phone) => {
    if (!appId || !phone) return;
    setLoading(true);
    setError(null);
    try {
      const res = await franchiseAPI.getPartnerDashboard(appId, phone);
      if (res?.data?.data) {
        setDashboardData(res.data.data);
      } else {
        setError('No franchise found with provided Application ID and Phone number');
      }
    } catch (err) {
      setError(err?.response?.data?.message || 'Invalid credentials or franchise not found');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const appId = searchParams.get('appId');
    const phone = searchParams.get('phone');
    if (appId && phone) {
      fetchDashboard(appId, phone);
    }
  }, [searchParams]);

  const handleLoginSubmit = (e) => {
    e.preventDefault();
    if (!appIdInput.trim() || !phoneInput.trim()) {
      setError('Please enter both Application ID and Phone number');
      return;
    }
    setSearchParams({ appId: appIdInput.trim(), phone: phoneInput.trim() });
    fetchDashboard(appIdInput.trim(), phoneInput.trim());
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'linear-gradient(180deg, #090B10 0%, #0D1117 100%)',
      fontFamily: "'Inter', sans-serif",
      color: 'white',
      padding: '30px 20px',
    }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>

      {/* Header Container */}
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Top Branding */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 44, height: 44, borderRadius: 14,
              background: 'linear-gradient(135deg, #FFC400, #E69500)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontWeight: 900, color: '#111827', fontSize: 20
            }}>
              R
            </div>
            <div>
              <h1 style={{ fontSize: 20, fontWeight: 900, margin: 0, letterSpacing: '-0.02em', color: 'white' }}>
                Raydo <span style={{ color: '#FFC400' }}>Franchise Partner Hub</span>
              </h1>
              <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
                Territory Performance & Business Earnings Portal
              </p>
            </div>
          </div>

          <button onClick={() => navigate('/food/franchise/apply')}
            style={{
              padding: '8px 16px', borderRadius: 10,
              background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)', fontSize: 12, fontWeight: 700, cursor: 'pointer',
            }}>
            Franchise Apply Page
          </button>
        </div>

        {/* If Not Logged In / Access Form */}
        {!dashboardData ? (
          <div style={{ maxWidth: 480, margin: '60px auto 0', textCenter: 'center' }}>
            <div style={{
              background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 24, padding: 32, backdropFilter: 'blur(20px)'
            }}>
              <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(255,196,0,0.12)', border: '1px solid rgba(255,196,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
                <ShieldCheck size={28} style={{ color: '#FFC400' }} />
              </div>

              <h2 style={{ fontSize: 20, fontWeight: 800, textAlign: 'center', margin: '0 0 8px' }}>Access Franchise Dashboard</h2>
              <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', textAlign: 'center', margin: '0 0 24px', lineHeight: 1.5 }}>
                Enter your Application ID (e.g. FRN-2024-0001) and registered Phone Number to view your territory performance.
              </p>

              {error && (
                <div style={{ padding: '12px 14px', borderRadius: 12, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.25)', color: '#f87171', fontSize: 13, marginBottom: 20 }}>
                  {error}
                </div>
              )}

              <form onSubmit={handleLoginSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Application ID</label>
                  <input
                    type="text"
                    placeholder="e.g. FRN-2024-0001"
                    value={appIdInput}
                    onChange={e => setAppIdInput(e.target.value)}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <div>
                  <label style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', display: 'block', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Registered Phone Number</label>
                  <input
                    type="text"
                    placeholder="e.g. 9876543210"
                    value={phoneInput}
                    onChange={e => setPhoneInput(e.target.value)}
                    style={{ width: '100%', padding: '12px 16px', borderRadius: 12, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.12)', color: 'white', fontSize: 14, outline: 'none', boxSizing: 'border-box' }}
                  />
                </div>

                <button type="submit" disabled={loading}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 12, marginTop: 8,
                    background: 'linear-gradient(135deg, #FFC400, #E69500)', border: 'none',
                    color: '#111827', fontSize: 14, fontWeight: 800, cursor: loading ? 'wait' : 'pointer',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                  }}>
                  {loading ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <ArrowRight size={18} />}
                  {loading ? 'Verifying Credentials...' : 'Open Partner Dashboard'}
                </button>
              </form>
            </div>
          </div>
        ) : (
          /* Dashboard Content */
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

            {/* Privacy & Boundary Notice */}
            <div style={{
              padding: '12px 18px', borderRadius: 14,
              background: 'rgba(104,149,255,0.08)', border: '1px solid rgba(104,149,255,0.2)',
              display: 'flex', alignItems: 'center', gap: 12, fontSize: 13, color: '#93c5fd'
            }}>
              <Lock size={16} style={{ flexShrink: 0 }} />
              <span>
                <strong>Franchise Partner Mode:</strong> You are viewing aggregated performance metrics for territory <strong>{dashboardData.territoryInfo.city}, {dashboardData.territoryInfo.state}</strong>. Platform system configurations are managed by Admin.
              </span>
            </div>

            {/* Partner Info Banner */}
            <div style={{
              background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
              borderRadius: 22, padding: 24, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 16
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 56, height: 56, borderRadius: 18, background: 'rgba(255,196,0,0.15)', border: '1px solid rgba(255,196,0,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 size={26} style={{ color: '#FFC400' }} />
                </div>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <h2 style={{ fontSize: 22, fontWeight: 900, margin: 0, color: 'white' }}>{dashboardData.partnerInfo.applicantName}</h2>
                    <span style={{ padding: '3px 10px', borderRadius: 20, background: 'rgba(52,211,153,0.15)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', fontSize: 11, fontWeight: 800, textTransform: 'uppercase' }}>
                      {dashboardData.partnerInfo.status} Partner
                    </span>
                  </div>
                  <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: '4px 0 0' }}>
                    Application ID: <strong style={{ color: '#FFC400' }}>{dashboardData.partnerInfo.applicationId}</strong> {dashboardData.partnerInfo.companyName ? `• ${dashboardData.partnerInfo.companyName}` : ''}
                  </p>
                </div>
              </div>

              <button onClick={() => { setDashboardData(null); setSearchParams({}); }}
                style={{ padding: '8px 14px', borderRadius: 10, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)', fontSize: 12, cursor: 'pointer' }}>
                Logout Partner
              </button>
            </div>

            {/* Metric Cards Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                  <ShoppingBag size={14} style={{ color: '#6895FF' }} /> Total Territory Orders
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: 'white' }}>
                  {dashboardData.territoryMetrics.totalOrders}
                </div>
                <div style={{ fontSize: 12, color: '#34d399', marginTop: 4, fontWeight: 600 }}>
                  {dashboardData.territoryMetrics.deliveredOrders} Delivered Successfully
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                  <TrendingUp size={14} style={{ color: '#FFC400' }} /> Total Territory Sales (GMV)
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#FFC400' }}>
                  ₹{(dashboardData.territoryMetrics.totalGMV || 0).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                  Gross Order Volume
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(52,211,153,0.3)', borderRadius: 18, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: '#34d399', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                  <DollarSign size={14} /> Earned Commission Share
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#34d399' }}>
                  ₹{(dashboardData.territoryMetrics.franchiseEarnings || 0).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 12, color: '#34d399', marginTop: 4, fontWeight: 600 }}>
                  ({dashboardData.financialSettings.commissionRate}% Commission Rate)
                </div>
              </div>

              <div style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 18, padding: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'rgba(255,255,255,0.5)', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', marginBottom: 10 }}>
                  <Store size={14} style={{ color: '#6895FF' }} /> Active Outlets in Area
                </div>
                <div style={{ fontSize: 28, fontWeight: 900, color: '#6895FF' }}>
                  {dashboardData.territoryMetrics.activeOutletsCount}
                </div>
                <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>
                  Operating Outlets
                </div>
              </div>
            </div>

            {/* Territory Scope & Financial Terms Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>

              {/* Territory Details */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <MapPin size={15} style={{ color: '#FFC400' }} /> Allocated Territory Scope
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>State</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginTop: 3 }}>{dashboardData.territoryInfo.state}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>City Hub</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginTop: 3 }}>{dashboardData.territoryInfo.city}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>Area / Zone</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginTop: 3 }}>{dashboardData.territoryInfo.area || 'Citywide'}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>Pincode Coverage</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#FFC400', marginTop: 3 }}>{dashboardData.territoryInfo.pincode || 'All Pincodes'}</div>
                  </div>
                </div>
              </div>

              {/* Financial Terms */}
              <div style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24 }}>
                <h3 style={{ fontSize: 14, fontWeight: 800, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Award size={15} style={{ color: '#34d399' }} /> Payout & Commission Terms
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>Commission Share</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: '#34d399', marginTop: 3 }}>{dashboardData.financialSettings.commissionRate}%</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>Payout Schedule</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginTop: 3, textTransform: 'capitalize' }}>{dashboardData.financialSettings.payoutCycle}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>Min Payout Threshold</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'white', marginTop: 3 }}>₹{dashboardData.financialSettings.minPayoutThreshold}</div>
                  </div>
                  <div>
                    <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase' }}>Payout Account</div>
                    <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginTop: 3 }}>
                      {dashboardData.financialSettings.paymentAccountInfo?.bankName || 'Bank Configured'}
                    </div>
                  </div>
                </div>
              </div>

            </div>

          </div>
        )}

      </div>
    </div>
  );
}
