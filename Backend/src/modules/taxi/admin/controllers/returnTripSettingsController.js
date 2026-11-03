import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { getReturnTripConfig, updateReturnTripConfig } from '../../services/returnTripService.js';

export const getReturnTripSettings = asyncHandler(async (_req, res) => {
  res.json({ success: true, data: await getReturnTripConfig({ fresh: true }) });
});

export const saveReturnTripSettings = asyncHandler(async (req, res) => {
  res.json({ success: true, data: await updateReturnTripConfig(req.body || {}) });
});
