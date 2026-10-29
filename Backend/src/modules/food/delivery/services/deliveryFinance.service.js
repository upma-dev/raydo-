import mongoose from 'mongoose';
import { FoodOrder } from '../../orders/models/order.model.js';
import { FoodTransaction } from '../../orders/models/foodTransaction.model.js';
import { FoodDeliveryWithdrawal } from '../models/foodDeliveryWithdrawal.model.js';
import { FoodDeliveryCashDeposit } from '../models/foodDeliveryCashDeposit.model.js';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { HybridWalletTransfer } from '../models/hybridWalletTransfer.model.js';
import { Driver } from '../../../taxi/driver/models/Driver.js';
import { Ride } from '../../../taxi/user/models/Ride.js';
import { withPartnerWalletLock } from './rideWalletLock.js';
import { DeliveryBonusTransaction } from '../../admin/models/deliveryBonusTransaction.model.js';
import { getDeliveryCashLimitSettings } from '../../admin/services/admin.service.js';
import { getRiderCashPosition } from './riderCash.service.js';
import { ValidationError } from '../../../../core/auth/errors.js';
import { Transaction } from '../../../../core/payments/models/transaction.model.js';
import { createRazorpayCheckoutOrder, isRazorpayConfigured, verifyPaymentSignature, fetchRazorpayOrder, fetchRazorpayPayment } from '../../orders/helpers/razorpay.helper.js';

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

/**
 * Payout the ledger gave this rider for orders that are NOT delivered: a rider who already picked up an order that was
 * then cancelled keeps the payout (see cancelOrderCore). Delivered orders are counted from the orders themselves, so
 * they are left out here to avoid counting them twice.
 */
const riderLedgerExtraEarnings = async (partnerId) => {
    const rows = await Transaction.aggregate([
        { $match: { entityType: 'deliveryBoy', entityId: partnerId, category: { $in: ['delivery_payout', 'delivery_payout_reversal'] }, orderId: { $ne: null } } },
        { $group: { _id: '$orderId', net: { $sum: { $cond: [{ $eq: ['$type', 'credit'] }, '$amount', { $multiply: ['$amount', -1] }] } } } },
    ]);
    if (!rows.length) return 0;
    const deliveredIds = await FoodOrder.find({ _id: { $in: rows.map((r) => r._id) }, orderStatus: 'delivered' }).distinct('_id');
    const delivered = new Set(deliveredIds.map(String));
    return round2(rows.filter((r) => !delivered.has(String(r._id))).reduce((sum, r) => sum + Math.max(0, r.net), 0));
};

/** Totals of the money moved between this partner's taxi wallet and the Pocket (Ride & Parcel mode). */
export const rideWalletTransferTotals = async (partnerId) => {
    const rows = await HybridWalletTransfer.aggregate([
        { $match: { deliveryPartnerId: new mongoose.Types.ObjectId(String(partnerId)) } },
        { $group: { _id: '$direction', total: { $sum: '$amount' } } },
    ]);
    const byDirection = Object.fromEntries(rows.map((r) => [r._id, round2(r.total)]));
    return { mergedIn: byDirection.taxi_to_food || 0, duesRecovered: byDirection.food_to_taxi || 0 };
};

/**
 * What the partner earned from completed rides / parcels on the linked ride profile, straight from the rides (the same
 * figure the driver app shows). The wallet merge only moves money around, so it is not used for this.
 */
export const getRideEarningsTotals = async (deliveryPartnerId, range = null) => {
    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).select('rideMode.taxiDriverId').lean();
    const driverId = partner?.rideMode?.taxiDriverId;
    if (!driverId) return { rideEarnings: 0, rideTrips: 0, rideGrossFare: 0 };
    const rideMatch = { driverId: new mongoose.Types.ObjectId(String(driverId)), status: 'completed' };
    if (range) rideMatch.completedAt = { $gte: range.start, $lte: range.end };
    const rows = await Ride.aggregate([
        { $match: rideMatch },
        {
            $group: {
                _id: null,
                earned: {
                    $sum: {
                        $ifNull: ['$driverEarnings', { $max: [{ $subtract: [{ $ifNull: ['$fare', 0] }, { $ifNull: ['$commissionAmount', 0] }] }, 0] }],
                    },
                },
                gross: { $sum: { $ifNull: ['$fare', 0] } },
                trips: { $sum: 1 },
            },
        },
    ]);
    return { rideEarnings: round2(rows[0]?.earned), rideTrips: rows[0]?.trips || 0, rideGrossFare: round2(rows[0]?.gross) };
};

