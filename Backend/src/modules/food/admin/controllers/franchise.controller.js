import { sendResponse } from '../../../../utils/response.js';
import * as franchiseAdminService from '../../admin/services/franchise.service.js';

/**
 * GET /v1/food/admin/franchise/applications
 */
export async function getApplicationsController(req, res, next) {
    try {
        const { status, search, page, limit } = req.query;
        const data = await franchiseAdminService.getApplications({ status, search, page, limit });
        return sendResponse(res, 200, 'Applications fetched', data);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /v1/food/admin/franchise/applications/stats
 */
export async function getStatsController(req, res, next) {
    try {
        const stats = await franchiseAdminService.getApplicationStats();
        return sendResponse(res, 200, 'Stats fetched', stats);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /v1/food/admin/franchise/applications/:id
 */
export async function getApplicationByIdController(req, res, next) {
    try {
        const app = await franchiseAdminService.getApplicationById(req.params.id);
        if (!app) return sendResponse(res, 404, 'Application not found', null);
        return sendResponse(res, 200, 'Application fetched', app);
    } catch (err) {
        next(err);
    }
}

/**
 * PATCH /v1/food/admin/franchise/applications/:id/status
 */
export async function updateStatusController(req, res, next) {
    try {
        const { status, adminNote } = req.body;
        const adminUserId = req.user?._id;
        const app = await franchiseAdminService.updateApplicationStatus(
            req.params.id,
            { status, adminNote },
            adminUserId
        );
        return sendResponse(res, 200, 'Status updated', app);
    } catch (err) {
        next(err);
    }
}

/**
 * DELETE /v1/food/admin/franchise/applications/:id
 */
export async function deleteApplicationController(req, res, next) {
    try {
        await franchiseAdminService.deleteApplication(req.params.id);
        return sendResponse(res, 200, 'Application deleted', null);
    } catch (err) {
        next(err);
    }
}

/**
 * PATCH /v1/food/admin/franchise/applications/:id/commission
 */
export async function updateCommissionController(req, res, next) {
    try {
        const app = await franchiseAdminService.updateCommissionSettings(req.params.id, req.body);
        return sendResponse(res, 200, 'Commission & financial settings updated', app);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /v1/food/admin/franchise/applications/:id/analytics
 */
export async function getAnalyticsController(req, res, next) {
    try {
        const data = await franchiseAdminService.getFranchiseAnalytics(req.params.id);
        return sendResponse(res, 200, 'Franchise analytics fetched', data);
    } catch (err) {
        next(err);
    }
}

/**
 * GET /v1/food/admin/franchise/form-config
 */
export async function getFormConfigController(req, res, next) {
    try {
        const config = await franchiseAdminService.getFormConfig();
        return sendResponse(res, 200, 'Form config fetched', config);
    } catch (err) {
        next(err);
    }
}

/**
 * PUT /v1/food/admin/franchise/form-config
 */
export async function updateFormConfigController(req, res, next) {
    try {
        const adminUserId = req.user?._id;
        const config = await franchiseAdminService.updateFormConfig(req.body, adminUserId);
        return sendResponse(res, 200, 'Form config updated', config);
    } catch (err) {
        next(err);
    }
}
