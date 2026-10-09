import React, { useState, useEffect, useCallback, Suspense, lazy } from 'react';
import { useNavigate, NavLink, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import {
  Car, Users, IndianRupee, LogOut, Clock, ChevronRight, CreditCard, Wallet, Bell, AlertTriangle,
  LayoutDashboard, Truck, FileText, Loader2, Building, Utensils, Lock, CheckCircle, Package, MessageSquare, TrendingUp, BusFront,
} from 'lucide-react';
import { clearModuleAuth, getCurrentUser } from "@food/utils/auth";
import { franchiseAPI } from "@food/api";
import {
  TaxiDashboardPage, TaxiRidesPage, TaxiBusPage, TaxiDriversPage, EarningsPage, WalletPage, SupportPage, StatCard,
} from './pages/FranchisePortalPages';

// Food pages (data is scoped to this franchise on the server by franchiseId)
const RestaurantsList = lazy(() => import('./pages/FranchiseRestaurantsList'));
const FoodsList = lazy(() => import('./pages/FranchiseFoodsList'));
const Category = lazy(() => import('./pages/FranchiseCategoryList'));
const OrdersPage = lazy(() => import('./pages/FranchiseOrdersList'));
const AddonsList = lazy(() => import('./pages/FranchiseAddonsList'));
const FoodApproval = lazy(() => import('./pages/FranchiseFoodApproval'));
const AddRestaurant = lazy(() => import('@food/pages/admin/restaurant/AddRestaurant'));
const JoiningRequest = lazy(() => import('@food/pages/admin/restaurant/JoiningRequest'));
const RestaurantCommission = lazy(() => import('@food/pages/admin/restaurant/RestaurantCommission'));
const RestaurantComplaints = lazy(() => import('@food/pages/admin/restaurant/RestaurantComplaints'));
const RestaurantReviews = lazy(() => import('@food/pages/admin/restaurant/RestaurantReviews'));
const OrderDetectDelivery = lazy(() => import('@food/pages/admin/OrderDetectDelivery'));

const cn = (...classes) => classes.filter(Boolean).join(' ');
const inr = (n) => `₹${Number(n || 0).toLocaleString('en-IN')}`;

const LockedPage = ({ moduleName }) => (
  <div className="bg-white rounded-[24px] border border-amber-200 p-8 shadow-sm flex flex-col items-center justify-center min-h-[400px]">
    <div className="w-16 h-16 rounded-2xl bg-amber-50 text-amber-500 flex items-center justify-center mb-4"><Lock size={32} /></div>
    <h2 className="text-xl font-bold text-slate-900 mb-2">Not part of your franchise</h2>
    <p className="text-slate-500 text-center max-w-md">Your franchise does not include the <strong>{moduleName}</strong> module. Contact the admin if you want to add it.</p>
  </div>
);

const Section = ({ title }) => (
  <div className="px-4 mb-3 flex items-center gap-2">
    <div className="h-3 w-1 rounded-full bg-white" />
    <span className="text-[11px] font-black uppercase tracking-widest text-white/90">{title}</span>
  </div>
);

export default function FranchiseDashboardUnified() {
  const navigate = useNavigate();
  const location = useLocation();
  const [expandedGroups, setExpandedGroups] = useState(['orders', 'restaurants', 'foods', 'categories']);

  const basePath = '/food/franchise/dashboard';
  const pathParts = location.pathname.replace(basePath, '').split('/').filter(Boolean);
  const activeModuleTab = pathParts[0] === 'taxi' ? 'taxi' : 'food';

  const [franchiseUser, setFranchiseUser] = useState(null);
  const [dash, setDash] = useState(null);
  const [dashError, setDashError] = useState('');
  const [allowedModules, setAllowedModules] = useState(null); // null = still loading

  const logout = () => {
    clearModuleAuth('admin');
    navigate('/food/franchise/login', { replace: true });
  };

  const loadDash = useCallback(async () => {
    try {
      const res = await franchiseAPI.getMyDashboard();
      const data = res?.data?.data || null;
      setDash(data);
      setDashError('');
      const mods = data?.partnerInfo?.selectedModules;
      if (Array.isArray(mods) && mods.length) setAllowedModules(mods);
      return data;
    } catch (err) {
      if (err?.response?.status === 401 || err?.response?.status === 403) { logout(); return null; }
      setDashError(err?.response?.data?.message || 'Could not load your franchise data');
      return null;
    }
  }, []);

  useEffect(() => {
    const user = getCurrentUser('admin');
    if (!user) { navigate('/food/franchise/login', { replace: true }); return; }
    setFranchiseUser(user);
    // The server's answer is the truth; the stored login is only a fallback while it loads
    const stored = Array.isArray(user.servicesAccess) && user.servicesAccess.length ? user.servicesAccess.filter((m) => m === 'food' || m === 'taxi') : ['food'];
    setAllowedModules((cur) => cur || stored);
    loadDash().then((data) => { if (!data) setAllowedModules((cur) => cur || stored); });
  }, []);

  const modules = allowedModules || ['food'];
  const hasFood = modules.includes('food');
  const hasTaxi = modules.includes('taxi');

  // A franchise can only open the module(s) it holds: anything else goes to its own module
  useEffect(() => {
    if (!allowedModules) return;
    const requested = pathParts[0];
    if ((requested === 'food' || requested === 'taxi') && !modules.includes(requested)) {
      navigate(`${basePath}/${modules[0]}/dashboard`, { replace: true });
    }
  }, [allowedModules, location.pathname]);

  const toggleGroup = (key) => setExpandedGroups((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));

  const SidebarItem = ({ id, label, icon: Icon, subItems, to }) => {
    if (subItems) {
      const isOpen = expandedGroups.includes(id);
      const isActive = subItems.some((sub) => location.pathname.includes(sub.to));
      return (
        <div className="space-y-1">
          <button onClick={() => toggleGroup(id)} className={cn('group w-full flex items-center justify-between px-4 py-2.5 rounded-xl transition-all duration-300', isOpen || isActive ? 'bg-white/10 text-white border border-white/15' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5')}>
            <div className="flex min-w-0 items-center gap-3"><Icon size={18} className="shrink-0" /><span className="truncate text-[14px] font-bold tracking-tight">{label}</span></div>
            <ChevronRight size={14} className={cn('transition-transform duration-300', isOpen && 'rotate-90')} />
          </button>
          {isOpen && (
            <div className="pl-6 pr-2 space-y-1">
              {subItems.map((sub) => (
                <NavLink key={sub.to} to={`${basePath}/${activeModuleTab}/${sub.to}`} className={({ isActive: a }) => cn('w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium transition-all text-left', a ? 'bg-white/5 text-white' : 'text-neutral-500 hover:text-neutral-200 hover:bg-white/5')}>
                  {({ isActive: a }) => (<><div className={cn('h-1 w-1 shrink-0 rounded-full', a ? 'bg-white' : 'bg-neutral-600')} /><span className="min-w-0 flex-1">{sub.label}</span></>)}
                </NavLink>
              ))}
            </div>
          )}
        </div>
      );
    }
    return (
      <NavLink to={`${basePath}/${activeModuleTab}/${to}`} className={({ isActive }) => cn('group w-full flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-300 text-left', isActive ? 'bg-white/10 text-white border border-white/15' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5')}>
        <Icon size={18} className="shrink-0" /><span className="min-w-0 flex-1 text-[14px] font-bold tracking-tight">{label}</span>
      </NavLink>
    );
  };

  const renderSidebar = () => {
    if (activeModuleTab === 'taxi') {
      if (!hasTaxi) return null;
      return (
        <>
          <SidebarItem id="taxi-dashboard" to="dashboard" label="Dashboard" icon={LayoutDashboard} />
          <div className="space-y-1 mt-4 pt-2 border-t border-white/5">
            <Section title="TAXI" />
            <SidebarItem id="rides" to="rides" label="Rides (city, outstation, parcel)" icon={Car} />
            <SidebarItem id="bus" to="bus" label="Bus, pooling & rental" icon={BusFront} />
            <SidebarItem id="drivers" to="drivers" label="Drivers" icon={Users} />
          </div>
          <div className="space-y-1 mt-4 pt-2 border-t border-white/5">
            <Section title="FINANCE & HELP" />
            <SidebarItem id="earnings" to="earnings" label="Earnings" icon={IndianRupee} />
            <SidebarItem id="wallet" to="wallet" label="Wallet & payouts" icon={Wallet} />
            <SidebarItem id="support" to="support" label="Support" icon={MessageSquare} />
          </div>
        </>
      );
    }
    if (!hasFood) return null;
    return (
      <>
        <SidebarItem id="food-dashboard" to="dashboard" label="Dashboard" icon={LayoutDashboard} />
        <div className="space-y-1 mt-4 pt-2 border-t border-white/5">
          <Section title="FOOD MANAGEMENT" />
          <SidebarItem id="food-approval" to="food-approval" label="Food Approval" icon={CheckCircle} />
          <SidebarItem id="foods" label="Foods" icon={Utensils} subItems={[{ to: 'foods/list', label: 'Restaurant Foods List' }, { to: 'foods/addons', label: 'Restaurant Addons List' }]} />
          <SidebarItem id="categories" label="Categories" icon={Building} subItems={[{ to: 'categories/list', label: 'Category' }]} />
        </div>
        <div className="space-y-1 mt-4 pt-2 border-t border-white/5">
          <Section title="RESTAURANTS" />
          <SidebarItem id="restaurants" label="Restaurants" icon={Building} subItems={[
            { to: 'restaurants/list', label: 'Restaurants List' }, { to: 'restaurants/add', label: 'Add New Restaurant' },
            { to: 'restaurants/joining', label: 'New Joining Request' }, { to: 'restaurants/commission', label: 'Restaurant Commission' },
            { to: 'restaurants/reviews', label: 'Restaurant Reviews' }, { to: 'restaurants/complaints', label: 'Restaurant Complaints' },
          ]} />
        </div>
        <div className="space-y-1 mt-4 pt-2 border-t border-white/5">
          <Section title="ORDERS" />
          <SidebarItem id="orders" label="Orders" icon={FileText} subItems={[
            { to: 'orders/all', label: 'All' }, { to: 'orders/pending', label: 'Pending' }, { to: 'orders/accepted', label: 'Accepted' },
            { to: 'orders/processing', label: 'Processing' }, { to: 'orders/on-the-way', label: 'Food On The Way' },
            { to: 'orders/delivered', label: 'Delivered' }, { to: 'orders/canceled', label: 'Cancelled' }, { to: 'orders/refunded', label: 'Refunded' },
          ]} />
          <SidebarItem id="order-detect" to="order-detect-delivery" label="Order Detect Delivery" icon={Truck} />
        </div>
        <div className="space-y-1 mt-4 pt-2 border-t border-white/5">
          <Section title="FINANCE & HELP" />
          <SidebarItem id="earnings" to="earnings" label="Earnings" icon={IndianRupee} />
          <SidebarItem id="wallet" to="wallet" label="Wallet & payouts" icon={Wallet} />
          <SidebarItem id="support" to="support" label="Support" icon={MessageSquare} />
        </div>
      </>
    );
  };

  const partnerName = franchiseUser?.name || dash?.partnerInfo?.applicantName || 'Franchise Partner';
  const partnerInitials = partnerName.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2) || 'FP';
  const feePending = dash?.financialSettings?.franchiseFeeStatus === 'pending';

  const Food = (el) => (hasFood ? el : <LockedPage moduleName="Food" />);
  const Taxi = (el) => (hasTaxi ? el : <LockedPage moduleName="Taxi" />);
  const tm = dash?.territoryMetrics || {};
  const earn = dash?.earningsByModule || {};

  return (
    <div className="flex h-screen bg-[#f6f7fb] font-sans text-slate-900 overflow-hidden">
      <aside className="w-72 flex-shrink-0 bg-neutral-950 flex flex-col z-20 shadow-2xl text-white">
        <div className="flex h-20 shrink-0 items-center px-6 border-b border-white/5">
          <div className="h-9 w-9 rounded-xl bg-indigo-600 flex items-center justify-center shrink-0">
            {activeModuleTab === 'taxi' ? <Car className="w-5 h-5 text-white" /> : <Utensils className="w-5 h-5 text-white" />}
          </div>
          <div className="ml-3 flex flex-col">
            <span className="text-[17px] font-black tracking-tight text-white leading-none">Raydo Partner</span>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">FRANCHISE PORTAL</span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-12 mt-6">
          {hasFood && hasTaxi ? (
            <div className="px-4 mb-6">
              <div className="flex p-1 bg-neutral-900/60 rounded-xl border border-white/5">
                {[['food', 'Food', Package], ['taxi', 'Taxi', Car]].map(([key, label, Icon]) => (
                  <button key={key} type="button" onClick={() => navigate(`${basePath}/${key}/dashboard`)} className={cn('flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all', activeModuleTab === key ? 'bg-white text-black shadow' : 'text-neutral-400 hover:text-neutral-200 hover:bg-white/5')}>
                    <Icon className="w-3.5 h-3.5" /> {label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="px-4 mb-4">
              <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-indigo-500/10 border border-indigo-500/20">
                {hasFood ? <Utensils size={14} className="text-indigo-400 shrink-0" /> : <Car size={14} className="text-indigo-400 shrink-0" />}
                <span className="text-xs font-bold text-indigo-300">{hasFood ? 'Food' : 'Taxi'} franchise</span>
              </div>
            </div>
          )}
          <nav className="space-y-4 px-4">{allowedModules ? renderSidebar() : <div className="py-10 flex justify-center"><Loader2 className="w-5 h-5 animate-spin text-neutral-500" /></div>}</nav>
        </div>
      </aside>

      <main className="flex-1 flex flex-col min-w-0 overflow-hidden relative">
        <header className="h-20 shrink-0 bg-white/80 backdrop-blur-xl border-b border-slate-200/60 flex items-center justify-between px-8 z-10 sticky top-0 shadow-sm">
          <h1 className="text-xl font-bold text-slate-800 tracking-tight">{activeModuleTab === 'taxi' ? '🚕 Taxi' : '🍽️ Food'} franchise</h1>
          <div className="flex items-center gap-4">
            <button className="p-2 rounded-xl bg-slate-50 text-slate-500 hover:bg-slate-100"><Bell size={20} /></button>
            <div className="flex items-center gap-3 pl-4 border-l border-slate-200">
              <div className="w-10 h-10 rounded-full bg-gradient-to-tr from-indigo-500 to-blue-500 text-white flex items-center justify-center font-bold text-sm">{partnerInitials}</div>
              <div className="mr-2">
                <p className="text-sm font-bold text-slate-800">{partnerName}</p>
                <p className="text-xs font-medium text-slate-500">{dash?.partnerInfo?.applicationId || 'Franchise Partner'}</p>
              </div>
              <button onClick={logout} className="p-2 rounded-xl bg-red-50 text-red-600 hover:bg-red-100 flex items-center gap-2" title="Logout"><LogOut size={18} /><span className="text-sm font-semibold">Logout</span></button>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 scroll-smooth bg-[#f6f7fb]">
          <div className="max-w-[1600px] mx-auto space-y-6">
            {dashError && <div className="p-4 rounded-2xl bg-red-50 border border-red-200 text-sm font-semibold text-red-700 flex items-center justify-between gap-3"><span><AlertTriangle className="w-4 h-4 inline mr-2" />{dashError}</span><button onClick={loadDash} className="px-3 py-1.5 rounded-lg bg-white border border-red-200 text-xs font-bold">Retry</button></div>}
            {feePending && <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200 text-sm font-semibold text-amber-800">Your franchise fee is still pending. Payouts are locked until it is paid.</div>}

            <Suspense fallback={<div className="flex h-[500px] items-center justify-center"><Loader2 className="animate-spin text-indigo-500 w-12 h-12" /></div>}>
              <Routes>
                <Route path="/" element={<Navigate to={`${hasFood ? 'food' : 'taxi'}/dashboard`} replace />} />

                {/* TAXI */}
                <Route path="taxi/dashboard" element={Taxi(<TaxiDashboardPage />)} />
                <Route path="taxi/rides" element={Taxi(<TaxiRidesPage />)} />
                <Route path="taxi/bus" element={Taxi(<TaxiBusPage />)} />
                <Route path="taxi/drivers" element={Taxi(<TaxiDriversPage />)} />
                <Route path="taxi/earnings" element={Taxi(<EarningsPage dash={dash} modules={modules} />)} />
                <Route path="taxi/wallet" element={Taxi(<WalletPage dash={dash} reload={loadDash} />)} />
                <Route path="taxi/support" element={Taxi(<SupportPage dash={dash} reload={loadDash} />)} />

                {/* FOOD */}
                <Route path="food/dashboard" element={Food(
                  !dash ? <div className="flex h-[300px] items-center justify-center"><Loader2 className="animate-spin text-indigo-500 w-9 h-9" /></div> : (
                    <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
                      <StatCard label="Restaurants" value={tm.activeOutletsCount ?? 0} icon={Building} tone="amber" />
                      <StatCard label="Orders" value={tm.totalOrders ?? 0} sub={`${tm.deliveredOrders ?? 0} delivered`} icon={FileText} tone="blue" />
                      <StatCard label="Delivered order value" value={inr(tm.totalGMV)} icon={TrendingUp} tone="violet" />
                      <StatCard label="Your food earnings" value={inr(earn.food)} sub={`${dash?.financialSettings?.commissionRate ?? 0}% commission`} icon={IndianRupee} tone="emerald" />
                    </div>
                  )
                )} />
                <Route path="food/food-approval" element={Food(<FoodApproval />)} />
                <Route path="food/foods/list" element={Food(<FoodsList />)} />
                <Route path="food/foods/addons" element={Food(<AddonsList />)} />
                <Route path="food/categories/list" element={Food(<Category />)} />
                <Route path="food/restaurants/list" element={Food(<RestaurantsList />)} />
                <Route path="food/restaurants/add" element={Food(<AddRestaurant />)} />
                <Route path="food/restaurants/joining" element={Food(<JoiningRequest />)} />
                <Route path="food/restaurants/commission" element={Food(<RestaurantCommission />)} />
                <Route path="food/restaurants/reviews" element={Food(<RestaurantReviews />)} />
                <Route path="food/restaurants/complaints" element={Food(<RestaurantComplaints />)} />
                <Route path="food/orders/all" element={Food(<OrdersPage statusKey="all" />)} />
                <Route path="food/orders/pending" element={Food(<OrdersPage statusKey="pending" />)} />
                <Route path="food/orders/accepted" element={Food(<OrdersPage statusKey="accepted" />)} />
                <Route path="food/orders/processing" element={Food(<OrdersPage statusKey="processing" />)} />
                <Route path="food/orders/on-the-way" element={Food(<OrdersPage statusKey="food-on-the-way" />)} />
                <Route path="food/orders/delivered" element={Food(<OrdersPage statusKey="delivered" />)} />
                <Route path="food/orders/canceled" element={Food(<OrdersPage statusKey="canceled" />)} />
                <Route path="food/orders/refunded" element={Food(<OrdersPage statusKey="refunded" />)} />
                <Route path="food/order-detect-delivery" element={Food(<OrderDetectDelivery />)} />
                <Route path="food/earnings" element={Food(<EarningsPage dash={dash} modules={modules} />)} />
                <Route path="food/wallet" element={Food(<WalletPage dash={dash} reload={loadDash} />)} />
                <Route path="food/support" element={Food(<SupportPage dash={dash} reload={loadDash} />)} />

                {/* Old links (POS, delivery fee, deliveryman) were empty placeholder pages: send them to the dashboard */}
                <Route path="*" element={<Navigate to={`${basePath}/${activeModuleTab}/dashboard`} replace />} />
              </Routes>
            </Suspense>
          </div>
        </div>
      </main>
    </div>
  );
}
