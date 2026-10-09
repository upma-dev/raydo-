import crypto from 'crypto';
import mongoose from 'mongoose';
import { FoodOrder } from '../../../modules/food/orders/models/order.model.js';
import { confirmOrderPaid } from '../../../modules/food/orders/services/order-payment-confirm.service.js';
import { config } from '../../../config/env.js';
import { logger } from '../../../utils/logger.js';

/**
 * ✅ NEW: Centralized Razorpay Webhook Handler (Core Layer)
 * Manages atomic updates for order payments and refunds across all modules.
 */
export const handleRazorpayWebhook = async (req, res) => {
    const signature = req.headers['x-razorpay-signature'];
    const secret = config.razorpayWebhookSecret;

    // 1. Verify Signature using raw body buffer
    if (!signature || !secret || !req.rawBody) {
        logger.warn('Razorpay Webhook: Missing signature or rawBody buffer.');
        return res.status(400).send('Invalid signature');
    }

    const expected = crypto
        .createHmac('sha256', secret)
        .update(req.rawBody)
        .digest('hex');

    if (expected !== signature) {
        logger.warn('Razorpay Webhook: Signature verification failed.');
        return res.status(400).send('Invalid signature');
    }

    const { event, payload } = req.body;
    logger.info(`Razorpay Webhook Received: ${event}`);

    try {
        // --- 🟢 Handle Payment Captured (Success) ---
        if (event === 'payment.captured') {
            const paymentObj = payload.payment.entity;
            const rzOrderId = paymentObj.order_id;
            const rzPaymentId = paymentObj.id;

            // Find the order this Razorpay order belongs to
            const found = await FoodOrder.findOne({ "payment.razorpay.orderId": rzOrderId }).select('_id pricing.total payment.status orderStatus').lean();

            if (!found) {
                logger.warn(`Webhook [payment.captured]: No food order for RZ-Order: ${rzOrderId}`);
            } else if (Math.round((Number(found.pricing?.total) || 0) * 100) !== Number(paymentObj.amount)) {
                // Never confirm an order for a different amount than it costs
                logger.error(`Webhook [payment.captured]: AMOUNT MISMATCH for order ${found._id}: expected ${Math.round((Number(found.pricing?.total) || 0) * 100)} paise, got ${paymentObj.amount}`);
            } else {
                // Same engine as the app's verify call: marks paid, moves the order forward, tells the restaurant.
                // Runs safely whichever of the two (webhook / app) arrives first, and any number of times.
                const order = await confirmOrderPaid(found._id, { paymentId: rzPaymentId, byRole: 'SYSTEM', source: 'webhook' });
                logger.info(`Webhook [payment.captured]: Synced Order ${order?.order_id || found._id} (Status=${order?.orderStatus})`);
            }
        }

        // --- 🔴 Handle Refund Processed ---
        if (event === 'refund.processed') {
            const refundObj = payload.refund.entity;
            const rzPaymentId = refundObj.payment_id;
            const rzRefundId = refundObj.id;
            const refundAmount = refundObj.amount / 100; // to major unit

            // Sync refund fields in the order
            const order = await FoodOrder.findOneAndUpdate(
                { 
                    "payment.razorpay.paymentId": rzPaymentId,
                    "payment.refund.status": { $ne: 'processed' }
                },
                { 
                    $set: { 
                        "payment.status": 'refunded',
                        "payment.refund": {
                            status: 'processed',
                            amount: refundAmount,
                            refundId: rzRefundId,
                            processedAt: new Date()
                        }
                    } 
                },
                { new: true }
            );

            if (order) {
                logger.info(`Webhook [refund.processed]: Synced Order ${order.orderId} (Refunded)`);
            } else {
                // ✅ ADDED: Log warn if order not found for refund
                logger.warn(`Webhook [refund.processed]: Order not found or already refunded for RZ-Payment: ${rzPaymentId}`);
            }
        }

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        logger.error(`Razorpay Webhook Logic Error: ${err.message}`);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
