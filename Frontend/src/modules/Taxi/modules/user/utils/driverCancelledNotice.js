import toast from 'react-hot-toast';

const shownForRide = new Set();

/**
 * The driver cancelled a ride the user had already booked: tell the user on screen (and with a system notification when
 * the browser allows it), once per ride. The server also sends a push for when the app is closed.
 */
export const notifyDriverCancelled = (payload = {}) => {
  if (String(payload?.reason || '') !== 'driver-cancelled') return false;

  const rideId = String(payload?.rideId || '');
  if (rideId) {
    if (shownForRide.has(rideId)) return false;
    shownForRide.add(rideId);
  }

  const message = String(payload?.message || '').trim() || 'Your driver cancelled the ride.';
  toast.error(`Ride cancelled by driver. ${message}`, { duration: 9000 });

  try {
    if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
      new Notification('Ride cancelled', { body: message, icon: '/favicon.ico' });
    }
  } catch {
    // System notification is optional; the toast above already informed the user.
  }
  return true;
};
