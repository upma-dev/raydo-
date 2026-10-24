import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import {
  ArrowLeft, Bike, Camera, Car, CheckCircle2, Clock, IndianRupee, Loader2, Package, ShieldCheck, Wallet, XCircle,
} from 'lucide-react';
import { deliveryAPI } from '@food/api';
import useDeliveryBackNavigation from '../../hooks/useDeliveryBackNavigation';
import { apiErrorOf, openRideApp, unwrap } from '@/modules/DeliveryV2/utils/rideModeSession';

const SERVICE_OPTIONS = [
  { key: 'taxi', label: 'Rides', hint: 'Take passengers', icon: Car },
  { key: 'delivery', label: 'Parcels', hint: 'Send packages', icon: Package },
];

const StatusCard = ({ state }) => {
  const config = {
    pending: { icon: Clock, tone: 'bg-amber-50 border-amber-200 text-amber-700', title: 'Application under review', body: 'Admin is checking your vehicle and documents. You will be able to switch to Ride & Parcel once approved.' },
    approved: { icon: CheckCircle2, tone: 'bg-emerald-50 border-emerald-200 text-emerald-700', title: 'Ride & Parcel is active', body: 'Use the Food | Ride & Parcel switch on the home screen to change what you work on.' },
    rejected: { icon: XCircle, tone: 'bg-rose-50 border-rose-200 text-rose-700', title: 'Application rejected', body: state.rejectionReason || 'Please correct your vehicle details below and apply again.' },
    blocked: { icon: XCircle, tone: 'bg-rose-50 border-rose-200 text-rose-700', title: 'Ride account blocked', body: 'Please contact support.' },
  }[state.status];
  if (!config) return null;
  const Icon = config.icon;
  return (
    <div className={`rounded-2xl border p-4 flex gap-3 ${config.tone}`}>
      <Icon className="w-5 h-5 shrink-0 mt-0.5" />
      <div>
        <p className="text-sm font-black">{config.title}</p>
        <p className="text-xs font-medium mt-1 leading-relaxed opacity-90">{config.body}</p>
        {state.vehicle && (
          <p className="text-xs font-bold mt-2 opacity-80">
            {state.vehicle.vehicleNumber} · {(state.vehicle.services || []).map((s) => (s === 'taxi' ? 'Rides' : 'Parcels')).join(' + ')}
          </p>
        )}
      </div>
    </div>
  );
};

const WalletCard = ({ wallet, navigate }) => {
  if (!wallet) return null;
  const needsMoney = wallet.isBlocked || wallet.topUpNeeded > 0;
  return (
    <div className="rounded-2xl border border-gray-100 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-2 mb-3">
        <Wallet className="w-4 h-4 text-gray-900" />
        <p className="text-sm font-black text-gray-900">One wallet for food and rides</p>
      </div>
      <ul className="space-y-2 text-xs font-medium text-gray-500 leading-relaxed">
        <li>• Ride and parcel earnings are added to your Pocket automatically. Withdraw everything from Pocket.</li>
        <li>• Commission on cash rides is taken from your Pocket.</li>
        <li>• While you take rides, ₹{wallet.minimumBalanceForRides} stays in your ride wallet as the minimum balance. It comes back to Pocket when you switch to Food.</li>
      </ul>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Ride wallet</p>
          <p className={`text-lg font-black ${wallet.rideWalletBalance < 0 ? 'text-rose-600' : 'text-gray-900'}`}>₹{wallet.rideWalletBalance}</p>
        </div>
        <div className="rounded-xl bg-gray-50 p-3">
          <p className="text-[10px] font-black uppercase tracking-wider text-gray-400">Dues pending</p>
          <p className={`text-lg font-black ${wallet.duesPending > 0 ? 'text-rose-600' : 'text-gray-900'}`}>₹{wallet.duesPending}</p>
        </div>
      </div>
      {needsMoney && wallet.topUpNeeded > 0 && (
        <button
          type="button"
          onClick={() => openRideApp(navigate, '/taxi/driver/wallet').catch((e) => toast.error(apiErrorOf(e).message))}
          className="mt-3 w-full h-11 rounded-xl bg-gray-900 text-white text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5"
        >
          <IndianRupee className="w-3.5 h-3.5" /> Add ₹{wallet.topUpNeeded} to take rides
        </button>
      )}
    </div>
  );
};

