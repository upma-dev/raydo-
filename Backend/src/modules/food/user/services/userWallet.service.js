import mongoose from 'mongoose';
import { ValidationError } from '../../../../core/auth/errors.js';
import { FoodUserWallet } from '../models/userWallet.model.js';
import { createRazorpayCheckoutOrder, isRazorpayConfigured, verifyPaymentSignature, fetchRazorpayOrder, fetchRazorpayPayment } from '../../orders/helpers/razorpay.helper.js';

const ensureWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const existing = await FoodUserWallet.findOne({ userId: oid });
    if (existing) return existing;
    return FoodUserWallet.create({ userId: oid, balance: 0, transactions: [] });
};

const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

// Every balance change is ONE atomic update ($inc + the history row together). The old code read the wallet, changed
// it in memory and saved it, so two parallel changes could overwrite each other (lost money / double spend).
const applyWalletChange = async (userId, { delta, tx, requireBalance = false }) => {
    await ensureWallet(userId);
    const oid = new mongoose.Types.ObjectId(String(userId));
    const filter = { userId: oid };
    if (requireBalance) filter.balance = { $gte: -delta };
    const updated = await FoodUserWallet.findOneAndUpdate(
        filter,
        {
            $inc: { balance: delta, ...(tx.referral ? { referralEarnings: delta } : {}) },
            $push: { transactions: { $each: [{ type: tx.type, amount: Math.abs(delta), status: 'Completed', description: tx.description, metadata: tx.metadata }], $position: 0 } },
        },
        { new: true },
    );
    return updated;
};

export const creditReferralReward = async (userId, amountInr, metadata = {}) => {
    const amount = round2(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }
    await applyWalletChange(userId, {
        delta: amount,
        tx: { type: 'addition', description: 'Referral reward', metadata: { source: 'referral_reward', ...(metadata || {}) }, referral: true },
    });
    return { wallet: await getUserWallet(userId) };
};

export const getUserWallet = async (userId) => {
    const id = String(userId || '');
    if (!id || !mongoose.Types.ObjectId.isValid(id)) {
        throw new ValidationError('User not found');
    }
    const oid = new mongoose.Types.ObjectId(id);
    const wallet = await FoodUserWallet.findOne({ userId: oid });
    if (!wallet) {
        return { balance: 0, referralEarnings: 0, transactions: [] };
    }
    // Return newest first (UI expects recent transactions on top)
    const tx = Array.isArray(wallet.transactions) ? [...wallet.transactions].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)) : [];
    return {
        balance: Number(wallet.balance) || 0,
        referralEarnings: Number(wallet.referralEarnings) || 0,
        transactions: tx.map((t) => ({
            id: String(t._id),
            _id: t._id,
            type: t.type,
            amount: Number(t.amount) || 0,
            status: t.status || 'Completed',
            description: t.description || '',
            date: t.createdAt,
            createdAt: t.createdAt,
            metadata: t.metadata || {}
        }))
    };
};

export const createWalletTopupOrder = async (userId, amountInr) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Amount must be greater than 0');
    }
    if (amount > 50000) {
        throw new ValidationError('Maximum amount is 50,000');
    }

    const amountPaise = Math.round(amount * 100);

    if (!isRazorpayConfigured()) {
        throw new ValidationError('Razorpay payment gateway is not configured');
    }

    const receipt = `wallet_topup_${String(userId).slice(-8)}_${Date.now()}`;
    try {
        const razorpay = await createRazorpayCheckoutOrder(amountPaise, 'INR', receipt, { purpose: 'wallet_topup', userId: String(userId) });
        return { razorpay };
    } catch (error) {
        throw new ValidationError(error?.message || 'Payment gateway error');
    }
};

