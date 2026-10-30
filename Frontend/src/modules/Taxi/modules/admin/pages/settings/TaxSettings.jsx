import React, { useEffect, useState } from 'react';
import { ChevronRight, Loader2, Percent } from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';

const DEFAULTS = { enabled: false, rate: '0', label: 'GST', gstin: '' };

const formatRupees = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const TaxSettings = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState(DEFAULTS);

  useEffect(() => {
    (async () => {
      try {
        const body = await api.get('/admin/general-settings/tax');
        const saved = body?.data?.settings || {};
        setSettings({
          enabled: saved.enabled === true || saved.enabled === 'true' || saved.enabled === 1 || saved.enabled === '1',
          rate: String(saved.rate ?? 0),
          label: saved.label || 'GST',
          gstin: saved.gstin || '',
        });
      } catch (err) {
        toast.error(err?.message || 'Failed to load tax settings');
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const rateNumber = Number(settings.rate);
  const rateValid = settings.rate !== '' && Number.isFinite(rateNumber) && rateNumber >= 0 && rateNumber <= 100;
  const exampleFare = 118;
  const exampleTax = rateValid && settings.enabled ? (exampleFare * rateNumber) / (100 + rateNumber) : 0;

  const handleSave = async () => {
    if (!rateValid) {
      toast.error('Tax rate must be between 0 and 100');
      return;
    }
    try {
      setSaving(true);
      await api.patch('/admin/general-settings/tax', {
        settings: {
          enabled: settings.enabled,
          rate: rateNumber,
          label: settings.label.trim() || 'GST',
          gstin: settings.gstin.trim(),
        },
      });
      toast.success('Tax settings saved');
    } catch (err) {
      toast.error(err?.message || 'Failed to save tax settings');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Loader2 className="w-10 h-10 text-indigo-600 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6 lg:p-10 font-sans">
      <div className="mb-10 flex items-center justify-between">
        <h1 className="text-[15px] font-black text-gray-800 uppercase tracking-widest">Tax Settings</h1>
        <div className="flex items-center gap-1.5 text-[11px] font-bold text-gray-400 uppercase tracking-widest">
          <span>Business Settings</span>
          <ChevronRight size={12} strokeWidth={3} />
          <span className="text-gray-600">Tax Settings</span>
        </div>
      </div>

      <div className="max-w-3xl space-y-6">
        <div className="bg-white rounded-xl border border-gray-200 shadow-sm px-8 py-6 flex items-center justify-between gap-6">
          <div>
            <p className="text-sm font-semibold text-gray-700">Apply tax on taxi trips</p>
            <p className="text-xs text-gray-400 mt-1">
              Tax is included in the fare the rider already pays. Fares, wallets and payments do not change.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSettings((s) => ({ ...s, enabled: !s.enabled }))}
            className={`w-14 h-7 shrink-0 rounded-full relative transition-all duration-300 ${settings.enabled ? 'bg-[#405189]' : 'bg-gray-300'}`}
            aria-pressed={settings.enabled}
          >
            <div className={`w-5 h-5 bg-white rounded-full absolute top-1 transition-all duration-300 ${settings.enabled ? 'right-1' : 'left-1'}`} />
          </button>
        </div>

        <div className="bg-white rounded-xl border border-gray-200 shadow-sm p-8 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 block">Tax rate (%) <span className="text-red-500">*</span></label>
              <div className="relative">
                <input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={settings.rate}
                  onChange={(e) => setSettings((s) => ({ ...s, rate: e.target.value }))}
                  className="w-full border border-gray-200 rounded-lg px-4 py-2.5 pr-10 text-sm text-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                  placeholder="5"
                />
                <Percent size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
              </div>
              {!rateValid && <p className="text-[11px] text-red-500">Enter a rate between 0 and 100.</p>}
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-gray-600 block">Tax name</label>
              <input
                type="text"
                value={settings.label}
                onChange={(e) => setSettings((s) => ({ ...s, label: e.target.value }))}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="GST"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <label className="text-xs font-semibold text-gray-600 block">GSTIN (optional)</label>
              <input
                type="text"
                value={settings.gstin}
                onChange={(e) => setSettings((s) => ({ ...s, gstin: e.target.value.toUpperCase() }))}
                className="w-full border border-gray-200 rounded-lg px-4 py-2.5 text-sm text-gray-800 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none"
                placeholder="22AAAAA0000A1Z5"
                maxLength={15}
              />
            </div>
          </div>

          <div className="rounded-lg bg-indigo-50/60 border border-indigo-100 px-5 py-4 text-xs text-gray-600">
            <p className="font-bold text-gray-700 mb-1">How it works</p>
            <p>
              For a fare of <b>{formatRupees(exampleFare)}</b> at <b>{rateValid ? rateNumber : 0}%</b>, the tax inside the fare is{' '}
              <b>{formatRupees(exampleTax)}</b> (fare × rate ÷ (100 + rate)). The rate is saved on each ride when it completes, so
              changing it later does not change old rides. Outstation, pooling and bus keep the service tax already set on their own prices.
            </p>
          </div>

          <div className="flex justify-end">
            <button
              onClick={handleSave}
              disabled={saving}
              className="bg-[#405189] text-white px-8 py-2 rounded-lg text-sm font-semibold hover:bg-[#344475] transition-all flex items-center gap-2 shadow-sm disabled:opacity-60"
            >
              {saving ? <Loader2 size={16} className="animate-spin" /> : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default TaxSettings;
