import { FoodTransaction } from '../models/foodTransaction.model.js';
import { FoodRestaurantCommission } from '../../admin/models/restaurantCommission.model.js';
import { recordTransaction, DuplicateTransactionError } from '../../../../core/payments/transaction.service.js';
import { Transaction } from '../../../../core/payments/models/transaction.model.js';
import { logger } from '../../../../utils/logger.js';
import mongoose from 'mongoose';

const RESTAURANT_COMMISSION_CACHE_MS = 60 * 1000;
let restaurantCommissionRulesCache = null;
let restaurantCommissionRulesLoadedAt = 0;

async function getActiveRestaurantCommissionRules() {
    const now = Date.now();
    if (
        restaurantCommissionRulesCache &&
        now - restaurantCommissionRulesLoadedAt < RESTAURANT_COMMISSION_CACHE_MS
    ) {
        return restaurantCommissionRulesCache;
    }

    const list = await FoodRestaurantCommission.find({
        status: { $ne: false },
    }).lean();
    restaurantCommissionRulesCache = list || [];
    restaurantCommissionRulesLoadedAt = now;
    return restaurantCommissionRulesCache;
}

export function computeRestaurantCommissionAmount(baseAmount, rule) {
    const safeBase = Math.max(0, Number(baseAmount) || 0);
    if (!Number.isFinite(safeBase) || safeBase < 0) return 0;

    const commissionType = rule?.defaultCommission?.type || 'percentage';
    const commissionValue = Math.max(
        0,
        Number(rule?.defaultCommission?.value ?? 0) || 0
    );

    let commissionAmount = 0;
    if (commissionType === 'percentage') {
        commissionAmount = safeBase * (commissionValue / 100);
    } else if (commissionType === 'amount') {
        commissionAmount = commissionValue;
    }

    // Round to 2 decimals and clamp to [0, base]
    commissionAmount = Math.round((commissionAmount || 0) * 100) / 100;
    commissionAmount = Math.max(0, Math.min(commissionAmount, safeBase));

    return { commissionAmount, commissionType, commissionValue, baseAmount: safeBase };
}

export async function getRestaurantCommissionSnapshot(orderDoc) {
    const baseAmount = Number(orderDoc?.pricing?.subtotal ?? 0) || 0;
    const restaurantIdRaw =
        orderDoc?.restaurantId?._id ?? orderDoc?.restaurantId ?? null;

    if (!restaurantIdRaw) {
        return {
            commissionAmount: 0,
            commissionType: 'percentage',
            commissionValue: 0,
            baseAmount,
        };
    }

    const rules = await getActiveRestaurantCommissionRules();
    const rule =
        rules.find((r) => String(r.restaurantId) === String(restaurantIdRaw)) ||
        // Fallback: accept legacy docs where restaurantId may be stored under `restaurant` / `restaurant_id`
        rules.find((r) => String(r.restaurant || r.restaurant_id || '') === String(restaurantIdRaw)) ||
        null;

    // No rule set in Admin > Restaurant Commission = no commission. (A hidden 10% used to apply here.)
    // To charge a platform-wide default without a per-restaurant rule, set DEFAULT_RESTAURANT_COMMISSION_PERCENT in .env.
    const fallbackPercent = Math.min(100, Math.max(0, Number(process.env.DEFAULT_RESTAURANT_COMMISSION_PERCENT) || 0));
    const effectiveRule = rule || {
        defaultCommission: { type: 'percentage', value: fallbackPercent }
    };

    return computeRestaurantCommissionAmount(baseAmount, effectiveRule);
}

/**
 * Creates an initial 'pending' transaction when an order is created.
 */