/**
 * The Pocket numbers only (no history lists). Every place that needs a balance - the wallet merge, the unified balance on
 * /drivers/me, the ride-mode switch - uses this one calculation, so they always agree, and none of them has to load the
 * 50-row histories the Pocket screen shows.
 */
export const getDeliveryPocketTotals = async (deliveryPartnerId) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Invalid delivery partner ID');
    }
    const partnerId = new mongoose.Types.ObjectId(String(deliveryPartnerId));

    const [earningsAgg, cashCollectedAgg, cashDepositsAgg, bonusAgg, withdrawalAgg, ledgerExtraEarnings, rideTransfers] = await Promise.all([
        // 1. Total Earnings from Delivered Orders
        FoodOrder.aggregate([
            { $match: { 'dispatch.deliveryPartnerId': partnerId, orderStatus: 'delivered' } },
            { $group: { _id: null, totalEarned: { $sum: { $ifNull: ['$riderEarning', 0] } } } }
        ]),
        // 2. Gross cash collected (COD orders)
        FoodOrder.aggregate([
            { $match: { 'dispatch.deliveryPartnerId': partnerId, orderStatus: 'delivered', 'payment.method': 'cash' } },
            { $group: { _id: null, cashCollected: { $sum: { $ifNull: ['$pricing.total', 0] } } } }
        ]),
        // 3. Cash deposits (deduct from cash-in-hand)
        FoodDeliveryCashDeposit.aggregate([
            { $match: { deliveryPartnerId: partnerId, status: 'Completed' } },
            { $group: { _id: null, depositedCash: { $sum: { $ifNull: ['$amount', 0] } } } }
        ]),
        // 4. Admin Bonuses
        DeliveryBonusTransaction.aggregate([
            { $match: { deliveryPartnerId: partnerId } },
            { $group: { _id: null, total: { $sum: { $ifNull: ['$amount', 0] } } } }
        ]),
        // 5. Withdrawal Aggregates (Approved vs Pending)
        FoodDeliveryWithdrawal.aggregate([
            { $match: { deliveryPartnerId: partnerId } },
            {
                $group: {
                    _id: null,
                    totalWithdrawn: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, '$amount', 0] } },
                    pendingWithdrawals: { $sum: { $cond: [{ $eq: ['$status', 'pending'] }, '$amount', 0] } }
                }
            }
        ]),
        riderLedgerExtraEarnings(partnerId),
        // Ride & Parcel mode: taxi earnings swept into the Pocket, minus cash-ride commission dues paid from it
        rideWalletTransferTotals(partnerId),
    ]);

    const totalEarned = Number(earningsAgg?.[0]?.totalEarned) || 0;
    const grossCashCollected = Number(cashCollectedAgg?.[0]?.cashCollected) || 0;
    const totalDepositedCash = Number(cashDepositsAgg?.[0]?.depositedCash) || 0;
    const cashInHand = Math.max(0, grossCashCollected - totalDepositedCash);
    const totalBonus = Number(bonusAgg?.[0]?.total) || 0;
    const totalWithdrawn = Number(withdrawalAgg?.[0]?.totalWithdrawn) || 0;
    const pendingWithdrawals = Number(withdrawalAgg?.[0]?.pendingWithdrawals) || 0;

    // Pocket Balance = (Earnings + Bonus + ride earnings) - Withdrawn (approved) - Pending Withdrawals - ride dues
    const rawGrossPocket = round2((totalEarned + ledgerExtraEarnings + totalBonus + rideTransfers.mergedIn) - (totalWithdrawn + pendingWithdrawals + rideTransfers.duesRecovered));
    const grossPocketBalance = Math.max(0, rawGrossPocket);

    // COD cash the rider is still holding belongs to the platform. It is netted against earnings, so a rider cannot
    // keep the customers' cash AND withdraw the same orders' earnings. Depositing the cash frees the earnings again.
    const pocketBalance = Math.max(0, grossPocketBalance - cashInHand);
    // Not clamped at zero: a negative value means more has been promised (withdrawals) than earned
    const rawPocketBalance = round2(rawGrossPocket - cashInHand);

    return {
        totalEarned, ledgerExtraEarnings, totalBonus, totalWithdrawn, pendingWithdrawals, cashInHand,
        rideTransfers, grossPocketBalance, pocketBalance, rawPocketBalance,
    };
};

