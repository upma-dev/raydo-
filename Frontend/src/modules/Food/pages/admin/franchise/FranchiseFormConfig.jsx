import React, { useState, useEffect } from "react";
import { adminAPI } from "@food/api";
import {
  Settings, Plus, Trash2, GripVertical, Save, CheckCircle2,
  Loader2, ChevronDown, ArrowLeft
} from "lucide-react";
import { useNavigate } from "react-router-dom";

const FIELD_TYPES = ['text', 'email', 'tel', 'number', 'textarea', 'select'];

function FieldRow({ field, index, onUpdate, onDelete, total }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div style={{ border: '1px solid rgba(255,255,255,0.1)', borderRadius: 14, marginBottom: 10, overflow: 'hidden', transition: 'all 0.2s' }}>
      {/* Row header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', background: 'rgba(255,255,255,0.04)', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <GripVertical size={16} style={{ color: 'rgba(255,255,255,0.25)' }} />

        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 700, color: field.enabled ? 'white' : 'rgba(255,255,255,0.35)' }}>{field.label || 'Unnamed Field'}</span>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', background: 'rgba(255,255,255,0.07)', padding: '2px 8px', borderRadius: 4 }}>{field.type}</span>
          {field.required && <span style={{ fontSize: 10, color: '#f87171', background: 'rgba(248,113,113,0.12)', padding: '2px 8px', borderRadius: 4 }}>Required</span>}
          {!field.enabled && <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>Disabled</span>}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Enable toggle */}
          <button onClick={e => { e.stopPropagation(); onUpdate(index, { enabled: !field.enabled }); }}
            style={{
              width: 36, height: 20, borderRadius: 10, border: 'none', cursor: 'pointer', position: 'relative',
              background: field.enabled ? '#315CFF' : 'rgba(255,255,255,0.15)', transition: 'all 0.2s',
            }}>
            <div style={{ position: 'absolute', top: 2, left: field.enabled ? 18 : 2, width: 16, height: 16, borderRadius: '50%', background: 'white', transition: 'left 0.2s' }} />
          </button>
          <button onClick={e => { e.stopPropagation(); onDelete(index); }}
            style={{ padding: '4px 6px', borderRadius: 6, background: 'rgba(248,113,113,0.12)', border: '1px solid rgba(248,113,113,0.2)', color: '#f87171', cursor: 'pointer' }}>
            <Trash2 size={13} />
          </button>
          <ChevronDown size={14} style={{ color: 'rgba(255,255,255,0.4)', transform: expanded ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }} />
        </div>
      </div>

      {/* Expanded editor */}
      {expanded && (
        <div style={{ padding: 16, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, background: 'rgba(0,0,0,0.15)' }}>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Field Label</label>
            <input value={field.label} onChange={e => onUpdate(index, { label: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Field Key</label>
            <input value={field.key} onChange={e => onUpdate(index, { key: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'monospace' }} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Field Type</label>
            <select value={field.type} onChange={e => onUpdate(index, { type: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }}>
              {FIELD_TYPES.map(t => <option key={t} value={t} style={{ background: '#1a1a2e' }}>{t}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Placeholder</label>
            <input value={field.placeholder || ''} onChange={e => onUpdate(index, { placeholder: e.target.value })}
              style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {field.type === 'select' && (
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', fontWeight: 600, display: 'block', marginBottom: 5, textTransform: 'uppercase' }}>Options (one per line)</label>
              <textarea value={(field.options || []).join('\n')} rows={4}
                onChange={e => onUpdate(index, { options: e.target.value.split('\n').filter(Boolean) })}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 8, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', fontSize: 13, outline: 'none', boxSizing: 'border-box', resize: 'vertical', lineHeight: 1.6 }} />
            </div>
          )}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13, color: 'rgba(255,255,255,0.6)', userSelect: 'none' }}>
              <input type="checkbox" checked={field.required || false} onChange={e => onUpdate(index, { required: e.target.checked })} style={{ accentColor: '#315CFF' }} />
              Required field
            </label>
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

  const updateDoc = (index, changes) => {
    setConfig(prev => {
      const requiredDocuments = [...(prev.requiredDocuments || [])];
      requiredDocuments[index] = { ...requiredDocuments[index], ...changes };
      return { ...prev, requiredDocuments };
    });
  };

  const deleteDoc = (index) => {
    setConfig(prev => ({ ...prev, requiredDocuments: prev.requiredDocuments.filter((_, i) => i !== index) }));
  };

  const addDoc = () => {
    const newDoc = { key: `doc_${Date.now()}`, label: 'New Document', description: '', required: false, order: (config?.requiredDocuments?.length || 0) + 1, enabled: true, acceptedFormats: 'image/*,.pdf', maxSizeMB: 5 };
    setConfig(prev => ({ ...prev, requiredDocuments: [...(prev.requiredDocuments || []), newDoc] }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const ordered = (config.fields || []).map((f, i) => ({ ...f, order: i + 1 }));
      const orderedDocs = (config.requiredDocuments || []).map((d, i) => ({ ...d, order: i + 1 }));
      await adminAPI.updateFranchiseFormConfig({ fields: ordered, requiredDocuments: orderedDocs });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: 'rgba(255,255,255,0.4)', gap: 12 }}><Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#6895FF' }} /><style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style> Loading config...</div>;

  return (
    <div style={{ padding: '24px', fontFamily: "'Inter', sans-serif", color: 'white', maxWidth: 760 }}>
      <style>{`@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');`}</style>

      <button onClick={() => navigate('/admin/food/franchise-management')}
        style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 24, background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.7)', padding: '8px 16px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600 }}>
        <ArrowLeft size={15} /> Back
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: 'white' }}>Franchise Form Config</h1>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', margin: 0 }}>Control what fields appear on the franchise apply form</p>
        </div>
        <button onClick={handleSave} disabled={saving}
          style={{
            display: 'flex', alignItems: 'center', gap: 8, padding: '10px 20px', borderRadius: 12,
            background: saved ? 'rgba(52,211,153,0.2)' : 'linear-gradient(135deg, #315CFF, #6842F5)',
            border: saved ? '1px solid rgba(52,211,153,0.4)' : 'none',
            color: saved ? '#34d399' : 'white', fontSize: 13, fontWeight: 700, cursor: saving ? 'wait' : 'pointer',
          }}>
          {saving ? <Loader2 size={15} style={{ animation: 'spin 1s linear infinite' }} /> : saved ? <CheckCircle2 size={15} /> : <Save size={15} />}
          {saving ? 'Saving...' : saved ? 'Saved!' : 'Save Config'}
        </button>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 24, background: 'rgba(255,255,255,0.05)', padding: 4, borderRadius: 12, width: 'fit-content', border: '1px solid rgba(255,255,255,0.08)' }}>
        {[['fields', 'Form Fields'], ['docs', 'Documents']].map(([key, label]) => (
          <button key={key} onClick={() => setActiveTab(key)}
            style={{ padding: '8px 20px', borderRadius: 9, background: activeTab === key ? 'rgba(49,92,255,0.25)' : 'transparent', border: activeTab === key ? '1px solid rgba(49,92,255,0.4)' : '1px solid transparent', color: activeTab === key ? '#6895FF' : 'rgba(255,255,255,0.5)', fontSize: 13, fontWeight: 700, cursor: 'pointer', transition: 'all 0.15s' }}>
            {label}
          </button>
        ))}
      </div>

      {activeTab === 'fields' ? (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{config?.fields?.length || 0} fields configured</span>
            <button onClick={addField}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: 'rgba(49,92,255,0.15)', border: '1px solid rgba(49,92,255,0.3)', color: '#6895FF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={13} /> Add Field
            </button>
          </div>
          {(config?.fields || []).map((field, i) => (
            <FieldRow key={i} field={field} index={i} onUpdate={updateField} onDelete={deleteField} total={config.fields.length} />
          ))}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.4)' }}>{config?.requiredDocuments?.length || 0} documents configured</span>
            <button onClick={addDoc}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 10, background: 'rgba(49,92,255,0.15)', border: '1px solid rgba(49,92,255,0.3)', color: '#6895FF', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
              <Plus size={13} /> Add Document
            </button>
          </div>
          {(config?.requiredDocuments || []).map((doc, i) => (
            <FieldRow key={i} field={doc} index={i} onUpdate={updateDoc} onDelete={deleteDoc} total={config.requiredDocuments.length} />
          ))}
        </div>
      )}
    </div>
  );
}
