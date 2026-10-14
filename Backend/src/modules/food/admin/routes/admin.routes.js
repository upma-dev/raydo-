import express from 'express';
import { AuthError, ForbiddenError } from '../../../../core/auth/errors.js';
import { isSuperAdminLike } from '../../../../core/admin/adminHierarchy.service.js';
import * as adminController from '../controllers/admin.controller.js';
import * as foodApprovalController from '../controllers/foodApproval.controller.js';
import * as addonsApprovalController from '../controllers/addonsApproval.controller.js';
import * as businessSettingsController from '../controllers/businessSettings.controller.js';
import * as feedbackExperienceController from '../controllers/feedbackExperience.controller.js';
import * as notificationBroadcastController from '../controllers/notificationBroadcast.controller.js';
import * as diningAdminController from '../../dining/controllers/diningAdmin.controller.js';
import * as orderController from '../../orders/controllers/order.controller.js';
import { getAdminPageController, upsertAdminPageController } from '../controllers/pageContent.controller.js';
import { upload } from '../../../../middleware/upload.js';
import { invalidateCache } from '../../../../middleware/cache.js';
import { attachFoodAdminContext, requireFoodResourceAccess } from '../middlewares/foodAdmin.middleware.js';
import {
    ownRestaurant, ownOrZoneRestaurant, ownFood, ownAddon, ownCategory, ownOrder, ownComplaint, ownRestaurantInBody,
    pinFranchiseQuery, denyFranchise, stripFranchiseOwnedFields, forceFranchiseZone,
} from '../middlewares/franchiseScope.middleware.js';

// Franchise logins see complaints of their own restaurants without the platform-wide "support" permission
const supportOrFranchise = (req, res, next) =>
    (req.adminContext?.franchiseId ? next() : requireFoodResourceAccess('support', 'support')(req, res, next));
const PLATFORM_ONLY = 'This is a platform setting. Contact the Raydo admin.';
import * as foodAdminManagementController from '../controllers/foodAdminManagement.controller.js';
import * as franchiseAdminController from '../controllers/franchise.controller.js';
import * as franchiseFinanceController from '../controllers/franchiseFinance.controller.js';
import { financeWriteRateLimiter } from '../../../../middleware/rateLimit.js';

const router = express.Router();

// ----- Public Business Settings (No Admin Required) -----
router.get('/business-settings/public', businessSettingsController.getBusinessSettings);

const requireAdmin = (req, _res, next) => {
    const user = req.user;
    const roleUpper = String(user?.role || '').toUpperCase();
    if (!user || (!['ADMIN', 'SUBADMIN', 'SUPERADMIN', 'SUPER_ADMIN'].includes(roleUpper))) {
        return next(new AuthError('Admin access required'));
    }
    return next();
};

router.use(requireAdmin);
router.use(attachFoodAdminContext);

// ----- Admin Management (Subadmins) -----
router.get('/admin-management/permissions', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.getFoodAdminPermissions);
router.get('/admin-management/assignable-zones', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.getAssignableFoodZones);
router.get('/admin-management/admins', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.getFoodAdmins);
router.get('/admin-management/admins/:id', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.getFoodAdminById);
router.post('/admin-management/admins', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.createFoodAdminAccount);
router.patch('/admin-management/admins/:id', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.updateFoodAdminAccount);
router.delete('/admin-management/admins/:id', requireFoodResourceAccess('subadmins', 'subadmins'), foodAdminManagementController.deleteFoodAdminAccount);

// ----- Broadcast Notifications -----
router.post('/notifications/broadcast', requireFoodResourceAccess('settings', 'settings'), notificationBroadcastController.createBroadcastNotificationController);
router.get('/notifications/broadcast', requireFoodResourceAccess('settings', 'settings'), notificationBroadcastController.getBroadcastNotificationsController);
router.delete('/notifications/broadcast/:id', requireFoodResourceAccess('settings', 'settings'), notificationBroadcastController.deleteBroadcastNotificationController);

