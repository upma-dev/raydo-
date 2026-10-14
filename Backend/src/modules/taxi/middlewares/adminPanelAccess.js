import { ApiError } from '../../../utils/ApiError.js';
import { isSuperAdminLike } from '../../../core/admin/adminHierarchy.service.js';
import { ADMIN_LEVELS, ADMIN_MODULES } from '../../../core/admin/adminHierarchy.constants.js';

/**
 * Who may use the TAXI ADMIN API (/v1/taxi/admin/*).
 * Every food/taxi/franchise login is a "FoodAdmin" with role ADMIN, so `authenticate(['admin'])` alone let franchise
 * partners and food-only admins call taxi admin endpoints (users, drivers, wallets, settings...).
 * Allowed: platform super admin, taxi super admin, taxi sub-admins. Franchise partners use /v1/franchise/taxi/*.
 * Runs after authenticate(['admin']), which loaded req.auth.admin from the database.
 */
export const requireTaxiPanelAdmin = (req, _res, next) => {
  const admin = req.auth?.admin || {};
  const adminType = String(admin.admin_type || '').toLowerCase();
  if (admin.franchiseId || adminType === 'franchise' || adminType === 'franchise_partner') {
    return next(new ApiError(403, 'Franchise accounts use the franchise portal, not the taxi admin panel'));
  }
  if (isSuperAdminLike(admin)) {
    if (admin.adminLevel === ADMIN_LEVELS.PLATFORM_SUPERADMIN || admin.adminLevel === ADMIN_LEVELS.TAXI_SUPERADMIN) return next();
    return next(new ApiError(403, 'Your admin account does not include the Taxi module'));
  }
  const services = Array.isArray(admin.servicesAccess) ? admin.servicesAccess : [];
  if (admin.module === ADMIN_MODULES.TAXI || services.includes(ADMIN_MODULES.TAXI)) return next();
  return next(new ApiError(403, 'Your admin account does not include the Taxi module'));
};
