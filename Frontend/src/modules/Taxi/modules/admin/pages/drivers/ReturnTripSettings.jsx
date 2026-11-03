import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2, Repeat } from 'lucide-react';
import toast from 'react-hot-toast';
import { adminService } from '../../services/adminService';

const inputClass = 'w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none';
const labelClass = 'block text-xs font-semibold text-gray-500 mb-1.5';

const Toggle = ({ label, hint, enabled, onToggle }) => (
  <div className="flex items-center justify-between gap-4 p-4 bg-white border border-gray-200 rounded-xl">
    <div>
      <p className="text-sm font-semibold text-gray-700">{label}</p>
      {hint && <p className="text-xs text-gray-400 mt-0.5">{hint}</p>}
    </div>
    <button type="button" onClick={onToggle} className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${enabled ? 'bg-indigo-600' : 'bg-gray-200'}`}>
      <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
    </button>
  </div>
);

/**
 * Admin > Drivers > Return Trip. Drivers who are heading back to a zone ("Dewas") get rides that END there before
 * other drivers (after pass holders). The limits below decide which rides count.
 */
const ReturnTripSettings = () => {
  const [config, setConfig] = useState(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await adminService.getReturnTripSettings();
        setConfig(res?.data || { enabled: true, allowCityRides: false, expiryHours: 12, maxKm: { car: 150, bike: 60 } });
      } catch (err) {
        toast.error(err?.message || 'Could not load Return trip settings');
      }
    })();
  }, []);

  const save = async () => {
    try {
      setSaving(true);
      const res = await adminService.updateReturnTripSettings(config);
      setConfig(res?.data || config);
      toast.success('Return trip settings saved');
    } catch (err) {
      toast.error(err?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  if (!config) {
    return <div className="flex min-h-[50vh] items-center justify-center"><Loader2 className="w-7 h-7 text-indigo-600 animate-spin" /></div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-8">
      <div className="mb-6">
        <div className="flex items-center gap-1.5 text-xs text-gray-400 mb-2">
          <span>Drivers</span><ChevronRight size={12} /><span className="text-gray-700">Return Trip</span>
        </div>
        <h1 className="text-xl font-semibold text-gray-900 flex items-center gap-2"><Repeat size={20} /> Return Trip (two-way)</h1>
      </div>

      <div className="max-w-2xl space-y-4">
        <Toggle label="Enable Return trip" hint="Drivers can say which zone they are going back to." enabled={config.enabled} onToggle={() => setConfig({ ...config, enabled: !config.enabled })} />
        <Toggle label="Count city rides too" hint="Off: only outstation (intercity) rides count as return rides. On: any ride that ends in the zone." enabled={config.allowCityRides} onToggle={() => setConfig({ ...config, allowCityRides: !config.allowCityRides })} />

        <div className="bg-white border border-gray-200 rounded-xl p-4 grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className={labelClass}>Max return ride - car (km)</label>
            <input type="number" min="1" className={inputClass} value={config.maxKm.car} onChange={(e) => setConfig({ ...config, maxKm: { ...config.maxKm, car: e.target.value } })} />
          </div>
          <div>
            <label className={labelClass}>Max return ride - bike (km)</label>
            <input type="number" min="1" className={inputClass} value={config.maxKm.bike} onChange={(e) => setConfig({ ...config, maxKm: { ...config.maxKm, bike: e.target.value } })} />
          </div>
          <div>
            <label className={labelClass}>Return trip lasts (hours)</label>
            <input type="number" min="1" max="72" className={inputClass} value={config.expiryHours} onChange={(e) => setConfig({ ...config, expiryHours: e.target.value })} />
          </div>
        </div>

        <div className="rounded-xl border border-indigo-100 bg-indigo-50/60 px-5 py-4 text-xs text-gray-600 leading-relaxed">
          <p className="font-bold text-gray-700 mb-1">How it works</p>
          <p>The driver picks the zone he is going back to (or taps the suggestion after an outstation trip). While it is on, a ride request that ends in that zone is offered to him before other drivers: after drivers with a running subscription pass, before the rating order.</p>
          <p className="mt-1">Search range does not change: he is asked only for pickups in the zone he is in now, inside the normal search radius. It switches off when he reaches the zone, goes offline, accepts such a ride, or the hours above pass. Works for delivery partners' bike profile too.</p>
        </div>

        <button type="button" onClick={save} disabled={saving} className="px-6 py-2.5 bg-indigo-600 text-white text-sm font-medium rounded-lg hover:bg-indigo-700 disabled:opacity-50">
          {saving ? 'Saving...' : 'Save settings'}
        </button>
      </div>
    </div>
  );
};

export default ReturnTripSettings;