// ----- Customers -----
router.get('/customers', requireFoodResourceAccess('customers', 'customers'), adminController.getCustomers);
router.get('/customers/:id', requireFoodResourceAccess('customers', 'customers'), adminController.getCustomerById);
router.patch('/customers/:id/status', requireFoodResourceAccess('customers', 'customers'), adminController.updateCustomerStatus);

// ----- Safety / Emergency Reports -----
router.get('/safety-emergency-reports', requireFoodResourceAccess('support', 'support'), adminController.getSafetyEmergencyReports);
router.put('/safety-emergency-reports/:id/status', requireFoodResourceAccess('support', 'support'), adminController.updateSafetyEmergencyStatus);
router.put('/safety-emergency-reports/:id/priority', requireFoodResourceAccess('support', 'support'), adminController.updateSafetyEmergencyPriority);
router.delete('/safety-emergency-reports/:id', requireFoodResourceAccess('support', 'support'), adminController.deleteSafetyEmergencyReport);

// ----- Support Tickets (users) -----
router.get('/support-tickets', requireFoodResourceAccess('support', 'support'), adminController.getSupportTicketsController);
router.patch('/support-tickets/:id', requireFoodResourceAccess('support', 'support'), adminController.updateSupportTicketController);
router.get('/global-search', adminController.globalSearch);
router.get('/restaurants/complaints', supportOrFranchise, pinFranchiseQuery, adminController.getRestaurantComplaints);
router.patch('/restaurants/complaints/:id', supportOrFranchise, ownComplaint(), adminController.updateRestaurantComplaint);

// ----- Restaurants -----
router.get('/restaurants', requireFoodResourceAccess('restaurants', 'restaurants'), adminController.getRestaurants);
router.get('/dashboard-stats', adminController.getDashboardStats);
router.get('/reports/restaurants', requireFoodResourceAccess('reports', 'reports'), denyFranchise('Platform reports are not available for franchises. Use Earnings.'), adminController.getRestaurantReport);
router.get('/reports/transactions', requireFoodResourceAccess('reports', 'reports'), denyFranchise('Platform reports are not available for franchises. Use Earnings.'), adminController.getTransactionReport);
router.get('/reports/tax', requireFoodResourceAccess('reports', 'reports'), denyFranchise('Platform reports are not available for franchises. Use Earnings.'), adminController.getTaxReport);
router.get('/reports/tax/:id', requireFoodResourceAccess('reports', 'reports'), denyFranchise('Platform reports are not available for franchises. Use Earnings.'), adminController.getTaxReportDetail);
router.get('/restaurants/pending', requireFoodResourceAccess('restaurants', 'restaurants'), pinFranchiseQuery, adminController.getPendingRestaurants);
router.get('/restaurants/reviews', requireFoodResourceAccess('restaurants', 'restaurants'), pinFranchiseQuery, adminController.getRestaurantReviews);
router.get('/restaurants/:id', requireFoodResourceAccess('restaurants', 'restaurants'), ownOrZoneRestaurant(), adminController.getRestaurantById);
router.get('/restaurants/:id/analytics', requireFoodResourceAccess('restaurants', 'restaurants'), ownRestaurant(), adminController.getRestaurantAnalytics);
router.get('/restaurants/:id/menu', requireFoodResourceAccess('restaurants', 'restaurants'), ownRestaurant(), adminController.getRestaurantMenuById);
router.post('/restaurants', requireFoodResourceAccess('restaurants', 'restaurants'), stripFranchiseOwnedFields(), forceFranchiseZone, adminController.createRestaurant);
router.patch('/restaurants/:id', requireFoodResourceAccess('restaurants', 'restaurants'), ownRestaurant(), stripFranchiseOwnedFields(), forceFranchiseZone, adminController.updateRestaurantById);
router.patch('/restaurants/:id/status', requireFoodResourceAccess('restaurants', 'restaurants'), ownRestaurant(), adminController.updateRestaurantStatus);
router.patch('/restaurants/:id/location', requireFoodResourceAccess('restaurants', 'restaurants'), ownRestaurant(), forceFranchiseZone, adminController.updateRestaurantLocation);
router.patch('/restaurants/:id/zone-featured-rank', requireFoodResourceAccess('restaurants', 'restaurants'), denyFranchise(PLATFORM_ONLY), adminController.updateRestaurantZoneFeaturedRank);
router.patch('/restaurants/:id/menu', requireFoodResourceAccess('restaurants', 'restaurants'), ownRestaurant(), adminController.updateRestaurantMenuById);
router.patch('/restaurants/:id/approve', requireFoodResourceAccess('restaurants', 'restaurants'), ownOrZoneRestaurant('id', { claim: true }), adminController.approveRestaurant);
router.patch('/restaurants/:id/reject', requireFoodResourceAccess('restaurants', 'restaurants'), ownOrZoneRestaurant(), adminController.rejectRestaurant);
router.delete('/restaurants/:id', requireFoodResourceAccess('restaurants', 'restaurants'), ownRestaurant(), adminController.deleteRestaurant);

