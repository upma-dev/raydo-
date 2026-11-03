import { sendResponse } from '../../../../utils/response.js';
import { getPartnerSubscriptionState, purchasePartnerSubscription } from '../services/deliverySubscription.service.js';

export const getMySubscriptionsController = async (req, res, next) => {
    try {
        const data = await getPartnerSubscriptionState(req.user?.userId);
        return sendResponse(res, 200, 'Subscriptions fetched', data);
    } catch (error) {
        next(error);
    }
};

export const purchaseSubscriptionController = async (req, res, next) => {
    try {
        const data = await purchasePartnerSubscription({ partnerId: req.user?.userId, planId: req.body?.planId });
        return sendResponse(
            res,
            201,
            data.startsLater ? 'Subscription renewed. It starts when your current plan ends.' : 'Subscription activated.',
            data,
        );
    } catch (error) {
        next(error);
    }
};