/**
 * Enhanced wallet fetch for delivery partners.
 * Integrates:
 * 1. Historical orders (earnings)
 * 2. Admin bonuses
 * 3. Withdrawals (pending/payout)
 * 4. Cash collected vs limit
 */
export const getDeliveryPartnerWalletEnhanced = async (deliveryPartnerId) => {
    if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(deliveryPartnerId)) {
        throw new ValidationError('Invalid delivery partner ID');
    }

    const partnerId = new mongoose.Types.ObjectId(deliveryPartnerId);
    const [partner, totals, rideTotals, cashLimitSettings, withdrawalsList, depositList] = await Promise.all([
        FoodDeliveryPartner.findById(partnerId).lean(),
        getDeliveryPocketTotals(deliveryPartnerId),
        getRideEarningsTotals(deliveryPartnerId),
        getDeliveryCashLimitSettings(),
        // Recent Withdrawals / deposits for History
        FoodDeliveryWithdrawal.find({ deliveryPartnerId: partnerId }).sort({ createdAt: -1 }).limit(50).lean(),
        FoodDeliveryCashDeposit.find({ deliveryPartnerId: partnerId }).sort({ createdAt: -1 }).limit(50).lean(),
    ]);
    if (!partner) throw new ValidationError('Delivery partner not found');

    const {
        totalEarned, ledgerExtraEarnings, totalBonus, totalWithdrawn, pendingWithdrawals, cashInHand,
        rideTransfers, grossPocketBalance, pocketBalance, rawPocketBalance,
    } = totals;

    const totalCashLimit = Number(cashLimitSettings.deliveryCashLimit) || 0;
    const deliveryWithdrawalLimit = Number(cashLimitSettings.deliveryWithdrawalLimit) || 100;

    // Fetch transactions for UI (Orders, Bonuses, Withdrawals)
    const rideDriverId = partner.rideMode?.taxiDriverId || null;
    const [ordersTx, rideTransferRows, rideTripRows] = await Promise.all([
        FoodOrder.find({ 'dispatch.deliveryPartnerId': partnerId, orderStatus: 'delivered' })
            .sort({ createdAt: -1 })
            .select('orderId riderEarning riderBasePay riderDeliveryFeeShare riderSurgePay riderIncentivePay riderTotalPayout pricing payment orderStatus createdAt')
            .limit(20)
            .lean(),
        rideTransfers.mergedIn || rideTransfers.duesRecovered
            ? HybridWalletTransfer.find({ deliveryPartnerId: partnerId }).sort({ createdAt: -1 }).limit(20).lean()
            : [],
        // Each completed bike ride / parcel, so the wallet shows ride money next to food deliveries
        rideDriverId
            ? Ride.find({ driverId: rideDriverId, status: 'completed' })
                .sort({ completedAt: -1, createdAt: -1 })
                .limit(20)
                .select('serviceType fare commissionAmount driverEarnings paymentMethod pickupAddress dropAddress completedAt createdAt')
                .lean()
                .catch(() => [])
            : [],
    ]);

    const transactions = [
        ...(ordersTx || []).map(o => {
            const riderBasePay = Number(o.riderBasePay || o.pricing?.deliveryFeeBreakdown?.basePayout || 0);
            const riderDeliveryFeeShare = Number(o.riderDeliveryFeeShare || o.pricing?.riderDeliveryEarningAfterAdminCommission || 0);
            const riderSurgePay = Number(o.riderSurgePay || o.pricing?.surgeAmount || 0);
            const riderIncentivePay = Number(o.riderIncentivePay || o.pricing?.deliveryPartnerIncentiveAmount || 0);
            const computedPayout = Math.round((riderDeliveryFeeShare + riderSurgePay + riderIncentivePay) * 100) / 100;
            const riderTotalPayout = Number(o.riderTotalPayout || computedPayout || o.riderEarning || 0);

            return {
                id: o._id,
                type: 'payment',
                amount: riderTotalPayout,
                riderBasePay,
                riderDeliveryFeeShare,
                riderSurgePay,
                riderIncentivePay,
                riderTotalPayout,
                status: 'Completed',
                date: o.createdAt,
                description: o.payment?.method === 'cash' ? 'COD delivery earning' : 'Online delivery earning',
                orderId: o.orderId
            };
        }),
        ...(withdrawalsList || []).map(w => ({
            id: w._id,
            type: 'withdrawal',
            amount: w.amount,
            status: w.status === 'pending' ? 'Pending' : (w.status === 'approved' ? 'Completed' : 'Rejected'),
            date: w.createdAt,
            description: `Withdrawal Request - ${w.paymentMethod}`,
            payoutMethod: w.paymentMethod
        })),
        ...(depositList || []).map(d => ({
            id: d._id,
            type: 'deposit',
            amount: d.amount,
            status: d.status || 'Pending',
            date: d.createdAt,
            description: 'Cash limit settlement',
            paymentMethod: d.paymentMethod || 'cash',
            razorpayPaymentId: d.razorpayPaymentId || '',
            razorpayOrderId: d.razorpayOrderId || ''
        })),
        // Own type (not 'payment'): the app adds up 'payment' rows as food earnings, and ride earnings are totalled separately
        ...(rideTripRows || []).map(r => {
            const stored = Number(r.driverEarnings);
            const earned = r.driverEarnings != null && Number.isFinite(stored)
                ? stored
                : Math.max((Number(r.fare) || 0) - (Number(r.commissionAmount) || 0), 0);
            const label = r.serviceType === 'parcel' ? 'Parcel' : r.serviceType === 'intercity' ? 'Intercity ride' : 'Bike ride';
            return {
                id: r._id,
                type: 'ride_trip',
                amount: round2(earned),
                status: 'Completed',
                date: r.completedAt || r.createdAt,
                description: `${label} earning`,
                orderId: `RIDE-${String(r._id).slice(-6).toUpperCase()}`,
                paymentMethod: r.paymentMethod || '',
                pickupAddress: r.pickupAddress || '',
                dropAddress: r.dropAddress || ''
            };
        }),
        ...(rideTransferRows || []).map(t => ({
            id: t._id,
            type: t.direction === 'taxi_to_food' ? 'ride_earning' : 'ride_dues',
            amount: t.amount,
            status: 'Completed',
            date: t.createdAt,
            description: t.direction === 'taxi_to_food' ? 'Ride & parcel earnings added to Pocket' : 'Moved to ride wallet (ride dues / minimum balance)'
        }))
    ].sort((a, b) => new Date(b.date) - new Date(a.date));

    // Same rupees as the ride wallet shows: Pocket + ride wallet (the reserve kept there). Earnings stay food-only below.
    const rideBalance = partner.rideMode?.taxiDriverId
        ? Number((await Driver.findById(partner.rideMode.taxiDriverId).select('wallet.balance').lean())?.wallet?.balance) || 0
        : 0;

    return {
        totalBalance: totalEarned + ledgerExtraEarnings + totalBonus, // Gross lifetime food earnings + bonus
        // Earnings split shown in the wallet: food deliveries, bike rides / parcels, and the total of both (plus bonus)
        foodEarnings: round2(totalEarned + ledgerExtraEarnings),
        rideEarnings: rideTotals.rideEarnings,
        rideTrips: rideTotals.rideTrips,
        totalEarnings: round2(totalEarned + ledgerExtraEarnings + totalBonus + rideTotals.rideEarnings),
        unifiedBalance: round2(pocketBalance + rideBalance),
        rideEarningsMerged: rideTransfers.mergedIn,
        rideDuesRecovered: rideTransfers.duesRecovered,
        pocketBalance, // Available to withdraw (earnings minus COD cash still in hand)
        rawPocketBalance,
        grossPocketBalance, // Earnings not yet withdrawn, before the COD cash in hand is netted off
        cashDeductedFromBalance: Math.min(cashInHand, grossPocketBalance),
        cashInHand, // COD to be deposited/deducted
        totalWithdrawn, // Actually paid out
        pendingWithdrawals, // In process
        totalEarned,
        totalBonus,
        totalCashLimit,
        availableCashLimit: Math.max(0, totalCashLimit - cashInHand - (await getRiderCashPosition(partnerId)).activeCod),
        deliveryWithdrawalLimit,
        transactions: transactions.slice(0, 50)
    };
};

