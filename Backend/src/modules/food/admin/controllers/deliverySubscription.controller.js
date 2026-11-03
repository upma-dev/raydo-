import { sendResponse } from '../../../../utils/response.js';
import {
    cancelPartnerSubscription,
    createDeliverySubscriptionPlan,
    getDeliverySubscriptionAdminOverview,
    grantPartnerSubscription,
    listPartnerSubscribersForAdmin,
    updateDeliverySubscriptionModes,
    updateDeliverySubscriptionPlan,
} from '../../delivery/services/deliverySubscription.service.js';

const wrap = (fn) => async (req, res, next) => {
    try {
        await fn(req, res);
    } catch (error) {
        next(error);
    }
};

/** Modes (food / ride / parcel) + every plan, for the admin Delivery Subscription page */
export const getOverview = wrap(async (_req, res) =>
    sendResponse(res, 200, 'Delivery subscription settings fetched', await getDeliverySubscriptionAdminOverview()));

export const updateModes = wrap(async (req, res) =>
    sendResponse(res, 200, 'Subscription modes updated', { modes: await updateDeliverySubscriptionModes(req.body || {}) }));

export const createPlan = wrap(async (req, res) =>
    sendResponse(res, 201, 'Subscription plan created', await createDeliverySubscriptionPlan(req.body || {})));

export const updatePlan = wrap(async (req, res) =>
    sendResponse(res, 200, 'Subscription plan updated', await updateDeliverySubscriptionPlan(req.params.id, req.body || {})));

export const listSubscribers = wrap(async (req, res) =>
    sendResponse(res, 200, 'Subscribers fetched', await listPartnerSubscribersForAdmin(req.query || {})));

export const grantSubscription = wrap(async (req, res) =>
    sendResponse(res, 201, 'Subscription given to the partner', await grantPartnerSubscription({
        partnerId: req.body?.partnerId,
        phone: req.body?.phone,
        planId: req.body?.planId,
        adminId: req.user?.userId || req.user?.id || req.user?._id || null,
    })));

export const cancelSubscription = wrap(async (req, res) =>
    sendResponse(res, 200, 'Subscription cancelled', await cancelPartnerSubscription(req.params.id, req.body?.reason)));
