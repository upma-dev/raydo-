import express from 'express';
import mongoose from 'mongoose';
import {
    getPaymentHistoryController,
    getOrderTransactionsController,
    getUserWalletBalanceController,
    getUserWalletTransactionsController,
    getRestaurantWalletController,
    getDeliveryWalletController,
    getAdminWalletController,
    getAdminFinanceSummaryController,
    listSettlementsController,
    createSettlementController,
    processSettlementController,
    listRefundsController,
    getRefundsByOrderController
} from './payment.controller.js';
import { sendError } from '../../utils/response.js';
import { isSuperAdminLike } from '../admin/adminHierarchy.service.js';

const router = express.Router();

/**
 * ACCESS RULES (this router is mounted with login only, so every route must check who is asking).
 *  - /admin/*              super admins only (these move and reveal platform money)
 *  - wallet of a restaurant / delivery partner: that restaurant / partner themselves, or a super admin
 *  - an order's payments / transactions / refunds: the customer, restaurant or rider of THAT order, or a super admin
 *  - own user wallet: the customer only
 */
const roleOf = (req) => String(req.user?.role || '').toUpperCase();
const isAdminToken = (req) => ['ADMIN', 'SUPERADMIN', 'SUPER_ADMIN', 'SUBADMIN'].includes(roleOf(req));

const loadAdmin = async (req) => {
    if (!isAdminToken(req)) return null;
    if (req.__admin !== undefined) return req.__admin;
    const FoodAdmin = mongoose.model('FoodAdmin');
    req.__admin = await FoodAdmin.findById(req.user?.id).lean();
    return req.__admin;
};

const requireSuperAdmin = async (req, res, next) => {
    try {
        const admin = await loadAdmin(req);
        if (!admin || admin.isActive === false || admin.active === false || admin.status === 'inactive' || !isSuperAdminLike(admin)) {
            return sendError(res, 403, 'Only super admins can access this');
        }
        return next();
    } catch (err) {
        return next(err);
    }
};

const requireOwnWallet = (roleName, paramName) => async (req, res, next) => {
    try {
        if (roleOf(req) === roleName) {
            // They may only ever see their own wallet, whatever id they put in the URL
            if (String(req.params[paramName]) !== String(req.user?.id)) return sendError(res, 403, 'You can only view your own wallet');
            return next();
        }
        return requireSuperAdmin(req, res, next);
    } catch (err) {
        return next(err);
    }
};

const requireOrderParticipant = async (req, res, next) => {
    try {
        const { orderId } = req.params;
        if (!mongoose.Types.ObjectId.isValid(orderId)) return sendError(res, 400, 'Invalid order id');

        const admin = await loadAdmin(req);
        if (admin && isSuperAdminLike(admin)) return next();

        const order = await mongoose.model('FoodOrder').findById(orderId).select('userId restaurantId dispatch.deliveryPartnerId').lean();
        if (!order) return sendError(res, 404, 'Order not found');

        const me = String(req.user?.id || '');
        const role = roleOf(req);
        const allowed =
            (role === 'USER' && String(order.userId) === me) ||
            (role === 'RESTAURANT' && String(order.restaurantId) === me) ||
            (role === 'DELIVERY_PARTNER' && String(order.dispatch?.deliveryPartnerId || '') === me);
        return allowed ? next() : sendError(res, 403, 'You are not part of this order');
    } catch (err) {
        return next(err);
    }
};

const requireCustomer = (req, res, next) =>
    (roleOf(req) === 'USER' ? next() : sendError(res, 403, 'Only customers have this wallet'));

// ─── Payment history for an order ───
router.get('/orders/:orderId/payments', requireOrderParticipant, getPaymentHistoryController);
router.get('/orders/:orderId/transactions', requireOrderParticipant, getOrderTransactionsController);
router.get('/orders/:orderId/refunds', requireOrderParticipant, getRefundsByOrderController);

// ─── User wallet ───
router.get('/wallet/balance', requireCustomer, getUserWalletBalanceController);
router.get('/wallet/transactions', requireCustomer, getUserWalletTransactionsController);

// ─── Restaurant wallet ───
router.get('/restaurant/:restaurantId/wallet', requireOwnWallet('RESTAURANT', 'restaurantId'), getRestaurantWalletController);

// ─── Delivery partner wallet ───
router.get('/delivery/:deliveryPartnerId/wallet', requireOwnWallet('DELIVERY_PARTNER', 'deliveryPartnerId'), getDeliveryWalletController);

// ─── Admin / Finance (super admins only) ───
router.get('/admin/wallet', requireSuperAdmin, getAdminWalletController);
router.get('/admin/finance/summary', requireSuperAdmin, getAdminFinanceSummaryController);
router.get('/admin/settlements', requireSuperAdmin, listSettlementsController);
router.post('/admin/settlements', requireSuperAdmin, createSettlementController);
router.post('/admin/settlements/:id/process', requireSuperAdmin, processSettlementController);
router.get('/admin/refunds', requireSuperAdmin, listRefundsController);

export default router;
