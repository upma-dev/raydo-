import React, { useState, useEffect } from 'react';
import { 
  Zap, 
  Search,
  ChevronRight,
  Plus,
  Car,
  Loader2,
} from 'lucide-react';
import { Link, useNavigate } from 'react-router-dom';
import { adminService } from '../../services/adminService';
import toast from 'react-hot-toast';

const ToggleSwitch = ({ label, enabled, onToggle }) => (
  <div className="flex items-center justify-between p-4 bg-white border border-gray-200 rounded-xl shadow-sm flex-1 min-w-[280px]">
    <span className="text-sm font-semibold text-gray-700">{label}</span>
    <button 
      onClick={onToggle}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}
    >
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

const DriverSubscriptions = () => {
  const navigate = useNavigate();
  const [searchTerm, setSearchTerm] = useState('');
  const [config, setConfig] = useState({
    mode: 'commissionOnly' // commissionOnly, subscriptionOnly, both
  });
  const [isLoading, setIsLoading] = useState(true);
  const [plans, setPlans] = useState([]);
  const [subscribers, setSubscribers] = useState({ results: [], summary: { activeNow: 0, total: 0 } });

  const handleToggle = async (mode) => {
    try {
      const res = await adminService.updateSubscriptionSettings({ mode });
      if (res.success) {
        setConfig({ mode });
        toast.success(`Mode changed to ${mode.replace(/([A-Z])/g, ' $1').toLowerCase()}`);
      } else {
        toast.error(res.message || "Failed to update settings");
      }
    } catch (err) {
      console.error('Update settings error:', err);
      toast.error(err.message || "Failed to update settings");
    }
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);
        
        const [plansData, settingsData, subscribersData] = await Promise.all([
          adminService.getSubscriptionPlans(),
          adminService.getSubscriptionSettings(),
          adminService.getDriverSubscribers({ limit: 20 }).catch(() => null),
        ]);

        if (plansData.success) setPlans(plansData.data?.results || []);
        if (subscribersData?.success) setSubscribers(subscribersData.data);
        
        if (settingsData.success) {
          setConfig({ mode: settingsData.data?.mode || 'commissionOnly' });
        }

      } catch (err) {
        toast.error(err?.message || 'Could not load subscription data');
      } finally {
        setIsLoading(false);
      }
    };
    fetchData();
  }, []);

  const togglePlan = async (plan) => {
    const next = plan.active === false;
    try {
      await adminService.setSubscriptionPlanActive(plan._id, next);
      setPlans((current) => current.map((item) => (item._id === plan._id ? { ...item, active: next } : item)));
      toast.success(next ? 'Plan is on sale again' : 'Plan hidden from drivers');
    } catch (err) {
      toast.error(err?.message || 'Could not update the plan');
    }
  };

  const formatDate = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '-');

  const filteredPlans = plans.filter(p => 
    p.name.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      {/* HEADER */}
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Drivers</span>
          <ChevronRight size={12} />
          <span className="text-gray-700">Subscription</span>
        </div>
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold text-gray-900">Subscription</h1>
        </div>
      </div>

      {/* TOP CONFIG TOGGLES */}
      <div className="flex flex-wrap gap-4 mb-8">
        <ToggleSwitch 
          label="Enable Commission Only" 
          enabled={config.mode === 'commissionOnly'} 
          onToggle={() => handleToggle('commissionOnly')} 
        />
        <ToggleSwitch 
          label="Enable Subscription Only" 
          enabled={config.mode === 'subscriptionOnly'} 
          onToggle={() => handleToggle('subscriptionOnly')} 
        />
        <ToggleSwitch 
          label="Enable Subscription and Commission" 
          enabled={config.mode === 'both'} 
          onToggle={() => handleToggle('both')} 
        />
      </div>

      <div className="mb-8 rounded-xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 text-xs text-gray-600 leading-relaxed">
        <p className="font-bold text-gray-700 mb-1">How the three modes work</p>
        <p><b>Commission only:</b> drivers pay the usual commission on each ride. Plans below are ignored and drivers cannot buy them.</p>
        <p><b>Subscription only:</b> a driver needs a running plan to go online, get requests and accept rides. No commission while the plan lasts.</p>
        <p><b>Subscription and commission:</b> plans are optional. With a running plan there is no commission; without one the commission is charged.</p>
        <p className="mt-1">Drivers buy a plan from their wallet in the driver app (Profile &gt; Subscription). A renewal starts when the running plan ends.</p>
      </div>

      {/* LIST SECTION */}
      {config.mode !== 'commissionOnly' && (
      <div className="bg-white rounded-xl border border-gray-200 overflow-visible shadow-sm">
        {/* TOOLBAR */}
        <div className="p-4 border-b border-gray-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <h2 className="text-sm font-semibold text-gray-800">Plans ({plans.length})</h2>
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input 
                type="text" 
                placeholder="Search plans..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-lg w-56 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
              />
            </div>
            <button 
              onClick={() => navigate('/taxi/admin/drivers/subscription/create')}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
            >
               <Plus size={15} /> Add Subscription
            </button>
          </div>
        </div>

        {/* TABLE */}
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Name</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Vehicle Type</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Price</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Duration</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {isLoading ? (
                <tr>
                  <td colSpan="6" className="py-16 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <Loader2 className="w-7 h-7 text-indigo-600 animate-spin" />
                      <p className="text-sm text-gray-400">Loading plans...</p>
                    </div>
                  </td>
                </tr>
              ) : filteredPlans.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-16 text-center text-sm text-gray-400">
                    No plans found.
                  </td>
                </tr>
              ) : (
                filteredPlans.map((item) => (
                  <tr key={item._id} className="hover:bg-gray-50/50 transition-colors">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900 uppercase">{item.name}</td>
                    <td className="px-4 py-4 text-sm text-gray-500">
                       <div className="flex items-center gap-2">
                          <Car size={14} className="text-gray-400" /> {item.transport_type} ({item.vehicle_type_id?.name || 'N/A'})
                       </div>
                    </td>
                    <td className="px-4 py-4 text-sm font-semibold text-gray-900">Rs {Number(item.amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-4 text-sm text-gray-500">{item.duration} days</td>
                    <td className="px-4 py-4">
                       <span className={`inline-flex items-center px-2.5 py-0.5 rounded text-xs font-medium ${item.active ? 'bg-emerald-50 text-emerald-700' : 'bg-gray-50 text-gray-500'}`}>
                          {item.active ? 'Active' : 'Inactive'}
                       </span>
                    </td>
                    <td className="px-4 py-4 text-center">
                       <button
                          type="button"
                          onClick={() => togglePlan(item)}
                          className="px-3 py-1.5 text-xs font-semibold text-indigo-600 border border-indigo-100 hover:bg-indigo-50 rounded-lg transition-colors"
                       >
                          {item.active ? 'Hide plan' : 'Put on sale'}
                       </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* FOOTER */}
        {!isLoading && filteredPlans.length > 0 && (
          <div className="px-6 py-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
             <span>Showing {filteredPlans.length} of {plans.length} plans</span>
          </div>
        )}
      </div>
      )}

      {/* SUBSCRIBERS */}
      {config.mode !== 'commissionOnly' && (
      <div className="mt-8 bg-white rounded-xl border border-gray-200 shadow-sm">
        <div className="p-4 border-b border-gray-100 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-800">Subscribed drivers</h2>
          <span className="text-xs text-gray-500">
            {subscribers.summary?.activeNow || 0} running now / {subscribers.summary?.total || 0} sold in total
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Driver</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Plan</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Paid</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Valid</th>
                <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">State</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {(subscribers.results || []).length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-6 py-12 text-center text-sm text-gray-400">No driver has bought a plan yet.</td>
                </tr>
              ) : (
                subscribers.results.map((row) => (
                  <tr key={row.id} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3 text-sm text-gray-900">{row.driver?.name || 'Driver'} <span className="text-gray-400">{row.driver?.phone}</span></td>
                    <td className="px-4 py-3 text-sm text-gray-600">{row.name}</td>
                    <td className="px-4 py-3 text-sm text-gray-600">Rs {Number(row.amount || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-sm text-gray-500">{formatDate(row.startedAt)} - {formatDate(row.expiresAt)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2.5 py-0.5 rounded text-xs font-medium capitalize ${row.state === 'active' ? 'bg-emerald-50 text-emerald-700' : row.state === 'upcoming' ? 'bg-blue-50 text-blue-700' : 'bg-gray-50 text-gray-500'}`}>
                        {row.state}
                      </span>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
      )}

    </div>
  );
};

export default DriverSubscriptions;
