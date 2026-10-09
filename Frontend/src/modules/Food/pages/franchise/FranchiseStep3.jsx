import React, { useState, useRef } from "react";
import { Upload, X, CheckCircle2, Loader2, ArrowRight, ArrowLeft, FileText, Image as ImageIcon } from "lucide-react";
import { apiClient } from "@food/api";

const DEFAULT_DOCS = [
  { key: 'aadhaar', label: 'Aadhaar Card', description: 'Front side of your Aadhaar card', required: true, acceptedFormats: 'image/*,.pdf', maxSizeMB: 5 },
  { key: 'pan', label: 'PAN Card', description: 'Clear photo of your PAN card', required: true, acceptedFormats: 'image/*,.pdf', maxSizeMB: 5 },
  { key: 'businessProof', label: 'Business Address Proof', description: 'GST, Shop Act or Utility Bill', required: false, acceptedFormats: 'image/*,.pdf', maxSizeMB: 10 },
  { key: 'selfie', label: 'Applicant Selfie', description: 'A clear selfie of yourself', required: false, acceptedFormats: 'image/*', maxSizeMB: 5 },
];

function FileUploadBox({ doc, onUpload, uploadedFile }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > (doc.maxSizeMB || 5) * 1024 * 1024) {
      setError(`File too large. Max ${doc.maxSizeMB || 5}MB.`);
      return;
    }
    setError('');
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('folder', 'franchise-docs');
      const res = await apiClient.post('/uploads/image', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const url = res?.data?.data?.url || res?.data?.url || '';
      if (url) {
        onUpload(doc.key, { key: doc.key, label: doc.label, url });
      } else {
        setError('Upload failed. Try again.');
      }
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const isImage = uploadedFile?.url && /\.(jpg|jpeg|png|gif|webp)$/i.test(uploadedFile.url);

  return (
    <div style={{
      border: `1px solid ${uploadedFile ? 'rgba(49,92,255,0.4)' : 'rgba(255,255,255,0.1)'}`,
      borderRadius: 16,
      padding: 20,
      background: uploadedFile ? 'rgba(49,92,255,0.06)' : 'rgba(255,255,255,0.03)',
      transition: 'all 0.2s',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12, flexShrink: 0,
          background: uploadedFile ? 'rgba(49,92,255,0.2)' : 'rgba(255,255,255,0.07)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          border: `1px solid ${uploadedFile ? 'rgba(49,92,255,0.3)' : 'rgba(255,255,255,0.1)'}`,
        }}>
          {uploadedFile ? (
            isImage ? (
              <img src={uploadedFile.url} alt={doc.label} style={{ width: 44, height: 44, objectFit: 'cover', borderRadius: 12 }} />
            ) : (
              <FileText size={20} style={{ color: '#6895FF' }} />
            )
          ) : (
            <ImageIcon size={20} style={{ color: 'rgba(255,255,255,0.4)' }} />
          )}
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
            <span style={{ fontSize: 13, fontWeight: 700, color: 'white' }}>{doc.label}</span>
            {doc.required && <span style={{ fontSize: 10, fontWeight: 700, color: '#f87171', background: 'rgba(248,113,113,0.15)', padding: '2px 6px', borderRadius: 4 }}>Required</span>}
            {uploadedFile && <CheckCircle2 size={14} style={{ color: '#34d399', marginLeft: 'auto' }} />}
          </div>
          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', margin: '0 0 10px' }}>{doc.description}</p>

          {uploadedFile ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>✓ Uploaded</span>
              <button
                type="button"
                onClick={() => { onUpload(doc.key, null); if (inputRef.current) inputRef.current.value = ''; }}
                style={{ fontSize: 11, color: '#f87171', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
              >
                Remove
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={uploading}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'rgba(49,92,255,0.15)', border: '1px solid rgba(49,92,255,0.3)',
                color: '#6895FF', padding: '7px 14px', borderRadius: 8, fontSize: 12,
                fontWeight: 700, cursor: uploading ? 'wait' : 'pointer', transition: 'all 0.2s',
              }}
            >
              {uploading ? <><Loader2 size={12} style={{ animation: 'spin 1s linear infinite' }} /> Uploading...</> : <><Upload size={12} /> Upload File</>}
            </button>
          )}

          {error && <p style={{ fontSize: 11, color: '#f87171', marginTop: 6, margin: '6px 0 0' }}>{error}</p>}
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={doc.acceptedFormats}
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />
    </div>
  );
}

