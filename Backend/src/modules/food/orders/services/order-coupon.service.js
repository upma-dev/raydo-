import { FoodOffer } from '../../admin/models/offer.model.js';
import { FoodOfferUsage } from '../../admin/models/offerUsage.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

/**
 * Coupon usage is claimed with ATOMIC updates that carry the limit inside the filter, so two orders placed at the
 * same moment can never both take the last use of a coupon (the old code read the count, then incremented later).
 */

/** Take one use of the coupon for this user. Throws if a limit was reached in the meantime. Returns a claim to release on failure. */
export async function claimCoupon({ code, userId }) {
  const couponCode = String(code || '').trim().toUpperCase();
  if (!couponCode || !userId) return null;

  const offer = await FoodOffer.findOne({ couponCode }).select('_id usageLimit perUserLimit').lean();
  if (!offer) return null;

  const limit = Number(offer.usageLimit) > 0 ? Number(offer.usageLimit) : 0;
  const perUser = Number(offer.perUserLimit) > 0 ? Number(offer.perUserLimit) : 0;

  const globalFilter = { _id: offer._id };
  if (limit) globalFilter.$or = [{ usedCount: { $exists: false } }, { usedCount: { $lt: limit } }];
  const global = await FoodOffer.updateOne(globalFilter, { $inc: { usedCount: 1 } });
  if (!global.modifiedCount) throw new ValidationError('This coupon has reached its usage limit');

  try {
    const userFilter = { offerId: offer._id, userId };
    if (perUser) userFilter.count = { $lt: perUser };
    // With a limit, a user already at it makes the upsert try to insert a second (offerId,userId) row -> duplicate key
    await FoodOfferUsage.updateOne(userFilter, { $inc: { count: 1 }, $set: { lastUsedAt: new Date() } }, { upsert: true });
  } catch (err) {
    await FoodOffer.updateOne({ _id: offer._id, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } }).catch(() => {});
    if (err?.code === 11000) throw new ValidationError('You have already used this coupon the maximum number of times');
    throw err;
  }

  return { offerId: offer._id, userId };
}

/** Give a claimed use back (the order failed before it was placed). */
export async function releaseCouponClaim(claim) {
  if (!claim) return;
  try {
    await FoodOffer.updateOne({ _id: claim.offerId, usedCount: { $gt: 0 } }, { $inc: { usedCount: -1 } });
    await FoodOfferUsage.updateOne({ offerId: claim.offerId, userId: claim.userId, count: { $gt: 0 } }, { $inc: { count: -1 } });
  } catch {
    // never hide the original failure
  }
}
