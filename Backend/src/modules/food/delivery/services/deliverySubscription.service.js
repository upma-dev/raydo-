import mongoose from 'mongoose';
import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { FoodDeliveryPartnerSubscription } from '../models/deliveryPartnerSubscription.model.js';
import { withPartnerWalletLock } from './rideWalletLock.js';
import { getDeliveryPocketTotals } from './deliveryFinance.service.js';
import { SubscriptionPlan } from '../../../taxi/admin/models/SubscriptionPlan.js';
import { Driver } from '../../../taxi/driver/models/Driver.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../../core/auth/errors.js';
import { createRazorpayCheckoutOrder, isRazorpayConfigured, verifyPaymentSignature, fetchRazorpayOrder, fetchRazorpayPayment } from '../../orders/helpers/razorpay.helper.js';
import {
    DELIVERY_SERVICES,
    SERVICE_LABEL,
    getDeliverySubscriptionModes,
} from './deliverySubscriptionCore.js';

export * from './deliverySubscriptionCore.js';

/**
 * DELIVERY PARTNER SUBSCRIPTION - the partner's Subscription screen (buying from the Pocket) and the admin tools.
 * The rules (modes, who may work, commission waiver) live in deliverySubscriptionCore.js.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;

/* ---------------------------------------------------------------------------------------------------------------- */
/* Serialising                                                                                                       */
/* ---------------------------------------------------------------------------------------------------------------- */

const serializePass = (item = {}, now = new Date()) => {
    const started = new Date(item.startedAt);
    const expires = new Date(item.expiresAt);
    let state = 'active';
    if (item.status === 'cancelled') state = 'cancelled';
    else if (expires <= now) state = 'expired';
    else if (started > now) state = 'upcoming';
    return {
        id: String(item._id),
        planId: String(item.planId || ''),
        service: item.service,
        name: item.name || '',
        amount: round2(item.amount),
        durationDays: item.durationDays,
        purchaseSource: item.purchaseSource || 'pocket',
        state,
        purchasedAt: item.purchasedAt || item.createdAt || null,
        startedAt: item.startedAt,
        expiresAt: item.expiresAt,
        daysLeft: state === 'active' ? Math.max(0, Math.ceil((expires - now) / DAY_MS)) : null,
    };
};

const serializePlan = (plan = {}) => ({
    id: String(plan._id),
    name: plan.name || '',
    description: plan.description || '',
    how_it_works: plan.how_it_works || '',
    amount: round2(plan.amount),
    duration: Math.max(1, Number(plan.duration || 1)),
    service: plan.service_type || '',
    vehicle_type: plan.vehicle_type_id?._id ? { id: String(plan.vehicle_type_id._id), name: plan.vehicle_type_id.name || '' } : null,
});

/** Ride and parcel work needs an approved ride profile; food needs nothing extra. */
const loadRideProfile = async (partner) => {
    const driverId = partner?.rideMode?.taxiDriverId;
    if (!driverId) return null;
    return Driver.findById(driverId).select('vehicleTypeId approve status').lean();
};

const planFitsPartner = (plan, service, rideProfile) => {
    if (service === 'food') return true;
    if (!rideProfile) return false;
    const planVehicle = plan.vehicle_type_id?._id || plan.vehicle_type_id;
    return !planVehicle || (rideProfile.vehicleTypeId && String(rideProfile.vehicleTypeId) === String(planVehicle));
};

/* ---------------------------------------------------------------------------------------------------------------- */
/* Partner side: the Subscription screen and buying                                                                  */
/* ---------------------------------------------------------------------------------------------------------------- */

