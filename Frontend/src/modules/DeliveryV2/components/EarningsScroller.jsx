import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, XCircle, Wallet, IndianRupee, CalendarDays, Star, Package, Banknote } from 'lucide-react';
import { deliveryAPI } from '@food/api';

const REFRESH_MS = 60000;
// Rounded off: no decimal point shown
const money = (value) => `₹${Math.round(Number(value) || 0).toLocaleString('en-IN')}`;

/**
 * Rapido style horizontal strip on top of the delivery home: wallet balance, today's earnings, week earnings,
 * rating, orders and cash in hand - swipe sideways to see all. Tapping a card opens Pocket.
 */
const EarningsScroller = () => {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [stats, setStats] = useState({
    balance: 0, today: 0, todayOrders: 0, todayTaken: 0, todayCancelled: 0, todayPending: 0, week: 0, cashInHand: 0, rating: 0,
  });

  const load = useCallback(async () => {
    const [profileOutcome, todayOutcome, weekOutcome, walletOutcome] = await Promise.allSettled([
      deliveryAPI.getProfile(),
      deliveryAPI.getEarnings({ period: 'today' }),
      deliveryAPI.getEarnings({ period: 'week' }),
      deliveryAPI.getWallet(),
    ]);
    const pick = (outcome) => (outcome.status === 'fulfilled' ? outcome.value : null);

    const profile = pick(profileOutcome)?.data?.data?.profile || {};
    const today = pick(todayOutcome)?.data?.data?.summary || {};
    const week = pick(weekOutcome)?.data?.data?.summary || {};
    const wallet = pick(walletOutcome)?.data?.data?.wallet || {};

    setStats({
      balance: Number(wallet.unifiedBalance ?? wallet.pocketBalance) || 0,
      today: Number(today.totalEarnings) || 0,
      todayOrders: Number(today.completedOrders ?? today.totalOrders) || 0,
      todayTaken: Number(today.takenOrders) || 0,
      todayCancelled: Number(today.cancelledOrders) || 0,
      todayPending: Number(today.pendingOrders) || 0,
      week: Number(week.totalEarnings) || 0,
      cashInHand: Number(wallet.cashInHand) || 0,
      rating: Number(profile.rating ?? profile.metrics?.rating ?? profile.ratings?.average ?? profile.averageRating) || 0,
    });
  }, []);

  useEffect(() => {
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    window.addEventListener('focus', load);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', load);
    };
  }, [load]);

  // orders taken today = completed + cancelled + still running
  const taken = Math.max(stats.todayTaken, stats.todayOrders + stats.todayCancelled + stats.todayPending);

  const cards = [
    { key: 'balance', label: 'Wallet balance', value: money(stats.balance), Icon: Wallet },
    { key: 'today', label: "Today's earnings", value: money(stats.today), Icon: IndianRupee },
    { key: 'orders', label: 'Orders completed', value: `${stats.todayOrders}/${taken}`, Icon: Package },
    { key: 'cancelled', label: 'Cancelled / running', value: `${stats.todayCancelled} / ${stats.todayPending}`, Icon: XCircle },
    { key: 'week', label: 'This week', value: money(stats.week), Icon: CalendarDays },
    { key: 'rating', label: 'Rating', value: stats.rating > 0 ? stats.rating.toFixed(1) : '—', Icon: Star },
    { key: 'cash', label: 'Cash in hand', value: money(stats.cashInHand), Icon: Banknote },
  ];

  return (
    <div className="px-4 pt-2">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/10 px-3.5 py-2 text-white active:scale-[0.99] transition-all"
      >
        <span className="flex items-center gap-2 text-[11px] font-bold">
          <Wallet className="h-4 w-4 text-[#FFC107]" />
          Earnings &amp; Wallet
        </span>
        <span className="flex items-center gap-2 text-xs font-extrabold text-[#FFC107]">
          {money(stats.today)}
          <span className="text-[10px] font-semibold text-white/60">· {stats.todayOrders}/{taken} done</span>
          <ChevronDown className={`h-4 w-4 transition-transform duration-300 ${open ? 'rotate-180' : ''}`} />
        </span>
      </button>
      {open && (
    <div className="-mx-4 flex gap-2.5 overflow-x-auto px-4 pt-2 pb-1 no-scrollbar snap-x">
      {cards.map(({ key, label, value, Icon }) => (
        <button
          key={key}
          type="button"
          onClick={() => navigate('/food/delivery/pocket')}
          className="snap-start shrink-0 min-w-[132px] rounded-xl bg-white px-3 py-2 text-left shadow-md active:scale-95 transition-all"
        >
          <div className="flex items-center gap-1.5 text-gray-500">
            <Icon className={`h-3.5 w-3.5 ${key === 'rating' ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span className="text-[10px] font-semibold whitespace-nowrap">{label}</span>
          </div>
          <p className="mt-1 text-lg font-black leading-tight text-gray-900">{value}</p>
        </button>
      ))}
    </div>
      )}
    </div>
  );
};

export default EarningsScroller;
