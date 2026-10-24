import { deliveryAPI } from '@food/api';
import { persistDriverAuthSession } from '@/modules/Taxi/modules/driver/services/registrationService';

/**
 * Ride & Parcel mode: a delivery partner works rides inside the existing taxi driver screens (/taxi/driver/*). Those
 * screens read the driver token from storage, so the delivery app stores a ride session issued by the backend for the
 * partner's linked ride profile. The flag tells the taxi screens to offer "Back to Food delivery" instead of the
 * driver-app login.
 */
export const RIDE_MODE_FLAG = 'rideModePartner';

export const isRideModePartner = () => {
  try {
    return localStorage.getItem(RIDE_MODE_FLAG) === '1';
  } catch {
    return false;
  }
};

export const unwrap = (response) => response?.data?.data ?? response?.data ?? null;

export const apiErrorOf = (error) => ({
  code: error?.response?.data?.code || '',
  message: error?.response?.data?.message || error?.message || 'Something went wrong',
  details: error?.response?.data?.details || null,
});

export const startRideSession = (taxiToken) => {
  persistDriverAuthSession({ token: taxiToken, role: 'driver' });
  try {
    localStorage.setItem(RIDE_MODE_FLAG, '1');
    // The delivery app must not think it is online for food while the partner takes rides
    localStorage.setItem('app:isOnline', 'false');
  } catch { /* storage blocked: the session token is still set for this tab */ }
};

export const setRideModeCache = (activeMode) => {
  try {
    localStorage.setItem('rideModeCard', JSON.stringify({ eligible: true, status: 'approved', activeMode }));
  } catch { /* storage blocked */ }
};

/**
 * The ride session token was refused (expired / replaced). A partner in Ride & Parcel mode gets a fresh one from the
 * delivery login instead of being thrown out. Returns true when the ride screens can be retried.
 */
export const recoverRideSession = async () => {
  try {
    const last = Number(sessionStorage.getItem('rideSessionRecoveredAt') || 0);
    if (Date.now() - last < 30000) return false; // already tried a moment ago: do not loop
    sessionStorage.setItem('rideSessionRecoveredAt', String(Date.now()));
    const session = unwrap(await deliveryAPI.getRideSession());
    if (session?.activeMode !== 'taxi' || !session?.taxiToken) return false;
    startRideSession(session.taxiToken);
    return true;
  } catch {
    return false;
  }
};

/** Opens a ride screen with a fresh ride session (e.g. after the stored one expired). */
export const openRideApp = async (navigate, path = '/taxi/driver/home') => {
  const session = unwrap(await deliveryAPI.getRideSession());
  startRideSession(session.taxiToken);
  navigate(path);
};
