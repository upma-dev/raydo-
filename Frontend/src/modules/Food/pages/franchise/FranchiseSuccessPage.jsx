import React, { useEffect, useState, useCallback } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckCircle2, Home, Building2, Sparkles, RefreshCw, Loader2, CreditCard, LogIn, XCircle, Search } from "lucide-react";
import { franchiseAPI } from "@food/api";

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const planTitle = (modules = ['food']) =>
  modules.length === 2 ? 'Food + Taxi (Combined)' : modules[0] === 'taxi' ? 'Taxi Franchise' : 'Food Delivery Franchise';

/** Turns the server status into the 5-step progress the applicant sees. */
function buildSteps(st) {
  const rejected = st?.status === 'rejected';
  const approved = st?.status === 'approved';
  const paid = st?.franchiseFeeStatus === 'paid' || st?.franchiseFeeStatus === 'waived';
  const refund = st?.franchiseFeeStatus === 'refund_due' || st?.franchiseFeeStatus === 'refunded';
  return [
    { label: 'Application submitted', done: true },
    { label: `Franchise fee${st ? ` (${inr(st.franchiseFee)})` : ''}`, done: paid, active: !paid && !rejected && !refund, note: paid ? '' : 'Pay now - you do not need to wait for approval' },
    { label: 'Admin review', done: approved || rejected, active: !approved && !rejected, note: 'Usually within 48 hours' },
    rejected
      ? { label: refund ? (st.franchiseFeeStatus === 'refunded' ? 'Rejected - fee refunded' : 'Rejected - fee refund in progress') : 'Application rejected', done: false, failed: true }
      : { label: 'Approved', done: approved },
    { label: 'Franchise login active', done: paid && approved && st?.hasLogin, note: paid && !approved ? 'Activated when approved' : '' },
  ];
}

