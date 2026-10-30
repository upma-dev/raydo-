import { AdminBusinessSetting } from '../admin/models/AdminBusinessSetting.js';
import { PoolingBooking } from '../admin/models/PoolingBooking.js';
import { BusBooking } from '../user/models/BusBooking.js';
import { Ride } from '../user/models/Ride.js';

/**
 * TAXI TAX (GST)
 *
 * The tax is INCLUDED in the fare the rider already pays, so no fare, wallet or payment changes:
 *   tax = fare x rate / (100 + rate)
 * The rate comes from Business Settings > Tax Settings. It is stamped on each ride when it completes, so a later rate
 * change never rewrites old rides. Pooling and bus bookings keep the service tax they already store.
 */

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

export const SERVICE_LABELS = {
  ride: 'Ride',
  parcel: 'Parcel',
  intercity: 'Outstation',
  pooling: 'Car Pooling',
  bus: 'Bus',
};

export const normalizeTaxSettings = (raw = {}) => {
  const rate = Number(raw?.rate);
  return {
    enabled: raw?.enabled === true || raw?.enabled === 'true' || raw?.enabled === 1 || raw?.enabled === '1',
    rate: Number.isFinite(rate) ? Math.min(100, Math.max(0, rate)) : 0,
    label: String(raw?.label || 'GST').trim() || 'GST',
    gstin: String(raw?.gstin || '').trim(),
  };
};

export const getTaxiTaxSettings = async () => {
  const doc = await AdminBusinessSetting.findOne({ scope: 'default' }, { tax: 1, _id: 0 }).lean();
  return normalizeTaxSettings(doc?.tax || {});
};

export const computeIncludedTax = (fare, rate) => {
  const safeRate = Number(rate) || 0;
  const safeFare = Number(fare) || 0;
  if (safeRate <= 0 || safeFare <= 0) return 0;
  return round2((safeFare * safeRate) / (100 + safeRate));
};

/** Stamp the tax on a ride (call when it completes). Never throws: tax bookkeeping must not fail a ride. */
export const stampRideTax = async (ride) => {
  try {
    const settings = await getTaxiTaxSettings();
    // Stamped even when tax is off (rate 0) so turning it on later does not retro-tax rides that already completed.
    const rate = settings.enabled ? settings.rate : 0;
    ride.tax = {
      rate,
      label: settings.label,
      amount: computeIncludedTax(ride.fare, rate),
      mode: 'included',
      calculatedAt: new Date(),
    };
  } catch (error) {
    console.warn('[taxi-tax] could not stamp ride tax:', error?.message || error);
  }
};

const parseRange = ({ fromDate, toDate } = {}) => {
  const from = fromDate ? new Date(fromDate) : null;
  const to = toDate ? new Date(toDate) : null;
  return {
    from: from && !Number.isNaN(from.getTime()) ? from : null,
    to: to && !Number.isNaN(to.getTime()) ? to : null,
  };
};

const dateMatch = (field, { from, to }) => {
  if (!from && !to) return {};
  const range = {};
  if (from) range.$gte = from;
  if (to) range.$lte = to;
  return { [field]: range };
};