export const getPartnerSubscriptionState = async (partnerId) => {
    if (!mongoose.Types.ObjectId.isValid(String(partnerId || ''))) throw new ValidationError('Delivery partner not found');
    const [modes, partner, plans, passes, pocket] = await Promise.all([
        getDeliverySubscriptionModes(),
        FoodDeliveryPartner.findById(partnerId).select('rideMode.taxiDriverId').lean(),
        SubscriptionPlan.find({ audience: 'delivery', active: true }).sort({ amount: 1, createdAt: -1 }).populate('vehicle_type_id', 'name').lean(),
        FoodDeliveryPartnerSubscription.find({ partnerId }).sort({ expiresAt: -1 }).limit(60).lean(),
        getDeliveryPocketTotals(partnerId),
    ]);
    if (!partner) throw new NotFoundError('Delivery partner not found');

    const rideProfile = await loadRideProfile(partner);
    const now = new Date();
    const history = passes.map((item) => serializePass(item, now));

    const services = DELIVERY_SERVICES.map((service) => {
        const mode = modes[service];
        const mine = history.filter((item) => item.service === service);
        const current = mine.find((item) => item.state === 'active') || null;
        const needsRideProfile = service !== 'food' && !rideProfile;
        return {
            service,
            label: SERVICE_LABEL[service],
            mode,
            enabled: mode !== 'commissionOnly',
            required: mode === 'subscriptionOnly',
            // With a live pass the ride / parcel commission is not charged
            commissionWaived: service !== 'food' && mode !== 'commissionOnly' && Boolean(current),
            // Ride and parcel passes can only be used once the partner has joined Ride & Parcel
            needsRideProfile,
            current,
            upcoming: mine.filter((item) => item.state === 'upcoming'),
            history: mine.slice(0, 10),
            plans: mode === 'commissionOnly'
                ? []
                : plans.filter((plan) => plan.service_type === service && planFitsPartner(plan, service, rideProfile)).map(serializePlan),
        };
    });

    return {
        modes,
        enabled: services.some((item) => item.enabled),
        pocketBalance: round2(pocket.pocketBalance),
        services,
    };
};

/**
 * Buy a plan from the Pocket. Decided under the same lock the Pocket withdrawal and the ride wallet merge use, and
 * re-checked after the pass exists, so two taps (or a tap and a withdrawal) can never spend the same rupees.
 * A renewal bought while a pass of that service is running starts when that pass ends.
 */
/** Everything that must be true before a partner may buy a plan (same for Pocket and online payment). */
const resolvePurchasablePlan = async (partnerId, planId) => {
    if (!mongoose.Types.ObjectId.isValid(String(planId || ''))) throw new ValidationError('Valid subscription plan id is required');

    const [plan, partner] = await Promise.all([
        SubscriptionPlan.findOne({ _id: planId, audience: 'delivery', active: true }).lean(),
        FoodDeliveryPartner.findById(partnerId).select('status rideMode.taxiDriverId').lean(),
    ]);
    if (!plan || !DELIVERY_SERVICES.includes(plan.service_type)) throw new NotFoundError('Subscription plan not found');
    if (!partner) throw new NotFoundError('Delivery partner not found');
    if (partner.status && partner.status !== 'approved') throw new ForbiddenError('Your account must be approved before you can buy a subscription.');

    const service = plan.service_type;
    const modes = await getDeliverySubscriptionModes();
    if (modes[service] === 'commissionOnly') throw new ValidationError('Subscription plans are not available for this work right now');

    const rideProfile = await loadRideProfile(partner);
    if (service !== 'food' && !rideProfile) {
        throw new ValidationError('Join Ride & Parcel first to buy a ride or parcel subscription.');
    }
    if (!planFitsPartner(plan, service, rideProfile)) throw new ForbiddenError('This plan is not available for your vehicle');

    return {
        plan,
        partner,
        service,
        amount: round2(plan.amount),
        durationDays: Math.max(1, Math.round(Number(plan.duration || 0))),
    };
};

/* ---------------------------------------------------------------------------------------------------------------- */
/* Buying online (Razorpay: Google Pay / PhonePe / UPI / card), no Pocket balance needed                             */
/* ---------------------------------------------------------------------------------------------------------------- */

const receiptPrefix = (partnerId) => `dsub_${String(partnerId).slice(-8)}_`;

