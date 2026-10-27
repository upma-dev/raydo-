import { useCallback, useEffect, useRef, useState } from 'react';
import { socketService } from '../../../shared/api/socket';
import api from '../../../shared/api/axiosInstance';

/**
 * Live driver position for the rider's map.
 *
 *   data in:   socket "ride:driver-location:updated" (every GPS tick the driver app sends)
 *   safety:    re-joins the ride room on every (re)connect and whenever the app comes back to the foreground;
 *              while updates stop arriving it asks the server for the last known place every few seconds
 *   data out:  position / heading that glide smoothly from one point to the next (no jumping marker),
 *              plus `connection` ('waiting' | 'live' | 'delayed' | 'lost') and how old the last point is
 */
const LIVE_UNTIL_MS = 8000; // newer than this: "Live"
const DELAYED_UNTIL_MS = 25000; // newer than this: "Updating", older: "Reconnecting"
const POLL_MS = 8000; // fallback poll while the live feed is quiet
const SMOOTH_MIN_MS = 500;
const SMOOTH_MAX_MS = 3500;
const JUMP_METERS = 600; // a bigger gap than this (app was asleep) snaps instead of gliding
const MIN_MOVE_METERS = 1.5; // GPS noise below this is ignored
const RENDER_EVERY_MS = 50; // about 20 frames per second is plenty for a map marker

const connectionFor = (ageMs) => (ageMs < LIVE_UNTIL_MS ? 'live' : ageMs < DELAYED_UNTIL_MS ? 'delayed' : 'lost');

const toRad = (deg) => (deg * Math.PI) / 180;

export const distanceMeters = (a, b) => {
  if (!a || !b) return 0;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h)));
};

const normalizeHeading = (value, fallback = null) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return ((numeric % 360) + 360) % 360;
};

// Shortest way round the compass, so 350 -> 10 turns 20 degrees and not 340
const lerpHeading = (from, to, t) => {
  if (!Number.isFinite(from)) return to;
  if (!Number.isFinite(to)) return from;
  const delta = ((to - from + 540) % 360) - 180;
  return normalizeHeading(from + delta * t, to);
};

const toPoint = (coordinates) => {
  const [lng, lat] = Array.isArray(coordinates) ? coordinates : [];
  if (!Number.isFinite(Number(lat)) || !Number.isFinite(Number(lng))) return null;
  return { lat: Number(lat), lng: Number(lng) };
};

