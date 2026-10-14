// Helpers to check a map location against a service zone (polygon of { latitude, longitude } points).

const toPoints = (zone) =>
  (Array.isArray(zone?.coordinates) ? zone.coordinates : [])
    .map((c) => ({ lat: Number(c?.latitude ?? c?.lat), lng: Number(c?.longitude ?? c?.lng) }))
    .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))

export const hasZonePolygon = (zone) => toPoints(zone).length >= 3

/** Ray casting: is (lat, lng) inside the zone polygon? A zone without a polygon accepts everything. */
export function isPointInZone(lat, lng, zone) {
  const pts = toPoints(zone)
  if (pts.length < 3) return true
  const y = Number(lat)
  const x = Number(lng)
  if (!Number.isFinite(x) || !Number.isFinite(y)) return false
  let inside = false
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const yi = pts[i].lat
    const xi = pts[i].lng
    const yj = pts[j].lat
    const xj = pts[j].lng
    const crosses = (yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi
    if (crosses) inside = !inside
  }
  return inside
}

/** { south, west, north, east } box around the zone, for biasing the search. null if the zone has no polygon. */
export function getZoneBounds(zone) {
  const pts = toPoints(zone)
  if (pts.length < 3) return null
  const lats = pts.map((p) => p.lat)
  const lngs = pts.map((p) => p.lng)
  return { south: Math.min(...lats), north: Math.max(...lats), west: Math.min(...lngs), east: Math.max(...lngs) }
}

export const zoneDisplayName = (zone) => zone?.name || zone?.zoneName || zone?.serviceLocation || "the selected zone"
