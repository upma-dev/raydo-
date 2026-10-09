import React, { useState, useEffect } from "react";
import { adminAPI } from "@food/api";
import { Settings, Save, Loader2, Percent, DollarSign, CreditCard } from "lucide-react";
import { toast } from "sonner";

export default function FranchiseModuleFees() {
  const [moduleFees, setModuleFees] = useState({ food: 50000, taxi: 50000, both: 80000 });
  const [moduleComms, setModuleComms] = useState({ food: 10, taxi: 10, both: 10 });
  const [paymentDetails, setPaymentDetails] = useState({ upiId: '', bankName: '', accountNumber: '', ifscCode: '', accountHolderName: '', qrCodeUrl: '' });
  const [taxiSettings, setTaxiSettings] = useState({ commissionBase: 'platform_commission', services: { ride: true, intercity: true, parcel: true, bus: true, pooling: false, rental: false }, serviceCommission: { pooling: 10, rental: 10 } });
  const [loading, setLoading] = useState(true);
  const [savingConfig, setSavingConfig] = useState(false);

  const fetchFormConfig = async () => {
    setLoading(true);
    try {
      const res = await adminAPI.getFranchiseFormConfig();
      if (res?.data?.data) {
        const cfg = res.data.data;
        if (cfg.moduleFranchiseFees) setModuleFees(cfg.moduleFranchiseFees);
        if (cfg.moduleCommissions) setModuleComms(cfg.moduleCommissions);
        if (cfg.paymentDetails) setPaymentDetails(cfg.paymentDetails);
        if (cfg.taxiSettings) {
          setTaxiSettings({
            commissionBase: cfg.taxiSettings.commissionBase || 'platform_commission',
            services: { ride: true, intercity: true, parcel: true, bus: true, pooling: false, rental: false, ...(cfg.taxiSettings.services || {}) },
            serviceCommission: { pooling: 10, rental: 10, ...(cfg.taxiSettings.serviceCommission || {}) },
          });
        }
      }
    } catch (err) {
      console.error(err);
      toast.error("Failed to load module fee configuration");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFormConfig();
  }, []);

  const handleSaveModuleFeesConfig = async (e) => {
    e.preventDefault();
    setSavingConfig(true);
    try {
      await adminAPI.updateFranchiseFormConfig({
        moduleFranchiseFees: moduleFees,
        moduleCommissions: moduleComms,
        paymentDetails: paymentDetails,
        taxiSettings,
      });
      toast.success("🎉 Global Module Onboarding Fees & Rates Saved!");
    } catch (err) {
      toast.error(err?.response?.data?.message || "Failed to save module fee config");
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen text-slate-900 font-sans space-y-6">
      
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center text-amber-600 shadow-xs">
              <Percent className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight">Module Fees & Commission Settings</h1>
              <p className="text-xs font-semibold text-slate-500 mt-0.5">
                Configure standard base onboarding fees, commission percentages & bank UPI payment details for partners
              </p>
            </div>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16 gap-3 text-slate-500 text-xs">
          <Loader2 className="w-6 h-6 animate-spin text-amber-600" />
          <span>Loading module pricing config...</span>
        </div>
      ) : (
        <form onSubmit={handleSaveModuleFeesConfig} className="bg-white rounded-2xl shadow-sm border border-slate-200 p-6 space-y-6 text-xs">
          <div className="flex items-center justify-between border-b border-slate-200 pb-4 flex-wrap gap-4">
            <div className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-amber-600" />
              <span>Standard Base Onboarding Fees & Commissions</span>
            </div>

            <button
              type="submit"
              disabled={savingConfig}
              className="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2 transition-all hover:scale-105"
            >
              {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{savingConfig ? 'Saving...' : 'Save Global Module Config'}</span>
            </button>
          </div>

          {/* Module Pricing Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {[
              { key: 'food', icon: '🍔', name: 'Food Only' },
              { key: 'taxi', icon: '🚕', name: 'Taxi Only' },
              { key: 'both', icon: '🤝', name: 'Food + Taxi (Both)' },
            ].map(mod => (
              <div key={mod.key} className="p-5 rounded-2xl border border-slate-200 bg-slate-50/70 space-y-3.5 shadow-xs">
                <div className="font-black text-slate-900 text-sm flex items-center gap-2">
                  <span className="text-lg">{mod.icon}</span>
                  <span>{mod.name}</span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Standard Base Onboarding Fee (₹)</label>
                  <input
                    type="number"
                    value={moduleFees[mod.key] ?? 50000}
                    onChange={e => setModuleFees({ ...moduleFees, [mod.key]: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-extrabold bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">Default Franchise Commission Rate (%)</label>
                  <input
                    type="number"
                    value={moduleComms[mod.key] ?? 10}
                    onChange={e => setModuleComms({ ...moduleComms, [mod.key]: Number(e.target.value) })}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-extrabold bg-white text-slate-900 focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Pricing sanity check: the combined plan should sit between the dearer single plan and the sum of both */}
          {(() => {
            const food = Number(moduleFees.food) || 0;
            const taxi = Number(moduleFees.taxi) || 0;
            const both = Number(moduleFees.both) || 0;
            const issues = [];
            if (both < Math.max(food, taxi)) issues.push(`"Food + Taxi" (₹${both.toLocaleString('en-IN')}) is cheaper than the dearer single plan (₹${Math.max(food, taxi).toLocaleString('en-IN')}). Applicants would be paid less for getting more.`);
            if (both > food + taxi) issues.push(`"Food + Taxi" (₹${both.toLocaleString('en-IN')}) costs more than buying Food and Taxi separately (₹${(food + taxi).toLocaleString('en-IN')}).`);
            if (!food || !taxi || !both) issues.push('One of the fees is 0.');
            return issues.length > 0 ? (
              <div className="p-4 rounded-xl border border-amber-300 bg-amber-50 text-amber-900 font-semibold space-y-1">
                <div className="font-extrabold">Please check your pricing</div>
                {issues.map((t, i) => <div key={i}>- {t}</div>)}
              </div>
            ) : (
              <div className="p-3 rounded-xl border border-emerald-200 bg-emerald-50 text-emerald-800 font-semibold">
                Pricing looks good. Applicants save {'₹'}{(food + taxi - both).toLocaleString('en-IN')} by choosing the combined plan.
              </div>
            );
          })()}

          {/* How taxi franchises earn: dynamic rules */}
          <div className="p-5 rounded-2xl border border-blue-200 bg-blue-50/50 space-y-4">
            <div className="font-extrabold text-slate-900 text-sm">Taxi franchise earning rules</div>
            <p className="text-slate-600 font-semibold">The taxi commission % above is applied on the base you choose here, only for the services you switch on. Changes apply to rides and bus trips credited from now on.</p>
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Commission is calculated on</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {[
                  ['platform_commission', 'What the platform earns', 'Franchise gets the rate % of Raydo\'s commission on the ride / booking (same as food).'],
                  ['fare', 'What the customer paid', 'Franchise gets the rate % of the ride fare / bus ticket amount.'],
                ].map(([value, title, desc]) => (
                  <button key={value} type="button" onClick={() => setTaxiSettings({ ...taxiSettings, commissionBase: value })}
                    className={`text-left p-4 rounded-xl border-2 transition ${taxiSettings.commissionBase === value ? 'border-blue-600 bg-white shadow' : 'border-slate-200 bg-white/60'}`}>
                    <div className="font-extrabold text-slate-900">{title}</div>
                    <div className="text-[11px] font-semibold text-slate-500 mt-1">{desc}</div>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Franchises earn on</label>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {[['ride', 'City taxi'], ['intercity', 'Outstation'], ['parcel', 'Parcel'], ['bus', 'Bus service'], ['pooling', 'Pooling'], ['rental', 'Rental']].map(([key, label]) => (
                  <label key={key} className={`flex items-center gap-2.5 p-3 rounded-xl border cursor-pointer ${taxiSettings.services[key] ? 'border-emerald-300 bg-emerald-50' : 'border-slate-200 bg-white'}`}>
                    <input type="checkbox" checked={Boolean(taxiSettings.services[key])}
                      onChange={(e) => setTaxiSettings({ ...taxiSettings, services: { ...taxiSettings.services, [key]: e.target.checked } })} />
                    <span className="font-extrabold text-slate-800">{label}</span>
                  </label>
                ))}
              </div>
              <p className="text-[11px] font-semibold text-slate-400 mt-2">Pooling and rental are OFF by default: switch them on only after you have set Raydo's commission for them below.</p>
            </div>
            <div>
              <label className="block font-bold text-slate-700 mb-1.5">Raydo's commission on pooling / rental (%)</label>
              <div className="grid grid-cols-2 gap-3 max-w-md">
                {[['pooling', 'Pooling'], ['rental', 'Rental']].map(([key, label]) => (
                  <div key={key}>
                    <span className="block text-[11px] font-bold text-slate-500 mb-1">{label}</span>
                    <input type="number" min={0} max={100} value={taxiSettings.serviceCommission[key] ?? 0}
                      onChange={(e) => setTaxiSettings({ ...taxiSettings, serviceCommission: { ...taxiSettings.serviceCommission, [key]: Number(e.target.value) } })}
                      className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-extrabold bg-white text-slate-900" />
                  </div>
                ))}
              </div>
              <p className="text-[11px] font-semibold text-slate-400 mt-2">Owners of pooling and rental are paid outside the app, so this % does not change anyone's payout. It is only the amount the franchise share is calculated on, when "What the platform earns" is selected above. Example: ride value 1000, Raydo commission 10% = 100, franchise rate 20% = franchise gets 20.</p>
            </div>
          </div>

          {/* Bank & UPI Details Section */}
          <div className="pt-6 border-t border-slate-200 space-y-4">
            <div className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <CreditCard className="w-4 h-4 text-blue-600" />
              <span>Raydo Bank & UPI Account Details for Franchise Payment QR</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Bank Name</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC Bank"
                  value={paymentDetails.bankName || ''}
                  onChange={e => setPaymentDetails({ ...paymentDetails, bankName: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-semibold bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Account Number</label>
                <input
                  type="text"
                  placeholder="e.g. 5010023456789"
                  value={paymentDetails.accountNumber || ''}
                  onChange={e => setPaymentDetails({ ...paymentDetails, accountNumber: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-semibold bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">IFSC Code</label>
                <input
                  type="text"
                  placeholder="e.g. HDFC0001234"
                  value={paymentDetails.ifscCode || ''}
                  onChange={e => setPaymentDetails({ ...paymentDetails, ifscCode: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-semibold bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Account Holder Name</label>
                <input
                  type="text"
                  placeholder="e.g. Raydo Services Private Limited"
                  value={paymentDetails.accountHolderName || ''}
                  onChange={e => setPaymentDetails({ ...paymentDetails, accountHolderName: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-semibold bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">UPI ID</label>
                <input
                  type="text"
                  placeholder="e.g. raydoservices@hdfcbank"
                  value={paymentDetails.upiId || ''}
                  onChange={e => setPaymentDetails({ ...paymentDetails, upiId: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-semibold bg-white text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">UPI QR Code Image URL</label>
                <input
                  type="text"
                  placeholder="https://..."
                  value={paymentDetails.qrCodeUrl || ''}
                  onChange={e => setPaymentDetails({ ...paymentDetails, qrCodeUrl: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-semibold bg-white text-slate-900"
                />
              </div>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-200 flex justify-end">
            <button
              type="submit"
              disabled={savingConfig}
              className="px-6 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-extrabold text-xs shadow-md inline-flex items-center gap-2"
            >
              {savingConfig ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              <span>{savingConfig ? 'Saving Configuration...' : 'Save Global Module Fees Config'}</span>
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
