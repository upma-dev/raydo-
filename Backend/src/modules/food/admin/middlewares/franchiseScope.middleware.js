import mongoose from 'mongoose';
import { ForbiddenError, NotFoundError } from '../../../../core/auth/errors.js';

/**
 * FRANCHISE DATA ISOLATION for the shared food admin API.
 *
 * A franchise login uses the same /v1/food/admin routes as the platform admins, so every route that takes an id
 * must prove the record belongs to the caller's franchise. All checks are no-ops for non-franchise admins.
 * The franchise id always comes from req.adminContext (loaded from the DB by attachFoodAdminContext), never from
 * the request. A record of another franchise answers 404 (not 403) so ids cannot be probed.
 */

const fidOf = (req) => (req.adminContext?.franchiseId ? String(req.adminContext.franchiseId) : null);
const model = (name) => mongoose.models[name];
const oid = (v) => new mongoose.Types.ObjectId(String(v));
const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

const notFound = (what) => new NotFoundError(`${what} not found`);

/** Restaurant ids owned by the franchise (cached on the request). */
export async function franchiseRestaurantIds(req) {
    if (req._franchiseRestaurantIds) return req._franchiseRestaurantIds;
    const fid = fidOf(req);
    const ids = fid ? await model('FoodRestaurant').find({ franchiseId: oid(fid) }).distinct('_id') : [];
    req._franchiseRestaurantIds = ids;
    return ids;
}

const restaurantOwned = async (fid, restaurantId) =>
    isId(restaurantId) && Boolean(await model('FoodRestaurant').exists({ _id: oid(restaurantId), franchiseId: oid(fid) }));

/** Build a guard: `check(req, fid)` resolves true when the record belongs to the franchise. */
const guard = (what, check) => async (req, _res, next) => {
    const fid = fidOf(req);
    if (!fid) return next();
    try {
        return (await check(req, fid)) ? next() : next(notFound(what));
    } catch (err) {
        return next(err);
    }
};

export const ownRestaurant = (param = 'id') => guard('Restaurant', (req, fid) => restaurantOwned(fid, req.params[param]));

/**
 * Join requests: a new restaurant in the franchise's food zone has no franchise yet. The franchise may view,
 * approve or reject it; with `claim` (approve) the restaurant is stamped with the franchise so its orders count for it.
 */
export const ownOrZoneRestaurant = (param = 'id', { claim = false } = {}) => guard('Restaurant', async (req, fid) => {
    const id = req.params[param];
    if (!isId(id)) return false;
    const r = await model('FoodRestaurant').findById(id).select('franchiseId zoneId').lean();
    if (!r) return false;
    if (r.franchiseId) return String(r.franchiseId) === fid;
    const app = await model('FranchiseApplication').findById(fid).select('zoneId').lean();
    if (!app?.zoneId || String(r.zoneId || '') !== String(app.zoneId)) return false;
    if (claim) {
        await model('FoodRestaurant').updateOne({ _id: r._id, franchiseId: null }, { $set: { franchiseId: oid(fid) } });
    }
    return true;
});

export const ownFood = (param = 'id') => guard('Food item', async (req, fid) => {
    if (!isId(req.params[param])) return false;
    const item = await model('FoodItem').findById(req.params[param]).select('restaurantId').lean();
    return Boolean(item) && restaurantOwned(fid, item.restaurantId);
});

export const ownAddon = (param = 'id') => guard('Addon', async (req, fid) => {
    if (!isId(req.params[param])) return false;
    const addon = await model('FoodAddon').findById(req.params[param]).select('restaurantId').lean();
    return Boolean(addon) && restaurantOwned(fid, addon.restaurantId);
});

/**
 * Categories: a franchise may change its own categories and those private to its restaurants.
 * Global/platform categories stay read-only for it.
 */
export const ownCategory = (param = 'id') => guard('Category', async (req, fid) => {
    if (!isId(req.params[param])) return false;
    const c = await model('FoodCategory').findById(req.params[param]).select('franchiseId restaurantId').lean();
    if (!c) return false;
    if (c.franchiseId && String(c.franchiseId) === fid) return true;
    return Boolean(c.restaurantId) && restaurantOwned(fid, c.restaurantId);
});

/** Orders are addressed by Mongo id or by the readable order id. */
export const ownOrder = (param = 'orderId') => guard('Order', async (req, fid) => {
    const ref = String(req.params[param] || '');
    const or = [{ order_id: ref }, { orderId: ref }];
    if (isId(ref)) or.push({ _id: oid(ref) });
    return Boolean(await model('FoodOrder').exists({ $or: or, franchiseId: oid(fid) }));
});

export const ownComplaint = (param = 'id') => guard('Complaint', async (req, fid) => {
    if (!isId(req.params[param])) return false;
    const t = await model('FoodSupportTicket').findById(req.params[param]).select('restaurantId').lean();
    return Boolean(t?.restaurantId) && restaurantOwned(fid, t.restaurantId);
});

/** The restaurant named in the request body (create food, bulk approve) must be the franchise's own (and present). */
export const ownRestaurantInBody = (key = 'restaurantId') => guard('Restaurant', (req, fid) => restaurantOwned(fid, req.body?.[key]));

/** For list endpoints: pin the franchise filter (overwrites anything the client sent). */
export const pinFranchiseQuery = async (req, _res, next) => {
    const fid = fidOf(req);
    if (!fid) return next();
    try {
        req.query.franchiseId = fid;
        req.query.restaurantIds = (await franchiseRestaurantIds(req)).map(String).join(',');
        if (req.query.restaurantId && !(await restaurantOwned(fid, req.query.restaurantId))) {
            req.query.restaurantId = '000000000000000000000000';
        }
        return next();
    } catch (err) {
        return next(err);
    }
};

/** Platform-only actions (global data / platform money / destructive). */
export const denyFranchise = (message = 'Not available for franchise accounts') => (req, _res, next) =>
    (fidOf(req) ? next(new ForbiddenError(message)) : next());

/** A franchise may not move a record to another franchise / territory or change platform commission on it. */
export const stripFranchiseOwnedFields = (fields = ['franchiseId', 'territoryId', 'commission', 'commissionRate', 'restaurantCommission', 'isFeatured', 'zoneFeaturedRank']) => (req, _res, next) => {
    if (!fidOf(req) || !req.body || typeof req.body !== 'object') return next();
    fields.forEach((f) => { delete req.body[f]; });
    return next();
};

/** Restaurants a franchise creates or moves must stay inside its own food zone. */
export const forceFranchiseZone = async (req, _res, next) => {
    const fid = fidOf(req);
    if (!fid || !req.body || typeof req.body !== 'object') return next();
    try {
        const app = await model('FranchiseApplication').findById(fid).select('zoneId').lean();
        if (!app?.zoneId) return next(new ForbiddenError('Your franchise has no food zone yet. Contact the admin.'));
        if (req.body.zoneId !== undefined && String(req.body.zoneId) !== String(app.zoneId)) {
            return next(new ForbiddenError('Restaurants can only be added to your own zone'));
        }
        if (req.method === 'POST') req.body.zoneId = String(app.zoneId);
        return next();
    } catch (err) {
        return next(err);
    }
};
