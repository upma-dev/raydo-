/**
 * A driver must verify with a fresh selfie to go online, and again every hour while online.
 * One place for the rule so going online, the dispatch filter and the app all agree.
 */
export const SELFIE_VALIDITY_MINUTES = 60;
export const SELFIE_VALIDITY_MS = SELFIE_VALIDITY_MINUTES * 60 * 1000;

export const isOnlineSelfieFresh = (selfie, now = Date.now()) => {
  const imageUrl = String(selfie?.imageUrl || '').trim();
  const capturedAt = selfie?.capturedAt ? new Date(selfie.capturedAt).getTime() : 0;
  return Boolean(imageUrl) && Number.isFinite(capturedAt) && capturedAt > 0 && now - capturedAt < SELFIE_VALIDITY_MS;
};
