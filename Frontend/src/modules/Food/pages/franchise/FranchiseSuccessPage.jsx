import React from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { CheckCircle2, ArrowRight, Home, Search, Building2, Sparkles } from "lucide-react";

export default function FranchiseSuccessPage() {
  const navigate = useNavigate();
  const { state } = useLocation();
  const applicationId = state?.applicationId || 'FRN-XXXX';

  return (
    <div className="min-h-screen bg-[#070A1F] flex flex-col items-center justify-center text-white p-6" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');`}</style>

      {/* Ambient */}
      <div style={{ position: 'fixed', inset: 0, pointerEvents: 'none', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: '20%', left: '50%', transform: 'translateX(-50%)', width: 600, height: 600, borderRadius: '50%', background: 'radial-gradient(ellipse, rgba(49,92,255,0.12), transparent 70%)' }} />
      </div>

      <div style={{ maxWidth: 480, width: '100%', textAlign: 'center', position: 'relative' }}>

        {/* Success Icon */}
        <div style={{ position: 'relative', display: 'inline-block', marginBottom: 24 }}>
          <div style={{
            width: 96, height: 96, borderRadius: '50%', margin: '0 auto',
            background: 'linear-gradient(135deg, rgba(52,211,153,0.2), rgba(16,185,129,0.15))',
            border: '2px solid rgba(52,211,153,0.3)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            animation: 'scaleIn 0.5s ease-out',
          }}>
            <CheckCircle2 size={48} style={{ color: '#34d399' }} />
          </div>
          <div style={{ position: 'absolute', top: -4, right: -4, width: 28, height: 28, borderRadius: '50%', background: 'linear-gradient(135deg, #315CFF, #6842F5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Sparkles size={14} style={{ color: 'white' }} />
          </div>
        </div>

        <style>{`
          @keyframes scaleIn { from { transform: scale(0.5); opacity: 0; } to { transform: scale(1); opacity: 1; } }
          @keyframes fadeUp { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        `}</style>

        <div style={{ animation: 'fadeUp 0.5s 0.2s ease-out both' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 100, padding: '6px 16px', marginBottom: 16 }}>
            <CheckCircle2 size={12} style={{ color: '#34d399' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399', letterSpacing: '0.06em' }}>APPLICATION SUBMITTED</span>
          </div>

          <h1 style={{ fontSize: 28, fontWeight: 900, margin: '0 0 10px', color: 'white' }}>
            Application Received! 🎉
          </h1>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: '0 0 32px', lineHeight: 1.6 }}>
            Your franchise application has been submitted successfully. Our team will review it within 48 hours.
          </p>

          {/* Application ID Card */}
          <div style={{
            background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)',
            borderRadius: 20, padding: 24, marginBottom: 32, backdropFilter: 'blur(12px)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(49,92,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Building2 size={18} style={{ color: '#6895FF' }} />
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.6)' }}>Application ID</span>
              </div>
              <span style={{ fontSize: 14, fontWeight: 800, color: '#6895FF', letterSpacing: '0.05em' }}>{applicationId}</span>
            </div>

            {/* Status Timeline */}
            {[
              { label: 'Application Submitted', done: true },
              { label: 'Under Review (1-2 days)', done: false },
              { label: 'Decision & Onboarding', done: false },
            ].map((step, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: i < 2 ? 12 : 0 }}>
                <div style={{
                  width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                  background: step.done ? 'linear-gradient(135deg, #34d399, #10b981)' : 'rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  border: step.done ? 'none' : '1px solid rgba(255,255,255,0.15)',
                }}>
                  {step.done && <CheckCircle2 size={12} style={{ color: 'white' }} />}
                </div>
                <span style={{ fontSize: 13, color: step.done ? 'white' : 'rgba(255,255,255,0.4)', fontWeight: step.done ? 600 : 400 }}>
                  {step.label}
                </span>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <button
              onClick={() => navigate(`/food/franchise/partner-dashboard?appId=${applicationId}&phone=${state?.phone || ''}`)}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, fontWeight: 800, fontSize: 14,
                background: 'linear-gradient(135deg, #FFC400, #E69500)', color: '#111827',
                border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Building2 size={16} /> Open Franchise Partner Dashboard
            </button>
            <button
              onClick={() => navigate('/')}
              style={{
                width: '100%', padding: '14px', borderRadius: 14, fontWeight: 700, fontSize: 14,
                background: 'rgba(255,255,255,0.06)', color: 'white',
                border: '1px solid rgba(255,255,255,0.12)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Home size={16} /> Go to Home
            </button>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.35)', margin: 0 }}>
              We'll reach out to <strong style={{ color: 'rgba(255,255,255,0.6)' }}>{state?.phone || 'your number'}</strong> within 48 hours
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
