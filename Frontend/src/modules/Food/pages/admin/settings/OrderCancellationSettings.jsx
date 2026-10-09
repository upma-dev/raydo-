import React, { useEffect, useState } from "react";
import { toast } from "sonner";
import { Loader2, Save, Timer, UserX, ShieldCheck, Info } from "lucide-react";
import { adminAPI } from "@food/api";

const errMsg = (e, fb) => e?.response?.data?.message || fb;
const inputCls = "w-full max-w-[160px] px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500";

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${checked ? "bg-emerald-500" : "bg-slate-300"}`}
    >
      <span className={`absolute top-0.5 w-6 h-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function Card({ icon: Icon, title, desc, children }) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 shrink-0"><Icon className="w-5 h-5" /></div>
        <div className="flex-1">
          <div className="font-extrabold text-slate-900">{title}</div>
          <div className="text-xs text-slate-500 mt-0.5">{desc}</div>
          <div className="mt-4">{children}</div>
        </div>
      </div>
    </div>
  );
}

export default function OrderCancellationSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rules, setRules] = useState(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await adminAPI.getOrderCancellationSettings();
        setRules(res?.data?.data?.rules || null);
      } catch (e) {
        toast.error(errMsg(e, "Could not load cancellation rules"));
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const res = await adminAPI.saveOrderCancellationSettings(rules);
      setRules(res?.data?.data?.rules || rules);
      toast.success("Cancellation rules saved. They apply to all new and waiting orders.");
    } catch (e) {
      toast.error(errMsg(e, "Could not save"));
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex items-center justify-center min-h-[50vh] gap-2 text-slate-500"><Loader2 className="w-5 h-5 animate-spin" /> Loading...</div>;
  if (!rules) return <div className="p-8 text-center text-slate-500">Could not load the rules.</div>;

  const set = (k, v) => setRules({ ...rules, [k]: v });

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 space-y-5 max-w-3xl">
      <div>
        <h1 className="text-2xl font-black tracking-tight">Order Cancellation Rules</h1>
        <p className="text-xs font-semibold text-slate-500 mt-1">Decide what happens when a restaurant does not respond, and when a customer may cancel. Refunds are always automatic.</p>
      </div>

      <Card icon={Timer} title="Auto-cancel if the restaurant does not accept" desc="When the restaurant ignores a new order, it is cancelled for them and the customer gets a full refund.">
        <div className="flex items-center gap-3 mb-4">
          <Toggle checked={rules.autoCancelEnabled} onChange={(v) => set("autoCancelEnabled", v)} />
          <span className="text-sm font-bold">{rules.autoCancelEnabled ? "On" : "Off"}</span>
        </div>
        <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Restaurant must accept within (minutes)</label>
        <input type="number" min={1} max={120} className={inputCls} disabled={!rules.autoCancelEnabled} value={rules.restaurantAcceptTimeoutMinutes} onChange={(e) => set("restaurantAcceptTimeoutMinutes", e.target.value)} />
        <p className="text-[11px] text-slate-400 mt-1.5">Between 1 and 120. The clock starts when the restaurant is first notified (scheduled orders start when they are sent to the restaurant).</p>
      </Card>

      <Card icon={UserX} title="Customer cancellation" desc="When may a customer cancel their own order?">
        <div className="flex items-center gap-3 mb-5">
          <Toggle checked={rules.allowUserCancelBeforeAccept} onChange={(v) => set("allowUserCancelBeforeAccept", v)} />
          <span className="text-sm font-bold">Customer can cancel until the restaurant accepts</span>
        </div>
        <label className="block text-xs font-bold text-slate-600 uppercase mb-1.5">Extra time after the restaurant accepts (seconds)</label>
        <input type="number" min={0} max={600} className={inputCls} value={rules.freeCancelWindowSecondsAfterAccept} onChange={(e) => set("freeCancelWindowSecondsAfterAccept", e.target.value)} />
        <p className="text-[11px] text-slate-400 mt-1.5">0 = no cancelling once the restaurant has accepted (recommended). For example 60 lets the customer still cancel for one minute after acceptance.</p>
      </Card>

      <div className="flex items-start gap-2 p-4 rounded-xl bg-blue-50 border border-blue-100 text-blue-900 text-xs font-semibold">
        <Info className="w-4 h-4 mt-0.5 shrink-0" />
        <div>
          Every cancellation (customer, restaurant, admin or automatic) does the same: refunds card/UPI payments through Razorpay and wallet payments to the wallet, puts the stock back, gives the coupon use back, and tells the customer, restaurant and rider. COD orders have nothing to refund.
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <div className="text-xs text-slate-500 flex items-center gap-1.5"><ShieldCheck className="w-4 h-4 text-emerald-600" /> Your Cancellation Policy text (shown to customers) is edited in Global &gt; Privacy Policy &amp; Legal.</div>
        <button onClick={save} disabled={saving} className="px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white font-extrabold text-sm shadow-md inline-flex items-center gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} {saving ? "Saving..." : "Save rules"}
        </button>
      </div>
    </div>
  );
}
