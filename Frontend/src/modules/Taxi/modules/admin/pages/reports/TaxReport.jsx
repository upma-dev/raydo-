import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, FileSpreadsheet, FileText, Loader2, Receipt, RefreshCw, Settings } from 'lucide-react';
import api from '../../../../shared/api/axiosInstance';
import toast from 'react-hot-toast';

const RANGES = ['All Time', 'Today', 'This Week', 'This Month', 'This Year', 'Custom'];
const SERVICES = [
  { value: 'all', label: 'All services' },
  { value: 'ride', label: 'Ride' },
  { value: 'parcel', label: 'Parcel' },
  { value: 'intercity', label: 'Outstation' },
  { value: 'pooling', label: 'Car Pooling' },
  { value: 'bus', label: 'Bus' },
];

const formatRupees = (value) =>
  `₹${Number(value || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const formatMonth = (key) => {
  const [year, month] = String(key).split('-').map(Number);
  return new Date(year, (month || 1) - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
};

const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const endOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);

const resolveRange = (type, customFrom, customTo) => {
  const now = new Date();
  if (type === 'Today') return { from: startOfDay(now), to: endOfDay(now) };
  if (type === 'This Week') {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
    return { from: start, to: endOfDay(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6)) };
  }
  if (type === 'This Month') {
    return { from: new Date(now.getFullYear(), now.getMonth(), 1), to: endOfDay(new Date(now.getFullYear(), now.getMonth() + 1, 0)) };
  }
  if (type === 'This Year') {
    return { from: new Date(now.getFullYear(), 0, 1), to: endOfDay(new Date(now.getFullYear(), 11, 31)) };
  }
  if (type === 'Custom') {
    return {
      from: customFrom ? startOfDay(new Date(customFrom)) : null,
      to: customTo ? endOfDay(new Date(customTo)) : null,
    };
  }
  return { from: null, to: null };
};

const downloadBlob = (blob, filename) => {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

const csvCell = (value) => `"${String(value ?? '').replace(/"/g, '""')}"`;