export async function createInitialTransaction(order) {
    if (!order) return null;

    const { commissionAmount = 0 } = await getRestaurantCommissionSnapshot(order).catch(() => ({ commissionAmount: 0 }));

    // Split logic - Ensure all values are finite numbers
    const totalCustomerPaid = Number(order.pricing?.total) || 0;
    const riderShare = Number(order.riderTotalPayout) || Number(order.riderEarning) || 0;

    // Prefer commission already computed & stored on the order (source of truth for this order),
    // fallback to rule snapshot for older orders.
    const restaurantCommissionFromOrder = Number(order.pricing?.restaurantCommission);
    const restaurantCommission =
        Number.isFinite(restaurantCommissionFromOrder) && restaurantCommissionFromOrder > 0
            ? restaurantCommissionFromOrder
            : (Number(commissionAmount) || 0);

    const discount = Number(order.pricing?.discount) || 0;
    const subtotal = Number(order.pricing?.subtotal) || 0;
    const packagingFee = Number(order.pricing?.packagingFee) || 0;
    const platformFee = Number(order.pricing?.platformFee) || 0;
    const deliveryFee = Number(order.pricing?.deliveryFee) || 0;
    const adminDeliveryCommissionEnabled = order.pricing?.adminDeliveryCommissionEnabled === true;
    const adminDeliveryCommissionPercent = Number(order.pricing?.adminDeliveryCommissionPercent) || 0;
    const adminDeliveryCommissionAmount = Number(order.pricing?.adminDeliveryCommissionAmount) || 0;
    const riderDeliveryEarningAfterAdminCommission = Number(order.pricing?.riderDeliveryEarningAfterAdminCommission) || deliveryFee;
    const deliveryPartnerIncentiveEnabled = order.pricing?.deliveryPartnerIncentiveEnabled === true;
    const deliveryPartnerIncentivePercent = Number(order.pricing?.deliveryPartnerIncentivePercent) || 0;
    const deliveryPartnerIncentiveAmount = Number(order.pricing?.deliveryPartnerIncentiveAmount) || 0;
    const deliveryPartnerIncentiveEligible = order.pricing?.deliveryPartnerIncentiveEligible === true;
    const surgeAmount = Number(order.pricing?.surgeAmount) || 0;
    const tax = Number(order.pricing?.tax) || 0;
    const riderBasePay = Number(order.riderBasePay) || Number(order.pricing?.deliveryFeeBreakdown?.basePayout) || 0;
    const riderDeliveryFeeShare = Number(order.riderDeliveryFeeShare) || riderDeliveryEarningAfterAdminCommission;
    const riderSurgePay = Number(order.riderSurgePay) || surgeAmount;
    const riderIncentivePay = Number(order.riderIncentivePay) || deliveryPartnerIncentiveAmount;
    const riderTotalPayout =
        Number(order.riderTotalPayout) ||
        Number(order.riderEarning) ||
        Math.round((riderDeliveryFeeShare + riderSurgePay + riderIncentivePay) * 100) / 100;

    let restaurantNet = subtotal + packagingFee - restaurantCommission;
    // Admin ONLY gets platform fee + restaurant commission (delivery fee, surge & tip go 100% directly to delivery partner)
    let platformNetProfit = platformFee + restaurantCommission;

    // Handle discount attribution
    const couponCode = order.pricing?.couponCode;
    if (discount > 0 && couponCode) {
        try {
            // Dynamic import to avoid circular dependency if any
            const { FoodOffer } = await import('../../admin/models/offer.model.js');
            const offer = await FoodOffer.findOne({ couponCode: String(couponCode).toUpperCase() }).lean();
            if (offer?.createdByRole === 'RESTAURANT') {
                restaurantNet -= discount;
            } else {
                // Admin created (default) or not found
                platformNetProfit -= discount;
            }
        } catch (err) {
            // Log but don't fail, default to admin attribution
            platformNetProfit -= discount;
        }
    }

    // The rider incentive is paid to the rider on top of the delivery fee, but the customer is NOT charged for it
    // (it is not part of pricing.total). So it is a platform cost and must come out of the platform's profit,
    // otherwise the books (and the franchise commission base) show money the platform never kept.
    platformNetProfit -= riderIncentivePay;

    // Ensure nets are finite and rounded
    restaurantNet = Math.round((Number(restaurantNet) || 0) * 100) / 100;
    const platformNetRaw = Math.round((Number(platformNetProfit) || 0) * 100) / 100;
    platformNetProfit = Math.max(0, platformNetRaw);
    // A platform-funded discount / incentive bigger than the platform's income is a real loss: keep it visible
    // instead of silently clamping it to zero.
    const platformShortfall = platformNetRaw < 0 ? Math.round(-platformNetRaw * 100) / 100 : 0;

    const transaction = new FoodTransaction({
        orderId: order._id,
        userId: order.userId,
        restaurantId: order.restaurantId,
        deliveryPartnerId: order.dispatch?.deliveryPartnerId,
        paymentMethod: order.payment?.method || 'cash',
        status: order.payment?.status === 'paid' ? 'captured' : 'pending',
        payment: {
            method: String(order.payment?.method || 'cash'),
            status: String(order.payment?.status || 'cod_pending'),
            amountDue: Number(order.payment?.amountDue ?? totalCustomerPaid) || 0,
            razorpay: {
                orderId: String(order.payment?.razorpay?.orderId || ''),
                paymentId: String(order.payment?.razorpay?.paymentId || ''),
                signature: String(order.payment?.razorpay?.signature || ''),
            },
            qr: {
                qrId: String(order.payment?.qr?.qrId || ''),
                imageUrl: String(order.payment?.qr?.imageUrl || ''),
                paymentLinkId: String(order.payment?.qr?.paymentLinkId || ''),
                shortUrl: String(order.payment?.qr?.shortUrl || ''),
                status: String(order.payment?.qr?.status || ''),
                expiresAt: order.payment?.qr?.expiresAt || null,
            }
        },
        pricing: {
            subtotal: subtotal,
            tax: tax,
            packagingFee: packagingFee,
            deliveryFee: deliveryFee,
            deliveryFeeBreakdown: order.pricing?.deliveryFeeBreakdown || null,
            adminDeliveryCommissionEnabled,
            adminDeliveryCommissionPercent,
            adminDeliveryCommissionAmount,
            riderDeliveryEarningAfterAdminCommission,
            deliveryPartnerIncentiveEnabled,
            deliveryPartnerIncentivePercent,
            deliveryPartnerIncentiveAmount,
            deliveryPartnerIncentiveEligible,
            platformFee: platformFee,
            surgeAmount: surgeAmount,
            restaurantCommission: restaurantCommission,
            discount: discount,
            total: totalCustomerPaid,
            currency: String(order.pricing?.currency || order.currency || 'INR'),
        },
        amounts: {
            totalCustomerPaid: totalCustomerPaid,
            restaurantShare: Math.max(0, restaurantNet),
            restaurantCommission: restaurantCommission,
            riderShare: riderTotalPayout,
            riderDeliveryFeeShare: riderDeliveryFeeShare,
            adminDeliveryCommissionAmount: adminDeliveryCommissionAmount,
            riderBasePay: riderBasePay,
            riderSurgePay: riderSurgePay,
            riderIncentivePay: riderIncentivePay,
            riderTotalPayout: riderTotalPayout,
            platformNetProfit: platformNetProfit,
            platformShortfall: platformShortfall,
            taxAmount: tax
        },
        gateway: {
            razorpayOrderId: order.payment?.razorpay?.orderId,
            qrUrl: order.payment?.qr?.imageUrl
        },
        history: [{
            kind: 'created',
            amount: totalCustomerPaid,
            note: 'Initial transaction created with order'
        }]
    });

    await transaction.save();

    // Link back to the order
    try {
        await mongoose.model('FoodOrder').updateOne(
            { _id: order._id },
            { $set: { transactionId: transaction._id } }
        );
    } catch (err) {
        // Log but don't fail transaction if the backlink fails
    }

    return transaction;
}

