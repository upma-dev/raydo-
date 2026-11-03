import { FoodZone } from '../../admin/models/zone.model.js';

/**
 * A delivery partner's zone follows where they really are: sign-up stores the zone they picked, but a partner who
 * signed up in Dewas and now works in Indore must show (and be treated) as an Indore partner. On every location ping /
 * go-online the point is checked against the active zones; only when the zone CHANGED is anything written.
 *
 * Outside every zone nothing is changed (GPS glitches at a border must not flip the partner back and forth).
 */

const ZONE_CACHE_MS = 60 * 1000;
let cache = { at: 0, zones: [] };

const loadActiveZones = async () => {
    if (Date.now() - cache.at < ZONE_CACHE_MS) return cache.zones;
    const zones = await FoodZone.find({ isActive: true }).select('_id name zoneName coordinates').lean();
    cache = { at: Date.now(), zones };
    return zones;
};

const pointInPolygon = (lat, lng, polygon = []) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = Number(polygon[i]?.longitude ?? polygon[i]?.lng ?? polygon[i]?.[0]);
        const yi = Number(polygon[i]?.latitude ?? polygon[i]?.lat ?? polygon[i]?.[1]);
        const xj = Number(polygon[j]?.longitude ?? polygon[j]?.lng ?? polygon[j]?.[0]);
        const yj = Number(polygon[j]?.latitude ?? polygon[j]?.lat ?? polygon[j]?.[1]);
        const crosses = yi > lat !== yj > lat && lng < ((xj - xi) * (lat - yi)) / ((yj - yi) || Number.EPSILON) + xi;
        if (crosses) inside = !inside;
    }
    return inside;
};

/** The active zone this point lies in, or null. */
export const findFoodZoneForPoint = async (lat, lng) => {
    const la = Number(lat);
    const lo = Number(lng);
    if (!Number.isFinite(la) || !Number.isFinite(lo) || (!la && !lo)) return null;
    const zones = await loadActiveZones();
    return zones.find((zone) => pointInPolygon(la, lo, zone.coordinates)) || null;
};

/**
 * { zoneId, zoneName, zoneUpdatedAt } to save on the partner when their location is in a different zone than the one
 * stored, otherwise null (same zone, or outside every zone).
 */
export const resolvePartnerZoneChange = async (currentZoneId, lat, lng) => {
    try {
        const zone = await findFoodZoneForPoint(lat, lng);
        if (!zone) return null;
        if (currentZoneId && String(currentZoneId) === String(zone._id)) return null;
        return { zoneId: zone._id, zoneName: zone.name || zone.zoneName || '', zoneUpdatedAt: new Date() };
    } catch {
        return null;
    }
};
