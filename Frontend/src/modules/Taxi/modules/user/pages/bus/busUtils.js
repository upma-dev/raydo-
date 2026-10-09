// Small helpers shared by the bus search / preview pages so every screen describes a bus the same clear way.

export const formatTravelDate = (dateStr) => {
  if (!dateStr) return '';
  try {
    return new Date(dateStr).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
  } catch {
    return dateStr;
  }
};

export const formatDurationBrief = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  return raw
    .replace(/days?/gi, 'd')
    .replace(/hours?|hrs?/gi, 'h')
    .replace(/minutes?|mins?/gi, 'm')
    .replace(/\s+/g, ' ')
    .trim();
};

/** "21:30" / "9:30 PM" -> minutes since midnight (null when unreadable) */
export const toMinutes = (value = '') => {
  const raw = String(value || '').trim();
  const m = raw.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
  if (!m) return null;
  let h = Number(m[1]);
  const min = Number(m[2]);
  const mer = (m[3] || '').toLowerCase();
  if (mer === 'pm' && h < 12) h += 12;
  if (mer === 'am' && h === 12) h = 0;
  return h * 60 + min;
};

/** Arrives on a later calendar day than it departs (overnight bus) */
export const arrivesNextDay = (departure, arrival) => {
  const d = toMinutes(departure);
  const a = toMinutes(arrival);
  return d !== null && a !== null && a <= d;
};

export const DEPARTURE_SLOTS = [
  { id: 'morning', label: 'Morning', hint: '6 AM - 12 PM', from: 360, to: 720 },
  { id: 'afternoon', label: 'Afternoon', hint: '12 PM - 6 PM', from: 720, to: 1080 },
  { id: 'evening', label: 'Evening', hint: '6 PM - 12 AM', from: 1080, to: 1440 },
  { id: 'night', label: 'Night', hint: '12 AM - 6 AM', from: 0, to: 360 },
];

export const slotOf = (departure) => {
  const m = toMinutes(departure);
  if (m === null) return null;
  return DEPARTURE_SLOTS.find((s) => m >= s.from && m < s.to)?.id || null;
};

/** AC / Non-AC and Sleeper / Seater read from the coach type text the operator entered */
export const coachTags = (bus) => {
  const text = [bus?.coachType, bus?.busCategory, bus?.type].filter(Boolean).join(' ').toLowerCase();
  const tags = [];
  if (/non[\s-]?a\.?c/.test(text)) tags.push('Non-AC');
  else if (/\ba\.?c\b|air[\s-]?con/.test(text)) tags.push('AC');
  if (/semi[\s-]?sleeper/.test(text)) tags.push('Semi Sleeper');
  else if (/sleeper/.test(text)) tags.push('Sleeper');
  if (/seater|seat/.test(text) && !/sleeper/.test(text)) tags.push('Seater');
  return tags;
};

export const isAc = (bus) => coachTags(bus).includes('AC');
export const isNonAc = (bus) => coachTags(bus).includes('Non-AC');
export const isSleeper = (bus) => coachTags(bus).some((t) => t.includes('Sleeper'));
export const isSeater = (bus) => coachTags(bus).includes('Seater');

const stopLabel = (stop) => [stop?.pointName, stop?.city].filter(Boolean).join(', ');

/** First boarding point and last dropping point of the route */
export const boardingAndDropping = (bus) => {
  const stops = Array.isArray(bus?.route?.stops) ? bus.route.stops : [];
  const boarding = stops.filter((s) => ['pickup', 'both', undefined, ''].includes(s?.stopType));
  const dropping = stops.filter((s) => ['drop', 'both'].includes(s?.stopType));
  return {
    boarding: stopLabel(boarding[0]) || '',
    dropping: stopLabel(dropping[dropping.length - 1]) || '',
    boardingCount: boarding.length,
    droppingCount: dropping.length,
  };
};

/** One readable line per cancellation rule: "24+ hours before departure -> 90% refund" */
export const describeCancellationRule = (rule) => {
  const when = rule.hoursBeforeDeparture > 0
    ? `${rule.hoursBeforeDeparture}+ hours before departure`
    : 'Any time before departure';
  let refund = 'No refund';
  if (rule.refundType === 'percentage') refund = rule.refundValue >= 100 ? '100% refund' : `${rule.refundValue}% refund`;
  else if (rule.refundType === 'fixed') refund = `₹${rule.refundValue} refund`;
  return { when, refund, full: rule.refundType === 'percentage' && rule.refundValue >= 100, none: rule.refundType === 'none' || rule.refundValue <= 0 };
};

export const hasFreeCancellation = (bus) => {
  const rules = Array.isArray(bus?.cancellationRules) ? bus.cancellationRules : [];
  if (rules.some((r) => r.refundType === 'percentage' && Number(r.refundValue) >= 100)) return true;
  return /free\s+cancel/i.test(String(bus?.cancellationPolicy || ''));
};
