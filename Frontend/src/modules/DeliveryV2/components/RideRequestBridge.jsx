import { useEffect, useState } from 'react';
import { useDeliveryStore } from '@/modules/DeliveryV2/store/useDeliveryStore';
import { socketService } from '@/modules/Taxi/shared/api/socket';
import DriverRideRequestListener from '@/modules/Taxi/modules/driver/components/DriverRideRequestListener';
import { ensureRideToken } from '@/modules/DeliveryV2/utils/rideModeSession';

const LOCATION_PING_MS = 5000;

/**
 * One panel: while the partner is online in the delivery app, ride and parcel requests arrive here too. Uses the same
 * request screen, sound and accept flow as the ride app; accepting a ride opens the ride screens, which have the way
 * back to food. Renders nothing for partners without a ride profile.
 */
const RideRequestBridge = ({ enabled }) => {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!enabled) {
      setReady(false);
      return undefined;
    }
    let active = true;
    ensureRideToken().then((ok) => {
      if (active) setReady(ok);
    });
    return () => {
      active = false;
    };
  }, [enabled]);

  // The ride side finds the partner by location: keep sending it while online
  useEffect(() => {
    if (!ready) return undefined;

    const ping = () => {
      const loc = useDeliveryStore.getState().riderLocation;
      const lat = Number(loc?.lat ?? loc?.latitude);
      const lng = Number(loc?.lng ?? loc?.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return;
      socketService.connect({ role: 'driver' });
      socketService.emit('locationUpdate', { coordinates: [lng, lat], lat, lng });
    };

    ping();
    const timer = window.setInterval(ping, LOCATION_PING_MS);
    return () => {
      window.clearInterval(timer);
      // Offline in the delivery app: stop receiving ride requests on this device
      socketService.disconnect();
    };
  }, [ready]);

  return ready ? <DriverRideRequestListener /> : null;
};

export default RideRequestBridge;