export const createPartnerSubscriptionPaymentOrder = async ({ partnerId, planId }) => {
    const { plan, amount } = await resolvePurchasablePlan(partnerId, planId);
    if (amount < 1) throw new ValidationError('This plan is free. Buy it from your Pocket.');
    if (!isRazorpayConfigured()) throw new ValidationError('Razorpay payment gateway is not configured');

    try {
        const razorpay = await createRazorpayCheckoutOrder(
            Math.round(amount * 100),
            'INR',
            `${receiptPrefix(partnerId)}${Date.now()}`,
            { purpose: 'delivery_subscription', deliveryPartnerId: String(partnerId), planId: String(plan._id) },
        );
        return { razorpay, plan: serializePlan(plan) };
    } catch (error) {
        throw new ValidationError(error?.message || 'Payment gateway error');
    }
};

/**
 * Turns a paid Razorpay order into a pass. Safe to call any number of times and from both the app and the webhook:
 * the unique index on razorpayPaymentId means one payment can only ever create one pass.
 */
const activatePaidPass = async ({ partnerId, rzOrder, paymentId }) => {
    const existing = await FoodDeliveryPartnerSubscription.findOne({ razorpayPaymentId: paymentId }).lean();
    if (existing) {
        if (String(existing.partnerId) !== String(partnerId)) throw new ValidationError('This payment has already been used');
        return { subscription: serializePass(existing, new Date()), startsLater: new Date(existing.startedAt) > new Date(), alreadyRecorded: true };
    }

    const planId = String(rzOrder?.notes?.planId || '');
    // The plan is read WITHOUT the "active" filter: the partner already paid, so a plan hidden meanwhile must still be delivered
    const plan = mongoose.Types.ObjectId.isValid(planId)
        ? await SubscriptionPlan.findOne({ _id: planId, audience: 'delivery' }).lean()
        : null;
    if (!plan || !DELIVERY_SERVICES.includes(plan.service_type)) throw new NotFoundError('Subscription plan not found. Contact support with your payment id.');

    const service = plan.service_type;
    const durationDays = Math.max(1, Math.round(Number(plan.duration || 0)));
    const paidAmount = round2(Number(rzOrder.amount) / 100);

    return withPartnerWalletLock(partnerId, async () => {
        const now = new Date();
        const latest = await FoodDeliveryPartnerSubscription.findOne({ partnerId, service, status: 'active', expiresAt: { $gt: now } })
            .sort({ expiresAt: -1 }).lean();
        const startedAt = latest ? new Date(latest.expiresAt) : now;
        const expiresAt = new Date(startedAt.getTime() + durationDays * DAY_MS);

        try {
            const pass = await FoodDeliveryPartnerSubscription.create({
                partnerId, planId: plan._id, service, name: plan.name || '', description: plan.description || '',
                amount: paidAmount, durationDays, status: 'active', purchaseSource: 'razorpay',
                razorpayOrderId: String(rzOrder.id), razorpayPaymentId: paymentId,
                purchasedAt: now, startedAt, expiresAt,
            });
            return { subscription: serializePass(pass.toObject(), now), startsLater: startedAt > now };
        } catch (err) {
            if (err?.code !== 11000) throw err;
            const again = await FoodDeliveryPartnerSubscription.findOne({ razorpayPaymentId: paymentId }).lean();
            if (!again || String(again.partnerId) !== String(partnerId)) throw new ValidationError('This payment has already been used');
            return { subscription: serializePass(again, now), startsLater: new Date(again.startedAt) > now, alreadyRecorded: true };
        }
    });
};

export const verifyPartnerSubscriptionPayment = async (partnerId, payload = {}) => {
    const orderId = String(payload?.razorpayOrderId || '').trim();
    const paymentId = String(payload?.razorpayPaymentId || '').trim();
    const signature = String(payload?.razorpaySignature || '').trim();
    if (!orderId) throw new ValidationError('razorpayOrderId is required');
    if (!paymentId) throw new ValidationError('razorpayPaymentId is required');
    if (!signature) throw new ValidationError('razorpaySignature is required');
    if (!isRazorpayConfigured()) throw new ValidationError('Razorpay payment gateway is not configured');
    if (!verifyPaymentSignature(orderId, paymentId, signature)) throw new ValidationError('Payment verification failed');

    // Razorpay is the source of truth: a real, completed payment for a subscription order made by THIS partner
    let rzOrder;
    let rzPayment;
    try {
        [rzOrder, rzPayment] = await Promise.all([fetchRazorpayOrder(orderId), fetchRazorpayPayment(paymentId)]);
    } catch (err) {
        throw new ValidationError('We could not confirm this payment with the bank yet. If money was deducted, please try again in a minute.');
    }
    if (String(rzPayment?.order_id) !== orderId) throw new ValidationError('This payment does not belong to this order');
    if (!['captured', 'authorized'].includes(String(rzPayment?.status))) throw new ValidationError('Payment is not completed yet');
    if (Number(rzPayment?.amount) !== Number(rzOrder?.amount)) throw new ValidationError('Paid amount does not match the order');
    if (rzOrder?.notes?.purpose !== 'delivery_subscription' || !String(rzOrder?.receipt || '').startsWith(receiptPrefix(partnerId))) {
        throw new ValidationError('This order was not created by your account');
    }

    return activatePaidPass({ partnerId, rzOrder, paymentId });
};