// ----- Restaurant Commission -----
router.get('/restaurant-commissions/bootstrap', requireFoodResourceAccess('fee_settings', 'fee_settings'), denyFranchise(PLATFORM_ONLY), adminController.getRestaurantCommissionBootstrap);
router.get('/restaurant-commissions', requireFoodResourceAccess('fee_settings', 'fee_settings'), denyFranchise(PLATFORM_ONLY), adminController.getRestaurantCommissions);
router.post('/restaurant-commissions', requireFoodResourceAccess('fee_settings', 'fee_settings'), denyFranchise(PLATFORM_ONLY), adminController.createRestaurantCommission);
router.get('/restaurant-commissions/:id', requireFoodResourceAccess('fee_settings', 'fee_settings'), denyFranchise(PLATFORM_ONLY), adminController.getRestaurantCommissionById);
router.patch('/restaurant-commissions/:id', requireFoodResourceAccess('fee_settings', 'fee_settings'), denyFranchise(PLATFORM_ONLY), adminController.updateRestaurantCommission);
router.delete('/restaurant-commissions/:id', requireFoodResourceAccess('fee_settings', 'fee_settings'), denyFranchise(PLATFORM_ONLY), adminController.deleteRestaurantCommission);
router.patch('/restaurant-commissions/:id/toggle', requireFoodResourceAccess('fee_settings', 'fee_settings'), denyFranchise(PLATFORM_ONLY), adminController.toggleRestaurantCommissionStatus);

// ----- Categories -----
router.get('/categories', requireFoodResourceAccess('categories', 'categories'), adminController.getCategories);
router.post('/categories', requireFoodResourceAccess('categories', 'categories'), adminController.createCategory);
router.patch('/categories/:id', requireFoodResourceAccess('categories', 'categories'), ownCategory(), adminController.updateCategory);
router.delete('/categories/:id', requireFoodResourceAccess('categories', 'categories'), ownCategory(), adminController.deleteCategory);
router.patch('/categories/:id/toggle', requireFoodResourceAccess('categories', 'categories'), ownCategory(), adminController.toggleCategoryStatus);
router.patch('/categories/:id/approve', requireFoodResourceAccess('categories', 'categories'), ownCategory(), adminController.approveCategory);
router.patch('/categories/:id/reject', requireFoodResourceAccess('categories', 'categories'), ownCategory(), adminController.rejectCategory);
router.patch('/categories/:id/make-global', requireFoodResourceAccess('categories', 'categories'), denyFranchise(PLATFORM_ONLY), adminController.makeCategoryGlobal);

