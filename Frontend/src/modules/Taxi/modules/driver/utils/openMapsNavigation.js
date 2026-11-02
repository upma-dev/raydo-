/**
 * Opens Google Maps turn-by-turn navigation to a point. Used by the pickup and the drop buttons.
 * - `dir_action=navigate` starts the navigation straight away (no "choose a route" step).
 * - The destination is given as coordinates and the start is left out, so Maps uses the phone's own location and the
 *   app does not have to ask for anything. Back from Maps returns to the app screen the driver left.
 * The map opens in an in-app overlay (see MapsNavigationOverlay) so the driver can always come back to the trip.
 * Returns false when the point has no usable coordinates.
 */
export const OPEN_MAPS_EVENT = 'open-maps-navigation';

export const openMapsNavigation = (lat, lng, from = null) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving&dir_action=navigate`;

  // Only a bridge that really exists is used; asking an app wrapper for a handler it does not have would swallow the tap.
  try {
    if (typeof window.Android?.openMapsNavigation === 'function') {
      window.Android.openMapsNavigation(latitude, longitude);
      return true;
    }
  } catch {
    // fall through to the normal link
  }

  // Shown inside the app (MapsNavigationOverlay) with its own Back button; it has a "Maps app" button for full voice navigation
  window.dispatchEvent(new CustomEvent(OPEN_MAPS_EVENT, { detail: { lat: latitude, lng: longitude, from, url } }));
  return true;
};

export default openMapsNavigation;