const monthKey = (date) => {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Tax report across every taxi service. Returns normalised rows (one per completed trip / paid booking) and the
 * summaries built from them, so the month table, the service table and the export always agree.
 */
export const getTaxiTaxReport = async (query = {}) => {
  const range = parseRange(query);
  const serviceFilter = String(query.service || '').trim().toLowerCase();
  const settings = await getTaxiTaxSettings();
  const currentRate = settings.enabled ? settings.rate : 0;
  const rows = [];

  const wants = (service) => !serviceFilter || serviceFilter === 'all' || serviceFilter === service;

  if (wants('ride') || wants('parcel') || wants('intercity')) {
    const rides = await Ride.find({
      status: 'completed',
      adminDeleted: { $ne: true },
      ...dateMatch('completedAt', range),
    })
      .select('serviceType fare tax completedAt createdAt')
      .lean();

    rides.forEach((ride) => {
      const service = ['parcel', 'intercity'].includes(ride.serviceType) ? ride.serviceType : 'ride';
      if (!wants(service)) return;
      const fare = Number(ride.fare) || 0;
      // Only rides completed after this feature carry a stamp; older ones fall back to the current rate.
      const hasStamp = Boolean(ride.tax?.calculatedAt);
      rows.push({
        id: String(ride._id),
        service,
        date: ride.completedAt || ride.createdAt,
        amount: round2(fare),
        rate: hasStamp ? Number(ride.tax.rate) || 0 : currentRate,
        tax: hasStamp ? round2(ride.tax.amount) : computeIncludedTax(fare, currentRate),
      });
    });
  }

  if (wants('pooling')) {
    const bookings = await PoolingBooking.find({
      paymentStatus: 'paid',
      bookingStatus: { $in: ['confirmed', 'completed'] },
      ...dateMatch('createdAt', range),
    })
      .select('fare serviceTaxPercentage serviceTaxAmount createdAt')
      .lean();

    bookings.forEach((booking) => {
      rows.push({
        id: String(booking._id),
        service: 'pooling',
        date: booking.createdAt,
        amount: round2(booking.fare),
        rate: Number(booking.serviceTaxPercentage) || 0,
        tax: round2(booking.serviceTaxAmount),
      });
    });
  }

  if (wants('bus')) {
    const bookings = await BusBooking.find({
      status: { $in: ['confirmed', 'boarded', 'completed'] },
      ...dateMatch('createdAt', range),
    })
      .select('financialSnapshot.serviceTax financialSnapshot.totalPaidAmount createdAt')
      .lean();

    bookings.forEach((booking) => {
      rows.push({
        id: String(booking._id),
        service: 'bus',
        date: booking.createdAt,
        amount: round2(booking.financialSnapshot?.totalPaidAmount),
        rate: 0,
        tax: round2(booking.financialSnapshot?.serviceTax),
      });
    });
  }

  rows.sort((a, b) => new Date(b.date) - new Date(a.date));

  const stats = { totalIncome: 0, totalTax: 0, totalTrips: rows.length };
  const monthMap = new Map();
  const serviceMap = new Map();

  rows.forEach((row) => {
    stats.totalIncome += row.amount;
    stats.totalTax += row.tax;

    const month = monthKey(row.date);
    const monthEntry = monthMap.get(month) || { month, income: 0, tax: 0, trips: 0 };
    monthEntry.income += row.amount;
    monthEntry.tax += row.tax;
    monthEntry.trips += 1;
    monthMap.set(month, monthEntry);

    const serviceEntry = serviceMap.get(row.service) || {
      service: row.service,
      label: SERVICE_LABELS[row.service] || row.service,
      income: 0,
      tax: 0,
      trips: 0,
    };
    serviceEntry.income += row.amount;
    serviceEntry.tax += row.tax;
    serviceEntry.trips += 1;
    serviceMap.set(row.service, serviceEntry);
  });

  const finish = (entry) => ({ ...entry, income: round2(entry.income), tax: round2(entry.tax) });

  return {
    settings,
    stats: { ...stats, totalIncome: round2(stats.totalIncome), totalTax: round2(stats.totalTax) },
    byMonth: [...monthMap.values()].sort((a, b) => (a.month < b.month ? 1 : -1)).map(finish),
    byService: [...serviceMap.values()].sort((a, b) => b.tax - a.tax).map(finish),
    // Detail list is capped so a huge range cannot freeze the page; the summaries above always cover everything.
    rows: rows.slice(0, 1000).map((row) => ({ ...row, serviceLabel: SERVICE_LABELS[row.service] || row.service })),
    rowsTruncated: rows.length > 1000,
  };
};