/** Webhook path: gives the pass even if the app was closed right after paying. */
export const settlePartnerSubscriptionFromWebhook = async ({ rzOrder, paymentId, amountPaise }) => {
    const partnerId = String(rzOrder?.notes?.deliveryPartnerId || '').trim();
    if (rzOrder?.notes?.purpose !== 'delivery_subscription' || !partnerId) return { handled: false };
    if (!String(rzOrder?.receipt || '').startsWith(receiptPrefix(partnerId))) return { handled: true, recorded: false, reason: 'receipt mismatch' };
    if (Number(rzOrder.amount) !== Number(amountPaise)) return { handled: true, recorded: false, reason: 'amount mismatch' };

    const result = await activatePaidPass({ partnerId, rzOrder, paymentId });
    return { handled: true, recorded: !result.alreadyRecorded, partnerId };
};

export const purchasePartnerSubscription = async ({ partnerId, planId }) => {
    const { plan, partner, service, amount, durationDays } = await resolvePurchasablePlan(partnerId, planId);

    // Ride earnings are swept into the Pocket first (as the withdrawal does), outside the lock
    if (partner.rideMode?.taxiDriverId) {
        const { reconcileRideWallet } = await import('./hybridRide.service.js');
        await reconcileRideWallet(partnerId).catch(() => null);
    }

    return withPartnerWalletLock(partnerId, async () => {
        if (amount > 0) {
            const pocket = await getDeliveryPocketTotals(partnerId);
            if (pocket.pocketBalance < amount) {
                throw new ValidationError(
                    pocket.cashInHand > 0 && amount <= pocket.grossPocketBalance
                        ? `You are holding ₹${pocket.cashInHand} of COD cash. Deposit it first to use that balance.`
                        : `Insufficient Pocket balance. This plan costs ₹${amount}; you have ₹${round2(pocket.pocketBalance)}.`,
                );
            }
        }

        const now = new Date();
        const latest = await FoodDeliveryPartnerSubscription.findOne({ partnerId, service, status: 'active', expiresAt: { $gt: now } })
            .sort({ expiresAt: -1 }).lean();
        const startedAt = latest ? new Date(latest.expiresAt) : now;
        const expiresAt = new Date(startedAt.getTime() + durationDays * DAY_MS);

        const pass = await FoodDeliveryPartnerSubscription.create({
            partnerId, planId: plan._id, service, name: plan.name || '', description: plan.description || '',
            amount, durationDays, status: 'active', purchaseSource: 'pocket', purchasedAt: now, startedAt, expiresAt,
        });

        // The pass now counts in the Pocket; if the Pocket went below zero, undo it
        if (amount > 0) {
            const after = await getDeliveryPocketTotals(partnerId);
            if (after.rawPocketBalance < -0.009) {
                await FoodDeliveryPartnerSubscription.deleteOne({ _id: pass._id });
                throw new ValidationError('Insufficient Pocket balance');
            }
        }

        return {
            subscription: serializePass(pass.toObject(), new Date()),
            startsLater: startedAt > now,
            pocketBalance: round2((await getDeliveryPocketTotals(partnerId)).pocketBalance),
        };
    });
};

/* ---------------------------------------------------------------------------------------------------------------- */
/* Admin side                                                                                                        */
/* ---------------------------------------------------------------------------------------------------------------- */

