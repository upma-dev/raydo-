import React, { useEffect, useMemo, useState } from 'react';
import { Bus, CalendarDays, IndianRupee, Search, Ticket, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import OwnerAppBar from '../components/OwnerAppBar';
import DriverBottomNav from '../../shared/components/DriverBottomNav';
import {
  cancelOwnerBusBookingSeats,
  getOwnerBusBookingCalendar,
  getOwnerBusBookings,
} from '../services/registrationService';

const statusTone = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  pending: 'bg-amber-50 text-amber-700 border-amber-200',
  cancelled: 'bg-rose-50 text-rose-700 border-rose-200',
  failed: 'bg-slate-100 text-slate-600 border-slate-200',
  expired: 'bg-slate-100 text-slate-600 border-slate-200',
};

const formatCurrency = (amount = 0, currency = 'INR') =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(amount || 0));

const formatDateLabel = (value) => {
  if (!value) return 'No date';
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString('en-IN', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  });
};

const getTodayValue = () => new Date().toISOString().slice(0, 10);
const getMonthValue = (value = getTodayValue()) => String(value || '').slice(0, 7);

const buildCalendarCells = (month, dayLookup) => {
  if (!/^\d{4}-\d{2}$/.test(String(month || ''))) return [];
  const [year, monthIndexValue] = month.split('-').map(Number);
  const monthIndex = monthIndexValue - 1;
  const firstDay = new Date(year, monthIndex, 1);
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const leadingSlots = firstDay.getDay();
  const cells = [];

  for (let index = 0; index < leadingSlots; index += 1) {
    cells.push({ id: `blank-${index}`, isCurrentMonth: false });
  }

  for (let day = 1; day <= daysInMonth; day += 1) {
    const date = `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    cells.push({
      id: date,
      date,
      isCurrentMonth: true,
      metrics: dayLookup.get(date) || null,
    });
  }

  return cells;
};

const OwnerBusBookingsPage = () => {
  const [filters, setFilters] = useState({
    busServiceId: '',
    travelDate: getTodayValue(),
    status: 'all',
    search: '',
  });
  const [month, setMonth] = useState(getMonthValue());
  const [loading, setLoading] = useState(true);
  const [calendarLoading, setCalendarLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState('');
  const [bookingData, setBookingData] = useState({
    buses: [],
    bookings: [],
    summary: {},
  });
  const [calendarDays, setCalendarDays] = useState([]);

  const loadBookings = async (activeFilters) => {
    const response = await getOwnerBusBookings(activeFilters);
    return response?.data?.data || response?.data || {};
  };

  const loadCalendar = async (payload) => {
    const response = await getOwnerBusBookingCalendar(payload);
    return response?.data?.data?.days || response?.data?.days || [];
  };

  useEffect(() => {
    let active = true;
    const run = async () => {
      setLoading(true);
      try {
        const data = await loadBookings(filters);
        if (!active) return;
        setBookingData(data);
        if (!filters.busServiceId && Array.isArray(data?.buses) && data.buses[0]) {
          setFilters((current) => ({ ...current, busServiceId: data.buses[0].id }));
        }
      } catch (error) {
        if (!active) return;
        toast.error(error?.response?.data?.message || error?.message || 'Failed to load owner bus bookings');
      } finally {
        if (active) setLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [filters.busServiceId, filters.search, filters.status, filters.travelDate]);

  useEffect(() => {
    if (!filters.busServiceId) return undefined;
    let active = true;
    const run = async () => {
      setCalendarLoading(true);
      try {
        const days = await loadCalendar({
          busServiceId: filters.busServiceId,
          month,
        });
        if (!active) return;
        setCalendarDays(days);
      } catch (error) {
        if (!active) return;
        toast.error(error?.response?.data?.message || error?.message || 'Failed to load owner bus calendar');
      } finally {
        if (active) setCalendarLoading(false);
      }
    };

    run();
    return () => {
      active = false;
    };
  }, [filters.busServiceId, month]);

  const buses = bookingData.buses || [];
  const bookings = bookingData.bookings || [];
  const summary = bookingData.summary || {};
  const selectedBus = useMemo(
    () => buses.find((item) => item.id === filters.busServiceId) || null,
    [buses, filters.busServiceId],
  );
  const dayLookup = useMemo(
    () => new Map((calendarDays || []).map((item) => [item.date, item])),
    [calendarDays],
  );
  const calendarCells = useMemo(() => buildCalendarCells(month, dayLookup), [dayLookup, month]);

  const refreshData = async () => {
    const [data, days] = await Promise.all([
      loadBookings(filters),
      filters.busServiceId ? loadCalendar({ busServiceId: filters.busServiceId, month }) : Promise.resolve([]),
    ]);
    setBookingData(data);
    setCalendarDays(days);
  };

  const handleCancelSeats = async (bookingId, seatIds = []) => {
    setActionLoading(`${bookingId}-${seatIds.join(',') || 'all'}`);
    try {
      const response = await cancelOwnerBusBookingSeats(bookingId, {
        seatIds,
        ownerNote: seatIds.length > 0 ? 'Seat cancelled by owner panel' : 'Booking cancelled by owner panel',
      });
      await refreshData();
      toast.success(response?.data?.message || 'Cancellation processed');
    } catch (error) {
      toast.error(error?.response?.data?.message || error?.message || 'Failed to cancel booking seats');
    } finally {
      setActionLoading('');
    }
  };

  const statCards = [
    { icon: Ticket, label: 'Bookings', value: summary.totalBookings || 0 },
    { icon: Users, label: 'Seats', value: summary.totalSeats || 0 },
    { icon: CalendarDays, label: 'Date', value: formatDateLabel(filters.travelDate) },
    {
      icon: IndianRupee,
      label: 'Revenue',
      value: formatCurrency(summary.totalAmount || 0, selectedBus?.fareCurrency || 'INR'),
    },
  ];

  const inputCls =
    'w-full rounded-2xl border border-[#D6E6FB] bg-[#F7FAFF] px-3.5 py-3 text-sm font-bold text-[#0B2A5B] outline-none focus:border-[#2F80ED]';
  const labelCls = 'mb-1.5 block text-[10px] font-black uppercase tracking-widest text-[#6B83A6]';

  return (
    <div className="min-h-screen bg-[#EEF5FF] pb-32">
      <OwnerAppBar
        title="Bus Bookings"
        subtitle={selectedBus?.busName || 'Choose a bus'}
        backTo="/taxi/owner/bus-service"
      />

      <div className="space-y-4 px-4 pt-4">
        {/* Summary strip */}
        <div className="grid grid-cols-2 gap-3">
          {statCards.map(({ icon: Icon, label, value }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl border border-[#D6E6FB] bg-white p-3.5 shadow-[0_4px_12px_rgba(11,42,91,0.05)]"
            >
              <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[#E8F1FF] text-[#0B2A5B]">
                <Icon size={18} />
              </div>
              <div className="min-w-0">
                <p className="text-[10px] font-black uppercase tracking-widest text-[#6B83A6]">{label}</p>
                <p className="truncate text-sm font-black text-[#0B2A5B]">{value}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <section className="space-y-3 rounded-3xl border border-[#D6E6FB] bg-white p-4 shadow-[0_4px_12px_rgba(11,42,91,0.05)]">
          <div>
            <label className={labelCls}>Bus</label>
            <select
              value={filters.busServiceId}
              onChange={(event) => setFilters((current) => ({ ...current, busServiceId: event.target.value }))}
              className={inputCls}
            >
              <option value="">Select bus</option>
              {buses.map((bus) => (
                <option key={bus.id} value={bus.id}>
                  {bus.busName} | {bus.route?.originCity} to {bus.route?.destinationCity}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Travel Date</label>
              <input
                type="date"
                value={filters.travelDate}
                onChange={(event) => {
                  const nextDate = event.target.value;
                  setFilters((current) => ({ ...current, travelDate: nextDate }));
                  setMonth(getMonthValue(nextDate));
                }}
                className={inputCls}
              />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select
                value={filters.status}
                onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value }))}
                className={inputCls}
              >
                <option value="all">All</option>
                <option value="confirmed">Confirmed</option>
                <option value="pending">Pending</option>
                <option value="cancelled">Cancelled</option>
                <option value="failed">Failed</option>
                <option value="expired">Expired</option>
              </select>
            </div>
          </div>
          <div className="relative">
            <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[#8EA3C2]" />
            <input
              value={filters.search}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value }))}
              placeholder="Search booking, passenger, phone..."
              className={`${inputCls} pl-10`}
            />
          </div>
        </section>

        {/* Calendar */}
        <section className="rounded-3xl border border-[#D6E6FB] bg-white p-4 shadow-[0_4px_12px_rgba(11,42,91,0.05)]">
          <div className="mb-3 flex items-center justify-between gap-3">
            <h2 className="text-sm font-black text-[#0B2A5B]">Calendar</h2>
            <input
              type="month"
              value={month}
              onChange={(event) => setMonth(event.target.value)}
              className="rounded-xl border border-[#D6E6FB] bg-[#F7FAFF] px-3 py-2 text-xs font-bold text-[#0B2A5B] outline-none"
            />
          </div>
          <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[9px] font-black uppercase text-[#8EA3C2]">
            {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((label, index) => (
              <div key={`${label}-${index}`}>{label}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarLoading
              ? Array.from({ length: 35 }, (_, index) => (
                  <div key={`loading-${index}`} className="h-11 animate-pulse rounded-xl bg-[#EEF5FF]" />
                ))
              : calendarCells.map((cell) =>
                  cell.isCurrentMonth ? (
                    <button
                      key={cell.id}
                      type="button"
                      onClick={() => setFilters((current) => ({ ...current, travelDate: cell.date }))}
                      className={`flex h-11 flex-col items-center justify-center rounded-xl border text-center transition ${
                        filters.travelDate === cell.date
                          ? 'border-[#0B2A5B] bg-[#0B2A5B] text-white'
                          : cell.metrics?.totalBookings
                            ? 'border-[#9CC8FF] bg-[#E8F1FF] text-[#0B2A5B]'
                            : 'border-transparent bg-[#F7FAFF] text-[#0B2A5B]'
                      }`}
                    >
                      <span className="text-xs font-black leading-none">{Number(cell.date.slice(-2))}</span>
                      {cell.metrics?.totalBookings ? (
                        <span className="mt-0.5 text-[8px] font-black leading-none">
                          {cell.metrics.totalBookings} bk
                        </span>
                      ) : null}
                    </button>
                  ) : (
                    <div key={cell.id} className="h-11" />
                  ),
                )}
          </div>
        </section>

        {/* Bookings */}
        <section>
          <h2 className="mb-3 px-1 text-[11px] font-black uppercase tracking-widest text-[#6B83A6]">
            Passenger Bookings ({bookings.length})
          </h2>

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 3 }, (_, index) => (
                <div key={`row-${index}`} className="h-28 animate-pulse rounded-2xl bg-white" />
              ))}
            </div>
          ) : bookings.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-[#9DB8DF] bg-white px-4 py-12 text-center">
              <Bus size={34} className="mx-auto text-[#9DB8DF]" />
              <p className="mt-3 text-sm font-black text-[#0B2A5B]">No bookings for this view</p>
              <p className="mt-1 text-xs font-semibold text-[#6B83A6]">Try another date, status, or bus.</p>
            </div>
          ) : (
            <div className="space-y-3">
              {bookings.map((booking) => (
                <div
                  key={booking.id}
                  className="rounded-2xl border border-[#D6E6FB] bg-white p-4 shadow-[0_4px_12px_rgba(11,42,91,0.05)]"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-sm font-black text-[#0B2A5B]">{booking.bookingCode || booking.id}</p>
                    <span
                      className={`shrink-0 rounded-full border px-2.5 py-0.5 text-[9px] font-black uppercase ${
                        statusTone[booking.status] || statusTone.pending
                      }`}
                    >
                      {booking.status}
                    </span>
                  </div>

                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <div className="rounded-xl bg-[#F4F8FF] px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-wider text-[#8EA3C2]">Passenger</p>
                      <p className="truncate text-xs font-black text-[#0B2A5B]">
                        {booking.passenger?.name || booking.user?.name || 'Unknown'}
                      </p>
                      <p className="truncate text-[10px] font-semibold text-[#6B83A6]">
                        {booking.passenger?.phone || booking.user?.phone || 'No phone'}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#F4F8FF] px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-wider text-[#8EA3C2]">Fare</p>
                      <p className="truncate text-xs font-black text-[#0B2A5B]">
                        {formatCurrency(booking.amount, booking.currency)}
                      </p>
                      <p className="truncate text-[10px] font-semibold text-[#6B83A6]">
                        Payment {booking.payment?.status || 'pending'}
                      </p>
                    </div>
                    <div className="col-span-2 rounded-xl bg-[#F4F8FF] px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-wider text-[#8EA3C2]">Route</p>
                      <p className="truncate text-xs font-black text-[#0B2A5B]">
                        {booking.routeSnapshot?.originCity || 'Origin'} to{' '}
                        {booking.routeSnapshot?.destinationCity || 'Destination'}
                      </p>
                      <p className="truncate text-[10px] font-semibold text-[#6B83A6]">
                        {booking.busService?.busName || booking.routeSnapshot?.busName || 'Bus'} •{' '}
                        {formatDateLabel(booking.travelDate)}
                      </p>
                    </div>
                  </div>

                  <p className="mt-3 text-[11px] font-bold text-[#6B83A6]">
                    Seats: {booking.seatSummary?.active || 0} active / {booking.seatSummary?.total || 0} total
                  </p>

                  {(booking.activeSeats || []).length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {booking.activeSeats.map((seat) => (
                        <button
                          key={`${booking.id}-${seat.seatId}`}
                          type="button"
                          disabled={Boolean(actionLoading)}
                          onClick={() => handleCancelSeats(booking.id, [seat.seatId])}
                          className="rounded-full border border-rose-200 bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase text-rose-700 disabled:opacity-60"
                        >
                          Cancel {seat.seatLabel}
                        </button>
                      ))}
                    </div>
                  ) : null}

                  <button
                    type="button"
                    disabled={Boolean(actionLoading) || (booking.activeSeats || []).length === 0}
                    onClick={() => handleCancelSeats(booking.id)}
                    className="mt-3 w-full rounded-xl bg-[#0B2A5B] py-2.5 text-xs font-black text-white active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {actionLoading.startsWith(booking.id) ? 'Processing...' : 'Cancel Full Booking'}
                  </button>

                  {(booking.cancelledSeats || []).length > 0 ? (
                    <div className="mt-3 rounded-xl border border-[#D6E6FB] bg-[#F4F8FF] px-3 py-2">
                      <p className="text-[9px] font-black uppercase tracking-wider text-[#8EA3C2]">Refund Snapshot</p>
                      <div className="mt-1 space-y-0.5 text-[11px] font-semibold text-[#0B2A5B]">
                        {booking.cancelledSeats.map((seat) => (
                          <p key={`${booking.id}-refund-${seat.seatId}`}>
                            {seat.seatLabel}: {formatCurrency(seat.refundAmount, booking.currency)} refunded
                          </p>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </section>
      </div>

      <DriverBottomNav />
    </div>
  );
};

export default OwnerBusBookingsPage;