/**
 * Submits a new withdrawal request for a delivery partner.
 */
export const requestDeliveryWithdrawal = async (deliveryPartnerId, payload) => {
    const linked = await FoodDeliveryPartner.findById(deliveryPartnerId).select('rideMode.taxiDriverId').lean();
    if (!linked?.rideMode?.taxiDriverId) return createDeliveryWithdrawal(deliveryPartnerId, payload);

    // Ride & Parcel partner: bring ride earnings into the Pocket first, then decide under the same lock the wallet
    // merge uses, so dues recovery and this withdrawal can never both spend the same rupees
    const { reconcileRideWallet } = await import('./hybridRide.service.js');
    await reconcileRideWallet(deliveryPartnerId).catch(() => null);
    return withPartnerWalletLock(deliveryPartnerId, () => createDeliveryWithdrawal(deliveryPartnerId, payload));
};

const createDeliveryWithdrawal = async (deliveryPartnerId, payload) => {
    const { amount, bankDetails, paymentMethod = 'bank_transfer' } = payload;

    if (!amount || amount < 1) throw new ValidationError('Invalid amount');

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount < wallet.deliveryWithdrawalLimit) {
        throw new ValidationError(`Minimum withdrawal amount is ₹${wallet.deliveryWithdrawalLimit}`);
    }
    if (amount > wallet.pocketBalance) {
        throw new ValidationError(
            wallet.cashInHand > 0 && amount <= wallet.grossPocketBalance
                ? `You are holding \u20B9${wallet.cashInHand} of COD cash. Deposit it first (or withdraw up to \u20B9${wallet.pocketBalance}).`
                : 'Insufficient balance for this withdrawal'
        );
    }

    const partner = await FoodDeliveryPartner.findById(deliveryPartnerId).lean();
    if (!partner) throw new ValidationError('Delivery partner not found');

    const withdrawal = await FoodDeliveryWithdrawal.create({
        deliveryPartnerId,
        amount: round2(amount),
        paymentMethod,
        bankDetails: bankDetails || {
            accountNumber: partner.bankAccountNumber,
            ifscCode: partner.bankIfscCode,
            bankName: partner.bankName,
            accountHolderName: partner.bankAccountHolderName
        },
        upiId: partner.upiId,
        upiQrCode: partner.upiQrCode,
        status: 'pending'
    });

    // Re-check AFTER the request exists. Two requests sent at the same moment both pass the check above, but now each one
    // sees the other as pending: if together they promise more than the rider has, the later one is withdrawn again.
    const after = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (after.rawPocketBalance < -0.009) {
        await FoodDeliveryWithdrawal.deleteOne({ _id: withdrawal._id, status: 'pending' });
        throw new ValidationError('Insufficient balance for this withdrawal');
    }

    return withdrawal;
};

