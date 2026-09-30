import { ADMIN_LEVELS } from '../admin/adminHierarchy.constants.js';

/**
 * Middleware to enforce franchise data isolation.
 * Automatically injects the correct franchiseId into req.query or req.body
 * based on the authenticated franchise admin's session.
 * Rejects requests if a Franchise Admin tries to access data belonging to another franchise.
 */
export const franchiseIsolation = (req, res, next) => {
    // If not authenticated, or not an admin, proceed (handled by auth middleware)
    if (!req.user || !req.user.adminLevel) {
        return next();
    }

    // Super Admins bypass isolation
    if (
        req.user.adminLevel === ADMIN_LEVELS.PLATFORM_SUPERADMIN ||
        req.user.adminLevel === ADMIN_LEVELS.FOOD_SUPERADMIN ||
        req.user.adminLevel === ADMIN_LEVELS.TAXI_SUPERADMIN ||
        req.user.adminLevel === ADMIN_LEVELS.FRANCHISE_SUPERADMIN
    ) {
        return next();
    }

    // If it's a franchise admin or staff, enforce their franchise ID
    if (req.user.adminLevel === ADMIN_LEVELS.FRANCHISE_ADMIN || req.user.role === 'FRANCHISE_STAFF') {
        const adminFranchiseId = req.user.franchiseId;

        if (!adminFranchiseId) {
            return res.status(403).json({ success: false, message: 'Franchise ID missing from session' });
        }

        // For GET requests, force query
        if (req.method === 'GET') {
            req.query.franchiseId = adminFranchiseId.toString();
        } 
        // For POST/PUT/PATCH, force body
        else if (['POST', 'PUT', 'PATCH'].includes(req.method)) {
            req.body.franchiseId = adminFranchiseId.toString();
        }

        return next();
    }

    next();
};