/**
 * Updates transaction status (captured, settled, etc) and appends to history.
 */
export async function updateTransactionStatus(orderId, kind, details = {}) {
    const query = { orderId };
    const transaction = await FoodTransaction.findOne(query);
    if (!transaction) return null;

    if (details.status) transaction.status = details.status;
    if (details.razorpayPaymentId) transaction.gateway.razorpayPaymentId = details.razorpayPaymentId;
    if (details.razorpaySignature) transaction.gateway.razorpaySignature = details.razorpaySignature;

    transaction.history.push({
        kind,
        amount: transaction.amounts?.totalCustomerPaid || 0,
        at: new Date(),
        note: details.note || `Transaction updated: ${kind}`,
        recordedBy: { role: details.recordedByRole || 'SYSTEM', id: details.recordedById }
    });

    await transaction.save();

    // If transaction is captured or completed, credit store and rider wallets atomically
    if (transaction.status === 'captured' || ['cod_marked_paid_on_delivery', 'payment_snapshot_sync', 'captured'].includes(kind)) {
        await creditWalletsForTransaction(transaction);
    }

    return transaction;
}

export async function creditWalletsForTransaction(transaction) {
    if (!transaction || !transaction.orderId) return;

    // Never pay out a cancelled order: a late payment confirmation can arrive after the cancel already reversed everything
    try {
        const cancelled = await mongoose.model('FoodOrder').exists({ _id: transaction.orderId, orderStatus: /^cancelled/ });
        if (cancelled) return;
    } catch {
        // if the check itself fails, fall through: the unique dedupe key still prevents double payment
    }

    let restaurantShare = Number(transaction.amounts?.restaurantShare) || 0;
    let riderShare = Number(transaction.amounts?.riderShare || transaction.amounts?.riderTotalPayout) || 0;
    let riderId = transaction.deliveryPartnerId?._id ? String(transaction.deliveryPartnerId._id) : (transaction.deliveryPartnerId ? String(transaction.deliveryPartnerId) : null);

    // Fallback: If restaurantShare, riderId or riderShare is missing/0, resolve from FoodOrder
    if ((restaurantShare <= 0 || !riderId || riderId === '[object Object]' || riderShare <= 0) && transaction.orderId) {
        try {
            const FoodOrderModel = mongoose.model('FoodOrder');
            const orderDoc = await FoodOrderModel.findById(transaction.orderId).lean();
            if (orderDoc) {
                if (restaurantShare <= 0) {
                    const subtotal = Number(orderDoc.pricing?.subtotal) || 0;
                    const packagingFee = Number(orderDoc.pricing?.packagingFee) || 0;
                    const restaurantCommission = Number(orderDoc.pricing?.restaurantCommission) || 0;
                    restaurantShare = Math.max(0, subtotal + packagingFee - restaurantCommission);
                }

                if (!riderId || riderId === '[object Object]') {
                    const rawPartnerId = orderDoc.dispatch?.deliveryPartnerId || orderDoc.deliveryPartnerId;
                    riderId = rawPartnerId?._id ? String(rawPartnerId._id) : (rawPartnerId ? String(rawPartnerId) : null);
                    if (riderId && riderId !== '[object Object]') {
                        transaction.deliveryPartnerId = new mongoose.Types.ObjectId(riderId);
                    }
                }

                if (riderShare <= 0) {
                    const riderDeliveryFeeShare = Number(orderDoc.riderDeliveryFeeShare || orderDoc.pricing?.riderDeliveryEarningAfterAdminCommission || orderDoc.pricing?.deliveryFee || 0);
                    const riderSurgePay = Number(orderDoc.riderSurgePay || orderDoc.pricing?.surgeAmount || 0);
                    const riderIncentivePay = Number(orderDoc.riderIncentivePay || orderDoc.pricing?.deliveryPartnerIncentiveAmount || 0);
                    const computedPayout = Math.round((riderDeliveryFeeShare + riderSurgePay + riderIncentivePay) * 100) / 100;
                    riderShare = Number(orderDoc.riderTotalPayout || computedPayout || orderDoc.riderEarning || 0);
                }

                transaction.amounts = {
                    ...(transaction.amounts || {}),
                    restaurantShare,
                    riderShare,
                    riderTotalPayout: riderShare,
                };

                await FoodTransaction.updateOne(
                    { _id: transaction._id },
                    {
                        $set: {
                            deliveryPartnerId: transaction.deliveryPartnerId,
                            'amounts.restaurantShare': restaurantShare,
                            'amounts.riderShare': riderShare,
                            'amounts.riderTotalPayout': riderShare,
                        }
                    }
                ).catch(() => {});
            }
        } catch (err) {
            logger.error(`[FoodTransaction] Error resolving order fallback for transaction ${transaction._id}: ${err?.message || err}`);
        }
    }
    const restId = transaction.restaurantId?._id ? String(transaction.restaurantId._id) : (transaction.restaurantId ? String(transaction.restaurantId) : null);
    if (restaurantShare > 0 && restId && restId !== '[object Object]') {
        try {
            const existingRestTxn = await Transaction.findOne({
                orderId: transaction.orderId,
                entityType: 'restaurant',
                category: 'order_payout',
            });
            if (!existingRestTxn) {
                await recordTransaction({
                    entityType: 'restaurant',
                    entityId: restId,
                    type: 'credit',
                    amount: restaurantShare,
                    description: `Order payout credit for order ${transaction.orderId}`,
                    category: 'order_payout',
                    orderId: String(transaction.orderId),
                    dedupeKey: `order_payout:${transaction.orderId}:${restId}`,
                });
                logger.info(`[FoodTransaction] Credited store wallet ${restId} with ₹${restaurantShare} for order ${transaction.orderId}`);
            }
        } catch (err) {
            // DuplicateTransactionError = a parallel call already paid this order: nothing more to do for the restaurant
            if (!(err instanceof DuplicateTransactionError)) logger.error(`[FoodTransaction] Error crediting store wallet for order ${transaction.orderId}: ${err?.message || err}`);
        }
    }

    if (riderShare > 0 && riderId && riderId !== '[object Object]') {
        try {
            const existingRiderTxn = await Transaction.findOne({
                orderId: transaction.orderId,
                entityType: 'deliveryBoy',
                category: 'delivery_payout',
            });
            if (!existingRiderTxn) {
                await recordTransaction({
                    entityType: 'deliveryBoy',
                    entityId: riderId,
                    type: 'credit',
                    amount: riderShare,
                    description: `Delivery payout credit for order ${transaction.orderId}`,
                    category: 'delivery_payout',
                    orderId: String(transaction.orderId),
                    dedupeKey: `delivery_payout:${transaction.orderId}:${riderId}`,
                });
                logger.info(`[FoodTransaction] Credited delivery partner wallet ${riderId} with ₹${riderShare} for order ${transaction.orderId}`);
            }
        } catch (err) {
            if (!(err instanceof DuplicateTransactionError)) logger.error(`[FoodTransaction] Error crediting delivery partner wallet for order ${transaction.orderId}: ${err?.message || err}`);
        }
    }
}