export const createDeliveryCashDepositOrder = async (deliveryPartnerId, amountInr) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount < 1) {
        throw new ValidationError('Amount must be at least ₹1');
    }
    if (amount > 500000) {
        throw new ValidationError('Maximum deposit is ₹5,00,000');
    }

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount > wallet.cashInHand) {
        throw new ValidationError('Deposit amount cannot exceed cash in hand');
    }

    const amountPaise = Math.round(amount * 100);
    const receipt = `cash_deposit_${String(deliveryPartnerId).slice(-8)}_${Date.now()}`;

    if (!isRazorpayConfigured()) {
        throw new ValidationError('Razorpay payment gateway is not configured');
    }

    try {
        const razorpay = await createRazorpayCheckoutOrder(amountPaise, 'INR', receipt, { purpose: 'cash_deposit', deliveryPartnerId: String(deliveryPartnerId) });
        return { razorpay };
    } catch (error) {
        throw new ValidationError(error?.message || 'Payment gateway error');
    }
};

export const verifyDeliveryCashDepositPayment = async (deliveryPartnerId, payload = {}) => {
    const orderId = String(payload?.razorpayOrderId || '').trim();
    const paymentId = String(payload?.razorpayPaymentId || '').trim();
    const signature = String(payload?.razorpaySignature || '').trim();
    // NOTE: the amount sent by the app is deliberately ignored. The deposit is exactly what Razorpay received.

    if (!orderId) throw new ValidationError('razorpayOrderId is required');
    if (!paymentId) throw new ValidationError('razorpayPaymentId is required');
    if (!signature) throw new ValidationError('razorpaySignature is required');

    if (!isRazorpayConfigured()) {
        throw new ValidationError('Razorpay payment gateway is not configured');
    }
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new ValidationError('Payment verification failed');
    }

    // One payment can only be credited once, to one partner (checked across ALL partners)
    const used = await FoodDeliveryCashDeposit.findOne({ razorpayPaymentId: paymentId, status: 'Completed' }).lean();
    if (used) {
        if (String(used.deliveryPartnerId) === String(deliveryPartnerId)) {
            return { deposit: used, wallet: await getDeliveryPartnerWalletEnhanced(deliveryPartnerId) };
        }
        throw new ValidationError('This payment has already been used');
    }

    // Ask Razorpay (source of truth): a real completed payment, for a deposit order created by THIS partner
    let rzOrder;
    let rzPayment;
    try {
        [rzOrder, rzPayment] = await Promise.all([fetchRazorpayOrder(orderId), fetchRazorpayPayment(paymentId)]);
    } catch (err) {
        throw new ValidationError('We could not confirm this payment with the bank yet. If money was deducted, please try again in a minute.');
    }
    if (String(rzPayment?.order_id) !== orderId) throw new ValidationError('This payment does not belong to this deposit');
    if (!['captured', 'authorized'].includes(String(rzPayment?.status))) throw new ValidationError('Payment is not completed yet');
    if (Number(rzPayment?.amount) !== Number(rzOrder?.amount)) throw new ValidationError('Paid amount does not match the deposit order');
    if (!String(rzOrder?.receipt || '').startsWith(`cash_deposit_${String(deliveryPartnerId).slice(-8)}_`)) {
        throw new ValidationError('This deposit order was not created by your account');
    }

    const amount = Math.round(Number(rzOrder.amount)) / 100;
    if (!Number.isFinite(amount) || amount < 1) throw new ValidationError('Invalid deposit amount');

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount > wallet.cashInHand) {
        // The partner can only create a deposit order up to their cash in hand, so this should not happen.
        // Do not over-credit; the payment stays on record at Razorpay for support to refund.
        throw new ValidationError('Deposit amount cannot exceed cash in hand. Contact support for a refund of this payment.');
    }

    // ONE atomic upsert. The unique index on razorpayPaymentId means that when two verify calls for the same payment
    // run together only one can write it; the other gets a duplicate-key error and just returns the existing deposit.
    let deposit;
    try {
        deposit = await FoodDeliveryCashDeposit.findOneAndUpdate(
            { deliveryPartnerId, razorpayOrderId: orderId },
            { $set: { amount, paymentMethod: 'razorpay', status: 'Completed', razorpayOrderId: orderId, razorpayPaymentId: paymentId } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
        );
    } catch (err) {
        if (err?.code !== 11000) throw err;
        deposit = await FoodDeliveryCashDeposit.findOne({ razorpayPaymentId: paymentId, status: 'Completed' }).lean();
        if (!deposit || String(deposit.deliveryPartnerId) !== String(deliveryPartnerId)) {
            throw new ValidationError('This payment has already been used');
        }
    }

    return {
        deposit,
        wallet: await getDeliveryPartnerWalletEnhanced(deliveryPartnerId)
    };
};

