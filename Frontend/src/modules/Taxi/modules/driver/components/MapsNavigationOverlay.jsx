import React, { useEffect, useState } from 'react';
import { ArrowLeft, ExternalLink } from 'lucide-react';
import { OPEN_MAPS_EVENT } from '../utils/openMapsNavigation';

/**
 * Google Maps inside the app, on top of the trip screen. The driver gets the route and the time on the map, and a Back button that
 * always returns to the trip (an app wrapper has no browser back, so a page that is left for Maps would be a dead end).
 * "Open in Maps app" is there for turn-by-turn voice navigation; the phone's own back button then returns here.
 */
const MapsNavigationOverlay = () => {
  const [target, setTarget] = useState(null);

  useEffect(() => {
    const onOpen = (event) => setTarget(event.detail || null);
    window.addEventListener(OPEN_MAPS_EVENT, onOpen);
    return () => window.removeEventListener(OPEN_MAPS_EVENT, onOpen);
  }, []);

  // The phone's back button closes the map first, not the trip screen
  useEffect(() => {
    if (!target) return undefined;
    const onPop = () => setTarget(null);
    window.history.pushState({ mapsOverlay: true }, '');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [target]);

  if (!target) return null;

  const { lat, lng, from } = target;
  const origin = from && Number.isFinite(Number(from.lat)) && Number.isFinite(Number(from.lng)) ? `&saddr=${from.lat},${from.lng}` : '';
  const embedUrl = `https://maps.google.com/maps?daddr=${lat},${lng}${origin}&dirflg=d&output=embed`;
  const appUrl = `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=driving&dir_action=navigate`;

  return (
    <div className="fixed inset-0 z-[600] flex flex-col bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-slate-100 bg-white px-3 pb-2 pt-10 shadow-sm">
        <button
          type="button"
          onClick={() => setTarget(null)}
          className="flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-[12px] font-black uppercase tracking-wide text-white active:scale-95 transition-transform"
        >
          <ArrowLeft size={16} strokeWidth={3} /> Back to trip
        </button>
        <button
          type="button"
          onClick={() => {
            const opened = window.open(appUrl, '_blank');
            if (!opened) window.location.href = appUrl;
          }}
          className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-2 text-[11px] font-black uppercase tracking-wide text-slate-700 active:scale-95 transition-transform"
        >
          <ExternalLink size={14} strokeWidth={2.5} /> Maps app
        </button>
      </div>
      <iframe title="Navigation" src={embedUrl} className="min-h-0 w-full flex-1 border-0" allow="geolocation" referrerPolicy="no-referrer-when-downgrade" />
    </div>
  );
};

export default MapsNavigationOverlay;
