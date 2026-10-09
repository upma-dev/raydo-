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

export const creditReferralReward = async (userId, amountInr, metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }
    const wallet = await ensureWallet(userId);
    wallet.transactions.unshift({
        type: 'addition',
        amount,
        status: 'Completed',
        description: 'Referral reward',
        metadata: { source: 'referral_reward', ...(metadata || {}) }
    });
    wallet.balance = Number(wallet.balance || 0) + amount;
    wallet.referralEarnings = Number(wallet.referralEarnings || 0) + amount;
    await wallet.save();
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
        const razorpay = await createRazorpayCheckoutOrder(amountPaise, 'INR', receipt);
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

export const deductWalletBalance = async (userId, amountInr, description = 'Order payment', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        throw new ValidationError('Invalid deduction amount');
    }

    const wallet = await ensureWallet(userId);
    if (wallet.balance < amount) {
        throw new ValidationError('Insufficient wallet balance');
    }

    wallet.transactions.unshift({
        type: 'deduction',
        amount,
        status: 'Completed',
        description,
        metadata: { source: 'order_payment', ...(metadata || {}) }
    });

    wallet.balance = Number(wallet.balance) - amount;
    await wallet.save();

    return { wallet: await getUserWallet(userId) };
};

export const refundWalletBalance = async (userId, amountInr, description = 'Order refund', metadata = {}) => {
    const amount = Number(amountInr);
    if (!Number.isFinite(amount) || amount <= 0) {
        return { wallet: await getUserWallet(userId) };
    }

    const wallet = await ensureWallet(userId);
    wallet.transactions.unshift({
        type: 'refund',
        amount,
        status: 'Completed',
        description,
        metadata: { source: 'order_refund', ...(metadata || {}) }
    });

    wallet.balance = Number(wallet.balance) + amount;
    await wallet.save();

    return { wallet: await getUserWallet(userId) };
};
