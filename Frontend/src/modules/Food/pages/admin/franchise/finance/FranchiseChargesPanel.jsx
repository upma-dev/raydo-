import React, { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Landmark, ShieldCheck, CheckCircle2, Ban, Pencil, Undo2, Scissors, Loader2, AlertTriangle, History } from "lucide-react";
import { adminAPI } from "@food/api";
import {
  Card, Badge, Modal, Field, Loading, ErrorState, Empty, inr2, when, errMsg, inputCls, btn, isAmount, istToday,
} from "./ui";

const METHODS = [["neft", "NEFT / RTGS"], ["imps", "IMPS"], ["upi", "UPI"], ["cheque", "Cheque"], ["cash", "Cash"], ["other", "Other"]];
const ICON = { joining_fee: Landmark, security_deposit: ShieldCheck };

/**
 * Joining fee + security deposit of one franchise, with every money action (super admin).
 * All amounts are validated again on the server; the buttons here only collect input.
 */
export default function FranchiseChargesPanel({ franchiseId, accountStatus = "active", archived = false, onChanged }) {
  const [charges, setCharges] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [dialog, setDialog] = useState(null); // { type, charge }

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await adminAPI.getFranchiseCharges(franchiseId);
      setCharges(res?.data?.data || []);
    } catch (e) {
      setError(errMsg(e, "Could not load fee & deposit"));
    } finally {
      setLoading(false);
    }
  }, [franchiseId]);
  useEffect(() => { load(); }, [load]);

  const done = async (msg) => {
    toast.success(msg);
    setDialog(null);
    await load();
    onChanged?.();
  };

  if (loading && !charges.length) return <Loading text="Loading fee & deposit..." />;
  if (error) return <ErrorState message={error} onRetry={load} />;

  const depositReleasable = accountStatus !== "active" || archived;
  const outstanding = charges.reduce((s, c) => s + (c.outstanding || 0), 0);

  return (
    <div className="space-y-5">
      {outstanding > 0 && (
        <div className="p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-xs font-semibold text-amber-900 flex gap-2">
          <AlertTriangle className="w-4 h-4 shrink-0" />
          <span>{inr2(outstanding)} is still due. A new franchise's login stays locked until the joining fee and the deposit are paid or waived.</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {charges.map((c) => {
          const Icon = ICON[c.kind] || Landmark;
          const isDeposit = c.kind === "security_deposit";
          return (
            <Card key={c.id} title={c.label} icon={Icon} right={<Badge status={c.status} />}>
              <div className="grid grid-cols-2 gap-2 text-xs mb-4">
                <Cell label="Amount" value={inr2(c.expected)} sub={c.overridden ? `Zone price ${c.territoryPrice === null ? "-" : inr2(c.territoryPrice)} · overridden` : c.territoryPrice !== null ? "Zone price" : null} />
                <Cell label="Paid" value={inr2(c.paid)} tone="text-emerald-700" />
                <Cell label="Outstanding" value={inr2(c.outstanding)} tone={c.outstanding ? "text-red-600" : ""} />
                {c.waived ? <Cell label="Waived" value={inr2(c.waived)} tone="text-blue-700" /> : <Cell label={isDeposit ? "Held now" : "Settled on"} value={isDeposit ? inr2(c.held) : (c.settledAt ? when(c.settledAt) : "-")} tone={isDeposit ? "text-blue-700" : ""} />}
                {isDeposit && (c.refunded > 0 || c.deducted > 0) && (
                  <>
                    <Cell label="Refunded" value={inr2(c.refunded)} />
                    <Cell label="Deducted" value={inr2(c.deducted)} tone="text-red-600" />
                  </>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                {c.outstanding > 0 && c.status !== "waived" && (
                  <button className={btn.success} onClick={() => setDialog({ type: "pay", charge: c })}><CheckCircle2 className="w-4 h-4" /> Record payment</button>
                )}
                {c.outstanding > 0 && (
                  <button className={btn.ghost} onClick={() => setDialog({ type: "waive", charge: c })}><Ban className="w-3.5 h-3.5" /> Waive due</button>
                )}
                <button className={btn.ghost} onClick={() => setDialog({ type: "amount", charge: c })}><Pencil className="w-3.5 h-3.5" /> Change amount</button>
                {isDeposit && c.held > 0 && (
                  <>
                    <button className={btn.ghost} disabled={!depositReleasable} onClick={() => setDialog({ type: "refund", charge: c })}><Undo2 className="w-3.5 h-3.5" /> Refund</button>
                    <button className={btn.ghost} disabled={!depositReleasable} onClick={() => setDialog({ type: "deduct", charge: c })}><Scissors className="w-3.5 h-3.5" /> Deduct</button>
                  </>
                )}
              </div>
              {isDeposit && c.held > 0 && !depositReleasable && (
                <p className="text-[11px] text-slate-400 mt-2">The deposit stays held while the franchise is active. Suspend or terminate it to refund or deduct.</p>
              )}

              <div className="mt-5">
                <div className="text-[10px] font-extrabold text-slate-500 uppercase mb-2 flex items-center gap-1"><History className="w-3 h-3" /> History</div>
                {!c.payments.length && !c.movements.length ? <p className="text-xs text-slate-400">No payments yet.</p> : (
                  <ul className="space-y-2">
                    {c.payments.map((p) => (
                      <li key={p.id} className="p-2.5 rounded-lg bg-emerald-50/60 border border-emerald-100 text-xs">
                        <div className="flex justify-between gap-2"><b className="text-emerald-800">+ {inr2(p.amount)} received</b><span className="text-slate-500">{when(p.paidAt)}</span></div>
                        <div className="text-slate-600 mt-0.5">Ref <span className="font-mono">{p.reference}</span> · {p.provider === "razorpay" ? "Razorpay (verified)" : p.provider === "legacy" ? "Before new system" : `${(p.method || "manual").toUpperCase()} · confirmed by ${p.confirmedByName || "admin"}`}</div>
                        {p.note && <div className="text-slate-500 mt-0.5">{p.note}</div>}
                      </li>
                    ))}
                    {c.movements.map((m) => (
                      <li key={m.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
                        <div className="flex justify-between gap-2"><b className={m.kind === "deduction" ? "text-red-700" : "text-slate-800"}>{m.kind === "refund" ? "− Refunded" : m.kind === "deduction" ? "− Deducted" : "Waived"} {inr2(m.amount)}</b><span className="text-slate-500">{when(m.at)}</span></div>
                        <div className="text-slate-600 mt-0.5">{m.reason}{m.reference ? ` · ref ${m.reference}` : ""}{m.byName ? ` · by ${m.byName}` : ""}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </Card>
          );
        })}
        {!charges.length && <Empty>No fee or deposit is set for this franchise.</Empty>}
      </div>

      {dialog?.type === "pay" && <PayDialog charge={dialog.charge} onClose={() => setDialog(null)} onDone={done} />}
      {dialog?.type === "waive" && <ReasonDialog title={`Waive ${dialog.charge.label.toLowerCase()} due`} charge={dialog.charge} confirmLabel={`Waive ${inr2(dialog.charge.outstanding)}`}
        note="The outstanding amount will be forgiven. This is recorded with your name and the reason."
        submit={(body) => adminAPI.waiveFranchiseCharge(dialog.charge.id, body)} onClose={() => setDialog(null)} onDone={() => done("Due waived")} />}
      {dialog?.type === "amount" && <AmountDialog charge={dialog.charge} onClose={() => setDialog(null)} onDone={done} />}
      {(dialog?.type === "refund" || dialog?.type === "deduct") && <DepositDialog kind={dialog.type} charge={dialog.charge} onClose={() => setDialog(null)} onDone={done} />}
    </div>
  );
}

function Cell({ label, value, sub, tone = "" }) {
  return (
    <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
      <div className="text-[10px] font-bold text-slate-400 uppercase">{label}</div>
      <div className={`text-sm font-black mt-0.5 ${tone || "text-slate-900"}`}>{value}</div>
      {sub && <div className="text-[10px] text-slate-400">{sub}</div>}
    </div>
  );
}

function useSubmit(onDone) {
  const [busy, setBusy] = useState(false);
  const run = async (fn, msg) => {
    if (busy) return;
    setBusy(true);
    try {
      await fn();
      await onDone(msg);
    } catch (e) {
      toast.error(errMsg(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  };
  return [busy, run];
}

function PayDialog({ charge, onClose, onDone }) {
  const [f, setF] = useState({ amount: String(charge.outstanding), reference: "", method: "neft", paidAt: istToday(), note: "" });
  const [verified, setVerified] = useState(false);
  const [busy, run] = useSubmit(onDone);
  const errors = {
    amount: !isAmount(f.amount, { allowZero: false }) ? "Enter a positive amount (max 2 decimals)" : Number(f.amount) > charge.outstanding ? `Max ${inr2(charge.outstanding)}` : "",
    reference: f.reference.trim().length < 4 ? "Bank UTR / UPI transaction id (min 4 characters)" : "",
    note: f.note.trim().length < 3 ? "Say how you verified it (e.g. seen in HDFC statement)" : "",
  };
  const valid = !errors.amount && !errors.reference && !errors.note && verified;
  const submit = () => run(() => adminAPI.confirmFranchiseChargePayment(charge.id, { ...f, paidAt: f.paidAt ? `${f.paidAt}T12:00:00+05:30` : undefined }), "Payment recorded");
  return (
    <Modal open title={`Record ${charge.label.toLowerCase()} payment`} onClose={onClose} footer={<>
      <button className={btn.ghost} onClick={onClose}>Cancel</button>
      <button className={btn.success} disabled={!valid || busy} onClick={submit}>{busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />} Record {isAmount(f.amount) ? inr2(f.amount) : ""}</button>
    </>}>
      <p className="text-xs text-slate-500">Outstanding: <b>{inr2(charge.outstanding)}</b>. Record only money that has actually reached the company account.</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Field label="Amount received (₹)" error={f.amount && errors.amount}><input inputMode="decimal" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
        <Field label="Paid on"><input type="date" max={istToday()} className={inputCls} value={f.paidAt} onChange={(e) => setF({ ...f, paidAt: e.target.value })} /></Field>
        <Field label="Method"><select className={inputCls} value={f.method} onChange={(e) => setF({ ...f, method: e.target.value })}>{METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></Field>
        <Field label="Reference (UTR / txn id)" error={f.reference && errors.reference}><input className={`${inputCls} font-mono`} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="e.g. HDFC0000123456" /></Field>
      </div>
      <Field label="How was it verified?" error={f.note && errors.note}><textarea rows={2} className={inputCls} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      <label className="flex items-start gap-2 text-xs font-semibold text-slate-700">
        <input type="checkbox" className="mt-0.5" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        I have checked this amount in the company bank / UPI account. A reference can be used only once.
      </label>
    </Modal>
  );
}

function ReasonDialog({ title, note, confirmLabel, submit, onClose, onDone }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async () => {
    setBusy(true);
    try {
      await submit({ reason });
      await onDone();
    } catch (e) {
      toast.error(errMsg(e, "Action failed"));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open title={title} onClose={onClose} footer={<>
      <button className={btn.ghost} onClick={onClose}>Cancel</button>
      <button className={btn.warn} disabled={reason.trim().length < 3 || busy} onClick={go}>{busy && <Loader2 className="w-4 h-4 animate-spin" />}{confirmLabel}</button>
    </>}>
      <p className="text-xs text-slate-500">{note}</p>
      <Field label="Reason (required)"><textarea rows={3} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </Modal>
  );
}

function AmountDialog({ charge, onClose, onDone }) {
  const [amount, setAmount] = useState(String(charge.expected));
  const [reason, setReason] = useState("");
  const [busy, run] = useSubmit(onDone);
  const min = (charge.paid || 0) + (charge.waived || 0);
  const err = !isAmount(amount) ? "Enter a valid amount" : Number(amount) < min ? `Cannot be below ${inr2(min)} (already paid/waived)` : "";
  return (
    <Modal open title={`Change ${charge.label.toLowerCase()}`} onClose={onClose} footer={<>
      <button className={btn.ghost} onClick={onClose}>Cancel</button>
      <button className={btn.primary} disabled={Boolean(err) || reason.trim().length < 3 || Number(amount) === charge.expected || busy}
        onClick={() => run(() => adminAPI.updateFranchiseChargeAmount(charge.id, { amount, reason }), "Amount updated")}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />} Save
      </button>
    </>}>
      <p className="text-xs text-slate-500">This overrides the zone price for this franchise only. Payments already recorded are not changed.</p>
      <Field label="New amount (₹)" error={err}><input inputMode="decimal" className={inputCls} value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
      <Field label="Reason (required)"><textarea rows={2} className={inputCls} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {Number(amount) > charge.expected && <p className="text-[11px] text-amber-700 font-semibold">The extra amount becomes outstanding. A franchise that is already running keeps operating; collect it like any due.</p>}
    </Modal>
  );
}

function DepositDialog({ kind, charge, onClose, onDone }) {
  const [f, setF] = useState({ amount: String(charge.held), reference: "", reason: "" });
  const [busy, run] = useSubmit(onDone);
  const refund = kind === "refund";
  const err = !isAmount(f.amount, { allowZero: false }) ? "Enter a positive amount" : Number(f.amount) > charge.held ? `Max ${inr2(charge.held)} is held` : "";
  const valid = !err && f.reason.trim().length >= 3 && (!refund || f.reference.trim().length >= 4);
  return (
    <Modal open title={refund ? "Refund security deposit" : "Deduct from security deposit"} onClose={onClose} footer={<>
      <button className={btn.ghost} onClick={onClose}>Cancel</button>
      <button className={refund ? btn.primary : btn.danger} disabled={!valid || busy}
        onClick={() => run(() => (refund ? adminAPI.refundFranchiseDeposit(charge.id, f) : adminAPI.deductFranchiseDeposit(charge.id, f)), refund ? "Deposit refunded" : "Deposit deducted")}>
        {busy && <Loader2 className="w-4 h-4 animate-spin" />}{refund ? "Record refund" : "Deduct"}
      </button>
    </>}>
      <p className="text-xs text-slate-500">Held now: <b>{inr2(charge.held)}</b>. {refund ? "Record the refund after the money was sent to the partner." : "The deducted amount is kept by the platform (e.g. unpaid dues, damages). The partner sees the reason."}</p>
      <Field label="Amount (₹)" error={f.amount && err}><input inputMode="decimal" className={inputCls} value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} /></Field>
      {refund && <Field label="Transfer reference (UTR)"><input className={`${inputCls} font-mono`} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>}
      <Field label="Reason (required)"><textarea rows={2} className={inputCls} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
    </Modal>
  );
}
