/**
 * Money helpers for the franchise finance engine.
 *
 * Every amount the engine stores or calculates is an INTEGER number of paise. Rupee values (Number) only appear at the
 * edges: reading legacy order/ride fields and sending numbers to the UI.
 * Rates are integer basis points (1% = 100 bps), so 12.5% is stored exactly as 1250.
 *
 * Rounding policy (documented, used everywhere):
 *  - rupees -> paise:      Math.round(rupees * 100), i.e. half away from zero to the nearest paisa
 *  - commission on a base: round half-up to the nearest paisa, computed per transaction (never on a daily total)
 *  - partial reversal:     round half-up of (original * refunded / total), capped at what is still un-reversed
 * Daily figures are sums of per-transaction rows, so a day's commission can differ by a few paise from
 * (day's earnings x rate). That difference is expected and is why each row stores its own base and rate.
 */

export const MAX_PAISE = 100_000_000_00; // ₹10 crore: upper bound for any single amount entered by an admin
export const MAX_BPS = 10_000;           // 100%

export class MoneyError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

/** Convert a rupee value coming from a model field to paise. Non-numbers become 0. */
export const toPaise = (rupees) => {
    const n = Number(rupees);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

export const fromPaise = (paise) => Math.round(Number(paise) || 0) / 100;

/**
 * Parse an admin-entered rupee amount (string or number) into paise. Rejects negatives, NaN, more than 2 decimals
 * and absurdly large values instead of silently rounding them.
 */
export function parseRupeesInput(value, { field = 'Amount', allowZero = true } = {}) {
    if (value === null || value === undefined || value === '') throw new MoneyError(`${field} is required`);
    const str = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(str)) throw new MoneyError(`${field} must be a positive amount with at most 2 decimals`);
    const paise = Math.round(Number(str) * 100);
    if (!Number.isSafeInteger(paise) || paise > MAX_PAISE) throw new MoneyError(`${field} is too large`);
    if (!allowZero && paise === 0) throw new MoneyError(`${field} must be greater than 0`);
    return paise;
}

/** Parse an admin-entered percentage (e.g. "12.5") into basis points. 0-100, at most 2 decimals. */
export function parsePercentInput(value, { field = 'Commission %' } = {}) {
    if (value === null || value === undefined || value === '') throw new MoneyError(`${field} is required`);
    const str = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(str)) throw new MoneyError(`${field} must be a number between 0 and 100 (max 2 decimals)`);
    const bps = Math.round(Number(str) * 100);
    if (bps < 0 || bps > MAX_BPS) throw new MoneyError(`${field} must be between 0 and 100`);
    return bps;
}

export const bpsToPercent = (bps) => Math.round(Number(bps) || 0) / 100;

/** base x rate, rounded half-up to the nearest paisa. Integer maths only. */
export function applyBps(basePaise, bps) {
    const b = Math.round(Number(basePaise) || 0);
    const r = Math.round(Number(bps) || 0);
    if (b <= 0 || r <= 0) return 0;
    return Math.floor((b * r + 5000) / 10000);
}

/** original x (part / whole), rounded half-up. Used for partial refunds. */
export function proportion(originalPaise, partPaise, wholePaise) {
    const o = Math.round(Number(originalPaise) || 0);
    const p = Math.max(0, Math.round(Number(partPaise) || 0));
    const w = Math.round(Number(wholePaise) || 0);
    if (o <= 0 || w <= 0) return 0;
    if (p >= w) return o;
    // BigInt: o * p can exceed 2^53 for large orders
    return Number((BigInt(o) * BigInt(p) * 2n + BigInt(w)) / (2n * BigInt(w)));
}

/** Paise amount stored on a ledger row (new rows have amountPaise; legacy rows only have rupees). */
export const rowPaise = (row) => (Number.isFinite(row?.amountPaise) ? row.amountPaise : toPaise(row?.amount));

/** IST calendar day helpers. Dates are 'YYYY-MM-DD' strings interpreted in Asia/Kolkata. */
export const FINANCE_TZ = 'Asia/Kolkata';
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

export function istDayKey(date = new Date()) {
    return new Date(new Date(date).getTime() + 330 * 60000).toISOString().slice(0, 10);
}

export function parseDayRange({ from, to } = {}, { defaultDays = 30, maxDays = 366 } = {}) {
    const today = istDayKey();
    const toKey = DAY_RE.test(String(to || '')) ? String(to) : today;
    let fromKey = DAY_RE.test(String(from || '')) ? String(from) : null;
    if (!fromKey) {
        const d = new Date(`${toKey}T00:00:00+05:30`);
        d.setUTCDate(d.getUTCDate() - (defaultDays - 1));
        fromKey = istDayKey(d);
    }
    const start = new Date(`${fromKey}T00:00:00.000+05:30`);
    const end = new Date(`${toKey}T23:59:59.999+05:30`);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) throw new MoneyError('Invalid date range');
    if (start > end) throw new MoneyError('"From" date must be before "To" date');
    if ((end - start) / 86400000 > maxDays) throw new MoneyError(`Date range can be at most ${maxDays} days`);
    return { from: fromKey, to: toKey, start, end };
}
