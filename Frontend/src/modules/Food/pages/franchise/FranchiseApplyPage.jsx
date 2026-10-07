import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, MapPin, FileText, CheckCircle2, ArrowRight, ArrowLeft, Loader2 } from "lucide-react";
import FranchiseStep1 from "./FranchiseStep1";
import FranchiseStep2 from "./FranchiseStep2";
import FranchiseStep3 from "./FranchiseStep3";
import { franchiseAPI } from "@food/api";

const STEPS = [
  { id: 1, label: "Business Info", icon: Building2, desc: "Tell us about you" },
  { id: 2, label: "Location", icon: MapPin, desc: "State, City & Area" },
  { id: 3, label: "Documents", icon: FileText, desc: "KYC & Proof" },
];

export default function FranchiseApplyPage() {
  const navigate = useNavigate();
  const [currentStep, setCurrentStep] = useState(1);
  const [formConfig, setFormConfig] = useState(null);
  const [loadingConfig, setLoadingConfig] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Collected form data across steps
  const [step1Data, setStep1Data] = useState({});
  const [step2Data, setStep2Data] = useState({});
  const [step3Data, setStep3Data] = useState({ documents: [] });

  useEffect(() => {
    franchiseAPI.getFormConfig()
      .then(res => {
        if (res?.data?.data) setFormConfig(res.data.data);
      })
      .catch(() => {})
      .finally(() => setLoadingConfig(false));
  }, []);

  const handleNext = (data) => {
    if (currentStep === 1) setStep1Data(data);
    if (currentStep === 2) setStep2Data(data);
    if (currentStep < 3) setCurrentStep(s => s + 1);
  };

  const handleBack = () => {
    if (currentStep > 1) setCurrentStep(s => s - 1);
    else navigate("/");
  };

  const handleSubmit = async (docs) => {
    setStep3Data({ documents: docs });
    setSubmitting(true);
    try {
      const payload = {
        ...step1Data,
        ...step2Data,
        documents: docs,
      };
      const res = await franchiseAPI.submitApplication(payload);
      const applicationId = res?.data?.data?.applicationId;
      navigate("/food/franchise/success", { state: { applicationId, phone: step1Data.phone } });
    } catch (err) {
      console.error("Submit error:", err);
      alert("Something went wrong. Please try again.");
    } finally {
      setSubmitting(false);
    }
  };

  const progress = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-[#070A1F] text-white" style={{ fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap');
        .glass-card { background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(16px); }
        .step-glow { box-shadow: 0 0 30px rgba(99,66,245,0.3); }
        .input-field { background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.12); color: white; border-radius: 12px; padding: 12px 16px; width: 100%; font-size: 14px; font-weight: 500; transition: all 0.2s; outline: none; }
        .input-field:focus { border-color: rgba(99,66,245,0.6); background: rgba(99,66,245,0.08); box-shadow: 0 0 0 3px rgba(99,66,245,0.15); }
        .input-field::placeholder { color: rgba(255,255,255,0.35); }
        .input-field option { background: #1a1a2e; color: white; }
        .btn-primary { background: linear-gradient(135deg, #315CFF, #6842F5); color: white; padding: 14px 32px; border-radius: 14px; font-weight: 700; font-size: 14px; letter-spacing: 0.05em; border: none; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
        .btn-primary:hover { transform: translateY(-1px); box-shadow: 0 8px 24px rgba(99,66,245,0.35); }
        .btn-primary:disabled { opacity: 0.5; cursor: not-allowed; transform: none; }
        .btn-outline { background: transparent; border: 1px solid rgba(255,255,255,0.2); color: rgba(255,255,255,0.7); padding: 14px 24px; border-radius: 14px; font-weight: 600; font-size: 14px; cursor: pointer; transition: all 0.2s; display: flex; align-items: center; gap: 8px; }
        .btn-outline:hover { border-color: rgba(255,255,255,0.4); color: white; }
        .label { font-size: 13px; font-weight: 600; color: rgba(255,255,255,0.65); margin-bottom: 6px; display: block; letter-spacing: 0.02em; }
        .error-text { font-size: 12px; color: #f87171; margin-top: 4px; }
      `}</style>

      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div style={{ position: 'absolute', top: '10%', left: '5%', width: 500, height: 500, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(49,92,255,0.12), transparent 70%)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: '10%', right: '5%', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(ellipse at center, rgba(104,66,245,0.12), transparent 70%)', pointerEvents: 'none' }} />
      </div>

      {/* Navbar */}
      <div style={{ borderBottom: '1px solid rgba(255,255,255,0.08)', padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: 'rgba(7,10,31,0.8)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
        <img src="/raydo-logo.png" alt="Raydo" style={{ height: 36, objectFit: 'contain' }} />
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', fontWeight: 500 }}>Franchise Application</span>
      </div>

      <div style={{ maxWidth: 760, margin: '0 auto', padding: '40px 20px 80px' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, background: 'rgba(49,92,255,0.12)', border: '1px solid rgba(49,92,255,0.25)', borderRadius: 100, padding: '6px 16px', marginBottom: 16 }}>
            <Building2 size={14} style={{ color: '#6895FF' }} />
            <span style={{ fontSize: 12, fontWeight: 700, color: '#6895FF', letterSpacing: '0.08em' }}>CITY FRANCHISE PROGRAM</span>
          </div>
          <h1 style={{ fontSize: 32, fontWeight: 900, margin: '0 0 8px', background: 'linear-gradient(135deg, #ffffff, rgba(255,255,255,0.7))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
            Apply for Raydo Franchise
          </h1>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', fontWeight: 400, margin: 0 }}>
            Become the exclusive Raydo operator in your city
          </p>
        </div>

        {/* Step Indicator */}
        <div style={{ marginBottom: 40 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'center', gap: 0, position: 'relative' }}>
            {STEPS.map((step, i) => {
              const Icon = step.icon;
              const isCompleted = currentStep > step.id;
              const isActive = currentStep === step.id;
              return (
                <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', flex: i < STEPS.length - 1 ? 1 : 'none' }}>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', minWidth: 80 }}>
                    <div style={{
                      width: 48, height: 48, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                      background: isCompleted ? 'linear-gradient(135deg, #315CFF, #6842F5)' : isActive ? 'rgba(49,92,255,0.2)' : 'rgba(255,255,255,0.06)',
                      border: isActive ? '2px solid #315CFF' : isCompleted ? 'none' : '1px solid rgba(255,255,255,0.12)',
                      transition: 'all 0.3s',
                    }}>
                      {isCompleted ? <CheckCircle2 size={20} style={{ color: 'white' }} /> : <Icon size={20} style={{ color: isActive ? '#6895FF' : 'rgba(255,255,255,0.4)' }} />}
                    </div>
                    <div style={{ marginTop: 8, textAlign: 'center' }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: isActive || isCompleted ? 'white' : 'rgba(255,255,255,0.4)' }}>{step.label}</div>
                      <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{step.desc}</div>
                    </div>
                  </div>
                  {i < STEPS.length - 1 && (
                    <div style={{ flex: 1, height: 2, marginTop: 24, background: isCompleted ? 'linear-gradient(90deg, #315CFF, #6842F5)' : 'rgba(255,255,255,0.1)', transition: 'all 0.3s' }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Step Content */}
        <div className="glass-card" style={{ borderRadius: 24, padding: '36px 32px' }}>
          {loadingConfig ? (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 60, gap: 12 }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#6895FF' }} />
              <span style={{ color: 'rgba(255,255,255,0.5)' }}>Loading form...</span>
              <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
            </div>
          ) : (
            <>
              {currentStep === 1 && (
                <FranchiseStep1
                  config={formConfig}
                  defaultValues={step1Data}
                  onNext={handleNext}
                  onBack={handleBack}
                />
              )}
              {currentStep === 2 && (
                <FranchiseStep2
                  defaultValues={step2Data}
                  onNext={handleNext}
                  onBack={handleBack}
                />
              )}
              {currentStep === 3 && (
                <FranchiseStep3
                  config={formConfig}
                  defaultValues={step3Data}
                  onSubmit={handleSubmit}
                  onBack={handleBack}
                  submitting={submitting}
                />
              )}
            </>
          )}
        </div>

        {/* Trust strip */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 32, marginTop: 32, flexWrap: 'wrap' }}>
          {[
            { text: '🔒 100% Secure', sub: 'SSL Encrypted' },
            { text: '⚡ 48hr Response', sub: 'Quick Review' },
            { text: '🏆 Exclusive Rights', sub: 'City Monopoly' },
          ].map(item => (
            <div key={item.text} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'rgba(255,255,255,0.7)' }}>{item.text}</div>
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>{item.sub}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
