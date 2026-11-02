import mongoose from 'mongoose';
import { FoodZone } from '../../admin/models/zone.model.js';

/**
 * An incentive can be tied to one zone (e.g. Indore). It then counts only for partners who are inside that zone right now.
 * An incentive without a zone is for everyone. Returns a function: (addon) => boolean for one partner.
 */
export async function buildAddonZoneMatcher(partner) {
  const { isPartnerInActiveZoneSync } = await import('../../orders/services/order-dispatch.service.js');
  const zones = await FoodZone.find({ isActive: true }).select('_id coordinates').lean();
  return (addon) => {
    if (!addon?.zoneId || !mongoose.Types.ObjectId.isValid(String(addon.zoneId))) return true;
    if (!partner) return false;
    return isPartnerInActiveZoneSync(partner.lastLat, partner.lastLng, String(addon.zoneId), zones);
  };
}
