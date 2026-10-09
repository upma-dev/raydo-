import express from 'express';
import mongoose from 'mongoose';
import { sendResponse, sendError } from '../../utils/response.js';
import { isPlatformSuperAdmin, isSuperAdminLike } from '../admin/adminHierarchy.service.js';
import * as svc from './globalSettings.service.js';

const router = express.Router();

/**
 * Global settings change how BOTH apps look and what their legal text says,
 * so only a platform-level super admin may touch them. Franchise logins and sub-admins are refused.
 */
router.use(async (req, res, next) => {
    try {
        const FoodAdmin = mongoose.model('FoodAdmin');
        const admin = await FoodAdmin.findById(req.user?.id).lean();
        if (!admin || admin.isActive === false || admin.active === false || admin.status === 'inactive') {
            return sendError(res, 401, 'Admin account not found or inactive');
        }
        if (!isSuperAdminLike(admin) || !isPlatformSuperAdmin(admin)) {
            return sendError(res, 403, 'Only the platform super admin can change global settings');
        }
        req.globalAdmin = admin;
        return next();
    } catch (err) {
        return next(err);
    }
});

const wrap = (fn, message) => async (req, res, next) => {
    try {
        return sendResponse(res, 200, message, await fn(req));
    } catch (err) {
        return next(err);
    }
};

router.get('/', wrap(() => svc.getGlobalSettings(), 'Global settings fetched'));

router.put('/', wrap(async (req) => {
    const result = await svc.updateGlobalSettings(req.body);
    if (req.body?.brand?.appName) await svc.syncAboutName(String(req.body.brand.appName).trim(), req.globalAdmin._id);
    return result;
}, 'Global settings saved for Food and Taxi'));

router.get('/integrations', wrap(() => svc.getIntegrationsStatus(), 'Integrations status fetched'));

router.get('/legal/:key', wrap((req) => svc.getLegalDocument(req.params.key), 'Document fetched'));
router.put('/legal/:key', wrap((req) => svc.saveLegalDocument(req.params.key, req.body, req.globalAdmin._id), 'Document saved'));

export default router;
