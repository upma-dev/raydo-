import { config } from '../../../config/env.js';

/**
 * Real road distance + driving time between two points, worked out on the SERVER from Google Directions
 * (the app can no longer tell us "distance: 0" or a made-up distance).
 *
 *   getDrivingRoute({ origin: [lng, lat], destination: [lng, lat] })
 *     -> { distanceMeters, durationMinutes, source: 'google' | 'estimate' }
 *
 * If Google is not reachable (no key, quota, network) the straight-line distance x 1.3 is used and the result says
 * source: 'estimate', so a quote is still possible and everybody can see it was an estimate.
 */

const EARTH_RADIUS_M = 6371000;
const ROAD_FACTOR = 1.3;          // roads are longer than the straight line
const AVERAGE_SPEED_KMPH = 45;    // used only for the estimate fallback
const CACHE_MS = 10 * 60 * 1000;
const cache = new Map();
export const clearRouteCache = () => cache.clear();   // for tests / after the admin changes the Maps key

const toPoint = (value) => {
  if (!Array.isArray(value) || value.length < 2) return null;
  const lng = Number(value[0]);
  const lat = Number(value[1]);
  if (!Number.isFinite(lng) || !Number.isFinite(lat) || Math.abs(lat) > 90 || Math.abs(lng) > 180) return null;
  return { lng, lat };
};

export const straightLineMeters = (a, b) => {
  const rad = (d) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
};

const estimateRoute = (origin, destination) => {
  const meters = Math.round(straightLineMeters(origin, destination) * ROAD_FACTOR);
  return { distanceMeters: meters, durationMinutes: Math.max(1, Math.round((meters / 1000 / AVERAGE_SPEED_KMPH) * 60)), source: 'estimate' };
};

export const getDrivingRoute = async ({ origin, destination, fetchImpl = fetch } = {}) => {
  const from = toPoint(origin);
  const to = toPoint(destination);
  if (!from || !to) return null;

  const key = `${from.lat.toFixed(4)},${from.lng.toFixed(4)}>${to.lat.toFixed(4)},${to.lng.toFixed(4)}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.value;

  const apiKey = config.googleMapsApiKey;
  let value = null;

  if (apiKey) {
    try {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 6000);
      const url = `https://maps.googleapis.com/maps/api/directions/json?origin=${from.lat},${from.lng}&destination=${to.lat},${to.lng}&mode=driving&key=${apiKey}`;
      const res = await fetchImpl(url, { signal: controller.signal });
      clearTimeout(timer);
      const data = await res.json();
      const leg = data?.status === 'OK' ? data.routes?.[0]?.legs?.[0] : null;
      if (leg?.distance?.value > 0) {
        value = {
          distanceMeters: Math.round(Number(leg.distance.value)),
          durationMinutes: Math.max(1, Math.round(Number(leg.duration?.value || 0) / 60)),
          source: 'google',
        };
      } else {
        console.warn(`[routeMetrics] Google Directions status ${data?.status || 'unknown'}${data?.error_message ? `: ${data.error_message}` : ''}`);
      }
    } catch (error) {
      console.warn('[routeMetrics] Google Directions failed:', error?.message || error);
    }
  }

  if (!value) value = estimateRoute(from, to);
  // Only real Google answers are cached for long; an estimate may be replaced by a real answer soon
  cache.set(key, { at: value.source === 'google' ? Date.now() : Date.now() - CACHE_MS + 60 * 1000, value });
  return value;
};
