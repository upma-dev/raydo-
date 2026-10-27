import { deliveryAPI } from '@food/api';
import { persistDriverAuthSession, getLocalDriverToken } from '@/modules/Taxi/modules/driver/services/registrationService';
import taxiApi from '@/modules/Taxi/shared/api/axiosInstance';
import { clearModuleAuth } from '@food/utils/auth';

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

/**
 * One panel: the delivery app also takes ride / parcel requests, so it needs the ride session token while the partner is
 * online. Unlike startRideSession it leaves the food online status alone. Returns true when the token is in place.
 */
export const ensureRideToken = async () => {
  try {
    const session = unwrap(await deliveryAPI.getRideSession());
    if (!session?.taxiToken) return false;
    persistDriverAuthSession({ token: session.taxiToken, role: 'driver' });
    localStorage.setItem(RIDE_MODE_FLAG, '1');
    return true;
  } catch {
    return false;
  }
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

/**
 * A partner who accepted a ride / parcel and then lost the screen (app restart, crash, refresh) is taken back to it.
 * Only for partners with a ride profile; returns true when a running ride was found and opened.
 */
export const restoreActiveRide = async (navigate) => {
  try {
    if (!(await ensureRideToken())) return false;
    const token = getLocalDriverToken();
    const response = await taxiApi.get('/rides/active/me', {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      params: { t: Date.now() },
    });
    const ride = response?.data?.data;
    if (!ride?.rideId) return false;
    navigate('/taxi/driver/active-trip', { state: { rideId: ride.rideId, type: ride.serviceType || 'ride' } });
    return true;
  } catch {
    return false;
  }
};

/**
 * Delivery partners and their ride profile are one account. True when this device holds a delivery login (or is in Ride &
 * Parcel mode), so a logout from ANY screen (ride or delivery) has to end both sessions and land on the delivery login.
 */
export const hasDeliveryLogin = () => {
  try {
    return isRideModePartner()
      || Boolean(localStorage.getItem('delivery_accessToken') || localStorage.getItem('delivery_refreshToken'));
  } catch {
    return false;
  }
};

/** One logout for the merged partner: ends the delivery login and the ride session, then opens the delivery login. */
export const logoutMergedPartner = async (navigate) => {
  // Clear this device first so Back can never re-open the app, then revoke on the server in the background.
  const refreshToken = (() => { try { return localStorage.getItem('delivery_refreshToken'); } catch { return null; } })();
  let revoke = null;
  try { revoke = deliveryAPI.logout(refreshToken); } catch { /* the local clean-up below still logs the partner out */ }
  clearModuleAuth('delivery');
  try {
    localStorage.removeItem('app:isOnline');
    localStorage.removeItem('rideModePartner');
    sessionStorage.setItem('deliveryLoggedOutAt', String(Date.now()));
  } catch { /* storage blocked */ }
  navigate('/food/delivery/login', { replace: true });
  Promise.resolve(revoke).catch(() => {});
};