/**
 * Updates the rider in the transaction when an order is accepted.
 */
export async function updateTransactionRider(orderId, riderId) {
    const query = { orderId };
    return await FoodTransaction.findOneAndUpdate(
        query,
        { $set: { deliveryPartnerId: riderId } },
        { new: true }
    );
}

/**
 * Marks restaurant as settled in the finance record.
 */
export async function settleRestaurant(orderId, adminId) {
    return await updateTransactionStatus(orderId, 'settled', {
        status: 'captured', // Ensure it's marked as captured if it was pending cash
        note: 'Restaurant payout settled by admin',
        recordedByRole: 'ADMIN',
        recordedById: adminId
    });
}

/**
 * The order was cancelled after the rider had already picked it up: the rider did the work, so the rider is paid
 * (idempotent: if the delivery payout was already credited nothing is posted again).
 */
export async function creditRiderForCancelledOrder(orderId) {
    const tx = await FoodTransaction.findOne({ orderId }).lean();
    const order = await mongoose.model('FoodOrder').findById(orderId).select('dispatch riderTotalPayout riderEarning').lean();
    const rawId = tx?.deliveryPartnerId || order?.dispatch?.deliveryPartnerId;
    const riderId = rawId?._id ? String(rawId._id) : (rawId ? String(rawId) : null);
    const share = Number(tx?.amounts?.riderTotalPayout || tx?.amounts?.riderShare || order?.riderTotalPayout || order?.riderEarning) || 0;
    if (!riderId || share <= 0) return null;
    const existing = await Transaction.findOne({ orderId, entityType: 'deliveryBoy', category: 'delivery_payout' }).lean();
    if (existing) return null;
    try {
        return await recordTransaction({
            entityType: 'deliveryBoy', entityId: riderId, type: 'credit', amount: share,
            description: `Delivery payout for order ${orderId}: cancelled after pickup`,
            category: 'delivery_payout', orderId: String(orderId),
            dedupeKey: `delivery_payout:${orderId}:${riderId}`,   // same key as the normal payout: the rider is never paid twice
        });
    } catch (err) {
        if (err instanceof DuplicateTransactionError) return null;
        throw err;
    }
}

