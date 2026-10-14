import { FoodFeeSettings } from '../models/feeSettings.model.js';

/**
 * The ONE GST rate of Raydo: the "GST rate (%)" the super admin sets in Fee Settings.
 * Every place that charges GST (food orders, platform fee, delivery fee, restaurant subscription, ...) must use this
 * and never a number typed into the code. No setting saved = 0%.
 */
export const normalizeGstRate = (value) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 && n <= 100 ? n : 0;
};

export async function getGstRatePercent() {
    const doc = await FoodFeeSettings.findOne({ isActive: true }).sort({ createdAt: -1 }).select('gstRate').lean();
    return normalizeGstRate(doc?.gstRate);
}

/** amount x rate%, rounded to paise (2 decimals). */
export const gstOn = (amount, ratePercent) =>
    Math.round((Number(amount) || 0) * (normalizeGstRate(ratePercent) / 100) * 100) / 100;
