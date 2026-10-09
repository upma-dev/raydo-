import React, { useState, useEffect, useCallback } from 'react';
import { Routes, Route, useNavigate, useLocation, Navigate } from 'react-router-dom';
import {
  Car, MapPin, Users, TrendingUp, DollarSign, Settings, LogOut,
  Shield, Clock, Zap, Plus, Search, Filter, CheckCircle, XCircle,
  ChevronRight, RefreshCw, CreditCard, Wallet, Bell, AlertTriangle,
  LayoutDashboard, Truck, Star, FileText, BarChart2, Eye, EyeOff,
  Save, Edit, X, Check, ChevronDown, Loader2, ArrowUpRight, ArrowDownLeft,
  Building, Phone, Mail, User, Hash, Percent, Package, ToggleLeft, ToggleRight,
  Activity, AlertCircle, Ban, UserCheck, MonitorPlay
} from 'lucide-react';
import { toast } from 'sonner';

const BASE_URL = import.meta.env.VITE_TAXI_API_URL || '/api/v1/taxi';

const franchiseApi = {
  login: async (email, password) => {
    const res = await fetch(`${BASE_URL}/taxi-franchise/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Login failed');
    return data.data;
  },
  _get: async (path, token) => {
    const res = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data.data;
  },
  _post: async (path, token, body) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data.data;
  },
  _patch: async (path, token, body) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data.data;
  },
  _put: async (path, token, body) => {
    const res = await fetch(`${BASE_URL}${path}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data.message || 'Request failed');
    return data.data;
  },
};

const STORAGE_KEY = 'taxi_franchise_auth';
const saveAuth = (token, partner) => localStorage.setItem(STORAGE_KEY, JSON.stringify({ token, partner }));
const loadAuth = () => { try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null'); } catch { return null; } };
const clearAuth = () => localStorage.removeItem(STORAGE_KEY);

function StatCard({ icon: Icon, label, value, sub, colorClass = 'text-blue-500 bg-blue-50' }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="flex items-center gap-4">
        <div className={`flex h-12 w-12 items-center justify-center rounded-2xl ${colorClass}`}>
          <Icon size={24} />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">{label}</p>
          <p className="text-2xl font-bold text-slate-900 mt-0.5">{value}</p>
          {sub && <p className="text-[11px] font-medium text-slate-500 mt-1">{sub}</p>}
        </div>
      </div>
    </div>
  );
}

function Badge({ children, active }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${active ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
      {children}
    </span>
  );
}