export default function FranchiseStep3({ config, defaultValues, onSubmit, onBack, submitting, planSummary }) {
  const docList = config?.requiredDocuments?.filter(d => d.enabled)
    .sort((a, b) => a.order - b.order) || DEFAULT_DOCS;

  const [uploadedDocs, setUploadedDocs] = useState(() => {
    const init = {};
    (defaultValues?.documents || []).forEach(d => { init[d.key] = d; });
    return init;
  });
  const [errors, setErrors] = useState({});

  const handleUpload = (key, fileData) => {
    setUploadedDocs(prev => {
      const next = { ...prev };
      if (fileData) next[key] = fileData;
      else delete next[key];
      return next;
    });
    if (errors[key]) setErrors(prev => ({ ...prev, [key]: '' }));
  };

  const validate = () => {
    const e = {};
    docList.forEach(doc => {
      if (doc.required && !uploadedDocs[doc.key]) {
        e[doc.key] = `${doc.label} is required`;
      }
    });
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSubmit = (ev) => {
    ev.preventDefault();
    if (validate()) {
      onSubmit(Object.values(uploadedDocs));
    }
  };

  const requiredCount = docList.filter(d => d.required).length;
  const uploadedRequiredCount = docList.filter(d => d.required && uploadedDocs[d.key]).length;

  return (
    <form onSubmit={handleSubmit} noValidate>
      {planSummary && (
        <div style={{ marginBottom: 24, padding: 16, borderRadius: 14, background: 'rgba(255,196,0,0.07)', border: '1px solid rgba(255,196,0,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#FFC400', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your selected plan</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'white', marginTop: 2 }}>{planSummary.title}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 20, fontWeight: 900, color: 'white' }}>{'\u20B9'}{Number(planSummary.fee || 0).toLocaleString('en-IN')}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>You will pay this in the next step</div>
          </div>
        </div>
      )}
      <div style={{ marginBottom: 28 }}>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: 'white' }}>Document Upload</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          Upload required documents for verification
        </p>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginTop: 10, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, padding: '4px 10px' }}>
          <CheckCircle2 size={12} style={{ color: '#34d399' }} />
          <span style={{ fontSize: 12, fontWeight: 600, color: '#34d399' }}>
            {uploadedRequiredCount} / {requiredCount} required documents uploaded
          </span>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {docList.map(doc => (
          <div key={doc.key}>
            <FileUploadBox
              doc={doc}
              onUpload={handleUpload}
              uploadedFile={uploadedDocs[doc.key]}
            />
            {errors[doc.key] && <p style={{ fontSize: 11, color: '#f87171', marginTop: 4 }}>{errors[doc.key]}</p>}
          </div>
        ))}
      </div>

      {/* Summary before submit */}
      <div style={{ marginTop: 24, padding: 16, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 12 }}>
        <p style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.5)', margin: '0 0 8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>By submitting, you agree that:</p>
        <ul style={{ margin: 0, padding: '0 0 0 16px', fontSize: 12, color: 'rgba(255,255,255,0.45)', lineHeight: 1.7 }}>
          <li>All information provided is accurate and truthful</li>
          <li>Raydo team may contact you for verification</li>
          <li>Approval is subject to availability in your selected area</li>
        </ul>
      </div>

      {/* Navigation */}
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 28, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 24 }}>
        <button type="button" className="btn-outline" onClick={onBack} disabled={submitting}>
          <ArrowLeft size={16} /> Back
        </button>
        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? (
            <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> Submitting...</>
          ) : (
            <>Submit & Continue to Payment <ArrowRight size={16} /></>
          )}
        </button>
      </div>
    </form>
  );
}
