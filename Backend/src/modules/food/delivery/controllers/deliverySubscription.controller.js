import { sendResponse } from '../../../../utils/response.js';
import {
    createPartnerSubscriptionPaymentOrder,
    getPartnerSubscriptionState,
    purchasePartnerSubscription,
    verifyPartnerSubscriptionPayment,
} from '../services/deliverySubscription.service.js';

/** Step 1 of paying online (Google Pay / PhonePe / UPI / card): creates the Razorpay order for a plan */
export const createSubscriptionPaymentOrderController = async (req, res, next) => {
    try {
        const data = await createPartnerSubscriptionPaymentOrder({ partnerId: req.user?.userId, planId: req.body?.planId });
        return sendResponse(res, 201, 'Payment order created', data);
    } catch (error) {
        next(error);
    }
};

/** Step 2: checks the payment with Razorpay and activates the pass */
export const verifySubscriptionPaymentController = async (req, res, next) => {
    try {
        const data = await verifyPartnerSubscriptionPayment(req.user?.userId, {
            razorpayOrderId: req.body?.razorpay_order_id,
            razorpayPaymentId: req.body?.razorpay_payment_id,
            razorpaySignature: req.body?.razorpay_signature,
        });
        return sendResponse(
            res,
            200,
            data.startsLater ? 'Payment received. Your pass starts when the current one ends.' : 'Payment received. Subscription activated.',
            data,
        );
    } catch (error) {
        next(error);
    }
};

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
