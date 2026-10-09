import { MaintenanceSetting } from './maintenanceSetting.model.js';
import { sendResponse } from '../../utils/response.js';

/**
 * MAINTENANCE MODE
 * Admin can lock: everything ('all'), a whole module ('food' / 'taxi'), or one app
 * (food_user, food_restaurant, food_delivery, taxi_user, taxi_driver), optionally for one taxi service type
 * (rental / outstation / pooling) and/or one zone.
 * Each request is matched to the app it belongs to by its URL, then checked against the active rules.
 */

const DEFAULT_MESSAGE = 'Service is currently under maintenance. Please try again later.';

// Never blocked: the admin panel (so admins can switch maintenance off), login, status checks, uploads, webhooks, health
// and payment confirmation (a customer who has already paid must still be able to finish).
const ALWAYS_ALLOWED = ['/admin', '/auth', '/maintenance', '/health', '/uploads', '/webhook', '/payments', '/verify', '/fcm-tokens'];

const TAXI_SERVICE_HINTS = ['rental', 'outstation', 'pooling'];

// Rules are cached for a few seconds so maintenance does not add a DB query to every request
let cache = { at: 0, rules: [] };
const CACHE_MS = 5000;

export const invalidateMaintenanceCache = () => {
    cache = { at: 0, rules: [] };
};

const loadRules = async () => {
    if (Date.now() - cache.at < CACHE_MS) return cache.rules;
    const rules = await MaintenanceSetting.find({ isMaintenance: true }).lean();
    cache = { at: Date.now(), rules };
    return rules;
};

/** Which app does this request belong to? */
const detectApp = (url) => {
    if (url.includes('/taxi')) return { moduleType: 'taxi', app: url.includes('/taxi/drivers') ? 'taxi_driver' : 'taxi_user' };
    if (url.includes('/food')) {
        if (url.includes('/food/delivery') || url.includes('/food/gigs')) return { moduleType: 'food', app: 'food_delivery' };
        if (url.includes('/food/restaurant')) return { moduleType: 'food', app: 'food_restaurant' };
        return { moduleType: 'food', app: 'food_user' };
    }
    return { moduleType: null, app: null };
};

export const checkMaintenanceMiddleware = async (req, res, next) => {
    try {
        const url = (req.originalUrl || req.url || '').split('?')[0].toLowerCase();

        if (ALWAYS_ALLOWED.some((p) => url.includes(p))) return next();

        const { moduleType, app } = detectApp(url);
        const rules = await loadRules();
        if (!rules.length) return next();

        const zoneId = String(req.headers['x-zone-id'] || req.query?.zoneId || req.query?.zone_id || '');
        const hintedService = TAXI_SERVICE_HINTS.find((s) => url.includes(s)) || '';

        const hit = rules.find((r) => {
            const mod = String(r.module || '');
            // Which request does this rule cover?
            const moduleMatch = mod === 'all' || (moduleType && (mod === moduleType || mod === app));
            if (!moduleMatch) return false;

            // Taxi service-type rules only lock that service (everything else keeps working)
            const service = String(r.serviceType || 'all');
            if (service !== 'all' && !(hintedService && service === hintedService)) return false;

            // Zone rules apply only when the app tells us which zone the request is for
            if (r.zoneId && String(r.zoneId) !== 'null') {
                if (!zoneId || String(r.zoneId) !== zoneId) return false;
            }
            return true;
        });

        if (hit) {
            return sendResponse(res, 503, hit.maintenanceMessage || DEFAULT_MESSAGE, null, false);
        }

        return next();
    } catch (err) {
        // If there's an error checking maintenance, continue to avoid breaking the app
        return next();
    }
};
