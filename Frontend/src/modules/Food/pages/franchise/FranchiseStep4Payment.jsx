import React, { useState } from "react";
import { CreditCard, ShieldCheck, Loader2, CheckCircle2, ArrowRight } from "lucide-react";
import { franchiseAPI } from "@food/api";

const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const loadRazorpaySDK = () =>
  new Promise((resolve) => {
    if (window.Razorpay) return resolve(true);
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = () => resolve(true);
    script.onerror = () => resolve(false);
    document.body.appendChild(script);
  });

/**
 * Last step of the apply form. The application is already saved (so nothing is lost);
 * here the applicant pays the fee the admin has set. They may also pay later.
 */
export default function FranchiseStep4Payment({ applicationId, phone, planTitle, fee, onPaid, onPayLater }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [paid, setPaid] = useState(false);

  const handlePay = async () => {
    setBusy(true);
    setError('');
    try {
      if (!(await loadRazorpaySDK())) {
        setError('Payment window could not load. Check your internet connection and try again.');
        setBusy(false);
        return;
      }

      const res = await franchiseAPI.createRazorpayOrder(applicationId, phone);
      const order = res?.data?.data;
      if (!order?.orderId || !order?.key) {
        setError('Could not start the payment. Please try again.');
        setBusy(false);
        return;
      }

      const rzp = new window.Razorpay({
        key: order.key,
        amount: order.amount,
        currency: order.currency || 'INR',
        name: 'Raydo Franchise',
        description: `Franchise fee - ${order.applicationId}`,
        order_id: order.orderId,
        prefill: { name: order.applicantName || '', email: order.email || '', contact: order.phone || '' },
        theme: { color: '#315CFF' },
        handler: async (response) => {
          try {
            await franchiseAPI.verifyRazorpayPayment({
              applicationId,
              phone,
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
            });
            setPaid(true);
            setTimeout(() => onPaid?.(), 1200);
          } catch (err) {
            setError(err?.response?.data?.message || 'Payment was made but could not be confirmed. Do not pay again - contact support with your Application ID.');
          } finally {
            setBusy(false);
          }
        },
        modal: { ondismiss: () => setBusy(false) },
      });
      rzp.on('payment.failed', (r) => {
        setError(r?.error?.description || 'Payment failed. You have not been charged. Please try again.');
        setBusy(false);
      });
      rzp.open();
    } catch (err) {
      setError(err?.response?.data?.message || 'Could not start the payment. Please try again.');
      setBusy(false);
    }
  };

  if (paid) {
    return (
      <div style={{ textAlign: 'center', padding: '24px 0' }}>
        <CheckCircle2 size={56} style={{ color: '#34d399' }} />
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '14px 0 6px', color: 'white' }}>Payment Successful</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', margin: 0 }}>Taking you to your application status...</p>
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 24 }}>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(52,211,153,0.1)', border: '1px solid rgba(52,211,153,0.2)', borderRadius: 8, padding: '4px 10px', marginBottom: 10 }}>
          <CheckCircle2 size={12} style={{ color: '#34d399' }} />
          <span style={{ fontSize: 12, fontWeight: 700, color: '#34d399' }}>Application saved - ID {applicationId}</span>
        </div>
        <h2 style={{ fontSize: 22, fontWeight: 800, margin: '0 0 4px', color: 'white' }}>Pay Franchise Fee</h2>
        <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
          Complete your payment now so your application can be approved faster.
        </p>
      </div>

      <div style={{ padding: 20, borderRadius: 16, background: 'rgba(255,196,0,0.07)', border: '1px solid rgba(255,196,0,0.25)', marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#FFC400', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Your plan</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: 'white', marginTop: 2 }}>{planTitle}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)' }}>One-time franchise fee</div>
            <div style={{ fontSize: 30, fontWeight: 900, color: 'white', lineHeight: 1.1 }}>{inr(fee)}</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gap: 8, marginBottom: 20, fontSize: 12, color: 'rgba(255,255,255,0.6)' }}>
        <div>✓ Pay by UPI, Card or Net Banking</div>
        <div>✓ Your login is activated as soon as our team approves your application</div>
        <div>✓ If your application is not approved, your fee is refunded</div>
      </div>

      {error && (
        <div style={{ marginBottom: 14, padding: 12, borderRadius: 10, background: 'rgba(239,68,68,0.1)', border: '1px solid rgba(239,68,68,0.25)', fontSize: 13, color: '#fca5a5' }}>
          {error}
        </div>
      )}

      <button
        type="button"
        onClick={handlePay}
        disabled={busy || !(Number(fee) > 0)}
        style={{
          width: '100%', padding: '15px', borderRadius: 14, fontWeight: 800, fontSize: 15, border: 'none',
          cursor: busy ? 'wait' : 'pointer', background: 'linear-gradient(135deg, #FFC400, #E69500)', color: '#111827',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, opacity: busy ? 0.7 : 1,
        }}
      >
        {busy ? <Loader2 size={18} style={{ animation: 'spin 1s linear infinite' }} /> : <CreditCard size={18} />}
        {busy ? 'Please wait...' : `Pay ${inr(fee)} Securely`}
      </button>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 10, fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>
        <ShieldCheck size={12} /> Secured by Razorpay
      </div>

      <button
        type="button"
        onClick={onPayLater}
        disabled={busy}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, width: '100%', marginTop: 16, background: 'none', border: 'none', color: 'rgba(255,255,255,0.55)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
      >
        I'll pay later <ArrowRight size={14} />
      </button>
      <p style={{ textAlign: 'center', fontSize: 11, color: 'rgba(255,255,255,0.35)', margin: '6px 0 0' }}>
        You can pay anytime from the "Track status" page using your Application ID.
      </p>
    </div>
  );
}
