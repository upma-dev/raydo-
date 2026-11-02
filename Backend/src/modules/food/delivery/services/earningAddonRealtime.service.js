import mongoose from 'mongoose';
import { getIO, rooms } from '../../../../config/socket.js';
import { FoodEarningAddonHistory } from '../../admin/models/earningAddonHistory.model.js';
import { getActiveEarningAddonsForPartner } from './delivery.service.js';

/**
 * Called right after a partner delivers an order. Finds the incentives ("complete N orders, earn a fixed amount") the partner
 * has just completed, credits them to the pocket at once (no waiting for an admin), and pushes the fresh progress to the
 * partner's screen so the counter at the top moves live.
 */
export async function refreshEarningAddonProgress(deliveryPartnerId) {
  if (!deliveryPartnerId || !mongoose.Types.ObjectId.isValid(String(deliveryPartnerId))) return null;
  const partnerId = String(deliveryPartnerId);

  // admin.service is large: load it only when needed
  const adminService = await import('../../admin/services/admin.service.js');
  const { completionsFound } = await adminService.checkEarningAddonCompletions(partnerId);

  const credited = [];
  if (completionsFound > 0) {
    const pending = await FoodEarningAddonHistory.find({ deliveryPartnerId: partnerId, status: 'pending' }).select('_id').lean();
    for (const item of pending) {
      const done = await adminService.creditEarningAddonHistory(String(item._id), 'Auto-credited on completion');
      if (done) credited.push({ amount: Number(done.earningAmount || 0) });
    }
  }

  const progress = await getActiveEarningAddonsForPartner(partnerId);
  const io = getIO();
  if (io) {
    const room = rooms.delivery(partnerId);
    io.to(room).emit('earning_addon_progress', progress);
    credited.forEach((item) => io.to(room).emit('earning_addon_credited', item));
  }
  return { progress, credited };
}
