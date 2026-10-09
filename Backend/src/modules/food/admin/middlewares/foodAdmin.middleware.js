import { AuthError, ForbiddenError } from '../../../../core/auth/errors.js';
import { FoodAdmin } from '../../../../core/admin/admin.model.js';
import mongoose from 'mongoose';
import { serializeAdminContext, isSuperAdminLike } from '../../../../core/admin/adminHierarchy.service.js';
import { hasFoodAdminPermission } from '../services/foodAdminAccessService.js';

export const attachFoodAdminContext = async (req, _res, next) => {
  try {
    const userId = req.user?.userId;
    if (!userId) {
      return next(new AuthError('Admin access required'));
    }

    const admin = await FoodAdmin.findById(userId).lean();
    if (!admin) {
      return next(new AuthError('Admin account not found'));
    }

    const context = serializeAdminContext(admin);
    if (context.admin_type === 'subadmin' || context.admin_type === 'franchise' || context.franchiseId) {
      context.module = context.module || 'food';
      if (!Array.isArray(context.permissions) || context.permissions.length === 0) {
        context.permissions = [
          'orders', 'restaurants', 'categories', 'foods', 'zones',
          'dashboard', 'reports', 'pos', 'delivery', 'support', 'wallet', 'promotions'
        ];
      }
      if (!context.franchiseId) {
        try {
          const { default: FranchiseApplication } = await import('../models/franchiseApplication.model.js');
          const franchise = await FranchiseApplication.findOne({ subAdminId: context.id }).select('_id').lean();
          if (franchise) {
            context.franchiseId = String(franchise._id);
          }
        } catch (err) {
          console.error('Error resolving franchiseId in attachFoodAdminContext:', err);
        }
      }
    }
    // A franchise can only use the modules it holds: a taxi-only franchise has no business in the food admin API.
    if (context.franchiseId) {
      try {
        const { default: FranchiseApplication } = await import('../models/franchiseApplication.model.js');
        const { normalizeModules } = await import('../services/franchisePlan.js');
        const franchise = await FranchiseApplication.findById(context.franchiseId).select('selectedModules accountStatus archived').lean();
        if (!franchise || franchise.archived || franchise.accountStatus === 'suspended') {
          return next(new ForbiddenError('This franchise account is not active'));
        }
        context.franchiseModules = normalizeModules(franchise.selectedModules);
        if (!context.franchiseModules.includes('food')) {
          return next(new ForbiddenError('Your franchise does not include the Food module'));
        }
      } catch (err) {
        return next(err);
      }
    }
    req.adminContext = context;
    next();
  } catch (error) {
    next(error);
  }
};

export const requireFoodAdminPermission = (permission, label = 'resource') => (req, _res, next) => {
  if (!hasFoodAdminPermission(req.adminContext, permission)) {
    return next(new AuthError(`You do not have permission to access ${label}`));
  }
  return next();
};

export const requireFoodResourceAccess = (resource, label = 'resource') => (req, _res, next) => {
  const action = ['GET', 'HEAD', 'OPTIONS'].includes(String(req.method || '').toUpperCase()) ? 'read' : 'write';
  if (!hasFoodAdminPermission(req.adminContext, resource, action)) {
    if (action === 'write' && hasFoodAdminPermission(req.adminContext, resource, 'read')) {
      return next(new ForbiddenError(`You have read-only permission for this section. Actions are restricted by the admin.`));
    }
    return next(new AuthError(`You do not have ${action} permission for ${label}`));
  }
  return next();
};

/**
 * Which franchise's data may this request see?
 *  - A franchise login is ALWAYS pinned to its own franchise; x-franchise-id / ?franchiseId= are ignored.
 *  - Only a super admin may look at another franchise by passing x-franchise-id / ?franchiseId=.
 * Returns null when the request is not scoped to a franchise.
 */
export const resolveFranchiseScopeId = (req) => {
  const ctx = req.adminContext || {};
  if (ctx.franchiseId) return String(ctx.franchiseId);
  const requested = req.headers['x-franchise-id'] || req.query?.franchiseId;
  if (isSuperAdminLike(ctx) && requested && mongoose.Types.ObjectId.isValid(String(requested))) {
    return String(requested);
  }
  return null;
};
