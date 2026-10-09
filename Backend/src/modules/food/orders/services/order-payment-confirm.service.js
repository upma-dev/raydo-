import { FoodOrder } from '../models/order.model.js';
import { logger } from '../../../../utils/logger.js';
import * as foodTransactionService from './foodTransaction.service.js';
import { notifyOwnersSafely, notifyRestaurantNewOrder, emitOrderStatusSocket } from './order.helpers.js';
import { refundOrderPayment } from './order-cancel.service.js';

/**
 * The ONE place that turns "Razorpay says this order is paid" into "order confirmed".
 * Called by BOTH the app's verify call and the Razorpay webhook, in any order and any number of times:
 *   1. mark the payment paid                  (atomic, only the first caller changes it)
 *   2. move pending_payment -> created        (atomic, only ONE caller wins and runs the side effects)
 *   3. record the capture in the finance book (idempotent)
 *   4. tell the restaurant + the customer     (only by the caller that won step 2)
 * If the customer paid for an order that was already cancelled in the meantime, the money is refunded.
 */
export async function confirmOrderPaid(orderId, { paymentId, signature = '', byRole = 'SYSTEM', byId = null, source = 'verify' } = {}) {
  const startedAs = await FoodOrder.findById(orderId).select('orderStatus payment userId').lean();
  if (!startedAs) return null;

  // 1. payment -> paid
  const paidNow = await FoodOrder.updateOne(
    { _id: orderId, 'payment.status': { $ne: 'paid' }, 'payment.refund.status': { $ne: 'processed' } },
    { $set: { 'payment.status': 'paid', 'payment.razorpay.paymentId': paymentId, ...(signature ? { 'payment.razorpay.signature': signature } : {}) } },
  );

  // 2. pending_payment -> created (only one caller wins)
  const moved = await FoodOrder.updateOne(
    { _id: orderId, orderStatus: 'pending_payment' },
    {
      $set: { orderStatus: 'created' },
      $push: { statusHistory: { at: new Date(), byRole, byId: byId || undefined, from: 'pending_payment', to: 'created', note: `Payment confirmed (${source})` } },
    },
  );

  const order = await FoodOrder.findById(orderId);

  // Paid after the order was already cancelled (customer left the Razorpay window open): give the money back
  if (String(order.orderStatus).startsWith('cancelled')) {
    if (paidNow.modifiedCount) {
      logger.warn(`[PaymentConfirm] Order ${order._id} was already cancelled when payment arrived; refunding.`);
      await refundOrderPayment(order._id, { reasonText: 'Payment received after the order was cancelled' });
    }
    return order;
  }

  // 3. finance book
  if (paidNow.modifiedCount || moved.modifiedCount) {
    try {
      await foodTransactionService.updateTransactionStatus(order._id, 'captured', {
        status: 'captured',
        razorpayPaymentId: paymentId,
        ...(signature ? { razorpaySignature: signature } : {}),
        note: `Payment confirmed (${source})`,
        recordedByRole: byRole,
        recordedById: byId || undefined,
      });
    } catch (err) {
      logger.error(`[PaymentConfirm] Ledger update failed for order ${order._id}: ${err?.message || err}`);
    }
  }

  // 4. side effects, exactly once
  if (moved.modifiedCount) {
    const scheduledForLater = Boolean(order.scheduledAt) && (new Date(order.scheduledAt).getTime() - Date.now() > 35 * 60 * 1000);
    try {
      if (!scheduledForLater) await notifyRestaurantNewOrder(order);   // scheduled orders are sent later by the scheduler
      await notifyOwnersSafely([{ ownerType: 'USER', ownerId: order.userId }], {
        title: 'Payment Successful! ✅',
        body: `We have received your payment of ₹${order.payment?.amountDue ?? order.pricing?.total} for Order #${order.order_id || order._id}.`,
        data: { type: 'payment_success', orderId: String(order._id), orderMongoId: String(order._id) },
      });
      emitOrderStatusSocket({ userId: order.userId }, {
        orderMongoId: order._id.toString(),
        orderId: order.order_id || order._id.toString(),
        orderStatus: order.orderStatus,
        title: 'Payment Successful!',
        message: `We have received your payment for Order #${order.order_id || order._id}.`,
      });
    } catch (err) {
      logger.warn(`[PaymentConfirm] Notifications failed for order ${order._id}: ${err?.message || err}`);
    }
  }

  return order;
}
