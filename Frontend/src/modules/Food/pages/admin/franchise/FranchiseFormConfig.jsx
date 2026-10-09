import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { adminAPI } from "@food/api";
import {
  ArrowLeft, Save, Plus, Trash2, ChevronDown, CheckCircle2, Loader2,
  FileText, CreditCard, DollarSign, Settings, QrCode
} from "lucide-react";
import { toast } from "sonner";

const FIELD_TYPES = ['text', 'tel', 'email', 'select', 'textarea', 'number'];

function FieldRow({ field, index, onUpdate, onDelete }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden mb-3">
      <div className="p-3.5 flex items-center justify-between bg-slate-50 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <span className="w-6 h-6 rounded-md bg-slate-200 text-slate-700 text-xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <div>
            <span className="text-sm font-bold text-slate-900">{field.label || 'Unnamed Field'}</span>
            <span className="text-xs text-slate-400 font-mono ml-2">({field.key})</span>
          </div>
          {field.required && (
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-red-50 text-red-600 border border-red-200">
              Required
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => onUpdate(index, { enabled: !field.enabled })}
            className={`px-2.5 py-1 rounded text-xs font-semibold border ${
              field.enabled ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}
          >
            {field.enabled ? 'Enabled' : 'Disabled'}
          </button>

          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
          >
            <ChevronDown className={`w-4 h-4 transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {expanded && (
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 gap-3 bg-white">
          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Field Label</label>
            <input
              type="text"
              value={field.label}
              onChange={e => onUpdate(index, { label: e.target.value })}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Field Key</label>
            <input
              type="text"
              value={field.key}
              onChange={e => onUpdate(index, { key: e.target.value })}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 font-mono text-slate-900"
            />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Field Type</label>
            <select
              value={field.type}
              onChange={e => onUpdate(index, { type: e.target.value })}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-900"
            >
              {FIELD_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Placeholder</label>
            <input
              type="text"
              value={field.placeholder || ''}
              onChange={e => onUpdate(index, { placeholder: e.target.value })}
              className="w-full px-3 py-1.5 text-xs rounded-lg border border-slate-300 text-slate-900"
            />
          </div>

          {field.type === 'select' && (
            <div className="sm:col-span-2">
              <label className="block text-[11px] font-bold text-slate-500 uppercase mb-1">Options (one per line)</label>
              <textarea
                value={(field.options || []).join('\n')}
                rows={3}
                onChange={e => onUpdate(index, { options: e.target.value.split('\n').filter(Boolean) })}
                className="w-full p-2 text-xs rounded-lg border border-slate-300 text-slate-900 font-sans"
              />
            </div>
          )}

          <div className="sm:col-span-2 flex items-center justify-between pt-2 border-t border-slate-100">
            <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={field.required || false}
                onChange={e => onUpdate(index, { required: e.target.checked })}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
              />
              <span>Is Required</span>
            </label>

            <button
              type="button"
              onClick={() => onDelete(index)}
              className="px-2.5 py-1 rounded text-xs font-semibold text-red-600 bg-red-50 border border-red-200 hover:bg-red-100 inline-flex items-center gap-1"
            >
              <Trash2 className="w-3.5 h-3.5" /> Delete Field
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function FranchiseFormConfig() {
  const navigate = useNavigate();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [activeTab, setActiveTab] = useState('fields');

  useEffect(() => {
    adminAPI.getFranchiseFormConfig()
      .then(res => { if (res?.data?.data) setConfig(res.data.data); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const updateField = (index, changes) => {
    setConfig(prev => {
      const fields = [...(prev.fields || [])];
      fields[index] = { ...fields[index], ...changes };
      return { ...prev, fields };
    });
  };

  const deleteField = (index) => {
    setConfig(prev => {
      const fields = prev.fields.filter((_, i) => i !== index);
      return { ...prev, fields };
    });
  };

  const addField = () => {
    const newField = { key: `field_${Date.now()}`, label: 'New Field', type: 'text', required: false, order: (config?.fields?.length || 0) + 1, enabled: true, section: 'business_info' };
    setConfig(prev => ({ ...prev, fields: [...(prev.fields || []), newField] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await adminAPI.updateFranchiseFormConfig({
        fields: config.fields || [],
        requiredDocuments: config.requiredDocuments || [],
        moduleFranchiseFees: config.moduleFranchiseFees || { food: 50000, taxi: 50000, both: 80000 },
        moduleCommissions: config.moduleCommissions || { food: 10, taxi: 10, both: 10 },
        paymentDetails: config.paymentDetails || { upiId: '', qrCodeUrl: '', bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '' },
      });
      setSaved(true);
      toast.success("Franchise form & fee config updated successfully!");
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
      toast.error("Failed to update config");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center min-h-[50vh] gap-3 text-slate-500">
      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
      <span>Loading form config...</span>
    </div>
  );

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 font-sans max-w-5xl mx-auto">
      
      {/* Back Button */}
      <button
        onClick={() => navigate('/admin/food/franchise-management')}
        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 mb-6"
      >
        <ArrowLeft className="w-4 h-4 text-slate-500" />
        <span>Back to Franchise List</span>
      </button>

      {/* Header */}
      <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Franchise Form & Default Fee Config</h1>
          <p className="text-sm text-slate-500">Manage default module fees, commissions, payment QR & applicant form fields</p>
        </div>

        <button
          onClick={handleSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-bold text-sm shadow-sm inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {saving ? 'Saving Config...' : saved ? 'Config Saved!' : 'Save All Config'}
        </button>
      </div>

      {/* Navigation Tabs */}
      <div className="flex gap-2 mb-6 border-b border-slate-200 pb-2">
        {[
          ['fields', 'Form Fields'],
          ['docs', 'KYC Documents'],
          ['fees', 'Default Module Fees & Payment QR']
        ].map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveTab(key)}
            className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${
              activeTab === key ? 'bg-blue-600 text-white shadow-sm' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Tab 1: Form Fields */}
      {activeTab === 'fields' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-slate-200">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Applicant Form Input Fields</h3>
              <p className="text-xs text-slate-500">Custom fields requested from public franchise applicants</p>
            </div>
            <button
              onClick={addField}
              className="px-3.5 py-2 rounded-lg bg-blue-50 text-blue-700 border border-blue-200 text-xs font-bold hover:bg-blue-100 inline-flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" /> Add Field
            </button>
          </div>

          {(config?.fields || []).map((field, idx) => (
            <FieldRow
              key={field.key || idx}
              field={field}
              index={idx}
              onUpdate={updateField}
              onDelete={deleteField}
            />
          ))}
        </div>
      )}

      {/* Tab 2: Fees & Payment QR Config */}
      {activeTab === 'fees' && (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 space-y-6">
          
          {/* Module Default Franchise Onboarding Fees */}
          <div>
            <h3 className="text-sm font-bold text-slate-900 uppercase mb-3 flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-emerald-600" /> Default Onboarding Fees per Vertical Module (₹)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'food', label: '🍔 Food Only Fee' },
                { key: 'taxi', label: '🚕 Taxi Only Fee' },
                { key: 'both', label: '🤝 Food + Taxi (Both) Fee' },
              ].map(item => (
                <div key={item.key}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{item.label}</label>
                  <input
                    type="number"
                    value={config.moduleFranchiseFees?.[item.key] ?? 50000}
                    onChange={e => setConfig({
                      ...config,
                      moduleFranchiseFees: { ...config.moduleFranchiseFees, [item.key]: Number(e.target.value) }
                    })}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 font-bold text-slate-900"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Module Default Commission Share */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 uppercase mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4 text-blue-600" /> Default Franchise Commission Rates (%)
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {[
                { key: 'food', label: '🍔 Food Only Commission (%)' },
                { key: 'taxi', label: '🚕 Taxi Only Commission (%)' },
                { key: 'both', label: '🤝 Food + Taxi (Both) Commission (%)' },
              ].map(item => (
                <div key={item.key}>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">{item.label}</label>
                  <input
                    type="number"
                    value={config.moduleCommissions?.[item.key] ?? 10}
                    onChange={e => setConfig({
                      ...config,
                      moduleCommissions: { ...config.moduleCommissions, [item.key]: Number(e.target.value) }
                    })}
                    className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 font-bold text-slate-900"
                  />
                </div>
              ))}
            </div>
          </div>

          {/* Admin Receiving Payment Accounts / QR */}
          <div className="pt-4 border-t border-slate-100">
            <h3 className="text-sm font-bold text-slate-900 uppercase mb-3 flex items-center gap-2">
              <QrCode className="w-4 h-4 text-amber-600" /> Admin Fee Collection Accounts & QR Code
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">UPI ID for Fee Collection</label>
                <input
                  type="text"
                  placeholder="e.g. raydo@okhdfcbank"
                  value={config.paymentDetails?.upiId || ''}
                  onChange={e => setConfig({
                    ...config,
                    paymentDetails: { ...config.paymentDetails, upiId: e.target.value }
                  })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 font-mono text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Payment QR Code Image URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={config.paymentDetails?.qrCodeUrl || ''}
                  onChange={e => setConfig({
                    ...config,
                    paymentDetails: { ...config.paymentDetails, qrCodeUrl: e.target.value }
                  })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Bank Name</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Bank"
                  value={config.paymentDetails?.bankName || ''}
                  onChange={e => setConfig({
                    ...config,
                    paymentDetails: { ...config.paymentDetails, bankName: e.target.value }
                  })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Account Number</label>
                <input
                  type="text"
                  placeholder="Account Number"
                  value={config.paymentDetails?.accountNumber || ''}
                  onChange={e => setConfig({
                    ...config,
                    paymentDetails: { ...config.paymentDetails, accountNumber: e.target.value }
                  })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">IFSC Code</label>
                <input
                  type="text"
                  placeholder="IFSC Code"
                  value={config.paymentDetails?.ifscCode || ''}
                  onChange={e => setConfig({
                    ...config,
                    paymentDetails: { ...config.paymentDetails, ifscCode: e.target.value }
                  })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">Account Holder Name</label>
                <input
                  type="text"
                  placeholder="Raydo Private Limited"
                  value={config.paymentDetails?.accountHolderName || ''}
                  onChange={e => setConfig({
                    ...config,
                    paymentDetails: { ...config.paymentDetails, accountHolderName: e.target.value }
                  })}
                  className="w-full px-3.5 py-2 text-sm rounded-lg border border-slate-300 text-slate-900"
                />
              </div>
            </div>
          </div>

        </div>
      )}
    </div>
  );
}
