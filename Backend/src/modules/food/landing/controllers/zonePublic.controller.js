import { FoodZone } from '../../admin/models/zone.model.js';

const toFinite = (v) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v));
    return Number.isFinite(n) ? n : null;
};

// Ray-casting point-in-polygon for lat/lng polygons.
const isPointInPolygon = (lat, lng, polygon) => {
    if (!Array.isArray(polygon) || polygon.length < 3) return false;
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].longitude;
        const yi = polygon[i].latitude;
        const xj = polygon[j].longitude;
        const yj = polygon[j].latitude;
        const intersect =
            yi > lat !== yj > lat &&
            lng < ((xj - xi) * (lat - yi)) / (yj - yi + 0.0) + xi;
        if (intersect) inside = !inside;
    }
    return inside;
};

const getDistanceInKm = (lat1, lon1, lat2, lon2) => {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
};

/** GET /zones/detect?lat=..&lng=.. */
export const detectZonePublicController = async (req, res, next) => {
    try {
        const lat = toFinite(req.query.lat);
        const lng = toFinite(req.query.lng);
        const city = req.query.city ? String(req.query.city).trim() : null;
        const address = req.query.address ? String(req.query.address).trim() : null;

        if (lat === null || lng === null) {
            return res.status(400).json({ success: false, message: 'lat and lng are required' });
        }

        const zones = await FoodZone.find({ isActive: true }).lean();

        // 1. Ray-casting point-in-polygon check
        for (const zone of zones) {
            const coords = Array.isArray(zone.coordinates) ? zone.coordinates : [];
            if (coords.length < 3) continue;
            if (isPointInPolygon(lat, lng, coords)) {
                return res.status(200).json({
                    success: true,
                    message: 'Zone detected',
                    data: { status: 'IN_SERVICE', zoneId: zone._id, zone }
                });
            }
        }

        // 2. Centroid proximity check (30km buffer for user locations near zone boundary)
        let closestZone = null;
        let minDistance = Infinity;

        for (const zone of zones) {
            const coords = Array.isArray(zone.coordinates) ? zone.coordinates : [];
            if (coords.length === 0) continue;
            let sumLat = 0, sumLng = 0;
            coords.forEach(c => { sumLat += c.latitude; sumLng += c.longitude; });
            const cenLat = sumLat / coords.length;
            const cenLng = sumLng / coords.length;

            const distKm = getDistanceInKm(lat, lng, cenLat, cenLng);
            if (distKm <= 35 && distKm < minDistance) {
                minDistance = distKm;
                closestZone = zone;
            }
        }

        if (closestZone) {
            return res.status(200).json({
                success: true,
                message: 'Zone detected (nearby)',
                data: { status: 'IN_SERVICE', zoneId: closestZone._id, zone: closestZone }
            });
        }

        // 3. City/address text match fallback
        if (city || address) {
            const targetText = `${city || ''} ${address || ''}`.toLowerCase();
            for (const zone of zones) {
                const zoneLoc = (zone.serviceLocation || zone.name || zone.zoneName || '').toLowerCase();
                if (zoneLoc && (targetText.includes(zoneLoc) || zoneLoc.split(',').some(part => part.trim() && targetText.includes(part.trim())))) {
                    return res.status(200).json({
                        success: true,
                        message: 'Zone detected (city match)',
                        data: { status: 'IN_SERVICE', zoneId: zone._id, zone }
                    });
                }
            }
        }

        return res.status(200).json({
            success: true,
            message: 'Out of service',
            data: { status: 'OUT_OF_SERVICE', zoneId: null, zone: null }
        });
    } catch (error) {
        next(error);
    }
};

/** GET /zones/public - list active zones for onboarding/selects */
export const listZonesPublicController = async (_req, res, next) => {
    try {
        const zones = await FoodZone.find({ isActive: true })
            .select('name zoneName serviceLocation country unit isActive coordinates createdAt')
            .sort({ createdAt: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: 'Zones fetched successfully',
            data: { zones }
        });
    } catch (error) {
        next(error);
    }
};

/** GET /zones/nearby - list zones for hotspot/nearby visualization */
export const listZonesNearbyPublicController = async (req, res, next) => {
    try {
        const zones = await FoodZone.find({ isActive: true })
            .select('name zoneName serviceLocation country unit isActive coordinates createdAt')
            .sort({ createdAt: 1 })
            .lean();

        return res.status(200).json({
            success: true,
            message: 'Nearby zones fetched',
            data: { zones }
        });
    } catch (error) {
        next(error);
    }
};