export default function FranchiseSuccessPage() {
  const navigate = useNavigate();
  const { state } = useLocation();

  const [applicationId, setApplicationId] = useState(state?.applicationId || '');
  const [phone, setPhone] = useState(state?.phone || '');
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const justSubmitted = Boolean(state?.applicationId);

  const load = useCallback(async (id, ph, silent = false) => {
    if (!id || !ph) return;
    if (!silent) setLoading(true);
    setError('');
    try {
      const res = await franchiseAPI.getApplicationStatus(id.trim(), ph.trim());
      setStatus(res?.data?.data || null);
    } catch (err) {
      setStatus(null);
      setError(err?.response?.status === 404 ? 'No application found with this ID and phone number.' : 'Could not load status. Please try again.');
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  // Load right away when coming from the form; keep refreshing while waiting for admin / payment
  useEffect(() => {
    if (justSubmitted) load(state.applicationId, state.phone);
  }, []);
  useEffect(() => {
    if (!status) return undefined;
    const waiting = status.status !== 'rejected' && !(status.franchiseFeeStatus !== 'pending' && status.hasLogin);
    if (!waiting) return undefined;
    const t = setInterval(() => load(applicationId, phone, true), 30000);
    return () => clearInterval(t);
  }, [status, applicationId, phone, load]);

  const steps = buildSteps(status);
  const paid = status?.franchiseFeeStatus === 'paid' || status?.franchiseFeeStatus === 'waived';
  const canPay = status && !paid && status.franchiseFeeStatus === 'pending' && status.status !== 'rejected';
  const rejected = status?.status === 'rejected';

  const card = { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 20, padding: 24, backdropFilter: 'blur(12px)' };
  const btn = { width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 14, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 };

  return (
    <div className="min-h-screen bg-[#070A1F] flex flex-col items-center justify-center text-white p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
        @keyframes fadeUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        @keyframes spin { to { transform: rotate(360deg); } }
        .frn-input { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: white; border-radius: 12px; padding: 12px 16px; width: 100%; font-size: 14px; outline: none; }
        .frn-input:focus { border-color: rgba(99,66,245,0.6); }
      `}</style>

      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(49,92,255,0.12), transparent 70%)' }} />
      </div>

      <div style={{ maxWidth: 500, width: '100%', textAlign: 'center', position: 'relative' }}>

        {/* Header */}
        {justSubmitted && !rejected ? (
          <>
            <div style={{ position: 'relative', display: 'inline-block', marginBottom: 20 }}>
              <div style={{ width: 88, height: 88, borderRadius: '50%', margin: '0 auto', background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(16,185,129,0.15))', border: '2px solid rgba(52,211,153,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', animation: 'scaleIn 0.5s ease-out' }}>
                <CheckCircle2 size={44} style={{ color: '#34d399' }} />
              </div>
              <div style={{ position: 'absolute', top: -4, right: -4, width: 26, height: 26, borderRadius: '50%', background: 'linear-gradient(135deg, #315CFF, #6842F5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={13} style={{ color: 'white' }} />
              </div>
            </div>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 8px' }}>Application Received! 🎉</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 24px', lineHeight: 1.6 }}>
              Your application is saved. Pay the franchise fee below (if you have not already) so we can approve you faster.
            </p>
          </>
        ) : (
          <>
            <h1 style={{ fontSize: 26, fontWeight: 900, margin: '0 0 8px' }}>Track Your Application</h1>
            <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 24px' }}>
              See your review status and pay your franchise fee.
            </p>
          </>
        )}

        {/* Lookup (when opened directly) */}
        {!status && !loading && (
          <form
            onSubmit={(e) => { e.preventDefault(); load(applicationId, phone); }}
            style={{ ...card, textAlign: 'left', display: 'grid', gap: 12, marginBottom: 16 }}
          >
            <input className="frn-input" placeholder="Application ID (e.g. FRN-2026-0001)" value={applicationId} onChange={e => setApplicationId(e.target.value)} />
            <input className="frn-input" placeholder="Registered mobile number" inputMode="numeric" maxLength={10} value={phone} onChange={e => setPhone(e.target.value.replace(/\D/g, ''))} />
            {error && <div style={{ fontSize: 12, color: '#f87171' }}>{error}</div>}
            <button type="submit" disabled={!applicationId || !phone} style={{ ...btn, background: 'linear-gradient(135deg, #315CFF, #6842F5)', color: 'white', opacity: (!applicationId || !phone) ? 0.5 : 1 }}>
              <Search size={16} /> Check Status
            </button>
          </form>
        )}

        {loading && (
          <div style={{ ...card, display: 'flex', justifyContent: 'center', gap: 10, alignItems: 'center', marginBottom: 16 }}>
            <Loader2 size={18} style={{ animation: 'spin 1s linear infinite', color: '#6895FF' }} />
            <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }}>Loading status...</span>
          </div>
        )}

        {/* Status card */}
        {status && (
          <div style={{ ...card, textAlign: 'left', marginBottom: 20, animation: 'fadeUp 0.4s ease-out both' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginBottom: 6 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(49,92,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 size={18} style={{ color: '#6895FF' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>Application ID</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#6895FF', letterSpacing: '0.05em' }}>{status.applicationId}</span>
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '0 0 18px 46px' }}>
              {planTitle(status.selectedModules)} - {inr(status.franchiseFee)}
            </div>

            {steps.map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: i < steps.length - 1 ? 14 : 0 }}>
                <div style={{
                  width: 22, height: 22, borderRadius: '50%', flexShrink: 0, marginTop: 1,
                  background: step.failed ? '#ef4444' : step.done ? 'linear-gradient(135deg, #34d399, #10b981)' : step.active ? 'rgba(255,196,0,0.2)' : 'rgba(255,255,255,0.1)',
                  border: step.active ? '2px solid #FFC400' : step.done || step.failed ? 'none' : '1px solid rgba(255,255,255,0.15)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {step.failed ? <XCircle size={13} style={{ color: 'white' }} /> : step.done ? <CheckCircle2 size={13} style={{ color: 'white' }} /> : null}
                </div>
                <div>
                  <div style={{ fontSize: 13, color: step.done || step.active || step.failed ? 'white' : 'rgba(255,255,255,0.4)', fontWeight: step.done || step.active ? 700 : 500 }}>
                    {step.label}
                  </div>
                  {step.note && !step.done && <div style={{ fontSize: 11, color: step.active ? '#FFC400' : 'rgba(255,255,255,0.35)', marginTop: 2 }}>{step.note}</div>}
                </div>
              </div>
            ))}

            {rejected && status.adminNote && (
              <div style={{ marginTop: 16, padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 12, color: '#fca5a5' }}>
                Reason: {status.adminNote}
              </div>
            )}

            <button
              type="button"
              onClick={() => load(applicationId, phone)}
              style={{ marginTop: 16, background: 'none', border: 'none', color: '#6895FF', fontSize: 12, fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <RefreshCw size={12} /> Refresh status
            </button>
          </div>
        )}

        {/* Actions depend on where the application is */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {canPay && (
            <button
              onClick={() => navigate(`/food/franchise/partner-dashboard?appId=${status.applicationId}&phone=${phone}`)}
              style={{ ...btn, background: 'linear-gradient(135deg, #FFC400, #E69500)', color: '#111827' }}
            >
              <CreditCard size={16} /> Pay Franchise Fee {inr(status.franchiseFee)}
            </button>
          )}
          {paid && status?.status === 'approved' && (
            <button onClick={() => navigate('/food/franchise/login')} style={{ ...btn, background: 'linear-gradient(135deg, #34d399, #10b981)', color: '#052e1c' }}>
              <LogIn size={16} /> Login to Franchise Panel
            </button>
          )}
          {status && paid && status.status !== 'approved' && !rejected && (
            <p style={{ fontSize: 12, color: '#34d399', margin: 0, lineHeight: 1.5 }}>
              Payment received. Your login will be activated as soon as our team approves your application.
            </p>
          )}
          {status && !canPay && !paid && !rejected && (
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: 0, lineHeight: 1.5 }}>
              Your application is being reviewed. This page updates automatically. We will also contact you on <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{phone}</strong>.
            </p>
          )}
          <button onClick={() => navigate('/')} style={{ ...btn, background: 'rgba(255,255,255,0.06)', color: 'white', border: '1px solid rgba(255,255,255,0.12)', fontWeight: 700 }}>
            <Home size={16} /> Go to Home
          </button>
          {justSubmitted && (
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
              Save your Application ID <strong style={{ color: 'rgba(255,255,255,0.6)' }}>{state.applicationId}</strong> - you need it with your phone number to track status or pay later.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
