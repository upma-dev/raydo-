/**
 * Opens Google Maps turn-by-turn navigation to a point. Used by the pickup and the drop buttons.
 * - `dir_action=navigate` starts the navigation straight away (no "choose a route" step).
 * - The destination is given as coordinates and the start is left out, so Maps uses the phone's own location and the
 *   app does not have to ask for anything. Back from Maps returns to the app screen the driver left.
 * Returns false when the point has no usable coordinates.
 */
export const openMapsNavigation = (lat, lng) => {
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

  // The same call that worked before (window.open): inside an app wrapper it is handed to the phone, which opens Google Maps.
  // If the page blocks it, the page itself goes to the link instead (Maps app link), so the button never does nothing.
  let opened = null;
  try {
    opened = window.open(url, '_blank');
  } catch {
    opened = null;
  }
  if (!opened) {
    window.location.href = url;
  }
  return true;
};

export default openMapsNavigation;