export const getDeliverySubscriptionAdminOverview = async () => {
    const [modes, plans] = await Promise.all([
        getDeliverySubscriptionModes(),
        SubscriptionPlan.find({ audience: 'delivery' }).sort({ service_type: 1, amount: 1 }).populate('vehicle_type_id', 'name').lean(),
    ]);
    return { modes, plans };
};

export const createDeliverySubscriptionPlan = async (payload = {}) => {
    const name = String(payload.name || '').trim();
    if (!name) throw new ValidationError('Plan name is required');
    const service = String(payload.service_type || payload.service || '').trim().toLowerCase();
    if (!DELIVERY_SERVICES.includes(service)) throw new ValidationError('Choose what the plan is for: food, ride or parcel');

    const amount = Number(payload.amount);
    const duration = Math.round(Number(payload.duration));
    if (!Number.isFinite(amount) || amount < 0) throw new ValidationError('A valid plan amount is required');
    if (!Number.isFinite(duration) || duration < 1) throw new ValidationError('Plan duration must be at least 1 day');
    const vehicleTypeId = payload.vehicle_type_id || undefined;
    if (vehicleTypeId && !mongoose.Types.ObjectId.isValid(String(vehicleTypeId))) throw new ValidationError('Valid vehicle type is required');
    if (service === 'food' && vehicleTypeId) throw new ValidationError('A food plan is not tied to a vehicle type');

    const plan = await SubscriptionPlan.create({
        audience: 'delivery',
        service_type: service,
        name,
        description: String(payload.description || '').trim(),
        how_it_works: String(payload.how_it_works || '').trim(),
        transport_type: service === 'food' ? 'delivery' : (service === 'parcel' ? 'delivery' : 'taxi'),
        vehicle_type_id: vehicleTypeId,
        amount,
        duration,
        benefit_type: 'standard',
        ride_limit: 0,
        active: payload.active !== undefined ? Boolean(payload.active) : true,
    });
    return plan.toObject();
};

export const updateDeliverySubscriptionPlan = async (id, payload = {}) => {
    if (!mongoose.Types.ObjectId.isValid(String(id || ''))) throw new ValidationError('Valid plan id is required');
    const set = {};
    if (payload.name !== undefined) {
        const name = String(payload.name).trim();
        if (!name) throw new ValidationError('Plan name is required');
        set.name = name;
    }
    if (payload.description !== undefined) set.description = String(payload.description || '').trim();
    if (payload.how_it_works !== undefined) set.how_it_works = String(payload.how_it_works || '').trim();
    if (payload.amount !== undefined) {
        const amount = Number(payload.amount);
        if (!Number.isFinite(amount) || amount < 0) throw new ValidationError('A valid plan amount is required');
        set.amount = amount;
    }
    if (payload.duration !== undefined) {
        const duration = Math.round(Number(payload.duration));
        if (!Number.isFinite(duration) || duration < 1) throw new ValidationError('Plan duration must be at least 1 day');
        set.duration = duration;
    }
    if (payload.active !== undefined) set.active = Boolean(payload.active);
    // Passes already sold keep their own copy of name / price / days, so this only changes what is sold from now on
    const plan = await SubscriptionPlan.findOneAndUpdate({ _id: id, audience: 'delivery' }, { $set: set }, { new: true }).lean();
    if (!plan) throw new NotFoundError('Subscription plan not found');
    return plan;
};

