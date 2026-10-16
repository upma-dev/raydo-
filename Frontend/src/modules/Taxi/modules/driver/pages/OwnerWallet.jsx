import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Banknote, CheckCircle2, Clock3, Loader2, RefreshCw, X } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../../../shared/api/axiosInstance';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import OwnerAppBar from '../components/OwnerAppBar';
import { getLocalDriverToken } from '../services/registrationService';

const money = (value) => {
  const amount = Number(value || 0);
  return `${amount < 0 ? '-' : ''}₹${Math.abs(amount).toLocaleString('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
};

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return 'Just now';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const withdrawalMeta = (status = '') => {
  const s = String(status).toLowerCase();
  if (s === 'completed' || s === 'approved') {
    return { label: 'Paid', className: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
  }
  if (s === 'cancelled' || s === 'rejected') {
    return { label: 'Rejected', className: 'bg-rose-50 text-rose-700 border-rose-200' };
  }
  return { label: 'Pending', className: 'bg-amber-50 text-amber-700 border-amber-200' };
};

const FILTERS = [
  { id: 'all', label: 'All' },
  { id: 'credit', label: 'Money In' },
  { id: 'debit', label: 'Money Out' },
];

const authConfig = () => {
  const token = getLocalDriverToken();
  if (!token) throw new Error('Session expired. Please login again.');
  return { headers: { Authorization: `Bearer ${token}` } };
};

const inputCls =
  'w-full rounded-2xl border border-[#D6E6FB] bg-[#F7FAFF] px-3.5 py-3 text-sm font-bold text-[#0B2A5B] outline-none focus:border-[#2F80ED]';

const OwnerWallet = () => {
  const [wallet, setWallet] = useState({ balance: 0 });
  const [transactions, setTransactions] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ amount: '', upiId: '', accountNumber: '', ifscCode: '' });

  const load = useCallback(async ({ silent = false } = {}) => {
    if (silent) setRefreshing(true);
    setError('');
    try {
      const response = await api.get('/drivers/wallet', authConfig());
      const data = response?.data || response || {};
      setWallet(data.wallet || { balance: 0 });
      setTransactions(Array.isArray(data.transactions) ? data.transactions : []);
      setWithdrawals(Array.isArray(data.withdrawalRequests) ? data.withdrawalRequests : []);
    } catch (requestError) {
      setError(requestError?.response?.data?.message || requestError?.message || 'Could not load wallet.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const balance = Number(wallet.balance || 0);
  const minimum = Number(wallet.minimumTransferAmount || 0);
  const transferEnabled = wallet.isTransferEnabled !== false;
  const pendingTotal = useMemo(
    () =>
      withdrawals
        .filter((item) => String(item.status).toLowerCase() === 'pending')
        .reduce((sum, item) => sum + Number(item.amount || 0), 0),
    [withdrawals],
  );
  const visibleTransactions = useMemo(
    () => transactions.filter((tx) => filter === 'all' || tx.kind === filter),
    [transactions, filter],
  );

  const submitWithdraw = async (event) => {
    event.preventDefault();
    const amount = Number(form.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error('Enter a valid amount');
      return;
    }
    if (amount > balance) {
      toast.error('Amount cannot exceed your balance');
      return;
    }
    if (minimum > 0 && amount < minimum) {
      toast.error(`Minimum withdrawal is ${money(minimum)}`);
      return;
    }
    if (!form.upiId.trim() && !(form.accountNumber.trim() && form.ifscCode.trim())) {
      toast.error('Enter a UPI ID or bank account number with IFSC');
      return;
    }

    setSubmitting(true);
    try {
      await api.post(
        '/drivers/wallet/withdrawals',
        {
          amount,
          upiId: form.upiId.trim(),
          accountNumber: form.accountNumber.trim(),
          ifscCode: form.ifscCode.trim(),
        },
        authConfig(),
      );
      toast.success('Withdrawal request sent to admin');
      setShowWithdraw(false);
      setForm({ amount: '', upiId: '', accountNumber: '', ifscCode: '' });
      await load({ silent: true });
    } catch (requestError) {
      toast.error(requestError?.response?.data?.message || requestError?.message || 'Withdrawal failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#EEF5FF] pb-32">
      <OwnerAppBar
        title="Wallet"
        subtitle="Balance, history and payouts"
        backTo="/taxi/owner/dashboard"
        actions={
          <button
            type="button"
            onClick={() => load({ silent: true })}
            aria-label="Refresh"
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15 active:scale-95"
          >
            <RefreshCw size={16} className={refreshing ? 'animate-spin' : ''} />
          </button>
        }
      />

      <div className="space-y-4 px-4 pt-4">
        {loading ? (
          <div className="flex justify-center py-20 text-[#0B2A5B]">
            <Loader2 className="animate-spin" />
          </div>
        ) : (
          <>
            {error ? (
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
                <span>{error}</span>
                <button
                  type="button"
                  onClick={() => load()}
                  className="rounded-full bg-rose-600 px-3 py-1 text-[11px] font-black text-white"
                >
                  Retry
                </button>
              </div>
            ) : null}

            {/* Compact balance row */}
            <section className="flex items-center justify-between gap-3 rounded-2xl border border-[#D6E6FB] bg-white p-4 shadow-[0_4px_12px_rgba(11,42,91,0.06)]">
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#6B83A6]">
                  Available Balance
                </p>
                <p className="truncate text-2xl font-black text-[#0B2A5B]">{money(balance)}</p>
                {pendingTotal > 0 ? (
                  <p className="mt-0.5 flex items-center gap-1 text-[11px] font-bold text-amber-600">
                    <Clock3 size={11} /> {money(pendingTotal)} payout pending
                  </p>
                ) : null}
              </div>
              <button
                type="button"
                disabled={!transferEnabled || balance <= 0}
                onClick={() => setShowWithdraw(true)}
                className="shrink-0 rounded-xl bg-[#0B2A5B] px-4 py-2.5 text-xs font-black text-white active:scale-95 disabled:opacity-40"
              >
                Withdraw
              </button>
            </section>
            {!transferEnabled ? (
              <p className="px-1 text-[11px] font-bold text-amber-700">Withdrawals are currently disabled by admin.</p>
            ) : null}

            {/* Payout requests */}
            {withdrawals.length > 0 ? (
              <section>
                <h2 className="mb-2 px-1 text-[11px] font-black uppercase tracking-widest text-[#6B83A6]">
                  Payout Requests
                </h2>
                <div className="space-y-2">
                  {withdrawals.slice(0, 5).map((item) => {
                    const meta = withdrawalMeta(item.status);
                    return (
                      <div
                        key={item._id}
                        className="flex items-center justify-between rounded-2xl border border-[#D6E6FB] bg-white p-3"
                      >
                        <div className="flex items-center gap-3">
                          <div className="grid h-10 w-10 place-items-center rounded-xl bg-[#E8F1FF] text-[#0B2A5B]">
                            <Banknote size={18} />
                          </div>
                          <div>
                            <p className="text-sm font-black text-[#0B2A5B]">{money(item.amount)}</p>
                            <p className="text-[10px] font-semibold text-[#6B83A6]">
                              {formatDate(item.createdAt)} • {item.payment_method === 'upi' ? 'UPI' : 'Bank'}
                            </p>
                          </div>
                        </div>
                        <span
                          className={`rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase ${meta.className}`}
                        >
                          {meta.label}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </section>
            ) : null}

            {/* History */}
            <section>
              <div className="mb-2 flex items-center justify-between px-1">
                <h2 className="text-[11px] font-black uppercase tracking-widest text-[#6B83A6]">
                  Transactions
                </h2>
                <div className="flex gap-1.5">
                  {FILTERS.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setFilter(item.id)}
                      className={`rounded-full px-3 py-1 text-[10px] font-black ${
                        filter === item.id
                          ? 'bg-[#0B2A5B] text-white'
                          : 'border border-[#D6E6FB] bg-white text-[#6B83A6]'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {visibleTransactions.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-[#9DB8DF] bg-white p-8 text-center text-xs font-bold text-[#6B83A6]">
                  No transactions yet.
                </div>
              ) : (
                <div className="space-y-2">
                  {visibleTransactions.map((tx) => {
                    const credit = tx.kind === 'credit';
                    return (
                      <div
                        key={tx._id}
                        className="flex items-center justify-between gap-3 rounded-2xl border border-[#D6E6FB] bg-white p-3"
                      >
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${
                              credit ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'
                            }`}
                          >
                            {credit ? <ArrowDownLeft size={18} /> : <ArrowUpRight size={18} />}
                          </div>
                          <div className="min-w-0">
                            <p className="truncate text-xs font-black text-[#0B2A5B]">
                              {tx.description || (credit ? 'Credit' : 'Debit')}
                            </p>
                            <p className="text-[10px] font-semibold text-[#6B83A6]">
                              {formatDate(tx.createdAt)} • Bal {money(tx.balance)}
                            </p>
                          </div>
                        </div>
                        <p
                          className={`shrink-0 text-sm font-black ${credit ? 'text-emerald-600' : 'text-rose-600'}`}
                        >
                          {credit ? '+' : '-'}
                          {money(Math.abs(tx.amount)).replace('-', '')}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>
          </>
        )}
      </div>

      {/* Withdraw sheet */}
      {showWithdraw ? (
        <div className="fixed inset-0 z-[60] flex items-end justify-center bg-[#0A1F44]/60 backdrop-blur-sm">
          <form
            onSubmit={submitWithdraw}
            className="w-full max-w-xl space-y-3 rounded-t-3xl bg-white p-5 pb-8"
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-black text-[#0B2A5B]">Withdraw Money</h3>
              <button
                type="button"
                onClick={() => setShowWithdraw(false)}
                aria-label="Close"
                className="grid h-8 w-8 place-items-center rounded-full bg-[#EEF5FF] text-[#0B2A5B]"
              >
                <X size={16} />
              </button>
            </div>
            <p className="text-[11px] font-bold text-[#6B83A6]">
              Available {money(balance)}
              {minimum > 0 ? ` • Minimum ${money(minimum)}` : ''}
            </p>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="0.01"
              placeholder="Amount (₹)"
              value={form.amount}
              onChange={(e) => setForm((c) => ({ ...c, amount: e.target.value }))}
              className={inputCls}
              required
            />
            <input
              type="text"
              placeholder="UPI ID (e.g. name@upi)"
              value={form.upiId}
              onChange={(e) => setForm((c) => ({ ...c, upiId: e.target.value }))}
              className={inputCls}
            />
            <p className="text-center text-[10px] font-black uppercase tracking-widest text-[#8EA3C2]">
              or bank account
            </p>
            <div className="grid grid-cols-2 gap-3">
              <input
                type="text"
                placeholder="Account number"
                value={form.accountNumber}
                onChange={(e) => setForm((c) => ({ ...c, accountNumber: e.target.value }))}
                className={inputCls}
              />
              <input
                type="text"
                placeholder="IFSC code"
                value={form.ifscCode}
                onChange={(e) => setForm((c) => ({ ...c, ifscCode: e.target.value.toUpperCase() }))}
                className={inputCls}
              />
            </div>
            <button
              type="submit"
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0B2A5B] py-3.5 text-sm font-black text-white active:scale-[0.98] disabled:opacity-60"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle2 size={16} />}
              {submitting ? 'Sending...' : 'Send Request'}
            </button>
          </form>
        </div>
      ) : null}

      <DriverBottomNav />
    </div>
  );
};

export default OwnerWallet;
