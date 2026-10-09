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
} from '../controllers/franchise.public.controller.js';
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

// Money / account actions: franchise login required
router.post('/support-message', requireFranchisePartner, submitPartnerSupportMessageController);
router.post('/payout-request', requireFranchisePartner, submitPartnerPayoutRequestController);
router.post('/refund-request/claim', requireFranchisePartner, claimRefundFromSuperAdminController);
router.post('/refund-request/process', requireFranchisePartner, processRestaurantRefundController);
router.post('/bank-details', requireFranchisePartner, updatePartnerBankDetailsController);

export default router;
