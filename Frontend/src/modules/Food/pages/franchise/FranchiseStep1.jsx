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
    if (validate()) onNext(form);
  };

  return (
    <form onSubmit={handleSubmit} noValidate>
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: 'white' }}>Business Information</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Tell us about yourself and your business</p>
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
