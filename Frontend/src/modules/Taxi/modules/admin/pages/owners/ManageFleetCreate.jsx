import React, { useEffect, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Loader2, Save } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useTaxiTransportTypes } from '../../../../shared/hooks/useTaxiTransportTypes';
import AdminPageHeader from '../../components/ui/AdminPageHeader';
import toast from 'react-hot-toast';
import api from '../../../../shared/api/axiosInstance';

// The shared axios instance unwraps the HTTP response, so every call resolves to the API body: { success, data }
const BASE = '/admin';

const inputClass =
  'w-full border border-gray-200 rounded-lg px-4 py-3 text-sm text-gray-800 bg-white focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none transition-colors';
const labelClass = 'block text-sm font-semibold text-gray-900 mb-2';

const getOwnerLabel = (owner) => owner?.company_name || owner?.name || owner?.email || owner?.mobile || owner?._id || 'Owner';

const getVehicleTypeLabel = (vt) => vt?.name || vt?.type_name || vt?.title || vt?._id || vt?.id || 'Type';

const ManageFleetCreate = () => {
  const navigate = useNavigate();
  const { transportTypes } = useTaxiTransportTypes();

  const [isBootLoading, setIsBootLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [owners, setOwners] = useState([]);
  const [serviceLocations, setServiceLocations] = useState([]);
  const [vehicleTypes, setVehicleTypes] = useState([]);

  const [formData, setFormData] = useState({
    owner_id: '',
    vehicle_type_id: '',
    car_brand: '',
    car_model: '',
    license_plate_number: '',
    car_color: '',

    // Backend-required fields (kept off-UI to match your screenshot).
    service_location_id: '',
    transport_type: '',
  });

  useEffect(() => {
    const boot = async () => {
      setIsBootLoading(true);
      try {
        const [oJson, lJson] = await Promise.all([
          api.get(`${BASE}/owner-management/manage-owners`),
          api.get(`${BASE}/service-locations`),
        ]);

        const oList = oJson?.data?.results || oJson?.data || [];
        const locs = Array.isArray(lJson?.data) ? lJson.data : lJson?.data?.results || [];

        const safeOwners = Array.isArray(oList) ? oList : [];
        const safeLocs = Array.isArray(locs) ? locs : [];

        setOwners(safeOwners);
        setServiceLocations(safeLocs);

        setFormData((prev) => ({
          ...prev,
          owner_id: prev.owner_id || safeOwners?.[0]?._id || '',
          service_location_id: prev.service_location_id || safeLocs?.[0]?._id || '',
        }));
      } catch (e) {
        toast.error(e?.message || 'Could not load owners and service locations');
      } finally {
        setIsBootLoading(false);
      }
    };

    boot();
  }, []);

  useEffect(() => {
    const fetchTypes = async () => {
      try {
        const typeFilter = (formData.transport_type || 'taxi').toLowerCase();
        const json = await api.get(`${BASE}/types/vehicle-types/list`, { params: { transport_type: typeFilter } });
        if (json?.success) {
          const list = Array.isArray(json.data) ? json.data : json?.data?.results || [];
          const safe = Array.isArray(list) ? list : [];
          setVehicleTypes(safe);
          setFormData((prev) => ({ ...prev, vehicle_type_id: prev.vehicle_type_id || safe?.[0]?._id || safe?.[0]?.id || '' }));
        }
      } catch (e) {
        toast.error(e?.message || 'Could not load vehicle types');
      }
    };

    fetchTypes();
  }, [formData.transport_type]);

  const handleSubmit = async (event) => {
    event.preventDefault();

    if (
      !formData.owner_id ||
      !formData.vehicle_type_id ||
      !formData.car_brand ||
      !formData.car_model ||
      !formData.license_plate_number ||
      !formData.car_color
    ) {
      alert('Please fill all required fields');
      return;
    }

    setSubmitting(true);
    try {
      const json = await api.post(`${BASE}/owner-management/manage-fleet`, {
        owner_id: formData.owner_id,
        service_location_id: formData.service_location_id,
        transport_type: formData.transport_type,
        vehicle_type_id: formData.vehicle_type_id,
        car_brand: formData.car_brand,
        car_model: formData.car_model,
        license_plate_number: formData.license_plate_number,
        car_color: formData.car_color,
      });
      if (json?.success) {
        navigate('/taxi/admin/fleet/manage');
        return;
      }
      alert(json?.message || 'Operation failed');
    } catch (e) {
      alert(e?.message || 'Operation failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 font-sans text-gray-950">
      <div className="px-5 pt-3">
        <AdminPageHeader module="Fleet Management" page="Manage Fleet" title="Create Fleet" backto="/taxi/admin/fleet/manage" />
      </div>

      <div className="px-5 pb-10">
        <div className="rounded border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-100 px-8 py-6" />

          <form onSubmit={handleSubmit} className="p-8">
            <div className="grid grid-cols-1 gap-x-10 gap-y-7 md:grid-cols-2">
              <div>
                <label className={labelClass}>
                  Transport Type <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.transport_type}
                    onChange={(e) => setFormData((prev) => ({ ...prev, transport_type: e.target.value }))}
                    className={`${inputClass} appearance-none pr-10`}
                    required
                  >
                    <option value="">Select Transport Type</option>
                    {transportTypes.map((t) => (
                      <option key={t.id || t._id} value={t.name}>
                        {t.display_name}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Owner <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.owner_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, owner_id: e.target.value }))}
                    className={`${inputClass} appearance-none pr-10`}
                    disabled={isBootLoading}
                  >
                    <option value="">{isBootLoading ? 'Loading owners...' : 'Select an owner'}</option>
                    {owners.map((o) => (
                      <option key={o._id} value={o._id}>
                        {getOwnerLabel(o)}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Select Type <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <select
                    value={formData.vehicle_type_id}
                    onChange={(e) => setFormData((prev) => ({ ...prev, vehicle_type_id: e.target.value }))}
                    className={`${inputClass} appearance-none pr-10`}
                    disabled={isBootLoading || !formData.service_location_id}
                  >
                    <option value="">
                      {isBootLoading ? 'Loading types...' : vehicleTypes.length ? 'Select' : 'No types found'}
                    </option>
                    {vehicleTypes.map((vt) => {
                      const id = vt?._id || vt?.id;
                      return (
                        <option key={id} value={id}>
                          {getVehicleTypeLabel(vt)}
                        </option>
                      );
                    })}
                  </select>
                  <ChevronDown size={18} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
                </div>
              </div>

              <div>
                <label className={labelClass}>
                  Car Brand <span className="text-rose-500">*</span>
                </label>
                <input
                  value={formData.car_brand}
                  onChange={(e) => setFormData((prev) => ({ ...prev, car_brand: e.target.value }))}
                  className={inputClass}
                  placeholder="Enter Car Make"
                />
              </div>

              <div>
                <label className={labelClass}>
                  Car Model <span className="text-rose-500">*</span>
                </label>
                <input
                  value={formData.car_model}
                  onChange={(e) => setFormData((prev) => ({ ...prev, car_model: e.target.value }))}
                  className={inputClass}
                  placeholder="Enter Car Model"
                />
              </div>

              <div>
                <label className={labelClass}>
                  License Plate Number <span className="text-rose-500">*</span>
                </label>
                <input
                  value={formData.license_plate_number}
                  onChange={(e) => setFormData((prev) => ({ ...prev, license_plate_number: e.target.value }))}
                  className={inputClass}
                  placeholder="Enter License Plate Number"
                />
              </div>

              <div>
                <label className={labelClass}>
                  Car Color <span className="text-rose-500">*</span>
                </label>
                <input
                  value={formData.car_color}
                  onChange={(e) => setFormData((prev) => ({ ...prev, car_color: e.target.value }))}
                  className={inputClass}
                  placeholder="Enter Car Color"
                />
              </div>
            </div>

            <div className="mt-10 flex items-center justify-end">
              <button
                type="submit"
                disabled={submitting || isBootLoading}
                className="inline-flex h-12 items-center gap-2 rounded bg-indigo-950 px-8 text-sm font-semibold text-white transition-colors hover:bg-indigo-900 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />}
                Save
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default ManageFleetCreate;

