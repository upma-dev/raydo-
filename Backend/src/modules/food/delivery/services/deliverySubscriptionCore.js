import mongoose from 'mongoose';
import { FoodDeliveryPartnerSubscription } from '../models/deliveryPartnerSubscription.model.js';
import { AdminBusinessSetting } from '../../../taxi/admin/models/AdminBusinessSetting.js';
import { ForbiddenError, ValidationError } from '../../../../core/auth/errors.js';

/**
 * DELIVERY PARTNER SUBSCRIPTION - the rules (models only, no wallet / dispatch imports, so the taxi wallet service,
 * taxi matching and food dispatch can all import this safely).
 *
 * A delivery partner can earn from three kinds of work, and admin decides for EACH one how it is paid for:
 *   food   - food delivery orders
 *   ride   - two-wheeler (bike / scooter) rides taken from the delivery app
 *   parcel - parcel deliveries taken from the delivery app
 *
 * Admin (Food admin > Deliveryman > Delivery Subscription) sets one mode per kind of work:
 *   commissionOnly   - no pass is needed or sold (rides / parcels pay the usual commission).
 *   subscriptionOnly - the partner needs a live pass for that work: without it no requests are offered and accepting is
 *                      refused. Rides / parcels pay no commission while the pass lasts.
 *   both             - (ride / parcel only) a pass is optional: with one there is no commission, without one the
 *                      commission is charged. Food has no commission to waive, so food supports only commissionOnly
 *                      and subscriptionOnly.
 */

export const DELIVERY_SERVICES = ['food', 'ride', 'parcel'];
export const SUBSCRIPTION_MODES = ['commissionOnly', 'subscriptionOnly', 'both'];

export const SERVICE_LABEL = { food: 'Food delivery', ride: 'Two-wheeler ride', parcel: 'Parcel delivery' };

/** The Ride.serviceType -> pass service. Intercity trips count as rides. */
export const passServiceForRide = (serviceType) => (String(serviceType || '').toLowerCase() === 'parcel' ? 'parcel' : 'ride');

const codedForbidden = (message, code) => {
    const err = new ForbiddenError(message);
    err.code = code;
    return err;
};

export const subscriptionRequiredError = (service) =>
    codedForbidden(
        `An active ${SERVICE_LABEL[service] || 'delivery'} subscription is required. Buy a plan in Profile > Subscription.`,
        'SUBSCRIPTION_REQUIRED',
    );

/* ---------------------------------------------------------------------------------------------------------------- */
/* Settings                                                                                                          */
/* ---------------------------------------------------------------------------------------------------------------- */

const normalizeMode = (service, value) => {
    const mode = String(value || '').trim();
    if (!SUBSCRIPTION_MODES.includes(mode)) return 'commissionOnly';
    // Food has no commission, so "optional pass" would give nothing
    if (service === 'food' && mode === 'both') return 'commissionOnly';
    return mode;
};

/** { food, ride, parcel } -> mode of each. Anything not set is commissionOnly (no pass needed). */
export const getDeliverySubscriptionModes = async () => {
    const setting = await AdminBusinessSetting.findOne({ scope: 'default' }, { subscription: 1, _id: 0 }).lean();
    const raw = setting?.subscription?.delivery || {};
    return Object.fromEntries(DELIVERY_SERVICES.map((service) => [service, normalizeMode(service, raw[service])]));
};

export const updateDeliverySubscriptionModes = async (payload = {}) => {
    const update = {};
    for (const service of DELIVERY_SERVICES) {
        if (payload[service] === undefined) continue;
        const mode = String(payload[service] || '').trim();
        if (!SUBSCRIPTION_MODES.includes(mode)) throw new ValidationError(`Invalid subscription mode for ${service}`);
        if (service === 'food' && mode === 'both') {
            throw new ValidationError('Food delivery supports only "commission only" or "subscription only" (there is no commission to waive).');
        }
        update[`subscription.delivery.${service}`] = mode;
    }
    if (Object.keys(update).length === 0) throw new ValidationError('Nothing to update');
    await AdminBusinessSetting.findOneAndUpdate({ scope: 'default' }, { $set: update }, { upsert: true });
    return getDeliverySubscriptionModes();
};

/* ---------------------------------------------------------------------------------------------------------------- */
/* The rules (used by dispatch, accepting and the ride wallet)                                                       */
/* ---------------------------------------------------------------------------------------------------------------- */

const liveFilter = (at) => ({ status: 'active', startedAt: { $lte: at }, expiresAt: { $gt: at } });

export const findLivePartnerPass = async (partnerId, service, at = new Date(), { session = null } = {}) => {
    if (!partnerId || !mongoose.Types.ObjectId.isValid(String(partnerId))) return null;
    const query = FoodDeliveryPartnerSubscription.findOne({ partnerId, service, ...liveFilter(at) }).sort({ expiresAt: -1 });
    if (session) query.session(session);
    return query.lean();
};

/** True when a live pass removes the ride / parcel commission for this partner at that moment. */
export const partnerPassWaivesCommission = async (partnerId, service, at = new Date(), { session = null } = {}) => {
    if (service === 'food') return false;
    const modes = await getDeliverySubscriptionModes();
    if (modes[service] === 'commissionOnly') return false;
    return Boolean(await findLivePartnerPass(partnerId, service, at, { session }));
};

/** subscriptionOnly for this work and no live pass -> the partner may not work it. */
export const isPassMissing = async (partnerId, service) => {
    const modes = await getDeliverySubscriptionModes();
    if (modes[service] !== 'subscriptionOnly') return false;
    return !(await findLivePartnerPass(partnerId, service));
};

export const assertPartnerMayWork = async (partnerId, service) => {
    if (await isPassMissing(partnerId, service)) throw subscriptionRequiredError(service);
};

/**
 * Dispatch priority: of these partner ids, the ones holding a live pass for this work. Counted only when passes are in use
 * for it (mode is not commissionOnly), so a leftover pass never gives priority while subscriptions are off.
 */
export const partnerIdsWithLivePass = async (partnerIds = [], service) => {
    const ids = [...new Set(partnerIds.filter(Boolean).map((id) => String(id?._id || id)))];
    if (ids.length === 0) return new Set();
    const modes = await getDeliverySubscriptionModes();
    if (modes[service] === 'commissionOnly') return new Set();
    const live = await FoodDeliveryPartnerSubscription.distinct('partnerId', {
        partnerId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
        service,
        ...liveFilter(new Date()),
    });
    return new Set(live.map(String));
};

/**
 * Dispatch filter: of these partner ids, the ones that must NOT be offered this kind of work because the work is
 * subscription-only and they have no live pass. Returns a Set of id strings (empty when passes are not required).
 */
export const partnerIdsMissingPass = async (partnerIds = [], service) => {
    const ids = [...new Set(partnerIds.filter(Boolean).map((id) => String(id?._id || id)))];
    const blocked = new Set();
    if (ids.length === 0) return blocked;
    const modes = await getDeliverySubscriptionModes();
    if (modes[service] !== 'subscriptionOnly') return blocked;

    const now = new Date();
    const liveIds = await FoodDeliveryPartnerSubscription.distinct('partnerId', {
        partnerId: { $in: ids.map((id) => new mongoose.Types.ObjectId(id)) },
        service,
        ...liveFilter(now),
    });
    const live = new Set(liveIds.map(String));
    ids.forEach((id) => { if (!live.has(id)) blocked.add(id); });
    return blocked;
};