/**
 * Webhook path for a cash deposit: records the deposit even if the app never called verify.
 * Same one-payment-one-deposit rule as verifyDeliveryCashDepositPayment (unique index on razorpayPaymentId).
 */
export const settleDeliveryCashDepositFromWebhook = async ({ rzOrder, paymentId, amountPaise }) => {
    const deliveryPartnerId = String(rzOrder?.notes?.deliveryPartnerId || '').trim();
    if (rzOrder?.notes?.purpose !== 'cash_deposit' || !deliveryPartnerId) return { handled: false };
    if (!String(rzOrder?.receipt || '').startsWith(`cash_deposit_${deliveryPartnerId.slice(-8)}_`)) return { handled: true, recorded: false, reason: 'receipt mismatch' };
    if (Number(rzOrder.amount) !== Number(amountPaise)) return { handled: true, recorded: false, reason: 'amount mismatch' };

    const amount = Math.round(Number(amountPaise)) / 100;
    if (!Number.isFinite(amount) || amount < 1) return { handled: true, recorded: false, reason: 'bad amount' };

    const existing = await FoodDeliveryCashDeposit.findOne({ razorpayPaymentId: paymentId, status: 'Completed' }).lean();
    if (existing) return { handled: true, recorded: false, reason: 'already recorded' };

    const wallet = await getDeliveryPartnerWalletEnhanced(deliveryPartnerId);
    if (amount > wallet.cashInHand) return { handled: true, recorded: false, reason: 'exceeds cash in hand (needs manual refund)' };

    try {
        await FoodDeliveryCashDeposit.findOneAndUpdate(
            { deliveryPartnerId, razorpayOrderId: String(rzOrder.id) },
            { $set: { amount, paymentMethod: 'razorpay', status: 'Completed', razorpayOrderId: String(rzOrder.id), razorpayPaymentId: paymentId } },
            { new: true, upsert: true, setDefaultsOnInsert: true },
        );
    } catch (err) {
        if (err?.code !== 11000) throw err;
        return { handled: true, recorded: false, reason: 'already recorded' };
    }
    return { handled: true, recorded: true, deliveryPartnerId, amount };
};
