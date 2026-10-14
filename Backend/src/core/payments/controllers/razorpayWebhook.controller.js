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

            // A refund our own API call is still finishing ('pending') is completed by that call, not here.
            const order = await FoodOrder.findOne({
                "payment.razorpay.paymentId": rzPaymentId,
                "payment.refund.refundId": { $ne: rzRefundId },
                "payment.refund.status": { $ne: 'pending' },
            });

            if (order) {
                const total = Math.round((Number(order.pricing?.total) || 0) * 100) / 100;
                const prev = Number(order.payment?.refund?.refundedTotal || (order.payment?.refund?.status === 'processed' ? order.payment.refund.amount : 0)) || 0;
                const newTotal = Math.round((prev + refundAmount) * 100) / 100;
                const isFull = newTotal >= total;
                const done = await FoodOrder.updateOne(
                    { _id: order._id, "payment.refund.refundId": { $ne: rzRefundId }, "payment.refund.status": { $ne: 'pending' } },
                    { $set: {
                        ...(isFull ? { "payment.status": 'refunded' } : {}),
                        "payment.refund.status": 'processed',
                        "payment.refund.amount": refundAmount,
                        "payment.refund.refundedTotal": newTotal,
                        "payment.refund.refundId": rzRefundId,
                        "payment.refund.processedAt": new Date(),
                    } },
                );
                if (done.modifiedCount) {
                    logger.info(`Webhook [refund.processed]: Synced Order ${order.order_id || order._id} (refunded ${newTotal}/${total})`);
                    try {
                        const { applyRefundBooks } = await import('../../../modules/food/orders/services/order-cancel.service.js');
                        const { notifyOwnersSafely } = await import('../../../modules/food/orders/services/order.helpers.js');
                        await applyRefundBooks(order._id, { refundAmount, refundedTotal: newTotal, deductFromRestaurant: Boolean(order.payment?.refund?.deductFromRestaurant) });
                        await notifyOwnersSafely([{ ownerType: 'USER', ownerId: order.userId }], {
                            title: 'Refund Processed! 💸',
                            body: `Your refund of ₹${refundAmount} for order #${order.order_id || order._id} has been sent to your original payment method. It can take 5-7 working days to show.`,
                            data: { type: 'refund_processed', orderId: String(order.order_id || order._id), orderMongoId: String(order._id) },
                        });
                    } catch (e) {
                        logger.warn(`Webhook [refund.processed]: books/notification failed for ${order._id}: ${e?.message || e}`);
                    }
                }
            } else {
                logger.warn(`Webhook [refund.processed]: Order not found or already synced for RZ-Payment: ${rzPaymentId}`);
            }
        }

        // --- 🔴 Handle Refund Failed (Razorpay accepted the refund, then the bank / UPI side rejected it) ---
        if (event === 'refund.failed') {
            const refundObj = payload.refund.entity;
            const rzRefundId = refundObj.id;
            const refundAmount = refundObj.amount / 100;
            const order = await FoodOrder.findOne({ "payment.razorpay.paymentId": refundObj.payment_id, "payment.refund.refundId": rzRefundId });
            if (order && order.payment?.refund?.status === 'processed') {
                const back = Math.max(0, Math.round(((Number(order.payment.refund.refundedTotal) || 0) - refundAmount) * 100) / 100);
                // Open the refund again so the admin can retry it (refund button / "refund via API" / manual-done)
                await FoodOrder.updateOne(
                    { _id: order._id, "payment.refund.refundId": rzRefundId, "payment.refund.status": 'processed' },
                    { $set: {
                        ...(order.payment.status === 'refunded' ? { "payment.status": 'paid' } : {}),
                        "payment.refund.status": 'failed',
                        "payment.refund.refundedTotal": back,
                        "payment.refund.amount": refundAmount,
                    } },
                );
                logger.error(`Webhook [refund.failed]: Order ${order.order_id || order._id} refund ${rzRefundId} FAILED at Razorpay`);
                try {
                    const { notifyAdminsSafely } = await import('../../../modules/food/orders/services/order.helpers.js');
                    await notifyAdminsSafely({
                        title: 'Refund failed at Razorpay',
                        body: `Order #${order.order_id || order._id}: the refund of ₹${refundAmount} (${rzRefundId}) failed. Retry it or refund manually.`,
                        data: { type: 'refund_failed', orderMongoId: String(order._id) },
                    });
                } catch (e) {
                    logger.warn(`Webhook [refund.failed]: admin notice failed: ${e?.message || e}`);
                }
            }
        }

        res.status(200).json({ status: 'ok' });
    } catch (err) {
        logger.error(`Razorpay Webhook Logic Error: ${err.message}`);
        res.status(500).json({ message: 'Internal Server Error' });
    }
};