export const listPartnerSubscribersForAdmin = async ({ page = 1, limit = 50, state = '', service = '' } = {}) => {
    const safePage = Math.max(1, Number(page) || 1);
    const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
    const now = new Date();

    const filter = {};
    if (DELIVERY_SERVICES.includes(service)) filter.service = service;
    if (state === 'active') Object.assign(filter, { status: 'active', startedAt: { $lte: now }, expiresAt: { $gt: now } });
    else if (state === 'expired') filter.expiresAt = { $lte: now };
    else if (state === 'upcoming') Object.assign(filter, { status: 'active', startedAt: { $gt: now } });
    else if (state === 'cancelled') filter.status = 'cancelled';

    const liveAll = { status: 'active', startedAt: { $lte: now }, expiresAt: { $gt: now } };
    const [items, total, activeRows] = await Promise.all([
        FoodDeliveryPartnerSubscription.find(filter)
            .sort({ purchasedAt: -1 })
            .skip((safePage - 1) * safeLimit)
            .limit(safeLimit)
            .populate('partnerId', 'name phone')
            .lean(),
        FoodDeliveryPartnerSubscription.countDocuments(filter),
        FoodDeliveryPartnerSubscription.aggregate([{ $match: liveAll }, { $group: { _id: '$service', count: { $sum: 1 } } }]),
    ]);
    const activeByService = Object.fromEntries(activeRows.map((row) => [row._id, row.count]));

    return {
        results: items.map((item) => ({
            ...serializePass(item, now),
            partner: item.partnerId?._id
                ? { id: String(item.partnerId._id), name: item.partnerId.name || '', phone: item.partnerId.phone || '' }
                : null,
        })),
        summary: { activeNow: Object.values(activeByService).reduce((a, b) => a + b, 0), activeByService, total },
        paginator: { current_page: safePage, per_page: safeLimit, total, last_page: Math.max(1, Math.ceil(total / safeLimit)) },
    };
};

/** Admin gives a pass for free (support, promotion, compensation). Starts when the running pass of that service ends. */
export const grantPartnerSubscription = async ({ partnerId, phone = '', planId, adminId = null }) => {
    // The admin screen asks for the partner's phone number; an id also works
    if (!mongoose.Types.ObjectId.isValid(String(partnerId || ''))) {
        const digits = String(phone || '').replace(/[^0-9]/g, '').slice(-10);
        if (digits.length < 10) throw new ValidationError('Enter the 10-digit phone number of the delivery partner');
        const found = await FoodDeliveryPartner.findOne({ phone: { $regex: `${digits}$` } }).select('_id').lean();
        if (!found) throw new NotFoundError('No delivery partner found with this phone number');
        partnerId = found._id;
    }
    if (!mongoose.Types.ObjectId.isValid(String(planId || ''))) throw new ValidationError('Valid plan is required');
    const [plan, partner] = await Promise.all([
        SubscriptionPlan.findOne({ _id: planId, audience: 'delivery' }).lean(),
        FoodDeliveryPartner.findById(partnerId).select('_id').lean(),
    ]);
    if (!plan || !DELIVERY_SERVICES.includes(plan.service_type)) throw new NotFoundError('Subscription plan not found');
    if (!partner) throw new NotFoundError('Delivery partner not found');

    const service = plan.service_type;
    const durationDays = Math.max(1, Math.round(Number(plan.duration || 0)));
    const now = new Date();
    const latest = await FoodDeliveryPartnerSubscription.findOne({ partnerId, service, status: 'active', expiresAt: { $gt: now } })
        .sort({ expiresAt: -1 }).lean();
    const startedAt = latest ? new Date(latest.expiresAt) : now;

    const pass = await FoodDeliveryPartnerSubscription.create({
        partnerId, planId: plan._id, service, name: plan.name || '', description: plan.description || '',
        amount: 0, durationDays, status: 'active', purchaseSource: 'admin',
        grantedBy: mongoose.Types.ObjectId.isValid(String(adminId || '')) ? adminId : null,
        purchasedAt: now, startedAt, expiresAt: new Date(startedAt.getTime() + durationDays * DAY_MS),
    });
    return serializePass(pass.toObject(), now);
};

/** Stop a pass (wrongly given, abuse). Money paid from the Pocket is not returned automatically; credit a bonus if needed. */
export const cancelPartnerSubscription = async (id, reason = '') => {
    if (!mongoose.Types.ObjectId.isValid(String(id || ''))) throw new ValidationError('Valid subscription id is required');
    const pass = await FoodDeliveryPartnerSubscription.findOneAndUpdate(
        { _id: id, status: 'active' },
        { $set: { status: 'cancelled', cancelledAt: new Date(), cancelReason: String(reason || '').trim() } },
        { new: true },
    ).lean();
    if (!pass) throw new NotFoundError('Active subscription not found');
    return serializePass(pass, new Date());
};