/**
 * The admin-set cancel penalty is a transfer, not money that vanishes: it goes to whoever runs the zone.
 *  - franchise order -> the franchise wallet (it bears the local operational cost of the cancel)
 *  - otherwise       -> the platform (admin) wallet as revenue
 * Idempotent per order, and independent of the restaurant debit so a retry still lands the credit if it failed once.
 */
async function creditCancelPenaltyTo(orderId, penalty) {
    const order = await mongoose.model('FoodOrder').findById(orderId).select('franchiseId order_id').lean();
    if (order?.franchiseId) {
        const { creditFranchiseCancelPenalty } = await import('../../admin/services/franchiseLedger.service.js');
        await creditFranchiseCancelPenalty(order.franchiseId, orderId, penalty, { orderLabel: order.order_id });
        return;
    }
    try {
        await recordTransaction({
            entityType: 'admin', entityId: 'platform', type: 'credit', amount: penalty,
            description: `Restaurant cancel penalty kept by the platform (order ${order?.order_id || orderId})`,
            category: 'cancel_penalty', orderId: String(orderId),
            dedupeKey: `cancel_penalty_income:${orderId}`,
        });
    } catch (err) {
        if (!(err instanceof DuplicateTransactionError)) throw err;   // already credited: nothing more to do
    }
}

