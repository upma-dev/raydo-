/**
 * A driver must verify with a selfie to go online.
 * The verification is valid for the driver's work shift (12 hours / same day).
 */
export const SELFIE_VALIDITY_MINUTES = 12 * 60;
export const SELFIE_VALIDITY_MS = SELFIE_VALIDITY_MINUTES * 60 * 1000;

export const isOnlineSelfieFresh = (selfie, now = Date.now()) => {
  const imageUrl = String(selfie?.imageUrl || '').trim();
  const capturedAt = selfie?.capturedAt ? new Date(selfie.capturedAt).getTime() : 0;
  const todayKey = new Date(now).toISOString().slice(0, 10);
  const isSameDay = selfie?.forDate === todayKey;
  const isWithinHours = Number.isFinite(capturedAt) && capturedAt > 0 && now - capturedAt < SELFIE_VALIDITY_MS;
  return Boolean(imageUrl) && (isSameDay || isWithinHours);
};
