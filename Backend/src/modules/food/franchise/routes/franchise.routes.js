import express from 'express';
import {
    getFormConfigController,
    getStatesController,
    getCitiesController,
    getPincodesController,
    submitApplicationController,
    getApplicationStatusController,
    getPartnerDashboardController,
    submitPaymentDetailsController,
    createRazorpayOrderController,
    verifyRazorpayPaymentController,
    submitPartnerSupportMessageController,
    submitPartnerPayoutRequestController,
    claimRefundFromSuperAdminController,
    processRestaurantRefundController,
    updatePartnerBankDetailsController,
    getPartnerTaxiOverviewController,
    getPartnerTaxiRidesController,
    getPartnerTaxiDriversController,
    getPartnerTaxiBusController,
    getPartnerFinanceController,
    getPartnerProfileController,
    listPartnerIssuesController,
    respondPartnerIssueController,
    createPartnerRequestController,
    listRidersController,
    getRiderController,
    decideRiderController,
    getTaxiDriverController,
    decideTaxiDriverController,
    listFoodPaymentsController,
    getDeliveryFeesController,
    saveDeliveryFeesController,
    resetDeliveryFeesController,
} from '../controllers/franchise.public.controller.js';
import { financeWriteRateLimiter } from '../../../../middleware/rateLimit.js';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import { authRateLimiter } from '../../../../middleware/rateLimit.js';
import { sendError } from '../../../../utils/response.js';

const router = express.Router();

/** Logged-in franchise partner: valid admin token whose account is linked to a franchise. */
const requireFranchisePartner = [
    authMiddleware,
    requireRoles('ADMIN', 'SUBADMIN', 'SUPERADMIN', 'SUPER_ADMIN'),
    (req, res, next) => {
        if (!req.user?.franchiseId) return sendError(res, 403, 'Franchise account required');
        return next();
    },
];

/** Token is optional here: with it -> full dashboard, without it -> onboarding view only. */
const optionalAuth = (req, res, next) =>
    (req.headers.authorization ? authMiddleware(req, res, next) : authRateLimiter(req, res, next));

// Public - no auth required
router.get('/form-config', getFormConfigController);
router.get('/states', getStatesController);
router.get('/cities', getCitiesController);
router.get('/pincodes', getPincodesController);
router.post('/apply', authRateLimiter, submitApplicationController);

// Onboarding (applicant has no login yet): exact applicationId + phone, rate limited
router.get('/status', authRateLimiter, getApplicationStatusController);
router.get('/partner-dashboard', optionalAuth, getPartnerDashboardController);
router.post('/submit-payment', authRateLimiter, submitPaymentDetailsController);
router.post('/create-razorpay-order', authRateLimiter, createRazorpayOrderController);
router.post('/verify-razorpay-payment', authRateLimiter, verifyRazorpayPaymentController);

// Taxi data of the logged-in franchise (403 if the franchise did not buy the taxi module)
router.get('/taxi/overview', requireFranchisePartner, getPartnerTaxiOverviewController);
router.get('/taxi/rides', requireFranchisePartner, getPartnerTaxiRidesController);
router.get('/taxi/drivers', requireFranchisePartner, getPartnerTaxiDriversController);
router.get('/taxi/bus', requireFranchisePartner, getPartnerTaxiBusController);

// Food riders (delivery partners) of the franchise's zone
router.get('/food/riders', requireFranchisePartner, listRidersController);
router.get('/food/riders/:id', requireFranchisePartner, getRiderController);
router.post('/food/riders/:id/:action(approve|reject)', requireFranchisePartner, financeWriteRateLimiter, decideRiderController);
// Delivery fee slabs of the franchise's food zone (goes to riders; does not touch platform commission)
router.get('/food/delivery-fees', requireFranchisePartner, getDeliveryFeesController);
router.put('/food/delivery-fees', requireFranchisePartner, financeWriteRateLimiter, saveDeliveryFeesController);
router.delete('/food/delivery-fees', requireFranchisePartner, financeWriteRateLimiter, resetDeliveryFeesController);
// Payments of the franchise's food orders (read-only)
router.get('/food/payments', requireFranchisePartner, listFoodPaymentsController);
// Taxi drivers of the franchise's taxi zone: details + approve / reject / block / unblock
router.get('/taxi/drivers/:id', requireFranchisePartner, getTaxiDriverController);
router.post('/taxi/drivers/:id/:action(approve|reject|block|unblock)', requireFranchisePartner, financeWriteRateLimiter, decideTaxiDriverController);

// Own finance view (read-only): earnings, platform commission, wallet, fee & deposit
router.get('/finance', requireFranchisePartner, getPartnerFinanceController);

// Issues (support tickets) raised by users / restaurants of the franchise zone
router.get('/issues', requireFranchisePartner, listPartnerIssuesController);
router.patch('/issues/:source(user|restaurant)/:id', requireFranchisePartner, financeWriteRateLimiter, respondPartnerIssueController);

// Own profile + requests to admin (zone change, deactivate account)
router.get('/profile', requireFranchisePartner, getPartnerProfileController);
router.post('/requests', requireFranchisePartner, financeWriteRateLimiter, createPartnerRequestController);

router.get('/my-zone', requireFranchisePartner, async (req, res, next) => {
    try {
        const FranchiseApplication = (await import('../../admin/models/franchiseApplication.model.js')).default;
        const app = await FranchiseApplication.findById(req.user.franchiseId).select('zoneId taxiZoneId city area state').lean();
        if (!app) return res.status(404).json({ success: false, message: 'Franchise not found' });
        let zone = null;
        const FoodZone = (await import('../../admin/models/foodZone.model.js')).default;
        if (app.zoneId && FoodZone) {
            const fz = await FoodZone.findById(app.zoneId).lean();
            if (fz) {
                zone = { _id: String(fz._id), id: String(fz._id), name: fz.name || fz.zoneName || fz.serviceLocation, zoneName: fz.name || fz.zoneName, coordinates: fz.coordinates, boundary: fz.boundary, city: app.city || '' };
            }
        }
        if (!zone && app.city && FoodZone) {
            const safeCity = String(app.city || "").trim();
            const fz = await FoodZone.findOne({ $or: [{ name: new RegExp("^" + safeCity + "$", "i") }, { zoneName: new RegExp("^" + safeCity + "$", "i") }] }).lean();
            if (fz) {
                zone = { _id: String(fz._id), id: String(fz._id), name: fz.name || fz.zoneName || fz.serviceLocation, zoneName: fz.name || fz.zoneName, coordinates: fz.coordinates, boundary: fz.boundary, city: app.city || '' };
            }
        }
        if (!zone) {
            zone = { _id: String(app.zoneId || app.city || 'zone'), id: String(app.zoneId || app.city || 'zone'), name: app.city || app.area || 'Franchise Zone', zoneName: app.city || app.area || 'Franchise Zone', city: app.city || '' };
        }
        return res.status(200).json({ success: true, data: { zone } });
    } catch (e) {
        next(e);
    }
});

// Money / account actions: franchise login required
router.post('/support-message', requireFranchisePartner, submitPartnerSupportMessageController);
router.post('/payout-request', requireFranchisePartner, submitPartnerPayoutRequestController);
router.post('/refund-request/claim', requireFranchisePartner, claimRefundFromSuperAdminController);
router.post('/refund-request/process', requireFranchisePartner, processRestaurantRefundController);
router.post('/bank-details', requireFranchisePartner, updatePartnerBankDetailsController);

export default router;