export const useLiveDriverLocation = ({ rideId, initialLocation = null, enabled = true } = {}) => {
  const [position, setPosition] = useState(null);
  const [heading, setHeading] = useState(null);
  const [speedKmph, setSpeedKmph] = useState(null);
  const [connection, setConnection] = useState('waiting');
  const [ageSeconds, setAgeSeconds] = useState(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  const shownRef = useRef({ point: null, heading: null }); // what the marker shows right now
  const animRef = useRef(null); // { from, to, fromHeading, toHeading, start, duration }
  const rafRef = useRef(0);
  const lastRenderAtRef = useRef(0);
  const lastReceivedAtRef = useRef(0); // when the last point arrived (this device's clock)
  const lastSentAtRef = useRef(0); // newest server timestamp seen (drops out-of-order points)
  const seededRef = useRef(false);

  const step = useCallback(() => {
    const anim = animRef.current;
    if (!anim) {
      rafRef.current = 0;
      return;
    }
    const now = performance.now();
    const t = Math.min(1, (now - anim.start) / anim.duration);
    const point = {
      lat: anim.from.lat + (anim.to.lat - anim.from.lat) * t,
      lng: anim.from.lng + (anim.to.lng - anim.from.lng) * t,
    };
    const nextHeading = lerpHeading(anim.fromHeading, anim.toHeading, t);
    shownRef.current = { point, heading: nextHeading };

    if (t >= 1 || now - lastRenderAtRef.current >= RENDER_EVERY_MS) {
      lastRenderAtRef.current = now;
      setPosition(point);
      setHeading(nextHeading);
    }

    if (t >= 1) {
      animRef.current = null;
      rafRef.current = 0;
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const receive = useCallback((update) => {
    const target = toPoint(update?.coordinates);
    if (!target) return;

    const sentAt = Number(update?.sentAt) || (update?.updatedAt ? new Date(update.updatedAt).getTime() : 0);
    if (sentAt && sentAt < lastSentAtRef.current) return; // an older point that arrived late
    if (sentAt) lastSentAtRef.current = sentAt;

    const now = performance.now();
    const gap = lastReceivedAtRef.current ? now - lastReceivedAtRef.current : SMOOTH_MIN_MS;
    // A point straight from the live feed is fresh. One from the server's saved copy (first screen load, fallback poll) may be
    // old, so its real age decides whether the rider sees "Live" or "Reconnecting".
    const dataAgeMs = update?.sentAt ? 0 : (update?.updatedAt ? Math.max(0, Date.now() - new Date(update.updatedAt).getTime()) : 0);
    lastReceivedAtRef.current = now - dataAgeMs;
    setLastUpdatedAt(Date.now() - dataAgeMs);
    setConnection(connectionFor(dataAgeMs));
    setAgeSeconds(Math.floor(dataAgeMs / 1000));

    const targetHeading = normalizeHeading(update?.heading, shownRef.current.heading);
    const speed = Number(update?.speed);
    setSpeedKmph(Number.isFinite(speed) && speed >= 0 ? Math.round(speed * 3.6) : null);

    const current = shownRef.current.point;
    if (!current || distanceMeters(current, target) > JUMP_METERS) {
      shownRef.current = { point: target, heading: targetHeading };
      animRef.current = null;
      setPosition(target);
      setHeading(targetHeading);
      return;
    }

    if (distanceMeters(current, target) < MIN_MOVE_METERS && (targetHeading ?? 0) === (shownRef.current.heading ?? 0)) return;

    animRef.current = {
      from: current,
      to: target,
      fromHeading: shownRef.current.heading,
      toHeading: targetHeading,
      start: now,
      // arrive just as the next point is expected, so the marker keeps gliding instead of stopping and starting
      duration: Math.min(SMOOTH_MAX_MS, Math.max(SMOOTH_MIN_MS, gap)),
    };
    if (!rafRef.current) rafRef.current = requestAnimationFrame(step);
  }, [step]);

  // The last place the server knows (screen opened late, refresh): shown at once, then live points take over
  useEffect(() => {
    if (!enabled || seededRef.current || !initialLocation?.coordinates?.length) return;
    seededRef.current = true;
    receive({
      coordinates: initialLocation.coordinates,
      heading: initialLocation.heading,
      updatedAt: initialLocation.updatedAt,
    });
  }, [enabled, initialLocation?.coordinates, initialLocation?.heading, initialLocation?.updatedAt, receive]);

  useEffect(() => {
    if (!enabled || !rideId) return undefined;

    const joinRide = () => socketService.emit('ride:join', { rideId });
    const onLocation = (payload) => {
      if (String(payload?.rideId || '') === String(rideId)) receive(payload);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') joinRide();
    };

    joinRide();
    socketService.on('connect', joinRide); // a new socket has lost its ride room: join again
    socketService.on('ride:driver-location:updated', onLocation);
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      socketService.off('connect', joinRide);
      socketService.off('ride:driver-location:updated', onLocation);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [enabled, rideId, receive]);

  // Age of the last point, the Live / Updating / Reconnecting state, and the fallback poll while the feed is quiet
  useEffect(() => {
    if (!enabled || !rideId) return undefined;
    let cancelled = false;
    let lastPollAt = 0;

    const poll = async () => {
      lastPollAt = Date.now();
      try {
        const response = await api.get('/rides/active/me');
        const ride = response?.data || response;
        const last = ride?.lastDriverLocation;
        if (cancelled || String(ride?.rideId || '') !== String(rideId) || !last?.coordinates?.length) return;
        receive({ coordinates: last.coordinates, heading: last.heading, speed: last.speed, updatedAt: last.updatedAt });
      } catch {
        /* the next tick tries again */
      }
    };

    const timer = setInterval(() => {
      if (!lastReceivedAtRef.current) return;
      const age = performance.now() - lastReceivedAtRef.current;
      setAgeSeconds(Math.floor(age / 1000));
      setConnection(connectionFor(age));
      if (age >= LIVE_UNTIL_MS && document.visibilityState === 'visible' && Date.now() - lastPollAt >= POLL_MS) {
        poll();
      }
    }, 1000);

    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [enabled, rideId, receive]);

  useEffect(() => () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
  }, []);

  return { position, heading, speedKmph, connection, ageSeconds, lastUpdatedAt, hasLocation: Boolean(position) };
};

export default useLiveDriverLocation;