// ----- Restaurant Add-ons Approval -----
router.get('/addons', requireFoodResourceAccess('foods', 'foods'), pinFranchiseQuery, addonsApprovalController.getRestaurantAddons);
router.patch('/addons/:id', requireFoodResourceAccess('foods', 'foods'), ownAddon(), addonsApprovalController.updateRestaurantAddon);
router.patch('/addons/:id/approve', requireFoodResourceAccess('foods', 'foods'), ownAddon(), addonsApprovalController.approveRestaurantAddon);
router.patch('/addons/:id/reject', requireFoodResourceAccess('foods', 'foods'), ownAddon(), addonsApprovalController.rejectRestaurantAddon);

// ----- Foods -----
router.get('/foods', requireFoodResourceAccess('foods', 'foods'), adminController.getFoods);
router.post('/foods', requireFoodResourceAccess('foods', 'foods'), ownRestaurantInBody('restaurantId'), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, adminController.createFood);
router.patch('/foods/:id', requireFoodResourceAccess('foods', 'foods'), ownFood(), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, adminController.updateFood);
router.delete('/foods/:id', requireFoodResourceAccess('foods', 'foods'), ownFood(), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, adminController.deleteFood);
// Food approval queue (pending items created by restaurants)
router.get('/foods/pending-approvals', requireFoodResourceAccess('foods', 'foods'), foodApprovalController.getPendingFoodApprovals);
router.patch('/foods/:id/approve', requireFoodResourceAccess('foods', 'foods'), ownFood(), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, foodApprovalController.approveFoodItemController);
router.patch('/foods/:id/reject', requireFoodResourceAccess('foods', 'foods'), ownFood(), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, foodApprovalController.rejectFoodItemController);
router.post('/foods/bulk-approve', requireFoodResourceAccess('foods', 'foods'), ownRestaurantInBody('restaurantId'), async (req, res, next) => {
    try {
        const { invalidateCache } = await import('../../../../middleware/cache.js');
        await invalidateCache('restaurant_menu:*');
        await invalidateCache('restaurants:*');
        await invalidateCache('restaurant_detail:*');
    } catch (err) { console.error('Cache invalidation error', err); }
    next();
}, adminController.bulkApproveFoodItems);


// ----- Offers & Coupons -----
router.get('/offers', requireFoodResourceAccess('promotions', 'promotions'), adminController.getAllOffers);
router.post('/offers', requireFoodResourceAccess('promotions', 'promotions'), adminController.createAdminOffer);
router.patch('/offers/:id/cart-visibility', requireFoodResourceAccess('promotions', 'promotions'), adminController.updateAdminOfferCartVisibility);
router.delete('/offers/:id', requireFoodResourceAccess('promotions', 'promotions'), adminController.deleteAdminOffer);

// ----- Feedback Experience (Admin) -----
router.get('/feedback-experiences', requireFoodResourceAccess('reports', 'reports'), feedbackExperienceController.getFeedbackExperiences);
router.delete('/feedback-experiences/:id', requireFoodResourceAccess('reports', 'reports'), feedbackExperienceController.deleteFeedbackExperience);

// ----- Fee Settings -----
router.get('/fee-settings', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.getFeeSettings);
router.get('/order-cancellation-settings', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.getOrderCancellationSettings);
router.put('/order-cancellation-settings', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.updateOrderCancellationSettings);
router.put('/fee-settings', requireFoodResourceAccess('fee_settings', 'fee_settings'), adminController.createOrUpdateFeeSettings);

// ----- Referral Settings -----
router.get('/referral-settings', requireFoodResourceAccess('referrals', 'referrals'), adminController.getReferralSettings);
router.put('/referral-settings', requireFoodResourceAccess('referrals', 'referrals'), adminController.createOrUpdateReferralSettings);

