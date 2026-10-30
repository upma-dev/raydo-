import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GoogleMap, MarkerF } from '@react-google-maps/api';
import { HAS_VALID_GOOGLE_MAPS_KEY, useAppGoogleMapsLoader } from '../../admin/utils/googleMaps';

const MAP_STYLE = { width: '100%', height: '100%' };

const MAP_OPTIONS = {
  disableDefaultUI: true,
  zoomControl: false,
  clickableIcons: false,
  gestureHandling: 'cooperative',
};

// Accepts GeoJSON ({ coordinates: [lng, lat] }), a [lng, lat] array or { lat, lng }.
const toPosition = (point) => {
  if (!point) return null;
  const lat = Array.isArray(point) ? point[1] : point.coordinates ? point.coordinates[1] : point.lat;
  const lng = Array.isArray(point) ? point[0] : point.coordinates ? point.coordinates[0] : point.lng;
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return { lat: Number(lat), lng: Number(lng) };
};

const pinIcon = (color, label) => ({
  path: window.google.maps.SymbolPath.CIRCLE,
  fillColor: color,
  fillOpacity: 1,
  strokeColor: '#ffffff',
  strokeWeight: 3,
  scale: label ? 11 : 9,
});

/**
 * Small map shown inside the incoming-request modal so the driver can see
 * where the pickup (green) and drop (orange) are relative to their position (blue).
 */
const RequestRouteMap = ({ pickupLocation, dropLocation, driverPosition }) => {
  const { isLoaded } = useAppGoogleMapsLoader();
  const [map, setMap] = useState(null);

  const pickup = useMemo(() => toPosition(pickupLocation), [pickupLocation]);
  const drop = useMemo(() => toPosition(dropLocation), [dropLocation]);
  const driver = useMemo(() => toPosition(driverPosition), [driverPosition]);

  useEffect(() => {
    if (!map || !window.google?.maps) return;
    const points = [pickup, drop, driver].filter(Boolean);
    if (!points.length) return;
    if (points.length === 1) {
      map.setCenter(points[0]);
      map.setZoom(15);
      return;
    }
    const bounds = new window.google.maps.LatLngBounds();
    points.forEach((point) => bounds.extend(point));
    map.fitBounds(bounds, 36);
  }, [map, pickup, drop, driver]);

  const onLoad = useCallback((instance) => setMap(instance), []);
  const onUnmount = useCallback(() => setMap(null), []);

  if (!HAS_VALID_GOOGLE_MAPS_KEY || !pickup) return null;

  return (
    <div className="relative mb-4 h-[170px] overflow-hidden rounded-[20px] border border-slate-100 bg-slate-100">
      {isLoaded ? (
        <GoogleMap
          mapContainerStyle={MAP_STYLE}
          center={pickup}
          zoom={14}
          onLoad={onLoad}
          onUnmount={onUnmount}
          options={MAP_OPTIONS}
        >
          {driver ? <MarkerF position={driver} title="You" icon={pinIcon('#2563eb')} zIndex={1} /> : null}
          <MarkerF position={pickup} title="Pickup" icon={pinIcon('#10b981', true)} zIndex={3} />
          {drop ? <MarkerF position={drop} title="Drop" icon={pinIcon('#f97316')} zIndex={2} /> : null}
        </GoogleMap>
      ) : (
        <div className="flex h-full items-center justify-center text-[11px] font-bold text-slate-400">Loading map</div>
      )}
      <div className="pointer-events-none absolute left-2 top-2 flex gap-1.5 rounded-full bg-white/95 px-2.5 py-1 text-[9px] font-black uppercase tracking-wider text-slate-600 shadow">
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-blue-600" />You</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-emerald-500" />Pickup</span>
        <span className="flex items-center gap-1"><i className="h-2 w-2 rounded-full bg-orange-500" />Drop</span>
      </div>
    </div>
  );
};

export default RequestRouteMap;
