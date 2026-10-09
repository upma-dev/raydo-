import React, { useState } from "react";
import { User, Mail, Phone, ArrowRight, ArrowLeft } from "lucide-react";

const DEFAULT_FIELDS = [
  { key: 'companyName', label: 'Company / Business Name', type: 'text', required: true, placeholder: 'Enter your company name' },
  { key: 'businessType', label: 'Business Type', type: 'select', required: true, options: ['Proprietorship', 'Partnership', 'Private Limited', 'LLP', 'Other'] },
  { key: 'investmentRange', label: 'Investment Range', type: 'select', required: true, options: ['Below 5 Lakhs', '5-10 Lakhs', '10-25 Lakhs', '25-50 Lakhs', 'Above 50 Lakhs'] },
  { key: 'experience', label: 'Business Experience', type: 'select', required: false, options: ['Fresher', '1-2 Years', '2-5 Years', '5-10 Years', 'Above 10 Years'] },
];

export default function FranchiseStep1({ config, defaultValues, onNext, onBack }) {
  const dynamicFields = config?.fields?.filter(f => f.enabled && f.section === 'business_info') || DEFAULT_FIELDS;

  // One plan: 'food' | 'taxi' | 'both'. Prices come from the server (Admin > Franchise Fees).
  const initialPlan = (() => {
    const list = defaultValues?.selectedModules || [];
    const hasFood = list.includes('food');
    const hasTaxi = list.some(m => String(m).startsWith('taxi'));
    return hasFood && hasTaxi ? 'both' : hasTaxi ? 'taxi' : 'food';
  })();
  const [plan, setPlan] = useState(initialPlan);
  const selectedModules = plan === 'both' ? ['food', 'taxi'] : [plan];
  const fees = { food: 0, taxi: 0, both: 0, ...(config?.moduleFranchiseFees || {}) };
  const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;
  const bundleSaving = Math.max(0, Number(fees.food) + Number(fees.taxi) - Number(fees.both));

  const PLANS = [
    { key: 'food', icon: '🍔', title: 'Food Delivery', tag: null,
      points: ['Onboard restaurants in your zone', 'Manage food orders & delivery', 'Earn commission on every delivered order'] },
    { key: 'taxi', icon: '🚕', title: 'Taxi', tag: null,
      points: ['Cabs, autos, bikes & bus rides', 'Manage drivers & rides in your area', 'Earn commission on every completed ride'] },
    { key: 'both', icon: '🤝', title: 'Food + Taxi', tag: 'BEST VALUE',
      points: ['Everything in Food and Taxi', 'One combined franchise fee', 'One combined commission rate'] },
  ];

  const [form, setForm] = useState({
    applicantName: defaultValues?.applicantName || '',
    email: defaultValues?.email || '',
    phone: defaultValues?.phone || '',
    ...dynamicFields.reduce((acc, f) => ({ ...acc, [f.key]: defaultValues?.[f.key] || '' }), {}),
  });
  const [errors, setErrors] = useState({});

  const handleChange = (key, val) => {
    setForm(prev => ({ ...prev, [key]: val }));
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const validate = () => {
    const e = {};
    if (!form.applicantName?.trim()) e.applicantName = 'Name is required';
    if (!form.phone?.trim()) e.phone = 'Phone is required';
    else if (!/^\d{10}$/.test(form.phone.trim())) e.phone = 'Enter valid 10-digit phone';
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) e.email = 'Enter valid email';
    dynamicFields.forEach(f => {
      if (f.required && !form[f.key]?.trim()) e[f.key] = `${f.label} is required`;
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (validate()) onNext({ ...form, selectedModules });
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: 'white' }}>Choose Plan & Tell Us About You</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Pick Food, Taxi or both, then enter your business details</p>
      </div>

      {/* Plan selection: Food / Taxi / Both */}
      <div style={{ marginBottom: 24 }}>
        <label className="label" style={{ fontSize: 13, color: '#FFC400', fontWeight: 800, display: 'block', marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          1. Choose your franchise plan <span style={{ color: '#f87171' }}>*</span>
        </label>
        <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', margin: '0 0 14px' }}>
          Pick one. The fee is a one-time payment and is shown clearly on each plan.
        </p>

        <div role="radiogroup" aria-label="Franchise plan" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
          {PLANS.map(p => {
            const active = plan === p.key;
            return (
              <div
                key={p.key}
                role="radio"
                aria-checked={active}
                tabIndex={0}
                onClick={() => setPlan(p.key)}
                onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setPlan(p.key); } }}
                style={{
                  position: 'relative', padding: '18px 16px 16px', borderRadius: 16, cursor: 'pointer', userSelect: 'none',
                  background: active ? 'rgba(255,196,0,0.10)' : 'rgba(255,255,255,0.04)',
                  border: `2px solid ${active ? '#FFC400' : 'rgba(255,255,255,0.10)'}`,
                  transition: 'all 0.15s', outline: 'none',
                }}>
                {p.tag && (
                  <span style={{ position: 'absolute', top: -10, right: 12, fontSize: 10, fontWeight: 800, letterSpacing: '0.06em', padding: '3px 10px', borderRadius: 100, background: '#34d399', color: '#052e1c' }}>
                    {p.tag}
                  </span>
                )}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <div style={{ fontSize: 26 }}>{p.icon}</div>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    border: `2px solid ${active ? '#FFC400' : 'rgba(255,255,255,0.3)'}`,
                  }}>
                    {active && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#FFC400' }} />}
                  </div>
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: active ? '#FFC400' : 'white', marginTop: 8 }}>{p.title}</div>
                <div style={{ fontSize: 24, fontWeight: 900, color: 'white', marginTop: 4, lineHeight: 1.1 }}>
                  {inr(fees[p.key])}
                  <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginLeft: 6 }}>one-time</span>
                </div>
                {p.key === 'both' && bundleSaving > 0 && (
                  <div style={{ fontSize: 11, fontWeight: 700, color: '#34d399', marginTop: 4 }}>You save {inr(bundleSaving)} vs. taking both separately</div>
                )}
                <ul style={{ listStyle: 'none', padding: 0, margin: '12px 0 0', display: 'grid', gap: 6 }}>
                  {p.points.map(t => (
                    <li key={t} style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', display: 'flex', gap: 6 }}>
                      <span style={{ color: '#34d399' }}>✓</span><span>{t}</span>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>

        {/* When do I pay? */}
        <div style={{ marginTop: 16, padding: 16, borderRadius: 14, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: '#6895FF', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
            How it works - when do I pay?
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 12 }}>
            {[
              { n: 1, t: 'Fill this form', d: 'Your details, location and documents.' },
              { n: 2, t: `Pay ${inr(fees[plan])}`, d: 'Last step of the form: pay by UPI / Card / Net banking.', hot: true },
              { n: 3, t: 'We review', d: 'Our team checks your application within ~48 hours.' },
              { n: 4, t: 'Start operating', d: 'Once approved, your franchise login is activated.' },
            ].map(st => (
              <div key={st.n} style={{ display: 'flex', gap: 10 }}>
                <div style={{
                  width: 24, height: 24, borderRadius: '50%', flexShrink: 0, fontSize: 12, fontWeight: 800,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: st.hot ? '#FFC400' : 'rgba(255,255,255,0.1)', color: st.hot ? '#111827' : 'white',
                }}>{st.n}</div>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: st.hot ? '#FFC400' : 'white' }}>{st.t}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', marginTop: 2, lineHeight: 1.4 }}>{st.d}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 12 }}>
            You can also choose Pay later on the payment step. If your application is not approved, your fee is refunded.
          </div>
        </div>
      </div>

      <div style={{ fontSize: 13, color: '#FFC400', fontWeight: 800, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
        2. Your details
      </div>

      {/* Core fields — always shown */}
      <div style={{ display: 'grid', gap: 20 }}>
        {/* Applicant Name */}
        <div>
          <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <User size={13} style={{ color: '#6895FF' }} /> Full Name <span style={{ color: '#f87171' }}>*</span>
          </label>
          <input
            className="input-field"
            type="text"
            placeholder="Your full legal name"
            value={form.applicantName}
            onChange={e => handleChange('applicantName', e.target.value)}
          />
          {errors.applicantName && <p className="error-text">{errors.applicantName}</p>}
        </div>

        {/* Phone + Email row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Phone size={13} style={{ color: '#6895FF' }} /> Mobile Number <span style={{ color: '#f87171' }}>*</span>
            </label>
            <input
              className="input-field"
              type="tel"
              placeholder="10-digit mobile number"
              maxLength={10}
              value={form.phone}
              onChange={e => handleChange('phone', e.target.value.replace(/\D/g, ''))}
            />
            {errors.phone && <p className="error-text">{errors.phone}</p>}
          </div>
          <div>
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Mail size={13} style={{ color: '#6895FF' }} /> Email Address
            </label>
            <input
              className="input-field"
              type="email"
              placeholder="your@email.com"
              value={form.email}
              onChange={e => handleChange('email', e.target.value)}
            />
            {errors.email && <p className="error-text">{errors.email}</p>}
          </div>
        </div>

        {/* Dynamic fields from admin config */}
        {dynamicFields.length > 0 && (
          <div style={{ borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 20 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.1em', marginBottom: 16, margin: '0 0 16px', textTransform: 'uppercase' }}>Business Details</p>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
              {dynamicFields.map(field => (
                <div key={field.key} style={field.type === 'textarea' ? { gridColumn: '1 / -1' } : {}}>
                  <label className="label">
                    {field.label}
                    {field.required && <span style={{ color: '#f87171' }}> *</span>}
                  </label>
                  {field.type === 'select' ? (
                    <select
                      className="input-field"
                      value={form[field.key] || ''}
                      onChange={e => handleChange(field.key, e.target.value)}
                    >
                      <option value="">Select {field.label}</option>
                      {(field.options || []).map(opt => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  ) : field.type === 'textarea' ? (
                    <textarea
                      className="input-field"
                      rows={3}
                      placeholder={field.placeholder || `Enter ${field.label}`}
                      value={form[field.key] || ''}
                      onChange={e => handleChange(field.key, e.target.value)}
                      style={{ resize: 'vertical' }}
                    />
                  ) : (
                    <input
                      className="input-field"
                      type={field.type || 'text'}
                      placeholder={field.placeholder || `Enter ${field.label}`}
                      value={form[field.key] || ''}
                      onChange={e => handleChange(field.key, e.target.value)}
                    />
                  )}
                  {errors[field.key] && <p className="error-text">{errors[field.key]}</p>}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 36, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24 }}>
        <button type="button" className="btn-outline" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <button type="submit" className="btn-primary">
          Continue <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
