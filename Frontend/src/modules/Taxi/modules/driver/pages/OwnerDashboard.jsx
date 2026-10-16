import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Bell,
  Briefcase,
  Bus,
  Car,
  ChevronRight,
  FileText,
  Gift,
  Headphones,
  History,
  IndianRupee,
  Loader2,
  MapPin,
  RefreshCw,
  ShieldCheck,
  TrendingUp,
  User,
  UserPlus,
  Users,
  Wallet,
  CarFront,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useSettings } from '../../../shared/context/SettingsContext';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import {
  getDriverNotifications,
  getOwnerFleetDashboard,
} from '../services/registrationService';
import {
  getUnreadDriverNotificationCount,
  getVisibleDriverNotifications,
} from '../utils/notificationState';

const OWNER = '/taxi/owner';

const money = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  })}`;

const formatDate = (value) => {
  if (!value) return 'Recently';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Recently';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const getGreeting = (tz) => {
  let hour;
  try {
    const zone = tz || Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    hour = parseInt(
      new Date().toLocaleString('en-US', { timeZone: zone, hour: 'numeric', hour12: false }),
      10,
    );
  } catch {
    hour = new Date().getHours();
  }
  if (hour >= 4 && hour < 12) return 'Good Morning';
  if (hour >= 12 && hour < 17) return 'Good Afternoon';
  if (hour >= 17 && hour < 22) return 'Good Evening';
  return 'Good Night';
};

const titleCase = (text = '') =>
  String(text)
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .join(' ');

const readStoredInfo = () => {
  try {
    const raw =
      sessionStorage.getItem('driverInfo') ||
      localStorage.getItem('driverInfo') ||
      localStorage.getItem('user');
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
};

const statusTone = (value = '') => {
  const s = String(value).toLowerCase();
  if (['approved', 'completed', 'active', 'online', 'confirmed'].includes(s)) {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (['pending', 'accepted', 'ongoing', 'maintenance'].includes(s)) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  if (['cancelled', 'rejected', 'inactive', 'offline'].includes(s)) {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  return 'bg-slate-50 text-slate-600 border-slate-200';
};

const SectionCard = ({ icon: Icon, title, hint, badge, onClick }) => (
  <motion.button
    type="button"
    whileTap={{ scale: 0.96 }}
    onClick={onClick}
    className="relative flex flex-col items-start gap-3 rounded-3xl border border-[#D6E6FB] bg-white p-4 text-left shadow-[0_6px_18px_rgba(11,42,91,0.07)] transition-colors hover:border-[#2F80ED]"
  >
    <div className="flex w-full items-start justify-between">
      <div className="grid h-11 w-11 place-items-center rounded-2xl bg-[#E8F1FF] text-[#0B2A5B]">
        <Icon size={21} strokeWidth={2.2} />
      </div>
      {badge !== undefined && badge !== null ? (
        <span className="rounded-full bg-[#0B2A5B] px-2 py-0.5 text-[10px] font-black text-white">
          {badge}
        </span>
      ) : (
        <ChevronRight size={16} className="mt-1 text-[#9DB8DF]" />
      )}
    </div>
    <div className="min-w-0">
      <p className="text-[13px] font-black leading-tight text-[#0B2A5B]">{title}</p>
      <p className="mt-0.5 line-clamp-1 text-[10.5px] font-semibold text-[#6B83A6]">{hint}</p>
    </div>
  </motion.button>
);

const OwnerDashboard = () => {
  const navigate = useNavigate();
  const { settings } = useSettings();
  const [dashboard, setDashboard] = useState(null);
  const [unread, setUnread] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState('');

  const busEnabled = String(settings.transportRide?.enable_bus_service ?? '1') !== '0';

  const refreshUnread = useCallback(async () => {
    try {
      const res = await getDriverNotifications();
      const results = res?.data?.results || [];
      setUnread(getUnreadDriverNotificationCount(getVisibleDriverNotifications(results)));
    } catch {
      setUnread(0);
    }
  }, []);

  const loadDashboard = useCallback(
    async ({ silent = false } = {}) => {
      if (silent) setIsRefreshing(true);
      else setIsLoading(true);
      setError('');

      try {
        const response = await getOwnerFleetDashboard();
        setDashboard(response?.data?.data || response?.data || response);
      } catch (requestError) {
        setError(
          requestError?.response?.data?.message ||
            requestError?.message ||
            'Unable to load owner dashboard',
        );
      } finally {
        setIsLoading(false);
        setIsRefreshing(false);
      }
      refreshUnread();
    },
    [refreshUnread],
  );

  useEffect(() => {
    loadDashboard();
  }, [loadDashboard]);

  const profile = dashboard?.profile || {};
  const fleet = dashboard?.fleet || {};
  const bookings = dashboard?.bookings || {};
  const earnings = dashboard?.earnings || {};
  const busOverview = dashboard?.busOverview || {};
  const serviceLocation = dashboard?.serviceLocation || null;
  const recentDrivers = dashboard?.recentDrivers || [];
  const recentRides = dashboard?.recentRides || [];

  const stored = useMemo(() => readStoredInfo(), []);
  const ownerName =
    titleCase(profile.ownerName || profile.name || stored.owner_name || stored.name || '') ||
    'Fleet Owner';
  const companyName =
    titleCase(profile.companyName || stored.companyName || '') || `${ownerName}'s Fleet`;
  const greeting = useMemo(() => getGreeting(serviceLocation?.timezone), [serviceLocation]);

  const walletBalance = Number(earnings.walletBalance ?? profile.walletBalance ?? 0);
  const todayEarnings = Number(earnings.todayOwnerEarnings || 0);
  const totalDrivers = Number(fleet.totalDrivers || 0);
  const totalVehicles = Number(fleet.totalVehicles || 0);
  const activeTrips = Number(bookings.active || 0);

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#EEF5FF]">
        <div className="flex flex-col items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-2xl bg-[#0B2A5B] text-white shadow-lg">
            <Loader2 size={22} className="animate-spin" />
          </div>
          <p className="text-[11px] font-black uppercase tracking-widest text-[#6B83A6]">
            Loading...
          </p>
        </div>
      </div>
    );
  }

  const sections = [
    {
      icon: Users,
      title: 'My Drivers',
      hint: `${fleet.onlineDrivers || 0} online • ${fleet.pendingDrivers || 0} pending`,
      badge: totalDrivers,
      path: `${OWNER}/manage-drivers`,
    },
    {
      icon: Car,
      title: 'My Vehicles',
      hint: `${fleet.approvedVehicles || 0} approved • ${fleet.pendingVehicles || 0} pending`,
      badge: totalVehicles,
      path: `${OWNER}/vehicle-fleet`,
    },
    {
      icon: UserPlus,
      title: 'Add Driver',
      hint: 'Onboard a new driver',
      path: `${OWNER}/add-driver`,
    },
    {
      icon: CarFront,
      title: 'Add Vehicle',
      hint: 'Register a vehicle',
      path: `${OWNER}/add-vehicle`,
    },
    ...(busEnabled
      ? [
          {
            icon: Bus,
            title: 'Bus Services',
            hint: `${busOverview.activeBuses || 0} active of ${busOverview.totalBuses || 0}`,
            badge: busOverview.totalBuses || 0,
            path: `${OWNER}/bus-service`,
          },
          {
            icon: Briefcase,
            title: 'Bus Bookings',
            hint: `${busOverview.upcomingBookings || 0} upcoming seats`,
            badge: busOverview.totalBookings || 0,
            path: `${OWNER}/bus-bookings`,
          },
        ]
      : []),
    {
      icon: Wallet,
      title: 'Wallet',
      hint: `Balance ${money(walletBalance)}`,
      path: `${OWNER}/wallet`,
    },
    {
      icon: TrendingUp,
      title: 'Earnings',
      hint: `Today ${money(todayEarnings)}`,
      path: `${OWNER}/earnings`,
    },
    {
      icon: History,
      title: 'Ride History',
      hint: `${bookings.total || 0} bookings`,
      badge: bookings.total || 0,
      path: `${OWNER}/history`,
    },
    {
      icon: Bell,
      title: 'Notifications',
      hint: unread ? `${unread} unread` : 'All caught up',
      badge: unread || undefined,
      path: `${OWNER}/notifications`,
    },
    {
      icon: FileText,
      title: 'Documents',
      hint: 'Upload & verify papers',
      path: `${OWNER}/documents`,
    },
    {
      icon: IndianRupee,
      title: 'Payout Methods',
      hint: 'Bank & UPI details',
      path: `${OWNER}/payout-methods`,
    },
    {
      icon: Gift,
      title: 'Refer & Earn',
      hint: 'Invite and get rewards',
      path: `${OWNER}/referral`,
    },
    {
      icon: Headphones,
      title: 'Help & Support',
      hint: 'Tickets and chat',
      path: `${OWNER}/help-support`,
    },
    {
      icon: User,
      title: 'My Account',
      hint: 'Profile & settings',
      path: `${OWNER}/profile`,
    },
  ];

  return (
    <div className="min-h-screen bg-[#EEF5FF] pb-28 font-sans text-[#0B2A5B]">
      {/* App bar + wallet hero */}
      <header className="relative overflow-hidden rounded-b-[32px] bg-gradient-to-br from-[#0A1F44] via-[#0B2A5B] to-[#1D4E9E] px-4 pb-6 pt-5 text-white shadow-[0_14px_30px_rgba(10,31,68,0.28)]">
        <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-[#5AA2FF]/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-[#9CC8FF]/15 blur-3xl" />

        <div className="relative z-10 flex items-center justify-between">
          <div className="flex min-w-0 items-center gap-2.5">
            <img
              src={settings.general?.logo || settings.customization?.logo || '/raydo-logo.png'}
              alt="Raydo"
              className="h-10 w-10 shrink-0 rounded-xl bg-white/90 object-contain p-0.5"
              onError={(e) => {
                e.target.onerror = null;
                e.target.src = '/raydo-logo.png';
              }}
            />
            <div className="min-w-0">
              <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#9CC8FF]">
                Owner Suite
              </p>
              <p className="max-w-[170px] truncate text-sm font-black">{companyName}</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => loadDashboard({ silent: true })}
              disabled={isRefreshing}
              aria-label="Refresh"
              className="grid h-10 w-10 place-items-center rounded-full bg-white/12 backdrop-blur disabled:opacity-60"
            >
              <RefreshCw size={17} className={isRefreshing ? 'animate-spin' : ''} />
            </button>
            <button
              type="button"
              onClick={() => navigate(`${OWNER}/notifications`)}
              aria-label="Notifications"
              className="relative grid h-10 w-10 place-items-center rounded-full bg-white/12 backdrop-blur"
            >
              <Bell size={18} />
              {unread > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-rose-500 px-1 text-[9px] font-black">
                  {unread > 99 ? '99+' : unread}
                </span>
              ) : null}
            </button>
          </div>
        </div>

        <div className="relative z-10 mt-5">
          <p className="text-xs font-semibold text-[#BBD7FF]">{greeting} 👋</p>
          <h1 className="text-2xl font-black tracking-tight">{ownerName}</h1>
          <p className="mt-0.5 text-[13px] font-extrabold text-[#9CC8FF]">Raydo Fleet Partner</p>
          <p className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#9CC8FF]">
            <MapPin size={12} />
            {serviceLocation?.name || profile.city || 'Your service area'}
            <span className="mx-1">•</span>
            <ShieldCheck size={12} /> Approved
          </p>
        </div>
      </header>

      <main className="space-y-6 px-4 pt-5">
        {error ? (
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-rose-200 bg-rose-50 p-3 text-xs font-bold text-rose-700">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => loadDashboard()}
              className="shrink-0 rounded-full bg-rose-600 px-3 py-1 text-[11px] font-black text-white"
            >
              Retry
            </button>
          </div>
        ) : null}

        {/* Section cards: tap to open related section */}
        <section>
          <h2 className="mb-3 px-1 text-[11px] font-black uppercase tracking-widest text-[#6B83A6]">
            Manage Your Business
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {sections.map((section) => (
              <SectionCard
                key={section.title}
                icon={section.icon}
                title={section.title}
                hint={section.hint}
                badge={section.badge}
                onClick={() => navigate(section.path)}
              />
            ))}
          </div>
        </section>

        {/* Recent rides */}
        <section>
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#6B83A6]">
              Recent Bookings
            </h2>
            <button
              type="button"
              onClick={() => navigate(`${OWNER}/history`)}
              className="text-xs font-black text-[#2F80ED]"
            >
              View all
            </button>
          </div>
          <div className="space-y-2.5">
            {recentRides.length === 0 ? (
              <div className="rounded-2xl border border-[#D6E6FB] bg-white p-5 text-center text-xs font-bold text-[#6B83A6]">
                No bookings for your fleet yet.
              </div>
            ) : (
              recentRides.slice(0, 4).map((ride) => (
                <div
                  key={ride.id}
                  className="rounded-2xl border border-[#D6E6FB] bg-white p-3.5 shadow-[0_4px_12px_rgba(11,42,91,0.05)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-xs font-black capitalize">
                      {ride.transportType || 'Taxi'} • {ride.driver?.name || 'Driver'}
                    </p>
                    <span
                      className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${statusTone(
                        ride.status,
                      )}`}
                    >
                      {ride.status || '-'}
                    </span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 truncate text-[11px] font-semibold text-[#6B83A6]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-emerald-500" />
                    {ride.pickupAddress || 'Pickup'}
                  </p>
                  <p className="mt-1 flex items-center gap-1.5 truncate text-[11px] font-semibold text-[#6B83A6]">
                    <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-rose-500" />
                    {ride.dropAddress || 'Drop'}
                  </p>
                  <div className="mt-2 flex items-center justify-between border-t border-[#EAF1FB] pt-2 text-[10px] font-bold text-[#8EA3C2]">
                    <span>{formatDate(ride.createdAt)}</span>
                    <span className="text-xs font-black text-[#0B2A5B]">
                      {money(ride.earnings || ride.fare)}
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* Drivers snapshot */}
        <section>
          <div className="mb-3 flex items-center justify-between px-1">
            <h2 className="text-[11px] font-black uppercase tracking-widest text-[#6B83A6]">
              Your Drivers
            </h2>
            <button
              type="button"
              onClick={() => navigate(`${OWNER}/manage-drivers`)}
              className="text-xs font-black text-[#2F80ED]"
            >
              View all
            </button>
          </div>
          <div className="space-y-2.5">
            {recentDrivers.length === 0 ? (
              <button
                type="button"
                onClick={() => navigate(`${OWNER}/add-driver`)}
                className="w-full rounded-2xl border border-dashed border-[#9DB8DF] bg-white p-5 text-center text-xs font-bold text-[#2F80ED]"
              >
                No drivers yet — tap to add your first driver
              </button>
            ) : (
              recentDrivers.slice(0, 4).map((driver) => (
                <div
                  key={driver.id}
                  className="flex items-center justify-between rounded-2xl border border-[#D6E6FB] bg-white p-3"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E8F1FF] text-xs font-black text-[#0B2A5B]">
                      {(driver.name || 'DR').substring(0, 2).toUpperCase()}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate text-xs font-black">{driver.name || 'Driver'}</p>
                      <p className="truncate text-[10.5px] font-semibold text-[#6B83A6]">
                        {driver.phone || '-'}
                      </p>
                    </div>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2 py-0.5 text-[9px] font-black uppercase ${statusTone(
                      driver.isOnRide ? 'ongoing' : driver.isOnline ? 'online' : driver.status || 'offline',
                    )}`}
                  >
                    {driver.isOnRide ? 'On Trip' : driver.isOnline ? 'Online' : driver.status || 'Offline'}
                  </span>
                </div>
              ))
            )}
          </div>
        </section>
      </main>

      <DriverBottomNav />
    </div>
  );
};

export default OwnerDashboard;
