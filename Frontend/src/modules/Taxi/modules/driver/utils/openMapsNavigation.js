/**
 * Opens Google Maps turn-by-turn navigation to a point. Used by the pickup and the drop buttons.
 * - `dir_action=navigate` starts the navigation straight away (no "choose a route" step).
 * - A plain link click is used instead of window.open, so no pop-up blocker or permission step comes in between.
 * - The destination is given as coordinates and the start is left out, so Maps uses the phone's own location and the
 *   app does not have to ask for anything. Back from Maps returns to the app screen the driver left.
 * Returns false when the point has no usable coordinates.
 */
export const openMapsNavigation = (lat, lng) => {
  const latitude = Number(lat);
  const longitude = Number(lng);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return false;

  const url = `https://www.google.com/maps/dir/?api=1&destination=${latitude},${longitude}&travelmode=driving&dir_action=navigate`;

  const payload = JSON.stringify({ type: 'open_maps_navigation', lat: latitude, lng: longitude, url });
  try {
    if (typeof window.Android?.openMapsNavigation === 'function') {
      window.Android.openMapsNavigation(latitude, longitude);
      return true;
    }
    if (typeof window.flutter_inappwebview?.callHandler === 'function') {
      window.flutter_inappwebview.callHandler('openMapsNavigation', { lat: latitude, lng: longitude, url });
      return true;
    }
    if (typeof window.ReactNativeWebView?.postMessage === 'function') {
      window.ReactNativeWebView.postMessage(payload);
      return true;
    }
  } catch {
    // fall through to the normal link
  }

  const link = document.createElement('a');
  link.href = url;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  link.remove();
  return true;
};

export default openMapsNavigation;