function LoginScreen({ onLogin }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!email || !password) return toast.error('Please enter email and password');
    setLoading(true);
    try {
      const { token, partner } = await franchiseApi.login(email, password);
      saveAuth(token, partner);
      onLogin(token, partner);
      toast.success(`Welcome back, ${partner.name}!`);
    } catch (err) {
      toast.error(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] flex items-center justify-center p-4 font-sans">
      <div className="w-full max-w-md bg-white border border-slate-200 rounded-[32px] p-8 shadow-sm">
        <div className="text-center mb-8">
          <div className="w-16 h-16 rounded-[20px] bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
            <Car size={32} />
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Taxi Franchise Portal</h1>
          <p className="text-sm font-medium text-slate-500 mt-2">Sign in to manage your zone</p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-2">Email Address</label>
            <div className="relative">
              <Mail size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="franchise@example.com" className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium" />
            </div>
          </div>
          <div>
            <label className="block text-[12px] font-bold text-slate-700 mb-2">Password</label>
            <div className="relative">
              <Shield size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type={showPw ? 'text' : 'password'} value={password} onChange={e => setPassword(e.target.value)} placeholder="Enter your password" className="w-full pl-11 pr-12 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 transition-all font-medium" />
              <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                {showPw ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={loading} className="w-full py-3.5 rounded-xl bg-[#2563EB] text-white text-[13px] font-bold uppercase tracking-widest shadow-lg shadow-blue-900/20 hover:bg-blue-700 transition-all flex items-center justify-center gap-2 mt-4">
            {loading ? <Loader2 size={18} className="animate-spin" /> : null}
            {loading ? 'Signing in...' : 'Sign In to Dashboard'}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function TaxiFranchiseDashboard({ superAdmin }) {
  if (superAdmin) return <SuperAdminFranchiseView />;

  const [auth, setAuth] = useState(() => loadAuth());
  const location = useLocation();
  const navigate = useNavigate();
  
  const pathSegments = location.pathname.split('/').filter(Boolean);
  const lastSegment = pathSegments[pathSegments.length - 1];
  const activeTab = (lastSegment === 'franchise-portal' || !lastSegment) ? 'overview' : lastSegment;

  const setActiveTab = (tab) => {
    navigate(`/taxi/franchise-portal${tab === 'overview' ? '' : `/${tab}`}`);
  };

  const [loading, setLoading] = useState(false);

  const [dashStats, setDashStats] = useState(null);
  const [drivers, setDrivers] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);
  const [zonePrices, setZonePrices] = useState([]);
  const [zoneSettings, setZoneSettings] = useState(null);
  const [earnings, setEarnings] = useState(null);

  const [showAddDriver, setShowAddDriver] = useState(false);
  const [showBankModal, setShowBankModal] = useState(false);
  const [showPayoutModal, setShowPayoutModal] = useState(false);
  const [editingPrice, setEditingPrice] = useState(null);

  const [driverForm, setDriverForm] = useState({ name: '', phone: '', email: '', password: '', vehicleType: 'car', vehicleMake: '', vehicleModel: '', vehicleNumber: '', vehicleColor: '' });
  const [bankForm, setBankForm] = useState({ bankName: '', accountNumber: '', ifscCode: '', upiId: '', accountHolderName: '' });
  const [payoutForm, setPayoutForm] = useState({ amount: '', payoutMethod: 'bank' });
  const [settingsForm, setSettingsForm] = useState({
    cancelWaitingTimeSeconds: 120, driverWaitingChargePerMin: 2, freeWaitingMinutes: 3,
    enableRide: true, enableOutstation: false, enableDelivery: false, enablePooling: false, enableRental: false,
  });
  const [savingSettings, setSavingSettings] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [searchDriver, setSearchDriver] = useState('');

  const token = auth?.token;
  const partner = auth?.partner;

  const handleLogin = (token, partner) => setAuth({ token, partner });
  const handleLogout = () => { clearAuth(); setAuth(null); toast.success('Logged out'); };

  const fetchDashboard = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try { setDashStats(await franchiseApi._get('/taxi-franchise/dashboard', token)); } 
    catch (err) { toast.error(err.message); } 
    finally { setLoading(false); }
  }, [token]);

  const fetchDrivers = useCallback(async () => {
    if (!token) return;
    try { const data = await franchiseApi._get('/taxi-franchise/drivers?limit=100', token); setDrivers(data?.results || []); } 
    catch (err) { toast.error(err.message); }
  }, [token]);

  const fetchVehicleTypes = useCallback(async () => {
    if (!token) return;
    try { const data = await franchiseApi._get('/taxi-franchise/vehicle-types', token); setVehicleTypes(data?.vehicles || []); } 
    catch (err) { console.warn(err.message); }
  }, [token]);

  const fetchZonePrices = useCallback(async () => {
    if (!token) return;
    try { const data = await franchiseApi._get('/taxi-franchise/prices', token); setZonePrices(data?.prices || []); } 
    catch (err) { console.warn(err.message); }
  }, [token]);

  const fetchZoneSettings = useCallback(async () => {
    if (!token) return;
    try { 
      const data = await franchiseApi._get('/taxi-franchise/zone-settings', token); 
      setZoneSettings(data); 
      if (data?.zoneSettings) setSettingsForm(prev => ({ ...prev, ...data.zoneSettings }));
    } catch (err) { console.warn(err.message); }
  }, [token]);

  const fetchEarnings = useCallback(async () => {
    if (!token) return;
    try { setEarnings(await franchiseApi._get('/taxi-franchise/earnings', token)); } 
    catch (err) { console.warn(err.message); }
  }, [token]);

  useEffect(() => {
    if (token) { fetchDashboard(); fetchDrivers(); fetchVehicleTypes(); }
  }, [token, fetchDashboard, fetchDrivers, fetchVehicleTypes]);

  useEffect(() => {
    if (token && activeTab === 'prices') fetchZonePrices();
    if (token && activeTab === 'settings') fetchZoneSettings();
    if (token && activeTab === 'earnings') fetchEarnings();
  }, [activeTab, token, fetchZonePrices, fetchZoneSettings, fetchEarnings]);

  const handleAddDriver = async (e) => {
    e.preventDefault();
    if (!driverForm.name || !driverForm.phone || !driverForm.password) return toast.error('Name, phone and password are required');
    setSubmitting(true);
    try {
      await franchiseApi._post('/taxi-franchise/drivers', token, driverForm);
      toast.success('Driver registered in your zone');
      setShowAddDriver(false);
      setDriverForm({ name: '', phone: '', email: '', password: '', vehicleType: 'car', vehicleMake: '', vehicleModel: '', vehicleNumber: '', vehicleColor: '' });
      fetchDrivers(); fetchDashboard();
    } catch (err) { toast.error(err.message); } finally { setSubmitting(false); }
  };

  const handleToggleDriver = async (driverId, currentApprove) => {
    try {
      await franchiseApi._patch(`/taxi-franchise/drivers/${driverId}/status`, token, { approve: !currentApprove, status: !currentApprove ? 'approved' : 'pending' });
      toast.success('Driver status updated'); fetchDrivers();
    } catch (err) { toast.error(err.message); }
  };

  const handleSaveSettings = async () => {
    setSavingSettings(true);
    try { await franchiseApi._patch('/taxi-franchise/zone-settings', token, settingsForm); toast.success('Zone settings saved'); } 
    catch (err) { toast.error(err.message); } finally { setSavingSettings(false); }
  };

  const handleSaveBankDetails = async () => {
    setSubmitting(true);
    try { await franchiseApi._put('/taxi-franchise/bank-details', token, bankForm); toast.success('Bank details saved'); setShowBankModal(false); } 
    catch (err) { toast.error(err.message); } finally { setSubmitting(false); }
  };

  const handleRequestPayout = async () => {
    if (!payoutForm.amount || Number(payoutForm.amount) <= 0) return toast.error('Enter a valid amount');
    setSubmitting(true);
    try {
      await franchiseApi._post('/taxi-franchise/payout/request', token, payoutForm);
      toast.success('Payout request submitted'); setShowPayoutModal(false); fetchEarnings(); fetchDashboard();
    } catch (err) { toast.error(err.message); } finally { setSubmitting(false); }
  };

  const handleUpdatePrice = async (priceId, fields) => {
    try { await franchiseApi._patch(`/taxi-franchise/prices/${priceId}`, token, fields); toast.success('Price updated'); setEditingPrice(null); fetchZonePrices(); } 
    catch (err) { toast.error(err.message); }
  };

  if (!auth) return <LoginScreen onLogin={handleLogin} />;

  const stats = dashStats?.stats || {};
  const filteredDrivers = drivers.filter(d => !searchDriver || d.name?.toLowerCase().includes(searchDriver.toLowerCase()) || d.phone?.includes(searchDriver));

  const TABS = [
    { id: 'overview', label: 'Dashboard', icon: LayoutDashboard, section: 'Overview' },
    { id: 'drivers', label: 'Zone Drivers', icon: Users, section: 'Driver Management' },
    { id: 'vehicle-types', label: 'Vehicle Types', icon: Truck, section: 'Price Management' },
    { id: 'prices', label: 'Set Price', icon: DollarSign, section: 'Price Management' },
    { id: 'settings', label: 'App Modules', icon: Settings, section: 'Zone Settings' },
    { id: 'earnings', label: 'Earnings & Payouts', icon: TrendingUp, section: 'Financials' },
  ];

  const renderContent = () => {
    switch (activeTab) {
      case 'overview': return (
        <div className="animate-in fade-in duration-300">
          <div className="mb-6">
            <h1 className="text-2xl font-bold text-slate-900">Welcome, {partner?.name}</h1>
            <p className="mt-1 text-sm text-slate-500">Manage your franchise operations for <span className="font-bold text-slate-700">{partner?.zoneName}</span>.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5 mb-8">
            <StatCard icon={Users} label="Total Drivers" value={stats.totalDrivers ?? '—'} sub="In your zone" colorClass="bg-blue-50 text-blue-600" />
            <StatCard icon={Activity} label="Online Now" value={stats.activeDrivers ?? '—'} sub="Active drivers" colorClass="bg-emerald-50 text-emerald-600" />
            <StatCard icon={Car} label="Today's Rides" value={stats.todayRides ?? '—'} sub="In zone today" colorClass="bg-orange-50 text-orange-600" />
            <StatCard icon={Wallet} label="Wallet Balance" value={`₹${(stats.walletBalance || 0).toFixed(2)}`} sub="Available" colorClass="bg-indigo-50 text-indigo-600" />
            <StatCard icon={TrendingUp} label="Total Earned" value={`₹${(stats.totalEarned || 0).toFixed(2)}`} sub={`${stats.franchiseCommissionRate || 0}% commission`} colorClass="bg-pink-50 text-pink-600" />
          </div>
          <div className="bg-white rounded-[24px] border border-slate-200 p-8 shadow-sm">
            <h3 className="text-base font-bold text-slate-900 mb-6 flex items-center gap-2">
               <BarChart2 className="text-blue-600" /> Commission Structure
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
               <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50">
                 <div className="text-3xl font-black text-emerald-600 mb-1">{partner?.franchiseCommissionRate || 0}%</div>
                 <div className="text-sm font-semibold text-slate-500">Your Commission (per ride)</div>
               </div>
               <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50">
                 <div className="text-3xl font-black text-orange-500 mb-1">{partner?.platformCommissionRate || 0}%</div>
                 <div className="text-sm font-semibold text-slate-500">Platform Commission</div>
               </div>
               <div className="p-5 rounded-2xl border border-slate-100 bg-slate-50">
                 <div className="text-3xl font-black text-red-500 mb-1">{stats.pendingPayouts || 0}</div>
                 <div className="text-sm font-semibold text-slate-500">Pending Payouts</div>
               </div>
            </div>
          </div>
        </div>
      );
      case 'drivers': return (
        <div className="animate-in fade-in duration-300">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <span>Driver Management</span><ChevronRight size={12} /><span className="text-slate-700">Zone Drivers</span>
              </div>
              <h1 className="text-2xl font-bold text-slate-900">Zone Drivers</h1>
              <p className="mt-1 text-sm text-slate-500">Manage all drivers registered in {partner?.zoneName}.</p>
            </div>
            <button onClick={() => setShowAddDriver(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-700">
              <Plus size={18} /> Register Driver
            </button>
          </div>
          <div className="mb-6 relative max-w-md">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={searchDriver} onChange={e => setSearchDriver(e.target.value)} placeholder="Search by name or phone..." className="w-full pl-11 pr-4 py-3 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium shadow-sm" />
          </div>
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Driver Details</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Vehicle Info</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Status</th>
                  <th className="px-6 py-4 text-right text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDrivers.length === 0 ? (
                  <tr><td colSpan="4" className="px-6 py-16 text-center text-sm text-slate-500 font-medium">No drivers found.</td></tr>
                ) : filteredDrivers.map(d => (
                  <tr key={d._id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-blue-100 text-blue-700 font-bold">{(d.name || 'D')[0].toUpperCase()}</div>
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{d.name}</div>
                          <div className="text-xs font-medium text-slate-500 mt-0.5">{d.phone}</div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                       <div className="text-sm font-semibold text-slate-800 capitalize">{d.vehicleType || 'N/A'}</div>
                       <div className="text-xs font-medium text-slate-500 mt-0.5">{d.vehicleModel || '—'}</div>
                    </td>
                    <td className="px-6 py-4">
                      <Badge active={d.approve}>{d.approve ? 'Active' : 'Suspended'}</Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                       <button onClick={() => handleToggleDriver(d._id, d.approve)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${d.approve ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-emerald-50 text-emerald-600 hover:bg-emerald-100'}`}>
                          {d.approve ? 'Suspend' : 'Activate'}
                       </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      );
      case 'vehicle-types': return (
        <div className="animate-in fade-in duration-300">
          <div className="mb-6">
             <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <span>Price Management</span><ChevronRight size={12} /><span className="text-slate-700">Vehicle Types</span>
             </div>
             <h1 className="text-2xl font-bold text-slate-900">Vehicle Types</h1>
             <p className="mt-1 text-sm text-slate-500">View vehicle types available for {partner?.zoneName} (configured by admin).</p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
            {vehicleTypes.length === 0 ? (
              <div className="col-span-full py-16 text-center text-sm text-slate-500 font-medium bg-white rounded-2xl border border-slate-200">No vehicle types configured.</div>
            ) : vehicleTypes.map(vt => (
              <div key={vt._id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm flex flex-col items-center text-center">
                 <div className="w-16 h-16 rounded-2xl bg-slate-50 flex items-center justify-center mb-4 border border-slate-100">
                    <Car size={32} className="text-blue-500" />
                 </div>
                 <h3 className="text-lg font-bold text-slate-900">{vt.name}</h3>
                 <p className="text-xs font-semibold text-slate-500 mt-1 capitalize">{vt.transport_type} • Cap: {vt.capacity || 'N/A'}</p>
                 <div className="mt-4">
                   <Badge active={vt.active}>{vt.active ? 'Active' : 'Inactive'}</Badge>
                 </div>
              </div>
            ))}
          </div>
        </div>
      );
      case 'prices': return (
        <div className="animate-in fade-in duration-300">
          <div className="mb-6">
             <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                <span>Price Management</span><ChevronRight size={12} /><span className="text-slate-700">Set Price</span>
             </div>
             <h1 className="text-2xl font-bold text-slate-900">Set Price</h1>
             <p className="mt-1 text-sm text-slate-500">Configure base price, distance price, and waiting charges.</p>
          </div>
          <div className="space-y-4">
            {zonePrices.length === 0 ? (
               <div className="py-16 text-center text-sm text-slate-500 font-medium bg-white rounded-2xl border border-slate-200">No pricing configured for your zone. Contact admin.</div>
            ) : zonePrices.map(price => (
               <div key={price._id} className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm">
                 <div className="flex items-center justify-between mb-6 pb-6 border-b border-slate-100">
                   <div className="flex items-center gap-4">
                     <div className="w-12 h-12 rounded-xl bg-blue-50 flex items-center justify-center"><Car className="text-blue-600" /></div>
                     <div>
                       <h3 className="text-base font-bold text-slate-900">{price.vehicle_type?.name || 'Vehicle'} Pricing</h3>
                       <p className="text-xs font-semibold text-slate-500 capitalize mt-0.5">{price.transport_type} • {price.pricing_scope}</p>
                     </div>
                   </div>
                   <button onClick={() => setEditingPrice(editingPrice?._id === price._id ? null : price)} className={`inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${editingPrice?._id === price._id ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' : 'bg-[#2563EB] text-white hover:bg-blue-700 shadow-md'}`}>
                     {editingPrice?._id === price._id ? <><X size={16} /> Cancel</> : <><Edit size={16} /> Edit Pricing</>}
                   </button>
                 </div>
                 {editingPrice?._id === price._id ? (
                    <PriceEditForm price={editingPrice} onSave={handleUpdatePrice} />
                 ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
                       {[ { label: 'Base Price', value: `₹${price.base_price ?? '—'}` }, { label: 'Base Dist.', value: `${price.base_distance ?? '—'} km` }, { label: 'Per km', value: `₹${price.price_per_distance ?? '—'}` }, { label: 'Per min', value: `₹${price.time_price ?? '—'}` }, { label: 'Wait/min', value: `₹${price.waiting_charge ?? '—'}` }, { label: 'Free Wait', value: `${price.free_waiting_before ?? '—'} min` } ].map((it, i) => (
                         <div key={i} className="bg-slate-50 border border-slate-100 rounded-xl p-4">
                           <div className="text-lg font-black text-slate-800">{it.value}</div>
                           <div className="text-[11px] font-bold text-slate-500 uppercase tracking-wider mt-1">{it.label}</div>
                         </div>
                       ))}
                    </div>
                 )}
               </div>
            ))}
          </div>
        </div>
      );
      case 'settings': return (
        <div className="animate-in fade-in duration-300">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
             <div>
               <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <span>Zone Settings</span><ChevronRight size={12} /><span className="text-slate-700">App Modules</span>
               </div>
               <h1 className="text-2xl font-bold text-slate-900">App Modules</h1>
               <p className="mt-1 text-sm text-slate-500">Configure active modules and basic waiting rules.</p>
             </div>
             <button onClick={handleSaveSettings} disabled={savingSettings} className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-5 py-3 text-sm font-bold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-700">
               {savingSettings ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Save Settings
             </button>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
             <div className="bg-white border border-slate-200 rounded-[24px] p-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 mb-6 pb-4 border-b border-slate-100 flex items-center gap-2"><Clock className="text-blue-500" /> Time & Wait Settings</h3>
                <div className="space-y-5">
                   {[ { label: 'Free Cancel Window (sec)', key: 'cancelWaitingTimeSeconds' }, { label: 'Free Waiting (min)', key: 'freeWaitingMinutes' }, { label: 'Wait Charge per min (₹)', key: 'driverWaitingChargePerMin' } ].map(f => (
                     <div key={f.key}>
                       <label className="block text-[12px] font-bold text-slate-700 mb-2">{f.label}</label>
                       <input type="number" min={0} value={settingsForm[f.key] ?? ''} onChange={e => setSettingsForm(prev => ({ ...prev, [f.key]: Number(e.target.value) }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium transition-all" />
                     </div>
                   ))}
                </div>
             </div>
             <div className="bg-white border border-slate-200 rounded-[24px] p-6 shadow-sm">
                <h3 className="text-base font-bold text-slate-900 mb-6 pb-4 border-b border-slate-100 flex items-center gap-2"><Settings className="text-blue-500" /> Active Modules</h3>
                <div className="space-y-4">
                   {[ { key: 'enableRide', label: 'Regular Ride', icon: Car }, { key: 'enableOutstation', label: 'Outstation', icon: MapPin }, { key: 'enableDelivery', label: 'Delivery', icon: Package }, { key: 'enablePooling', label: 'Car Pooling', icon: Users }, { key: 'enableRental', label: 'Rental', icon: Truck } ].map(mod => (
                     <div key={mod.key} className="flex items-center justify-between p-4 rounded-xl border border-slate-100 bg-slate-50">
                       <div className="flex items-center gap-3">
                         <mod.icon className="text-slate-500" size={20} />
                         <span className="text-sm font-bold text-slate-800">{mod.label}</span>
                       </div>
                       <button onClick={() => setSettingsForm(prev => ({ ...prev, [mod.key]: !prev[mod.key] }))} className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${settingsForm[mod.key] ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                          {settingsForm[mod.key] ? <><CheckCircle size={14} /> ON</> : <><XCircle size={14} /> OFF</>}
                       </button>
                     </div>
                   ))}
                </div>
             </div>
          </div>
        </div>
      );
      case 'earnings': return (
        <div className="animate-in fade-in duration-300">
          <div className="mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
             <div>
               <div className="mb-2 flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <span>Financials</span><ChevronRight size={12} /><span className="text-slate-700">Earnings & Payouts</span>
               </div>
               <h1 className="text-2xl font-bold text-slate-900">Earnings & Payouts</h1>
               <p className="mt-1 text-sm text-slate-500">Track commissions and request payouts.</p>
             </div>
             <div className="flex gap-3">
                <button onClick={() => setShowBankModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-white border border-slate-200 px-4 py-3 text-sm font-bold text-slate-700 shadow-sm transition hover:bg-slate-50">
                  <CreditCard size={18} /> Bank Details
                </button>
                <button onClick={() => setShowPayoutModal(true)} className="inline-flex items-center gap-2 rounded-xl bg-[#2563EB] px-4 py-3 text-sm font-bold text-white shadow-lg shadow-blue-900/20 transition hover:bg-blue-700">
                  <ArrowUpRight size={18} /> Request Payout
                </button>
             </div>
          </div>
          {earnings && (
             <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-8">
               <StatCard icon={Wallet} label="Wallet Balance" value={`₹${(earnings.summary?.walletBalance || 0).toFixed(2)}`} colorClass="bg-indigo-50 text-indigo-600" />
               <StatCard icon={TrendingUp} label="Total Earned" value={`₹${(earnings.summary?.totalEarned || 0).toFixed(2)}`} colorClass="bg-emerald-50 text-emerald-600" />
               <StatCard icon={ArrowDownLeft} label="Total Paid Out" value={`₹${(earnings.summary?.totalPaidOut || 0).toFixed(2)}`} colorClass="bg-orange-50 text-orange-600" />
               <StatCard icon={Car} label="Zone Rides" value={earnings.summary?.ridesInZone ?? 0} colorClass="bg-blue-50 text-blue-600" />
             </div>
          )}
          <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
             <div className="p-6 border-b border-slate-100">
                <h3 className="text-base font-bold text-slate-900">Commission Ledger</h3>
             </div>
             <div className="overflow-x-auto">
                <table className="w-full text-left">
                  <thead className="bg-slate-50">
                    <tr>
                      {['Date', 'Ride Amount', 'Your Earn', 'Platform Earn', 'Rate'].map(h => (
                        <th key={h} className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {!earnings?.ledger?.results?.length ? (
                      <tr><td colSpan="5" className="px-6 py-16 text-center text-sm text-slate-500 font-medium">No commission records yet.</td></tr>
                    ) : earnings.ledger.results.map((row, i) => (
                      <tr key={i} className="hover:bg-slate-50">
                        <td className="px-6 py-4 text-sm font-semibold text-slate-700">{new Date(row.recordedAt).toLocaleDateString('en-IN')}</td>
                        <td className="px-6 py-4 text-sm font-bold text-slate-900">₹{(row.rideAmount || 0).toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm font-bold text-emerald-600">₹{(row.franchiseCommissionAmount || 0).toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm font-bold text-orange-500">₹{(row.platformCommissionAmount || 0).toFixed(2)}</td>
                        <td className="px-6 py-4 text-sm font-semibold text-slate-500">{row.franchiseCommissionRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
             </div>
          </div>
        </div>
      );
      default: return null;
    }
  };

  return (
    <div className="flex h-screen bg-[#f6f7fb] font-sans text-slate-900 overflow-hidden">
      {/* Sidebar */}
      {/* Sidebar */}
      {/* Sidebar */}
      {/* Sidebar - Exact Copy of AdminLayout */}
      <aside className="w-72 flex-shrink-0 bg-neutral-950 flex flex-col z-20 shadow-2xl transition-all duration-300 ease-[cubic-bezier(0.25,0.8,0.25,1)] text-white">
        
        {/* Header */}
        <div className="flex h-20 shrink-0 items-center px-6 transition-all border-b border-white/5">
          <div className="h-9 w-9 rounded-xl bg-amber-500 flex items-center justify-center">
            <Car className="w-5 h-5 text-black" />
          </div>
          <div className="ml-3 flex flex-col pt-0.5">
            <span className="text-[17px] font-black tracking-tight text-white leading-none">
              Raydo Partner
            </span>
            <div className="mt-1 flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse shadow-[0_0_8px_rgba(16,185,129,0.8)]" />
              <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-400">
                {partner?.zoneName || 'GHAZIABAD'} ZONE
              </span>
            </div>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto no-scrollbar pb-12 scroll-smooth mt-6">
          <div className="px-6 mb-4">
            <h2 className="text-[13px] font-bold text-neutral-400 uppercase tracking-wider text-left">
              Franchise Panel
            </h2>
          </div>

          {/* Module Switcher Tabs */}
          <div className="px-4 mb-6">
            <div className="flex p-1 bg-neutral-900/60 backdrop-blur-sm rounded-xl border border-white/5 shadow-inner">
              <button
                type="button"
                onClick={() => window.location.href = '/food/franchise/dashboard'}
                className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all duration-300 text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
              >
                <Package className="w-3.5 h-3.5 text-neutral-500" />
                Food
              </button>
              <button
                type="button"
                className="flex-1 flex items-center justify-center gap-2 py-2 text-xs font-bold rounded-lg transition-all duration-300 bg-white text-black shadow-[0_4px_12px_rgba(255,255,255,0.15)] scale-[1.02]"
              >
                <Truck className="w-3.5 h-3.5 text-black" />
                Taxi
              </button>
            </div>
          </div>

          <nav className="space-y-8 px-4">
            {/* Section: DRIVER & FLEET MANAGEMENT */}
            <div className="space-y-1">
              <div className="px-4 mb-3 flex items-center gap-2">
                <div className="h-3 w-1 rounded-full bg-white" />
                <span className="text-[12px] font-black uppercase tracking-widest text-white/90">
                  DRIVER & FLEET MANAGEMENT
                </span>
              </div>
              <div className="flex cursor-pointer items-center justify-between rounded-xl px-4 py-3 text-sm transition-all duration-200 text-neutral-300 hover:bg-white/5 hover:text-white">
                <div className="flex items-center gap-3 font-medium">
                  <Users className="w-4 h-4 opacity-80" />
                  <span className="text-[13px] tracking-wide">Drivers & Riders</span>
                </div>
                <ChevronDown className="w-4 h-4 opacity-60" />
              </div>
              <div className="mt-1 flex flex-col space-y-0.5 overflow-hidden transition-all duration-300 ml-11 border-l border-neutral-800">
                <button onClick={() => setActiveTab('drivers')} className={`relative flex items-center gap-3 rounded-lg py-2 pl-3 pr-4 text-[13px] font-medium transition-all ${activeTab === 'drivers' ? 'text-white' : 'text-neutral-400 hover:text-neutral-200'}`}>
                  {activeTab === 'drivers' ? (
                    <span className="absolute -left-[2.5px] top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-white ring-4 ring-white/10" />
                  ) : (
                    <span className="absolute -left-[2.5px] top-1/2 h-[5px] w-[5px] -translate-y-1/2 rounded-full bg-neutral-600" />
                  )}
                  All Drivers & Riders ({drivers.length})
                </button>
              </div>
            </div>

            {/* Section: TAXI FARES & VEHICLE SETUP */}
            <div className="space-y-1 pt-2 border-t border-white/5">
              <div className="px-4 mb-3 flex items-center gap-2">
                <div className="h-3 w-1 rounded-full bg-white" />
                <span className="text-[12px] font-black uppercase tracking-widest text-white/90">
                  TAXI FARES & VEHICLE SETUP
                </span>
              </div>
              <button onClick={() => setActiveTab('prices')} className={`group relative flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-all duration-200 ${activeTab === 'prices' ? 'bg-neutral-800/80 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] ring-1 ring-white/10' : 'text-neutral-300 hover:bg-white/5 hover:text-white'}`}>
                <div className="flex items-center gap-3 font-medium">
                  <DollarSign className={`w-4 h-4 ${activeTab === 'prices' ? 'text-white' : 'opacity-80'}`} />
                  <span className="text-[13px] tracking-wide">Set Zone Taxi Prices</span>
                </div>
              </button>
              <button onClick={() => setActiveTab('vehicle-types')} className={`group relative flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-all duration-200 ${activeTab === 'vehicle-types' ? 'bg-neutral-800/80 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] ring-1 ring-white/10' : 'text-neutral-300 hover:bg-white/5 hover:text-white'}`}>
                <div className="flex items-center gap-3 font-medium">
                  <Truck className={`w-4 h-4 ${activeTab === 'vehicle-types' ? 'text-white' : 'opacity-80'}`} />
                  <span className="text-[13px] tracking-wide">Vehicle Types & Models</span>
                </div>
              </button>
              <button onClick={() => setActiveTab('settings')} className={`group relative flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-all duration-200 ${activeTab === 'settings' ? 'bg-neutral-800/80 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] ring-1 ring-white/10' : 'text-neutral-300 hover:bg-white/5 hover:text-white'}`}>
                <div className="flex items-center gap-3 font-medium">
                  <AlertTriangle className={`w-4 h-4 ${activeTab === 'settings' ? 'text-white' : 'opacity-80'}`} />
                  <span className="text-[13px] tracking-wide">Zone Policy & Fees</span>
                </div>
              </button>
            </div>

            {/* Section: TAXI TRIP MANAGEMENT */}
            <div className="space-y-1 pt-2 border-t border-white/5">
              <div className="px-4 mb-3 flex items-center gap-2">
                <div className="h-3 w-1 rounded-full bg-white" />
                <span className="text-[12px] font-black uppercase tracking-widest text-white/90">
                  TAXI TRIP MANAGEMENT
                </span>
              </div>
              <button className="group relative flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-all duration-200 text-neutral-500 cursor-not-allowed">
                <div className="flex items-center gap-3 font-medium">
                  <Car className="w-4 h-4 opacity-50" />
                  <span className="text-[13px] tracking-wide">Zone Taxi Rides</span>
                </div>
              </button>
            </div>

            {/* Section: MY ZONE & COMMISSIONS */}
            <div className="space-y-1 pt-2 border-t border-white/5">
              <div className="px-4 mb-3 flex items-center gap-2">
                <div className="h-3 w-1 rounded-full bg-white" />
                <span className="text-[12px] font-black uppercase tracking-widest text-white/90">
                  MY ZONE & COMMISSIONS
                </span>
              </div>
              <button onClick={() => setActiveTab('overview')} className={`group relative flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-all duration-200 ${activeTab === 'overview' ? 'bg-neutral-800/80 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] ring-1 ring-white/10' : 'text-neutral-300 hover:bg-white/5 hover:text-white'}`}>
                <div className="flex items-center gap-3 font-medium">
                  <LayoutDashboard className={`w-4 h-4 ${activeTab === 'overview' ? 'text-white' : 'opacity-80'}`} />
                  <span className="text-[13px] tracking-wide">Zone Business Overview</span>
                </div>
              </button>
              <button onClick={() => setActiveTab('earnings')} className={`group relative flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-all duration-200 ${activeTab === 'earnings' ? 'bg-neutral-800/80 text-white shadow-[0_4px_12px_rgba(0,0,0,0.1)] ring-1 ring-white/10' : 'text-neutral-300 hover:bg-white/5 hover:text-white'}`}>
                <div className="flex items-center gap-3 font-medium">
                  <DollarSign className={`w-4 h-4 ${activeTab === 'earnings' ? 'text-white' : 'opacity-80'}`} />
                  <span className="text-[13px] tracking-wide">Earnings & Commission</span>
                </div>
              </button>
            </div>
          </nav>
        </div>

        <div className="mt-auto px-4 py-4 border-t border-white/5 bg-neutral-950 z-10 sticky bottom-0">
          <button onClick={handleLogout} className="group relative flex w-full items-center justify-between rounded-xl px-4 py-3 text-sm transition-all duration-200 text-neutral-400 hover:bg-white/5 hover:text-white">
            <div className="flex items-center gap-3 font-medium">
              <LogOut className="w-4 h-4 opacity-80" />
              <span className="text-[13px] tracking-wide">Logout Partner CRM</span>
            </div>
          </button>
        </div>
      </aside>

      {/* Main Area */}
      <div className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-20 bg-white/80 backdrop-blur-md border-b border-slate-200 flex items-center justify-between px-8 z-10 sticky top-0">
          <div className="flex items-center gap-3">
             <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center font-bold text-slate-600">{(partner?.name || 'P')[0]}</div>
             <div>
                <div className="font-bold text-slate-900 text-sm">{partner?.zoneName} Zone</div>
                <div className="text-xs font-semibold text-slate-500">ID: {partner?.partnerId}</div>
             </div>
             <span className="ml-2 px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-600 text-[10px] font-bold uppercase tracking-wider border border-emerald-100">Active</span>
          </div>
          <button onClick={handleLogout} className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-slate-600 hover:bg-slate-100 transition-all">
             <LogOut className="w-[18px] h-[18px] text-slate-400" /> Logout
          </button>
        </header>
        <main className="flex-1 overflow-y-auto p-8">
          <div className="max-w-7xl mx-auto">
            {renderContent()}
          </div>
        </main>
      </div>

      {/* Modals */}
      {showAddDriver && (
        <Modal title="Register Zone Driver" onClose={() => setShowAddDriver(false)}>
          <form onSubmit={handleAddDriver} className="space-y-4">
            <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-xs font-semibold text-blue-800 flex gap-2">
               <AlertCircle className="w-4 h-4 shrink-0" /> Driver auto-assigned to {partner?.zoneName}
            </div>
            {[
              { label: 'Full Name *', key: 'name', type: 'text', placeholder: 'Driver full name' },
              { label: 'Phone *', key: 'phone', type: 'tel', placeholder: '9876543210' },
              { label: 'Email', key: 'email', type: 'email', placeholder: 'driver@example.com' },
              { label: 'Password *', key: 'password', type: 'password', placeholder: 'Min 6 characters' },
            ].map(f => (
              <ModalField key={f.key} {...f} value={driverForm[f.key]} onChange={v => setDriverForm(prev => ({ ...prev, [f.key]: v }))} />
            ))}
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-2">Vehicle Type</label>
              <select value={driverForm.vehicleType} onChange={e => setDriverForm(prev => ({ ...prev, vehicleType: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:border-blue-500 font-medium">
                {['car', 'bike', 'auto', 'truck'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>)}
              </select>
            </div>
            {[
              { label: 'Vehicle Make', key: 'vehicleMake', placeholder: 'Maruti, Hyundai...' },
              { label: 'Vehicle Model', key: 'vehicleModel', placeholder: 'Swift, WagonR...' },
              { label: 'Vehicle Number', key: 'vehicleNumber', placeholder: 'DL01AB1234' },
              { label: 'Vehicle Color', key: 'vehicleColor', placeholder: 'White, Black...' },
            ].map(f => (
              <ModalField key={f.key} {...f} type="text" value={driverForm[f.key]} onChange={v => setDriverForm(prev => ({ ...prev, [f.key]: v }))} />
            ))}
            <ModalSubmitBtn loading={submitting} label="Register Driver" />
          </form>
        </Modal>
      )}

      {showBankModal && (
        <Modal title="Bank Details" onClose={() => setShowBankModal(false)}>
          <div className="space-y-4">
            <p className="text-sm font-medium text-slate-500">Add your bank details to receive payout transfers</p>
            {[
              { label: 'Account Holder Name', key: 'accountHolderName', placeholder: 'As per bank records' },
              { label: 'Bank Name', key: 'bankName', placeholder: 'HDFC, SBI, ICICI...' },
              { label: 'Account Number', key: 'accountNumber', placeholder: 'Enter account number' },
              { label: 'IFSC Code', key: 'ifscCode', placeholder: 'HDFC0001234' },
              { label: 'UPI ID (optional)', key: 'upiId', placeholder: 'phone@upi' },
            ].map(f => (
              <ModalField key={f.key} {...f} type="text" value={bankForm[f.key]} onChange={v => setBankForm(prev => ({ ...prev, [f.key]: v }))} />
            ))}
            <button onClick={handleSaveBankDetails} disabled={submitting} className="w-full py-3.5 mt-2 rounded-xl bg-[#2563EB] text-white text-[13px] font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-all">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Bank Details
            </button>
          </div>
        </Modal>
      )}

      {showPayoutModal && (
        <Modal title="Request Payout" onClose={() => setShowPayoutModal(false)}>
          <div className="space-y-4">
            <div className="bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center justify-between">
               <span className="text-sm font-bold text-emerald-800">Available Balance:</span>
               <span className="text-xl font-black text-emerald-600">₹{(dashStats?.stats?.walletBalance || 0).toFixed(2)}</span>
            </div>
            <ModalField label="Amount (₹) *" type="number" placeholder="Enter amount" value={payoutForm.amount} onChange={v => setPayoutForm(prev => ({ ...prev, amount: v }))} />
            <div>
              <label className="block text-[12px] font-bold text-slate-700 mb-2">Payout Method</label>
              <select value={payoutForm.payoutMethod} onChange={e => setPayoutForm(prev => ({ ...prev, payoutMethod: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:border-blue-500 font-medium">
                <option value="bank">Bank Transfer</option>
                <option value="upi">UPI</option>
              </select>
            </div>
            <button onClick={handleRequestPayout} disabled={submitting} className="w-full py-3.5 mt-2 rounded-xl bg-[#2563EB] text-white text-[13px] font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-all">
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <ArrowUpRight size={16} />} Submit Request
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function PriceEditForm({ price, onSave }) {
  const [form, setForm] = useState({
    base_price: price.base_price ?? '', base_distance: price.base_distance ?? '', price_per_distance: price.price_per_distance ?? '',
    time_price: price.time_price ?? '', waiting_charge: price.waiting_charge ?? '', free_waiting_before: price.free_waiting_before ?? '',
    user_cancellation_fee: price.user_cancellation_fee ?? '', driver_cancellation_fee: price.driver_cancellation_fee ?? '',
  });

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 mt-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-5 mb-6">
        {[ { label: 'Base Price (₹)', key: 'base_price' }, { label: 'Base Distance (km)', key: 'base_distance' }, { label: 'Per km (₹)', key: 'price_per_distance' }, { label: 'Per min (₹)', key: 'time_price' }, { label: 'Wait Charge/min (₹)', key: 'waiting_charge' }, { label: 'Free Wait (min)', key: 'free_waiting_before' }, { label: 'User Cancel Fee (₹)', key: 'user_cancellation_fee' }, { label: 'Driver Cancel Fee (₹)', key: 'driver_cancellation_fee' } ].map(f => (
          <div key={f.key}>
            <label className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-2">{f.label}</label>
            <input type="number" min={0} value={form[f.key]} onChange={e => setForm(prev => ({ ...prev, [f.key]: e.target.value }))} className="w-full px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-sm font-black text-slate-900 focus:border-blue-500 focus:ring-1 focus:ring-blue-500" />
          </div>
        ))}
      </div>
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-xs font-semibold text-amber-800 mb-6 flex items-start gap-2">
        <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" /> Admin commission rates are managed by the super admin and are not editable here.
      </div>
      <button onClick={() => onSave(price._id, Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v === '' ? null : Number(v)])))} className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-900 text-white text-[13px] font-bold shadow-md hover:bg-slate-800 transition-all">
        <Save size={16} /> Save Pricing Configuration
      </button>
    </div>
  );
}

function ModalField({ label, type = 'text', placeholder, value, onChange }) {
  return (
    <div>
      <label className="block text-[12px] font-bold text-slate-700 mb-2">{label}</label>
      <input type={type} placeholder={placeholder} value={value} onChange={e => onChange(e.target.value)} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:border-blue-500 focus:ring-1 focus:ring-blue-500 font-medium transition-all" />
    </div>
  );
}

function ModalSubmitBtn({ loading, label }) {
  return (
    <button type="submit" disabled={loading} className="w-full py-3.5 mt-2 rounded-xl bg-[#2563EB] text-white text-[13px] font-bold shadow-lg flex items-center justify-center gap-2 hover:bg-blue-700 transition-all">
      {loading ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} {loading ? 'Submitting...' : label}
    </button>
  );
}

function Modal({ title, onClose, children }) {
  return (
    <div className="fixed inset-0 z-[1000] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-white border border-slate-200 rounded-[24px] p-8 w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl animate-in zoom-in-95 duration-200">
        <div className="flex items-center justify-between mb-6 pb-4 border-b border-slate-100">
          <h3 className="text-lg font-black text-slate-900">{title}</h3>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function SuperAdminFranchiseView() {
  const [partners, setPartners] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [zones, setZones] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', phone: '', password: '', zoneId: '', commissionRate: 10, platformCommissionRate: 5, franchiseFee: 25000, adminNote: '' });

  const getAdminToken = () => {
    return (
      localStorage.getItem('admin_accessToken') ||
      localStorage.getItem('adminToken') ||
      localStorage.getItem('token') ||
      localStorage.getItem('accessToken') ||
      ''
    );
  };

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${BASE_URL}/admin/taxi-franchise`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.data?.results) setPartners(data.data.results);
      else if (Array.isArray(data.data)) setPartners(data.data);
    } catch (err) { toast.error('Failed to fetch partners'); } finally { setLoading(false); }
  };
  const fetchZones = async () => {
    try {
      const token = getAdminToken();
      const res = await fetch(`${BASE_URL}/admin/pricing/zone?limit=100`, { headers: { Authorization: `Bearer ${token}` } });
      const data = await res.json();
      if (data.data?.results) setZones(data.data.results);
      else if (Array.isArray(data.data)) setZones(data.data);
    } catch (err) {}
  };
  useEffect(() => { fetchPartners(); fetchZones(); }, []);
  const handleCreate = async (e) => {
    e.preventDefault(); setSubmitting(true);
    try {
      const token = getAdminToken();
      const res = await fetch(`${BASE_URL}/admin/taxi-franchise`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }, body: JSON.stringify(form) });
      const data = await res.json(); if (!res.ok) throw new Error(data.message);
      toast.success('Franchise partner created successfully'); setShowAdd(false); fetchPartners();
    } catch (err) { toast.error(err.message); } finally { setSubmitting(false); }
  };

  return (
    <div className="min-h-screen bg-[#f6f7fb] p-8 font-sans">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h2 className="text-2xl font-bold text-slate-900">Taxi Franchise Partners</h2>
            <p className="text-sm text-slate-500 mt-1">Manage zone franchise owners and their payouts.</p>
          </div>
          <button onClick={() => window.open('/food/franchise/apply', '_blank')} className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-[#2563EB] text-white text-sm font-bold shadow-lg shadow-blue-900/20 hover:bg-blue-700 transition-all">
            <Plus size={18} /> Add Partner
          </button>
        </div>
        <div className="bg-white border border-slate-200 rounded-[24px] shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Partner</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Zone</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Commissions</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Wallet</th>
                  <th className="px-6 py-4 text-[11px] font-bold uppercase tracking-[0.2em] text-slate-500">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  <tr><td colSpan="5" className="px-6 py-20 text-center"><Loader2 className="animate-spin mx-auto text-slate-400" size={32} /></td></tr>
                ) : partners.length === 0 ? (
                  <tr><td colSpan="5" className="px-6 py-16 text-center text-sm font-medium text-slate-500">No franchise partners found. Click "Add Partner" to register one.</td></tr>
                ) : partners.map(p => (
                  <tr key={p._id} className="hover:bg-slate-50">
                    <td className="px-6 py-4">
                      <div className="font-bold text-slate-900 text-sm">{p.name}</div>
                      <div className="text-xs font-semibold text-slate-500 mt-0.5">{p.email} • {p.phone}</div>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-800 text-sm">{p.zoneName || '—'}</td>
                    <td className="px-6 py-4">
                      <div className="text-xs font-bold text-slate-700">Franchise: <span className="text-emerald-600">{p.franchiseCommissionRate ?? 0}%</span></div>
                      <div className="text-xs font-bold text-slate-700 mt-1">Platform: <span className="text-orange-500">{p.platformCommissionRate ?? 0}%</span></div>
                    </td>
                    <td className="px-6 py-4 font-black text-emerald-600 text-sm">₹{(p.walletBalance || 0).toFixed(2)}</td>
                    <td className="px-6 py-4">
                      <span className={`inline-flex px-3 py-1 rounded-full text-[11px] font-bold uppercase tracking-wider ${p.isActive ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>
                        {p.status || (p.isActive ? 'active' : 'inactive')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        {showAdd && (
          <Modal title="Register Franchise Partner" onClose={() => setShowAdd(false)}>
            <form onSubmit={handleCreate} className="space-y-4">
              <ModalField label="Full Name *" value={form.name} onChange={v => setForm({...form, name: v})} />
              <ModalField label="Email *" type="email" value={form.email} onChange={v => setForm({...form, email: v})} />
              <ModalField label="Phone *" type="tel" value={form.phone} onChange={v => setForm({...form, phone: v})} />
              <ModalField label="Password *" type="password" value={form.password} onChange={v => setForm({...form, password: v})} />
              <div>
                <label className="block text-[12px] font-bold text-slate-700 mb-2">Zone *</label>
                <select value={form.zoneId} onChange={e => setForm({...form, zoneId: e.target.value})} className="w-full px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 text-sm text-slate-900 focus:outline-none focus:border-blue-500 font-medium" required>
                  <option value="">Select Zone</option>
                  {zones.map(z => <option key={z._id} value={z._id}>{z.name}</option>)}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <ModalField label="Franchise Commission %" type="number" value={form.commissionRate} onChange={v => setForm({...form, commissionRate: v})} />
                <ModalField label="Platform Commission %" type="number" value={form.platformCommissionRate} onChange={v => setForm({...form, platformCommissionRate: v})} />
              </div>
              <ModalSubmitBtn loading={submitting} label="Save Partner" />
            </form>
          </Modal>
        )}
      </div>
    </div>
  );
}
