import React from 'react';
import { Briefcase, Plus } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useSettings } from '../../../shared/context/SettingsContext';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import OwnerAppBar from '../components/OwnerAppBar';
import BusServiceManager from '../../admin/pages/bus-service/BusServiceManager';
import { normalizeBusCatalog } from '../../admin/services/busService';
import {
  getOwnerFleetDrivers,
  createOwnerBusService,
  deleteOwnerBusService,
  getOwnerBusServices,
  updateOwnerBusService,
} from '../services/registrationService';
import '../styles/ownerApp.css';

const BASE = '/taxi/owner/bus-service';

const ownerBusApi = {
  deleteBus: deleteOwnerBusService,
  getBuses: async () => {
    const response = await getOwnerBusServices();
    const rawItems = response?.data?.data || response?.data?.results || response?.data || [];
    return normalizeBusCatalog(Array.isArray(rawItems) ? rawItems : []);
  },
  getDrivers: async () => {
    const response = await getOwnerFleetDrivers();
    const rawItems = response?.data?.data?.results || response?.data?.results || [];
    return Array.isArray(rawItems) ? rawItems : [];
  },
  upsertBus: async (payload) =>
    normalizeBusCatalog([
      (
        payload.id?.startsWith('bus-')
          ? await createOwnerBusService(payload)
          : await updateOwnerBusService(payload.id, payload)
      )?.data?.data || {},
    ])[0],
};

const getScreen = (pathname) => {
  if (pathname === `${BASE}/create`) return { title: 'Add Bus', subtitle: 'Fill bus, route and seat details' };
  if (pathname.startsWith(`${BASE}/edit/`)) return { title: 'Edit Bus', subtitle: 'Update your bus service' };
  if (pathname.startsWith(`${BASE}/`)) return { title: 'Bus Details', subtitle: 'Route, seats and schedules' };
  return { title: 'My Buses', subtitle: 'Manage your bus services' };
};

const OwnerBusServicePage = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { settings } = useSettings();
  const busEnabled = String(settings.transportRide?.enable_bus_service || '0') === '1';
  const isList = pathname === BASE || pathname === `${BASE}/`;
  const screen = getScreen(pathname);

  return (
    <div className="min-h-screen bg-[#EEF5FF] pb-32">
      <OwnerAppBar
        title={screen.title}
        subtitle={screen.subtitle}
        backTo={isList ? '/taxi/owner/dashboard' : BASE}
        actions={
          isList ? (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => navigate('/taxi/owner/bus-bookings')}
                aria-label="Bus bookings"
                className="grid h-9 w-9 place-items-center rounded-full bg-white/15 active:scale-95"
              >
                <Briefcase size={17} />
              </button>
              <button
                type="button"
                onClick={() => navigate(`${BASE}/create`)}
                aria-label="Add bus"
                className="grid h-9 w-9 place-items-center rounded-full bg-white text-[#0B2A5B] active:scale-95"
              >
                <Plus size={18} />
              </button>
            </div>
          ) : null
        }
      />

      <div className="px-4 pt-4">
        {busEnabled ? (
          <BusServiceManager
            appMode
            api={ownerBusApi}
            basePath={BASE}
            emptyLabel="No buses added yet. Tap + to add your first bus."
            defaultStatus="pending_approval"
          />
        ) : (
          <div className="rounded-2xl border border-amber-200 bg-amber-50 p-5 text-sm font-bold text-amber-800">
            Bus service is currently disabled by admin, so this section is hidden until it is enabled.
          </div>
        )}
      </div>

      <DriverBottomNav />
    </div>
  );
};

export default OwnerBusServicePage;