/** Ride & Parcel: apply with a vehicle, follow the review, and see how the merged wallet works. */
const RideModeV2 = () => {
  const goBack = useDeliveryBackNavigation();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState(null);
  const [vehicles, setVehicles] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({ vehicleTypeId: '', vehicleNumber: '', vehicleMake: '', vehicleModel: '', vehicleColor: '', services: ['taxi', 'delivery'] });
  const [rcPhoto, setRcPhoto] = useState(null);

  const load = useCallback(async () => {
    try {
      const [status, vehicleList] = await Promise.all([deliveryAPI.getRideMode(), deliveryAPI.getRideModeVehicleTypes()]);
      const s = unwrap(status);
      setState(s);
      // Bikes first: they are the only vehicles that can be added here; the rest are shown greyed out below them
      const list = [...(unwrap(vehicleList)?.vehicles || [])].sort((a, b) => Number(b.allowed) - Number(a.allowed));
      setVehicles(list);
      const bikes = list.filter((v) => v.allowed);
      if (!s?.vehicle && bikes.length === 1) {
        setForm((f) => ({ ...f, vehicleTypeId: bikes[0].id, services: bikes[0].services }));
      }
      if (s?.vehicle) {
        setForm((f) => ({
          ...f,
          vehicleTypeId: s.vehicle.vehicleTypeId || '',
          vehicleNumber: s.vehicle.vehicleNumber || '',
          vehicleMake: s.vehicle.vehicleMake || '',
          vehicleModel: s.vehicle.vehicleModel || '',
          vehicleColor: s.vehicle.vehicleColor || '',
          services: s.vehicle.services?.length ? s.vehicle.services : f.services,
        }));
      }
    } catch (e) {
      toast.error(apiErrorOf(e).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const selectedVehicle = useMemo(() => vehicles.find((v) => v.id === form.vehicleTypeId), [vehicles, form.vehicleTypeId]);
  const canApply = state && state.eligible && (state.status === 'none' || state.status === 'rejected');
  // The Submit button only appears once a bike is chosen
  const canSubmit = canApply && Boolean(selectedVehicle?.allowed);

  const selectVehicle = (vehicle) => {
    setForm((f) => ({
      ...f,
      vehicleTypeId: vehicle.id,
      // keep only services this vehicle can do
      services: f.services.filter((s) => vehicle.services.includes(s)).length ? f.services.filter((s) => vehicle.services.includes(s)) : vehicle.services,
    }));
  };

  const toggleService = (key) => {
    if (selectedVehicle && !selectedVehicle.services.includes(key)) return;
    setForm((f) => ({ ...f, services: f.services.includes(key) ? f.services.filter((s) => s !== key) : [...f.services, key] }));
  };

  const submit = async () => {
    if (!form.vehicleTypeId) return toast.error('Select your vehicle type');
    if (!/^[A-Za-z0-9 -]{4,15}$/.test(form.vehicleNumber.trim())) return toast.error('Enter a valid vehicle number');
    if (form.services.length === 0) return toast.error('Select Rides, Parcels or both');
    if (!rcPhoto && state?.status !== 'rejected') return toast.error('Add a photo of your vehicle RC');

    const data = new FormData();
    Object.entries(form).forEach(([key, value]) => data.append(key, Array.isArray(value) ? value.join(',') : value));
    if (rcPhoto) data.append('rcPhoto', rcPhoto);

    setSubmitting(true);
    try {
      setState(unwrap(await deliveryAPI.applyForRideMode(data)));
      toast.success('Application submitted');
    } catch (e) {
      const { code, message } = apiErrorOf(e);
      toast.error(message);
      if (code === 'DRIVING_LICENSE_REQUIRED') navigate('/food/delivery/profile/documents');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 pb-28">
      <div className="sticky top-0 z-20 bg-[#121212] text-white px-4 pt-4 pb-5 rounded-b-[28px] shadow-xl">
        <div className="flex items-center gap-3">
          <button type="button" onClick={goBack} className="w-9 h-9 rounded-full bg-white/10 flex items-center justify-center"><ArrowLeft className="w-4 h-4" /></button>
          <h1 className="text-base font-black tracking-tight">Ride & Parcel</h1>
        </div>
        <div className="mt-4 flex items-center gap-3">
          <div className="w-12 h-12 rounded-2xl bg-[#FFC107] flex items-center justify-center shrink-0"><Bike className="w-6 h-6 text-black" /></div>
          <p className="text-xs font-medium text-white/70 leading-relaxed">
            Take rides and parcel deliveries from this app when food orders are slow. One login, one Pocket.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-20"><Loader2 className="w-6 h-6 animate-spin text-gray-400" /></div>
      ) : (
        <div className="px-4 mt-4 space-y-4">
          {!state?.eligible && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 text-xs font-bold text-amber-700">
              Your delivery account must be approved before you can add Ride & Parcel.
            </div>
          )}

          {state && state.status !== 'none' && <StatusCard state={state} />}
          {state?.status === 'approved' && <WalletCard wallet={state.wallet} navigate={navigate} />}

          {canApply && (
            <>
              <section className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-3">1. Your vehicle</p>
                <p className="mb-3 text-[11px] font-medium text-gray-500 leading-relaxed">
                  Only bikes and scooters can be added here. For a car or auto, register in the <span className="font-black text-gray-900">Raydo Sarthi</span> app.
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {vehicles.map((v) => (
                    <button
                      key={v.id}
                      type="button"
                      disabled={!v.allowed}
                      onClick={() => (v.allowed ? selectVehicle(v) : toast.error('Register this vehicle in the Raydo Sarthi app.'))}
                      className={`rounded-xl border p-3 text-left transition-all ${!v.allowed ? 'border-gray-100 bg-gray-50 text-gray-400 opacity-70' : form.vehicleTypeId === v.id ? 'border-gray-900 bg-gray-900 text-white' : 'border-gray-200 bg-white text-gray-900'}`}
                    >
                      <p className="text-sm font-black truncate">{v.name}</p>
                      <p className={`text-[10px] font-bold mt-0.5 ${form.vehicleTypeId === v.id && v.allowed ? 'text-white/60' : 'text-gray-400'}`}>
                        {v.allowed ? v.services.map((s) => (s === 'taxi' ? 'Rides' : 'Parcels')).join(' · ') : 'Register in Raydo Sarthi app'}
                      </p>
                    </button>
                  ))}
                  {vehicles.length === 0 && <p className="col-span-2 text-xs font-medium text-gray-400">No vehicle types are open yet.</p>}
                </div>

                <div className="mt-4 space-y-3">
                  <input
                    value={form.vehicleNumber}
                    onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value.toUpperCase() }))}
                    placeholder="Vehicle number (e.g. MP09AB1234)"
                    className="w-full h-12 rounded-xl border border-gray-200 px-4 text-sm font-bold uppercase outline-none focus:border-gray-900"
                  />
                  <div className="grid grid-cols-3 gap-2">
                    {[['vehicleMake', 'Make'], ['vehicleModel', 'Model'], ['vehicleColor', 'Colour']].map(([key, label]) => (
                      <input
                        key={key}
                        value={form[key]}
                        onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                        placeholder={label}
                        className="min-w-0 h-11 rounded-xl border border-gray-200 px-3 text-xs font-bold outline-none focus:border-gray-900"
                      />
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-3">2. What you want to do</p>
                <div className="grid grid-cols-2 gap-2">
                  {SERVICE_OPTIONS.map(({ key, label, hint, icon: Icon }) => {
                    const disabled = selectedVehicle && !selectedVehicle.services.includes(key);
                    const active = form.services.includes(key) && !disabled;
                    return (
                      <button
                        key={key}
                        type="button"
                        disabled={disabled}
                        onClick={() => toggleService(key)}
                        className={`rounded-xl border p-3 flex items-center gap-2.5 text-left ${active ? 'border-[#FFC107] bg-[#FFC107]/15' : 'border-gray-200'} ${disabled ? 'opacity-40' : ''}`}
                      >
                        <Icon className="w-5 h-5 text-gray-900 shrink-0" />
                        <span>
                          <span className="block text-sm font-black text-gray-900">{label}</span>
                          <span className="block text-[10px] font-bold text-gray-400">{disabled ? 'Not for this vehicle' : hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section className="rounded-2xl bg-white border border-gray-100 p-4 shadow-sm">
                <p className="text-[11px] font-black uppercase tracking-wider text-gray-400 mb-3">3. Documents</p>
                <label className="flex items-center gap-3 rounded-xl border border-dashed border-gray-300 p-3 cursor-pointer">
                  <span className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center"><Camera className="w-5 h-5 text-gray-500" /></span>
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-black text-gray-900">Vehicle RC photo</span>
                    <span className="block text-[11px] font-bold text-gray-400 truncate">{rcPhoto ? rcPhoto.name : 'Tap to upload'}</span>
                  </span>
                  <input type="file" accept="image/*" className="hidden" onChange={(e) => setRcPhoto(e.target.files?.[0] || null)} />
                </label>
                <p className="mt-3 flex items-start gap-2 text-[11px] font-medium text-gray-500 leading-relaxed">
                  <ShieldCheck className="w-4 h-4 text-emerald-500 shrink-0" />
                  Your driving licence, Aadhaar and PAN from your delivery profile are shared with the review. No need to upload them again.
                </p>
              </section>
            </>
          )}
        </div>
      )}

      {canSubmit && !loading && (
        <div className="fixed bottom-0 inset-x-0 bg-white border-t border-gray-100 p-4 z-30">
          <button
            type="button"
            disabled={submitting}
            onClick={submit}
            className="w-full h-13 py-3.5 rounded-2xl bg-[#FFC107] text-black text-sm font-black uppercase tracking-wider shadow-lg disabled:opacity-60 flex items-center justify-center gap-2"
          >
            {submitting && <Loader2 className="w-4 h-4 animate-spin" />}
            {state?.status === 'rejected' ? 'Apply again' : 'Submit application'}
          </button>
        </div>
      )}
    </div>
  );
};

export default RideModeV2;