export const verifyWalletTopupPayment = async (userId, payload) => {
    const orderId = String(payload?.razorpayOrderId || '').trim();
    const paymentId = String(payload?.razorpayPaymentId || '').trim();
    const signature = String(payload?.razorpaySignature || '').trim();
    // NOTE: the amount sent by the app is deliberately ignored. The amount credited is the amount Razorpay received.

    if (!orderId) throw new ValidationError('razorpayOrderId is required');
    if (!paymentId) throw new ValidationError('razorpayPaymentId is required');
    if (!signature) throw new ValidationError('razorpaySignature is required');

    if (!isRazorpayConfigured()) {
        throw new ValidationError('Razorpay payment gateway is not configured');
    }
    if (!verifyPaymentSignature(orderId, paymentId, signature)) {
        throw new ValidationError('Payment verification failed');
    }

    await ensureWallet(userId);

    // One payment can only ever be credited once, to one wallet (checked across ALL users, not just this one)
    const alreadyUsed = await FoodUserWallet.findOne({ 'transactions.razorpayPaymentId': paymentId }).select('userId').lean();
    if (alreadyUsed) {
        if (String(alreadyUsed.userId) === String(userId)) return { wallet: await getUserWallet(userId) };
        throw new ValidationError('This payment has already been used');
    }

    // Ask Razorpay (source of truth): is it a real, completed payment for a top-up order that THIS user created?
    let rzOrder;
    let rzPayment;
    try {
        [rzOrder, rzPayment] = await Promise.all([fetchRazorpayOrder(orderId), fetchRazorpayPayment(paymentId)]);
    } catch (err) {
        throw new ValidationError('We could not confirm this payment with the bank yet. If money was deducted, please try again in a minute.');
    }
    if (String(rzPayment?.order_id) !== orderId) throw new ValidationError('This payment does not belong to this top-up');
    if (!['captured', 'authorized'].includes(String(rzPayment?.status))) throw new ValidationError('Payment is not completed yet');
    if (Number(rzPayment?.amount) !== Number(rzOrder?.amount)) throw new ValidationError('Paid amount does not match the top-up order');
    if (!String(rzOrder?.receipt || '').startsWith(`wallet_topup_${String(userId).slice(-8)}_`)) {
        throw new ValidationError('This top-up order was not created by your account');
    }

    const amount = Math.round(Number(rzOrder.amount)) / 100;
    if (!Number.isFinite(amount) || amount <= 0) throw new ValidationError('Invalid top-up amount');

    // Credit atomically; the $ne guard makes a double credit impossible even if the call arrives twice at once
    const credited = await FoodUserWallet.updateOne(
        { userId, 'transactions.razorpayPaymentId': { $ne: paymentId } },
        {
            $inc: { balance: amount },
            $push: {
                transactions: {
                    $each: [{
                        type: 'addition',
                        amount,
                        status: 'Completed',
                        description: 'Wallet top-up',
                        metadata: { source: 'wallet_topup', mode: 'razorpay' },
                        razorpayOrderId: orderId,
                        razorpayPaymentId: paymentId,
                        razorpaySignature: signature,
                    }],
                    $position: 0,
                },
            },
        },
    );
    if (!credited.modifiedCount) {
        // someone else (or a parallel request) already credited this payment
        return { wallet: await getUserWallet(userId) };
    }

    return { wallet: await getUserWallet(userId) };
};

/**
 * Webhook path for a wallet top-up: credits the money even if the app never called verify (app closed / network drop).
 * Safe to run together with verifyWalletTopupPayment: the $ne guard on razorpayPaymentId credits a payment only once.
 * `rzOrder` is the Razorpay order (fetched server-side); its notes carry the full userId set when the order was created.
 */
export const settleWalletTopupFromWebhook = async ({ rzOrder, paymentId, amountPaise }) => {
    const userId = String(rzOrder?.notes?.userId || '').trim();
    if (rzOrder?.notes?.purpose !== 'wallet_topup' || !userId) return { handled: false };
    if (!String(rzOrder?.receipt || '').startsWith(`wallet_topup_${userId.slice(-8)}_`)) return { handled: true, credited: false, reason: 'receipt mismatch' };
    if (Number(rzOrder.amount) !== Number(amountPaise)) return { handled: true, credited: false, reason: 'amount mismatch' };

    const amount = Math.round(Number(amountPaise)) / 100;
    if (!Number.isFinite(amount) || amount <= 0) return { handled: true, credited: false, reason: 'bad amount' };

    await ensureWallet(userId);
    const credited = await FoodUserWallet.updateOne(
        { userId, 'transactions.razorpayPaymentId': { $ne: paymentId } },
        {
            $inc: { balance: amount },
            $push: {
                transactions: {
                    $each: [{
                        type: 'addition',
                        amount,
                        status: 'Completed',
                        description: 'Wallet top-up',
                        metadata: { source: 'wallet_topup', mode: 'razorpay', via: 'webhook' },
                        razorpayOrderId: String(rzOrder.id),
                        razorpayPaymentId: paymentId,
                    }],
                    $position: 0,
                },
            },
        },
    );
    return { handled: true, credited: Boolean(credited.modifiedCount), userId, amount };
};

export const deductWalletBalance = async (userId, amountInr, description = 'Order payment', metadata = {}) => {
    const amount = round2(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Invalid deduction amount');
    }

    // The "enough balance" check is part of the same atomic update, so parallel orders cannot both spend the same money
    const updated = await applyWalletChange(userId, {
        delta: -amount,
        requireBalance: true,
        tx: { type: 'deduction', description, metadata: { source: 'order_payment', ...(metadata || {}) } },
    });
    if (!updated) throw new ValidationError('Insufficient wallet balance');

    return { wallet: await getUserWallet(userId) };
};

export const refundWalletBalance = async (userId, amountInr, description = 'Order refund', metadata = {}) => {
    const amount = round2(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }

    await applyWalletChange(userId, {
        delta: amount,
        tx: { type: 'refund', description, metadata: { source: 'order_refund', ...(metadata || {}) } },
    });

    return { wallet: await getUserWallet(userId) };
};
