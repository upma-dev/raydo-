import { ValidationError } from '../../../core/auth/errors.js';

const toPoints = (coordinates) =>
    (Array.isArray(coordinates) ? coordinates : [])
        .map((c) => ({ lat: Number(c?.latitude ?? c?.lat), lng: Number(c?.longitude ?? c?.lng) }))
        .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng));

/** Ray casting. A zone without a usable polygon (fewer than 3 points) accepts every location. */
export function isPointInZoneCoordinates(lat, lng, coordinates) {
    const pts = toPoints(coordinates);
    if (pts.length < 3) return true;
    const y = Number(lat);
    const x = Number(lng);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
    let inside = false;
    for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const crosses = (pts[i].lat > y) !== (pts[j].lat > y)
            && x < ((pts[j].lng - pts[i].lng) * (y - pts[i].lat)) / (pts[j].lat - pts[i].lat) + pts[i].lng;
        if (crosses) inside = !inside;
    }
    return inside;
}

/** Throws when a restaurant location lies outside its service zone. Nothing to check without both a zone and a location. */
export function assertLocationInsideZone(zoneDoc, latitude, longitude) {
    if (!zoneDoc || latitude === null || latitude === undefined || longitude === null || longitude === undefined) return;
    if (!isPointInZoneCoordinates(latitude, longitude, zoneDoc.coordinates)) {
        const name = zoneDoc.name || zoneDoc.zoneName || 'the selected zone';
        throw new ValidationError(`This location is outside the selected zone (${name}). Choose a location inside the zone, or pick the correct zone.`);
    }
}
