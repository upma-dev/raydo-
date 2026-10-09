import { sendResponse } from '../../../../utils/response.js';
import * as franchiseAdminService from '../../admin/services/franchise.service.js';
import * as overviewService from '../../admin/services/franchiseOverview.service.js';
import * as taxiService from '../../admin/services/franchiseTaxi.service.js';

/**
 * GET /v1/food/admin/franchise/applications
 */
export async function getApplicationsController(req, res, next) {
    try {
        const { status, search, page, limit, archived } = req.query;
        const data = await franchiseAdminService.getApplications({ status, search, page, limit, archived });
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
        const adminUserId = req.user?.id;
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
 * Deletes for good when there is no history, otherwise archives (see removeFranchise).
 */
export async function deleteApplicationController(req, res, next) {
    try {
        const result = await overviewService.removeFranchise(req.params.id);
        return sendResponse(res, 200, result.deleted ? 'Franchise deleted' : 'Franchise archived', result);
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
        const adminUserId = req.user?.id;
        const config = await franchiseAdminService.updateFormConfig(req.body, adminUserId);
        return sendResponse(res, 200, 'Form config updated', config);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /v1/food/admin/franchise/applications/:id/subadmin
 */
export async function syncSubAdminController(req, res, next) {
    try {
        const { password, permissions, zoneId, taxiZoneId } = req.body;
        const result = await franchiseAdminService.syncFranchiseSubAdmin(req.params.id, { password, permissions, zoneId, taxiZoneId });
        return sendResponse(res, 200, 'Franchise SubAdmin account created/synced successfully', result);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /v1/food/admin/franchise/applications
 */
export async function createApplicationController(req, res, next) {
    try {
        const adminUserId = req.user?.id;
        const app = await franchiseAdminService.createApplication(req.body, adminUserId);
        return sendResponse(res, 201, 'Franchise application created successfully', app);
    } catch (err) {
        next(err);
    }
}

/**
 * POST /v1/food/admin/franchise/applications/:id/support-messages/:messageId/reply
 */
export async function replySupportMessageController(req, res, next) {
    try {
        const { reply, status } = req.body;
        const app = await franchiseAdminService.replyToSupportMessage(req.params.id, req.params.messageId, { reply, status });
        return sendResponse(res, 200, 'Support message reply saved', app);
    } catch (err) {
        next(err);
    }
}

/**
 * PATCH /v1/food/admin/franchise/applications/:id/payout-requests/:requestId
 */
export async function updatePayoutRequestStatusController(req, res, next) {
    try {
        const { status, adminNote, transactionId } = req.body;
        const app = await franchiseAdminService.updatePayoutRequestStatus(req.params.id, req.params.requestId, { status, adminNote, transactionId });
        return sendResponse(res, 200, 'Payout request status updated', app);
    } catch (err) {
        next(err);
    }
}

/**
 * PATCH /v1/food/admin/franchise/applications/:id/refund-requests/:refundId
 */
export async function updateRefundClaimStatusController(req, res, next) {
    try {
        const { status, adminNote } = req.body;
        const app = await franchiseAdminService.updateRefundClaimStatus(req.params.id, req.params.refundId, { status, adminNote });
        return sendResponse(res, 200, 'Refund claim status updated', app);
    } catch (err) {
        next(err);
    }
}





// ----- Live overview & account control -----
const wrap = (fn, message) => async (req, res, next) => {
    try {
        return sendResponse(res, 200, message, await fn(req));
    } catch (err) {
        next(err);
    }
};

export const getTaxiZonesController = wrap((req) => taxiService.listTaxiZonesForFranchise(req.query.franchiseId || null), 'Taxi zones fetched');
export const getTaxiOverviewController = wrap((req) => taxiService.getTaxiOverview(req.params.id), 'Taxi overview fetched');
export const getTaxiRidesController = wrap((req) => taxiService.listTaxiRides(req.params.id, req.query), 'Taxi rides fetched');
export const getTaxiBusController = wrap((req) => taxiService.listTaxiBookings(req.params.id, req.query), 'Bookings fetched');
export const getTaxiDriversController = wrap((req) => taxiService.listTaxiDrivers(req.params.id, req.query), 'Taxi drivers fetched');
export const getOverviewController = wrap((req) => overviewService.getFranchiseOverview(req.params.id), 'Franchise overview fetched');
export const getFranchiseRestaurantsController = wrap((req) => overviewService.listFranchiseRestaurants(req.params.id, req.query), 'Restaurants fetched');
export const getFranchiseOrdersController = wrap((req) => overviewService.listFranchiseOrders(req.params.id, req.query), 'Orders fetched');
export const getFranchiseLedgerController = wrap((req) => overviewService.listFranchiseLedger(req.params.id, req.query), 'Ledger fetched');
export const suspendFranchiseController = wrap((req) => overviewService.suspendFranchise(req.params.id, req.body?.reason), 'Franchise suspended');
export const activateFranchiseController = wrap((req) => overviewService.activateFranchise(req.params.id), 'Franchise activated');
export const restoreFranchiseController = wrap((req) => overviewService.restoreFranchise(req.params.id), 'Franchise restored');
export const updateFranchiseProfileController = wrap((req) => overviewService.updateFranchiseProfile(req.params.id, req.body), 'Franchise updated');
