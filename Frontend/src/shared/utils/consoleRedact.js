/**
 * Keeps personal / secret data out of the browser console.
 *
 * Every console.log / info / debug / warn / error call goes through here first. Objects are copied with sensitive
 * fields masked (the original objects are never changed), and strings are scrubbed for emails, phone numbers,
 * tokens and OTPs. Import this file before anything else so logs made at import time are covered too.
 */

const REDACTED = '[REDACTED]';

// Field names whose values must never be printed
const SENSITIVE_KEY =
  /otp|passw|passcode|^pin$|token|secret|authorization|cookie|signature|phone|mobile|contact(no|number)?$|email|address|street|landmark|zip|pincode|^lat(itude)?$|^l(ng|on|ong|ongitude)$|coordinates|aadhaar|aadhar|^pan(no|number|card)?$|account(no|number)|ifsc|upi|card(no|number)?$|cvv|bank|full_?name|first_?name|last_?name|customer_?name|^dob$|birth|api_?key|private_?key/i;

const MAX_DEPTH = 6;
const MAX_KEYS = 60;
const MAX_ITEMS = 30;

const JWT_RE = /eyJ[\w-]{8,}\.[\w-]{8,}\.[\w-]{4,}/g;
const BEARER_RE = /(bearer\s+)[\w.~+/-]+=*/gi;
const EMAIL_RE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const PHONE_RE = /(?<!\d)(?:\+?91[\s-]?)?[6-9]\d{9}(?!\d)/g;
const OTP_IN_TEXT_RE = /(\botp\b[^\d\n]{0,12})\d{4,8}/gi;

export const redactString = (value) =>
  String(value)
    .replace(JWT_RE, REDACTED)
    .replace(BEARER_RE, `$1${REDACTED}`)
    .replace(EMAIL_RE, REDACTED)
    .replace(OTP_IN_TEXT_RE, `$1${REDACTED}`)
    .replace(PHONE_RE, REDACTED);

const isPlainLike = (value) => {
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
};

const redactValue = (value, depth, seen) => {
  if (typeof value === 'string') return redactString(value);
  if (value === null || typeof value !== 'object') return value;

  if (value instanceof Error) {
    const safe = new Error(redactString(value.message));
    safe.name = value.name;
    safe.stack = value.stack ? redactString(value.stack) : value.stack;
    return safe;
  }
  // DOM nodes, events, Dates, typed arrays, class instances (axios, sockets...) are printed as they are:
  // walking them is slow and they rarely carry user data directly.
  if (!Array.isArray(value) && !isPlainLike(value)) return value;

  if (seen.has(value)) return '[Circular]';
  if (depth >= MAX_DEPTH) return '[Object]';
  seen.add(value);

  if (Array.isArray(value)) {
    const out = value.slice(0, MAX_ITEMS).map((item) => redactValue(item, depth + 1, seen));
    if (value.length > MAX_ITEMS) out.push(`...${value.length - MAX_ITEMS} more`);
    return out;
  }

  const out = {};
  const keys = Object.keys(value);
  for (const key of keys.slice(0, MAX_KEYS)) {
    out[key] = SENSITIVE_KEY.test(key) && value[key] != null && value[key] !== ''
      ? REDACTED
      : redactValue(value[key], depth + 1, seen);
  }
  if (keys.length > MAX_KEYS) out.__truncated__ = `${keys.length - MAX_KEYS} more keys`;
  return out;
};

export const redactArgs = (args) => args.map((arg) => {
  try {
    return redactValue(arg, 0, new WeakSet());
  } catch {
    return '[unprintable]';
  }
});

const METHODS = ['log', 'info', 'debug', 'warn', 'error'];

const install = () => {
  if (typeof console === 'undefined' || console.__redacting) return;
  for (const method of METHODS) {
    const original = console[method]?.bind(console);
    if (!original) continue;
    console[method] = (...args) => original(...redactArgs(args));
  }
  Object.defineProperty(console, '__redacting', { value: true, enumerable: false });
};

install();
