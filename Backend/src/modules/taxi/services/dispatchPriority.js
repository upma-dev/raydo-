/**
 * DISPATCH PRIORITY - who is asked first among the drivers / delivery partners that are INSIDE the search range.
 * Used by ride matching (matchingService) and food dispatch (order-dispatch.service), so both follow one rule:
 *
 *   1. a running subscription pass            (pass holders first)
 *   2. a return-trip match                    (the ride ends where the driver is heading back to; rides only)
 *   3. higher rating                          (rounded to 0.1, so 4.81 and 4.83 count as equal)
 *   4. nearer to the pickup / restaurant      (the old rule, now only the tie-breaker)
 *
 * The range itself (5 km ... 15 km for rides, the zone for food) is NOT changed by this: someone outside the range is
 * never asked, however good the rating is.
 */

// A driver / partner nobody has rated yet is treated as an average one, so new people are not pushed to the end forever
export const NEUTRAL_RATING = 4;
const FAR = 1e12;

export const effectiveRating = (rating, ratingCount) => {
  const value = Number(rating);
  const rounded = Number(ratingCount) > 0 && Number.isFinite(value) ? value : NEUTRAL_RATING;
  return Math.round(rounded * 10) / 10;
};

/** Sort comparator for { hasPass, isReturn, rating, distance } entries: pass, return match, rating, distance. */
export const compareDispatchPriority = (a, b) =>
  (Number(Boolean(b.hasPass)) - Number(Boolean(a.hasPass)))
  || (Number(Boolean(b.isReturn)) - Number(Boolean(a.isReturn)))
  || ((b.rating || 0) - (a.rating || 0))
  || ((Number.isFinite(a.distance) ? a.distance : FAR) - (Number.isFinite(b.distance) ? b.distance : FAR));