// ----- Business Settings -----
router.get('/business-settings/public', businessSettingsController.getBusinessSettings); // Public endpoint
router.get('/business-settings', requireFoodResourceAccess('settings', 'settings'), businessSettingsController.getBusinessSettings);
router.patch('/business-settings', requireFoodResourceAccess('settings', 'settings'), upload.fields([
    { name: 'logo', maxCount: 1 },
    { name: 'userLogo', maxCount: 1 },
    { name: 'deliveryLogo', maxCount: 1 },
    { name: 'driverLogo', maxCount: 1 },
    { name: 'restaurantLogo', maxCount: 1 },
    { name: 'adminLogo', maxCount: 1 },
    { name: 'favicon', maxCount: 1 }
]), businessSettingsController.updateBusinessSettings);

// ----- Delivery Cash Limit -----
router.get('/delivery-cash-limit', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryCashLimit);
router.patch('/delivery-cash-limit', requireFoodResourceAccess('delivery', 'delivery'), adminController.updateDeliveryCashLimit);
router.get('/restaurant-withdrawal-setting', requireFoodResourceAccess('wallet', 'wallet'), adminController.getRestaurantWithdrawalSetting);
router.patch('/restaurant-withdrawal-setting', requireFoodResourceAccess('wallet', 'wallet'), adminController.updateRestaurantWithdrawalSetting);

// ----- Delivery Emergency Help -----
router.get('/delivery-emergency-help', requireFoodResourceAccess('delivery', 'delivery'), adminController.getEmergencyHelp);
router.put('/delivery-emergency-help', requireFoodResourceAccess('delivery', 'delivery'), adminController.createOrUpdateEmergencyHelp);