/**
 * Restaurant cancelled an order it had already accepted: take the admin-set penalty from its wallet (once per order) and
 * hand it to the zone's franchise (or the platform if there is none).
 */
export async function chargeRestaurantCancelPenalty(orderId, restaurantId, amount) {
    const penalty = Math.round((Number(amount) || 0) * 100) / 100;
    if (penalty <= 0 || !restaurantId) return null;

    // 1. Debit the restaurant (once per order)
    const existing = await Transaction.findOne({ orderId, entityType: 'restaurant', category: 'cancel_penalty' }).lean();
    if (!existing) {
        try {
            await recordTransaction({
                entityType: 'restaurant', entityId: String(restaurantId), type: 'debit', amount: penalty,
                description: `Penalty: order ${orderId} cancelled by the restaurant after accepting it`,
                category: 'cancel_penalty', orderId: String(orderId), allowNegative: true,
                dedupeKey: `cancel_penalty:${orderId}:${restaurantId}`,
            });
        } catch (err) {
            if (!(err instanceof DuplicateTransactionError)) throw err;
        }
    }

    // 2. Give the penalty to the franchise that runs the zone, or to the platform. Never let a credit failure undo the debit.
    await creditCancelPenaltyTo(orderId, penalty).catch((err) =>
        logger.error(`[FoodTransaction] Cancel penalty credit failed for order ${orderId}: ${err?.message || err}`));

    return { penalty };
}

/**
 * Take back the restaurant / delivery-partner wallet credits of an order that was cancelled or refunded.
 * Credits are posted as soon as an online payment is captured, so a cancelled order must undo them,
 * otherwise the wallets show money for an order that never happened.
 * Idempotent: each credit is reversed at most once. Reversals are allowed to push a wallet negative
 * (the money may already have been withdrawn) so the books always end up correct.
 */
export async function reverseWalletsForOrder(orderId, { onlyRestaurant = false, keepRider = false } = {}) {
    const results = [];
    const credits = await Transaction.find({
        orderId,
        type: 'credit',
        category: { $in: (onlyRestaurant || keepRider) ? ['order_payout'] : ['order_payout', 'delivery_payout'] },
    }).lean();

    for (const credit of credits) {
        const reversalCategory = `${credit.category}_reversal`;
        const already = await Transaction.findOne({
            orderId,
            entityType: credit.entityType,
            entityId: credit.entityId,
            category: reversalCategory,
        }).lean();
        if (already) continue;

        try {
            await recordTransaction({
                entityType: credit.entityType,
                entityId: String(credit.entityId),
                type: 'debit',
                amount: Number(credit.amount),
                description: `Reversal: order ${orderId} was cancelled / refunded`,
                category: reversalCategory,
                orderId: String(orderId),
                allowNegative: true,
                dedupeKey: `${reversalCategory}:${orderId}:${credit.entityId}`,
            });
            results.push({ entityType: credit.entityType, amount: credit.amount });
        } catch (err) {
            if (err instanceof DuplicateTransactionError) continue;   // already reversed by a parallel call
            logger.error(`[FoodTransaction] Could not reverse ${credit.category} for order ${orderId}: ${err?.message || err}`);
        }
    }
    return results;
}
