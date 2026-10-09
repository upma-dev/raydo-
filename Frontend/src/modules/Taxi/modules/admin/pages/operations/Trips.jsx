import React from 'react';
import { Filter, MoreVertical, Search, Loader2, ChevronRight, Menu } from 'lucide-react';
import { motion } from 'framer-motion';
import { adminService } from '../../services/adminService';

const STATUS_STYLES = {
  CANCELLED: 'bg-orange-500 text-white',
  COMPLETED: 'bg-teal-500 text-white',
  UPCOMING: 'bg-amber-400 text-white',
  ONGOING: 'bg-blue-500 text-white',
  ACCEPTED: 'bg-emerald-500 text-white',
};

const PAYMENT_STYLES = {
  CASH: 'bg-orange-500 text-white',
  CARD: 'bg-red-500 text-white',
  WALLET: 'bg-teal-500 text-white',
};

const TAB_SET = ['All', 'Completed', 'Cancelled', 'Upcoming', 'On Trip'];

const formatDate = (value) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) return '--';
  return date.toLocaleString('en-IN', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const normalizeTab = (tab) => {
  if (tab === 'On Trip') return 'ongoing';
  return tab.toLowerCase();
};

const normalizeRow = (row = {}) => ({
  id: String(row._id || row.id || row.requestId || Math.random()),
  requestId: row.requestId || row.request_id || row.ride_request_id || '--',
  date: row.date || row.createdAt || row.created_at || row.trip_date || row.updatedAt,
  userName: row.userName || row.user_name || row.customer_name || row.user?.name || '--',
  driverName: row.driverName || row.driver_name || row.driver?.name || '--',
  transportType: row.transportType || row.transport_type || row.service_type || row.module || '--',
  tripStatus: String(row.tripStatus || row.trip_status || row.status || '').toUpperCase(),
  paymentOption: String(row.paymentOption || row.payment_option || row.payment_method || 'CASH').toUpperCase(),
  fare: Number(row.fare || 0),
  refundStatus: row.refundStatus || 'none',
  refundedAmount: Number(row.refundedAmount || 0),
});

const Trips = () => {
  const [activeTab, setActiveTab] = React.useState('All');
  const [search, setSearch] = React.useState('');
  const [selectedZone, setSelectedZone] = React.useState('all');
  const [zonesList, setZonesList] = React.useState([]);
  const [limit, setLimit] = React.useState(10);
  const [rows, setRows] = React.useState([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState('');
  const [refundingId, setRefundingId] = React.useState('');

  const refundRide = async (row) => {
    const answer = window.prompt(
      `Refund ride ${row.requestId} (fare \u20B9${row.fare})?\n\nEnter the amount to refund (max \u20B9${row.fare}):`,
      String(row.fare),
    );
    if (answer === null) return;
    const amount = Number(answer);
    if (!Number.isFinite(amount) || amount <= 0 || amount > row.fare) {
      window.alert(`Enter an amount between 1 and ${row.fare}`);
      return;
    }
    const reason = window.prompt('Reason for the refund (shown to the rider):', 'Ride refunded by admin');
    if (reason === null) return;
    const deductFromDriver = window.confirm(
      "Take this ride's earning back from the DRIVER's wallet?\n\nOK = driver returns the earning\nCancel = the platform bears the refund",
    );
    setRefundingId(row.id);
    try {
      const response = await adminService.refundRide(row.id, { amount, reason, deductFromDriver });
      const data = response?.data?.data || response?.data || {};
      window.alert(
        `Refunded \u20B9${data.amount ?? amount} (${data.method === 'razorpay' ? 'to the original payment method' : 'to the rider wallet'}).` +
          (data.driverDebited ? `\nTaken back from the driver: \u20B9${data.driverDebited}` : '') +
          (data.note ? `\n${data.note}` : ''),
      );
      loadRows();
    } catch (err) {
      window.alert(err?.response?.data?.message || err?.message || 'Refund failed');
    } finally {
      setRefundingId('');
    }
  };

  React.useEffect(() => {
    adminService.getZones().then((res) => {
      const list = res?.data?.data?.zones || res?.data?.zones || res?.data || [];
      if (Array.isArray(list)) setZonesList(list);
    }).catch(() => {});
  }, []);

  const loadRows = React.useCallback(async () => {
    setLoading(true);
    setError('');

    try {
      const response = await adminService.getRideRequests({
        limit,
        tab: normalizeTab(activeTab),
        search,
        zoneId: selectedZone !== 'all' ? selectedZone : undefined,
        zone: selectedZone !== 'all' ? selectedZone : undefined,
      });
      const payload = response?.data?.data || response?.data || response || {};
      const results = Array.isArray(payload?.results) ? payload.results : [];
      setRows(results.map(normalizeRow));
    } catch (err) {
      setRows([]);
      setError(err?.message || 'Failed to load trip requests');
    } finally {
      setLoading(false);
    }
  }, [activeTab, limit, search, selectedZone]);

  React.useEffect(() => {
    loadRows();
  }, [loadRows]);

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col font-sans">
      <div className="p-4 space-y-4">
        <div className="flex items-center justify-between px-4 py-2 bg-white rounded-t-xl">
          <h1 className="text-[20px] font-black tracking-tight text-slate-800 uppercase">RIDE REQUESTS</h1>
          <div className="flex items-center gap-2 text-[12px] font-medium text-slate-400">
            <span>Operations</span>
            <ChevronRight size={14} className="text-slate-300" />
            <span className="text-slate-500">Ride Requests</span>
          </div>
        </div>

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm relative">
          <div className="flex flex-col gap-4 border-b border-slate-100 px-6 py-6 lg:flex-row lg:items-center">
            <div className="flex items-center gap-2 text-[14px] font-medium text-slate-500">
              <span>show</span>
              <select
                value={limit}
                onChange={(e) => setLimit(Number(e.target.value))}
                className="h-9 w-16 border border-slate-200 rounded-md bg-white px-2 text-[13px] outline-none"
              >
                <option value={10}>10</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>entries</span>
            </div>

            <div className="flex flex-1 justify-center items-center gap-8 flex-wrap">
              {TAB_SET.map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`relative py-1 text-[15px] font-bold transition-all ${
                    activeTab === tab ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
                  }`}
                >
                  {tab}
                  {activeTab === tab && (
                    <motion.div layoutId="trip-tab" className="absolute -bottom-3 left-0 right-0 h-0.5 bg-indigo-600" />
                  )}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3">
              <select
                value={selectedZone}
                onChange={(e) => setSelectedZone(e.target.value)}
                className="h-10 border border-slate-200 rounded-full bg-white px-3 text-[13px] outline-none text-slate-700 focus:border-slate-300"
              >
                <option value="all">All Zones</option>
                {zonesList.map((z) => (
                  <option key={z._id || z.id} value={z._id || z.id || z.name}>
                    {z.name || z.zoneName || z.service_location_name || 'Unnamed Zone'}
                  </option>
                ))}
              </select>
              <div className="relative">
                <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Search trips"
                  className="h-10 w-52 rounded-full border border-slate-200 bg-white pl-9 pr-4 text-[13px] outline-none focus:border-slate-300"
                />
              </div>
              <button className="flex items-center gap-2 px-5 py-2.5 bg-[#f46b45] text-white rounded-lg text-[13px] font-bold shadow-sm">
                <Filter size={16} /> Filters
              </button>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-slate-50">
                  {['Request Id', 'Date', 'User Name', 'Driver Name', 'Transport Type', 'Trip Status', 'Payment Option', 'Action'].map((heading) => (
                    <th key={heading} className="px-6 py-4 text-[13px] font-bold text-slate-900 border-b border-slate-100">
                      {heading}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {loading ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center">
                      <Loader2 className="animate-spin text-slate-300 mx-auto" size={32} />
                    </td>
                  </tr>
                ) : error ? (
                  <tr>
                    <td colSpan={8} className="py-20 text-center text-[14px] font-medium text-red-500">
                      {error}
                    </td>
                  </tr>
                ) : rows.length > 0 ? (
                  rows.map((row) => (
                    <tr key={row.id} className="hover:bg-slate-50/30">
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.requestId}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{formatDate(row.date)}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.userName}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.driverName}</td>
                      <td className="px-6 py-5 text-[14px] text-slate-600 font-medium">{row.transportType}</td>
                      <td className="px-6 py-5">
                        <span className={`inline-block px-3 py-1 text-[10px] font-bold rounded uppercase ${STATUS_STYLES[row.tripStatus] || 'bg-slate-200 text-slate-700'}`}>
                          {row.tripStatus || 'UNKNOWN'}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <span className={`inline-block px-3 py-1 text-[10px] font-bold rounded uppercase ${PAYMENT_STYLES[row.paymentOption] || 'bg-orange-500 text-white'}`}>
                          {row.paymentOption}
                        </span>
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          {row.tripStatus === 'COMPLETED' && row.fare > 0 && (
                            row.refundStatus === 'processed' ? (
                              <span className="text-[11px] font-bold text-emerald-600">Refunded {'\u20B9'}{row.refundedAmount}</span>
                            ) : (
                              <button
                                onClick={() => refundRide(row)}
                                disabled={refundingId === row.id || row.refundStatus === 'processing'}
                                className="px-3 py-1.5 text-[11px] font-bold rounded-lg border border-red-200 text-red-600 hover:bg-red-50 disabled:opacity-50"
                              >
                                {refundingId === row.id || row.refundStatus === 'processing' ? 'Refunding...' : row.refundStatus === 'failed' ? 'Retry refund' : 'Refund'}
                              </button>
                            )
                          )}
                          <button className="text-slate-400 hover:text-slate-800">
                            <MoreVertical size={18} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} className="py-20 text-center text-[14px] font-medium text-slate-400">
                      No ride requests found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <button className="fixed bottom-10 right-10 w-14 h-14 bg-[#00BFA5] text-white rounded-full flex items-center justify-center shadow-xl hover:scale-105 transition-transform z-50">
            <Menu size={24} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default Trips;