export default function TaxReport() {
  const [rangeType, setRangeType] = useState('All Time');
  const [customFrom, setCustomFrom] = useState('');
  const [customTo, setCustomTo] = useState('');
  const [service, setService] = useState('all');
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchReport = useCallback(async () => {
    try {
      setLoading(true);
      setError('');
      const { from, to } = resolveRange(rangeType, customFrom, customTo);
      // The shared axios instance already unwraps the HTTP response, so this is the API body: { success, data }
      const body = await api.get('/admin/tax-report', {
        params: {
          fromDate: from ? from.toISOString() : undefined,
          toDate: to ? to.toISOString() : undefined,
          service: service === 'all' ? undefined : service,
        },
      });
      if (!body?.success || !body.data) {
        throw new Error(body?.message || 'Unexpected response from server');
      }
      setData(body.data);
    } catch (err) {
      const message = err?.message || 'Failed to load tax report';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, [rangeType, customFrom, customTo, service]);

  // Preset ranges and the service filter reload on change; custom dates wait for the Apply button.
  useEffect(() => {
    if (rangeType === 'Custom') return;
    fetchReport();
  }, [rangeType, service]); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = data?.rows || [];

  const exportRows = useMemo(
    () => rows.map((row, index) => ({
      SI: index + 1,
      Date: new Date(row.date).toLocaleDateString('en-IN'),
      Service: row.serviceLabel,
      'Trip ID': row.id,
      Amount: row.amount,
      'Tax Rate %': row.rate,
      Tax: row.tax,
    })),
    [rows],
  );

  const handleExport = async (format) => {
    if (!exportRows.length) {
      toast.error('No data to export');
      return;
    }
    const stamp = new Date().toISOString().slice(0, 10);
    if (format === 'csv') {
      const headers = Object.keys(exportRows[0]);
      const lines = [headers.map(csvCell).join(','), ...exportRows.map((row) => headers.map((h) => csvCell(row[h])).join(','))];
      downloadBlob(new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8;' }), `taxi_tax_report_${stamp}.csv`);
      return;
    }
    const XLSX = await import('xlsx');
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(exportRows), 'Trips');
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet((data?.byMonth || []).map((m) => ({ Month: formatMonth(m.month), Trips: m.trips, Income: m.income, Tax: m.tax }))),
      'By Month',
    );
    XLSX.utils.book_append_sheet(
      workbook,
      XLSX.utils.json_to_sheet((data?.byService || []).map((s) => ({ Service: s.label, Trips: s.trips, Income: s.income, Tax: s.tax }))),
      'By Service',
    );
    XLSX.writeFile(workbook, `taxi_tax_report_${stamp}.xlsx`);
  };

  const settings = data?.settings;
  const stats = data?.stats || { totalIncome: 0, totalTax: 0, totalTrips: 0 };

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      <div className="max-w-7xl mx-auto space-y-6">
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
              <Receipt className="w-7 h-7 text-indigo-600" />
              Taxi Tax Report
            </h1>
            <p className="text-xs text-slate-500 mt-1">
              Tax collected on completed rides, parcels, outstation trips, pooling and bus bookings, month by month.
            </p>
          </div>
          <Link
            to="/taxi/admin/settings/business/tax"
            className="inline-flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-700 hover:bg-slate-50 self-start sm:self-auto"
          >
            <Settings className="w-4 h-4 text-slate-500" />
            Tax Settings
          </Link>
        </div>

        {settings && !settings.enabled && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-3 text-xs text-amber-800">
            Tax is currently <b>off</b> for rides, so new rides record no tax. Pooling and bus still show the service tax they already carry.{' '}
            <Link to="/taxi/admin/settings/business/tax" className="underline font-bold">Turn it on in Tax Settings</Link>.
          </div>
        )}

        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Date range</label>
              <select
                value={rangeType}
                onChange={(e) => setRangeType(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {RANGES.map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-2">Service</label>
              <select
                value={service}
                onChange={(e) => setService(e.target.value)}
                className="w-full px-4 py-2.5 text-sm rounded-lg border border-slate-300 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                {SERVICES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            {rangeType === 'Custom' && (
              <>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">From</label>
                  <input type="date" value={customFrom} onChange={(e) => setCustomFrom(e.target.value)} className="w-full px-4 py-2 text-sm rounded-lg border border-slate-300" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-2">To</label>
                  <input type="date" value={customTo} onChange={(e) => setCustomTo(e.target.value)} className="w-full px-4 py-2 text-sm rounded-lg border border-slate-300" />
                </div>
              </>
            )}
            <div className="flex gap-2 md:col-start-4 md:justify-end">
              {rangeType === 'Custom' && (
                <button onClick={fetchReport} className="px-5 py-2.5 text-sm font-medium rounded-lg bg-indigo-600 text-white hover:bg-indigo-700">
                  Apply
                </button>
              )}
              <button onClick={fetchReport} className="px-4 py-2.5 text-sm font-medium rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 inline-flex items-center gap-2">
                <RefreshCw className="w-4 h-4" />
                Refresh
              </button>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          </div>
        ) : error && !data ? (
          <div className="bg-white border border-red-200 rounded-2xl p-8 text-center space-y-3">
            <p className="text-sm font-bold text-slate-900">Could not load the tax report</p>
            <p className="text-xs text-slate-500">{error}</p>
            <button onClick={fetchReport} className="px-4 py-2 bg-slate-900 text-white rounded-xl text-xs font-bold">Try again</button>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <p className="text-sm font-medium text-slate-600 mb-1">Total Income</p>
                <p className="text-2xl font-bold text-blue-600">{formatRupees(stats.totalIncome)}</p>
                <p className="text-[11px] text-slate-400 mt-1">Fare / amount paid, tax included</p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <p className="text-sm font-medium text-slate-600 mb-1">Total Tax</p>
                <p className="text-2xl font-bold text-red-600">{formatRupees(stats.totalTax)}</p>
                <p className="text-[11px] text-slate-400 mt-1">
                  {settings?.enabled ? `${settings.label} @ ${settings.rate}% on rides` : 'Tax off for rides'}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <p className="text-sm font-medium text-slate-600 mb-1">Trips / Bookings</p>
                <p className="text-2xl font-bold text-slate-900">{stats.totalTrips}</p>
                <p className="text-[11px] text-slate-400 mt-1">Completed and paid only</p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Month-wise Tax</h2>
                {(data?.byMonth || []).length === 0 ? (
                  <p className="text-sm text-slate-400 py-8 text-center">No data for this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2 text-left">Month</th>
                        <th className="py-2 text-right">Trips</th>
                        <th className="py-2 text-right">Income</th>
                        <th className="py-2 text-right">Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.byMonth.map((m) => (
                        <tr key={m.month}>
                          <td className="py-2.5 font-medium text-slate-800">{formatMonth(m.month)}</td>
                          <td className="py-2.5 text-right text-slate-600">{m.trips}</td>
                          <td className="py-2.5 text-right text-slate-700">{formatRupees(m.income)}</td>
                          <td className="py-2.5 text-right font-semibold text-red-600">{formatRupees(m.tax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>

              <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
                <h2 className="text-base font-bold text-slate-900 mb-4">Service-wise Tax</h2>
                {(data?.byService || []).length === 0 ? (
                  <p className="text-sm text-slate-400 py-8 text-center">No data for this period.</p>
                ) : (
                  <table className="w-full text-sm">
                    <thead className="text-[10px] uppercase tracking-wider text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="py-2 text-left">Service</th>
                        <th className="py-2 text-right">Trips</th>
                        <th className="py-2 text-right">Income</th>
                        <th className="py-2 text-right">Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {data.byService.map((s) => (
                        <tr key={s.service}>
                          <td className="py-2.5 font-medium text-slate-800">{s.label}</td>
                          <td className="py-2.5 text-right text-slate-600">{s.trips}</td>
                          <td className="py-2.5 text-right text-slate-700">{formatRupees(s.income)}</td>
                          <td className="py-2.5 text-right font-semibold text-red-600">{formatRupees(s.tax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </div>

            <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <h2 className="text-base font-bold text-slate-900">Tax Details ({rows.length}{data?.rowsTruncated ? '+' : ''})</h2>
                <div className="flex gap-2">
                  <button onClick={() => handleExport('csv')} className="px-4 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 inline-flex items-center gap-2">
                    <Download className="w-4 h-4" /> CSV
                  </button>
                  <button onClick={() => handleExport('excel')} className="px-4 py-2 text-xs font-bold rounded-lg border border-slate-300 bg-white hover:bg-slate-50 inline-flex items-center gap-2">
                    <FileSpreadsheet className="w-4 h-4" /> Excel
                  </button>
                </div>
              </div>
              {data?.rowsTruncated && (
                <p className="text-[11px] text-amber-700 mb-3">
                  Showing the latest 1000 entries. The totals and the month/service tables above cover every entry; narrow the date range to list the rest.
                </p>
              )}
              {rows.length === 0 ? (
                <div className="py-16 text-center">
                  <FileText className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">No tax entries for this period.</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[480px] overflow-y-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-slate-50 text-[10px] uppercase tracking-wider text-slate-600 border-b border-slate-200">
                      <tr>
                        <th className="px-3 py-3 text-left">SI</th>
                        <th className="px-3 py-3 text-left">Date</th>
                        <th className="px-3 py-3 text-left">Service</th>
                        <th className="px-3 py-3 text-left">Trip ID</th>
                        <th className="px-3 py-3 text-right">Amount</th>
                        <th className="px-3 py-3 text-right">Rate</th>
                        <th className="px-3 py-3 text-right">Tax</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {rows.map((row, index) => (
                        <tr key={`${row.service}-${row.id}`} className="hover:bg-slate-50">
                          <td className="px-3 py-2.5 text-slate-500">{index + 1}</td>
                          <td className="px-3 py-2.5 text-slate-700">{new Date(row.date).toLocaleDateString('en-IN')}</td>
                          <td className="px-3 py-2.5 text-slate-700">{row.serviceLabel}</td>
                          <td className="px-3 py-2.5 font-mono text-xs text-slate-500">{row.id.slice(-8)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-800">{formatRupees(row.amount)}</td>
                          <td className="px-3 py-2.5 text-right text-slate-500">{row.rate ? `${row.rate}%` : '-'}</td>
                          <td className="px-3 py-2.5 text-right font-semibold text-red-600">{formatRupees(row.tax)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