// ----- Withdrawals (admin) -----
router.get('/withdrawals', requireFoodResourceAccess('wallet', 'wallet'), adminController.getWithdrawals);
router.patch('/withdrawals/:id', requireFoodResourceAccess('wallet', 'wallet'), adminController.updateWithdrawalStatus);
router.get('/delivery/withdrawals', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryWithdrawals);
router.patch('/delivery/withdrawals/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.updateDeliveryWithdrawalStatus);
router.get('/delivery/cash-limit-settlements', requireFoodResourceAccess('delivery', 'delivery'), adminController.getCashLimitSettlements);

// ----- Delivery partners & general -----
router.get('/delivery/join-requests', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryJoinRequests);
router.get('/delivery/wallets', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryWallets);
router.get('/delivery/bonus-transactions', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryPartnerBonusTransactions);
router.get('/delivery/earnings', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryEarnings);
router.post('/delivery/bonus', requireFoodResourceAccess('delivery', 'delivery'), adminController.addDeliveryPartnerBonus);
router.get('/delivery/commission-rules', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryCommissionRules);
router.post('/delivery/commission-rules', requireFoodResourceAccess('delivery', 'delivery'), adminController.createDeliveryCommissionRule);
router.patch('/delivery/commission-rules/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.updateDeliveryCommissionRule);
router.delete('/delivery/commission-rules/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.deleteDeliveryCommissionRule);
router.patch('/delivery/commission-rules/:id/status', requireFoodResourceAccess('delivery', 'delivery'), adminController.toggleDeliveryCommissionRuleStatus);
router.get('/delivery/zone-surge', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryZoneSurgeConfigs);
router.put('/delivery/zone-surge', requireFoodResourceAccess('delivery', 'delivery'), adminController.upsertDeliveryZoneSurgeConfig);
router.patch('/delivery/zone-surge/:zoneId/status', requireFoodResourceAccess('delivery', 'delivery'), adminController.toggleDeliveryZoneSurgeStatus);
router.get('/delivery/reviews', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliverymanReviews);
router.get('/contact-messages', requireFoodResourceAccess('support', 'support'), adminController.getContactMessages);
router.get('/delivery/earning-addons', requireFoodResourceAccess('delivery', 'delivery'), adminController.getEarningAddons);
router.post('/delivery/earning-addons', requireFoodResourceAccess('delivery', 'delivery'), adminController.createEarningAddon);
router.patch('/delivery/earning-addons/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.updateEarningAddon);
router.delete('/delivery/earning-addons/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.deleteEarningAddon);
router.patch('/delivery/earning-addons/:id/status', requireFoodResourceAccess('delivery', 'delivery'), adminController.toggleEarningAddonStatus);
router.get('/delivery/earning-addon-history', requireFoodResourceAccess('delivery', 'delivery'), adminController.getEarningAddonHistory);
router.post('/delivery/earning-addon-history/:id/credit', requireFoodResourceAccess('delivery', 'delivery'), adminController.creditEarningToWallet);
router.post('/delivery/earning-addon-history/:id/cancel', requireFoodResourceAccess('delivery', 'delivery'), adminController.cancelEarningAddonHistory);
router.post('/delivery/earning-addon-completions/check', requireFoodResourceAccess('delivery', 'delivery'), adminController.checkEarningAddonCompletions);
router.get('/delivery/support-tickets/stats', requireFoodResourceAccess('delivery', 'delivery'), adminController.getSupportTicketStats);
router.get('/delivery/support-tickets', requireFoodResourceAccess('delivery', 'delivery'), adminController.getSupportTickets);
router.patch('/delivery/support-tickets/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.updateSupportTicket);
router.get('/delivery/partners', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryPartners);
router.get('/delivery/:id', requireFoodResourceAccess('delivery', 'delivery'), adminController.getDeliveryPartnerById);
router.patch('/delivery/:id/approve', requireFoodResourceAccess('delivery', 'delivery'), adminController.approveDeliveryPartner);
router.patch('/delivery/:id/reject', requireFoodResourceAccess('delivery', 'delivery'), adminController.rejectDeliveryPartner);
router.post('/delivery/:id/approve-emergency-offline', requireFoodResourceAccess('delivery', 'delivery'), adminController.approveEmergencyOfflineController);

// ----- Zones -----
router.get('/zones', requireFoodResourceAccess('zones', 'zones'), adminController.getZones);
router.get('/zones/:id', requireFoodResourceAccess('zones', 'zones'), adminController.getZoneById);
router.post('/zones', requireFoodResourceAccess('zones', 'zones'), adminController.createZone);
router.patch('/zones/:id', requireFoodResourceAccess('zones', 'zones'), adminController.updateZone);
router.delete('/zones/:id', requireFoodResourceAccess('zones', 'zones'), adminController.deleteZone);

// ----- Dining -----
router.get('/dining/categories', requireFoodResourceAccess('dining', 'dining'), diningAdminController.getDiningCategories);
router.post('/dining/categories', requireFoodResourceAccess('dining', 'dining'), diningAdminController.createDiningCategory);
router.patch('/dining/categories/:id', requireFoodResourceAccess('dining', 'dining'), diningAdminController.updateDiningCategory);
router.delete('/dining/categories/:id', requireFoodResourceAccess('dining', 'dining'), diningAdminController.deleteDiningCategory);
router.get('/dining/restaurants', requireFoodResourceAccess('dining', 'dining'), diningAdminController.getDiningRestaurants);
router.patch('/dining/restaurants/:restaurantId', requireFoodResourceAccess('dining', 'dining'), diningAdminController.updateDiningRestaurant);

// ----- Orders -----
router.get('/orders', requireFoodResourceAccess('orders', 'orders'), orderController.listOrdersAdminController);
router.get('/orders/handover-requests/pending', requireFoodResourceAccess('orders', 'orders'), orderController.listPendingHandoverRequestsAdminController);
router.get('/orders/:orderId', requireFoodResourceAccess('orders', 'orders'), ownOrder(), orderController.getOrderByIdAdminController);
router.post('/orders/:orderId/assign', requireFoodResourceAccess('orders', 'orders'), ownOrder(), orderController.assignDeliveryPartnerController);
router.post('/orders/:orderId/handover/approve', requireFoodResourceAccess('orders', 'orders'), ownOrder(), orderController.approveOrderHandoverAdminController);
router.post('/orders/:orderId/handover/reject', requireFoodResourceAccess('orders', 'orders'), ownOrder(), orderController.rejectOrderHandoverAdminController);
router.get('/orders/:orderId/available-partners', requireFoodResourceAccess('orders', 'orders'), ownOrder(), orderController.listAvailableDeliveryPartnersForOrderController);
router.delete('/orders/:orderId', requireFoodResourceAccess('orders', 'orders'), denyFranchise('Franchises cannot delete orders'), orderController.deleteOrderAdminController);
router.post('/orders/:orderId/cancel', requireFoodResourceAccess('orders', 'orders'), ownOrder(), orderController.cancelOrderAdminController);
// Refunds move real money: super admins only (a franchise login must never refund)
router.post('/orders/:orderId/refund', requireFoodResourceAccess('orders', 'orders'), (req, _res, next) => (isSuperAdminLike(req.adminContext) ? next() : next(new ForbiddenError('Only super admins can refund orders'))), adminController.processRefund);

// Manual Razorpay refund: the admin refunds in the Razorpay dashboard, then records it here (or asks the server to do it through the API)
const superAdminOnly = (req, _res, next) => (isSuperAdminLike(req.adminContext) ? next() : next(new ForbiddenError('Only super admins can refund orders')));
// A franchise partner may record the manual refund of ITS OWN zone's orders (ownOrder() blocks every other order)
const superAdminOrFranchise = (req, _res, next) => ((isSuperAdminLike(req.adminContext) || req.adminContext?.franchiseId) ? next() : next(new ForbiddenError('Only a super admin or the franchise of this order can record a refund')));
router.post('/orders/:orderId/refund/manual-done', requireFoodResourceAccess('orders', 'orders'), ownOrder(), superAdminOrFranchise, orderController.markRefundDoneAdminController);
router.post('/orders/:orderId/refund-request/decision', requireFoodResourceAccess('orders', 'orders'), superAdminOnly, adminController.decideRefundRequest);
router.post('/orders/:orderId/refund/via-api', requireFoodResourceAccess('orders', 'orders'), superAdminOnly, orderController.refundViaApiAdminController);

// ----- CMS Pages (About + legal) -----
// ----- Franchise Management -----
// Only platform / module super admins may manage franchises. A franchise login (or any sub-admin)
// must never reach these routes - they control commissions, fees and payouts.
router.use('/franchise', (req, _res, next) =>
    (isSuperAdminLike(req.adminContext)
        ? next()
        : next(new ForbiddenError('Only super admins can manage franchises'))));
// Money / configuration writes: platform super admin only, rate limited, audited in the services
const fin = [franchiseFinanceController.requireFinanceAdmin, financeWriteRateLimiter];
const F = franchiseFinanceController;

router.get('/franchise/applications/stats', franchiseAdminController.getStatsController);
router.get('/franchise/applications', franchiseAdminController.getApplicationsController);
router.post('/franchise/applications', fin, franchiseAdminController.createApplicationController);
router.get('/franchise/applications/:id', franchiseAdminController.getApplicationByIdController);
router.get('/franchise/applications/:id/analytics', franchiseAdminController.getAnalyticsController);
router.get('/franchise/applications/:id/overview', franchiseAdminController.getOverviewController);
router.get('/franchise/taxi-zones', franchiseAdminController.getTaxiZonesController);
router.get('/franchise/applications/:id/taxi/overview', franchiseAdminController.getTaxiOverviewController);
router.get('/franchise/applications/:id/taxi/rides', franchiseAdminController.getTaxiRidesController);
router.get('/franchise/applications/:id/taxi/drivers', franchiseAdminController.getTaxiDriversController);
router.get('/franchise/applications/:id/taxi/bus', franchiseAdminController.getTaxiBusController);
router.get('/franchise/applications/:id/restaurants', franchiseAdminController.getFranchiseRestaurantsController);
router.get('/franchise/applications/:id/orders', franchiseAdminController.getFranchiseOrdersController);
router.get('/franchise/applications/:id/ledger', franchiseAdminController.getFranchiseLedgerController);
router.patch('/franchise/applications/:id/profile', fin, franchiseAdminController.updateFranchiseProfileController);
router.post('/franchise/applications/:id/suspend', fin, franchiseAdminController.suspendFranchiseController);
router.post('/franchise/applications/:id/activate', fin, franchiseAdminController.activateFranchiseController);
router.post('/franchise/applications/:id/terminate', fin, franchiseAdminController.terminateFranchiseController);
router.post('/franchise/applications/:id/restore', fin, franchiseAdminController.restoreFranchiseController);
router.post('/franchise/applications/:id/territory', fin, franchiseAdminController.changeTerritoryController);
router.patch('/franchise/applications/:id/status', fin, franchiseAdminController.updateStatusController);
router.post('/franchise/applications/:id/requests/:requestId', fin, franchiseAdminController.decideFranchiseRequestController);
router.post('/franchise/applications/:id/subadmin', fin, franchiseAdminController.syncSubAdminController);
router.patch('/franchise/applications/:id/commission', fin, franchiseAdminController.updateCommissionController);
router.post('/franchise/applications/:id/support-messages/:messageId/reply', franchiseAdminController.replySupportMessageController);
router.patch('/franchise/applications/:id/payout-requests/:requestId', fin, franchiseAdminController.updatePayoutRequestStatusController);
router.patch('/franchise/applications/:id/refund-requests/:refundId', fin, franchiseAdminController.updateRefundClaimStatusController);
router.delete('/franchise/applications/:id', fin, franchiseAdminController.deleteApplicationController);

router.get('/franchise/form-config', franchiseAdminController.getFormConfigController);
router.put('/franchise/form-config', fin, franchiseAdminController.updateFormConfigController);

// ----- Franchise finance (earnings, commission, fees, deposit) -----
router.get('/franchise/finance/summary', F.getFinanceSummary);
router.get('/franchise/applications/:id/finance', F.getFranchiseFinance);
router.get('/franchise/applications/:id/finance/entries', F.getFinanceEntries);
router.get('/franchise/applications/:id/charges', F.listCharges);
router.get('/franchise/applications/:id/commission/effective', F.getEffectiveRates);
router.get('/franchise/applications/:id/audit', F.getAuditLog);
router.get('/franchise/applications/:id/reconcile', F.getReconciliation);
router.post('/franchise/applications/:id/reconcile', fin, F.fixReconciliation);
router.post('/franchise/charges/:chargeId/confirm-payment', fin, F.confirmChargePayment);
router.post('/franchise/charges/:chargeId/waive', fin, F.waiveCharge);
router.patch('/franchise/charges/:chargeId', fin, F.updateChargeAmount);
router.post('/franchise/charges/:chargeId/refund', fin, F.refundDeposit);
router.post('/franchise/charges/:chargeId/deduct', fin, F.deductDeposit);
router.get('/franchise/commission-rules/:scope', F.listRuleVersions);
router.get('/franchise/commission-rules/:scope/:scopeId', F.listRuleVersions);
router.post('/franchise/commission-rules/:scope', fin, F.createRuleVersion);
router.post('/franchise/commission-rules/:scope/:scopeId', fin, F.createRuleVersion);
router.get('/franchise/territories', F.listTerritories);
router.get('/franchise/territories/zones', F.listZoneOptions);
router.post('/franchise/territories', fin, F.createTerritory);
router.patch('/franchise/territories/:territoryId', fin, F.updateTerritory);

router.get('/pages-social-media/:key', getAdminPageController);
router.put('/pages-social-media/:key', upsertAdminPageController);

router.get('/sidebar-badges', adminController.getSidebarBadges);
router.get('/notifications/fssai-expired', adminController.getExpiredFssaiNotifications);

export default router;
