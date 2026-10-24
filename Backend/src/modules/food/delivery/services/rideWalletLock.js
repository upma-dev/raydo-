import { FoodDeliveryPartner } from '../models/deliveryPartner.model.js';
import { ValidationError } from '../../../../core/auth/errors.js';

const LOCK_MS = 15000;
const RETRIES = 20;
const RETRY_DELAY_MS = 150;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Runs fn while holding the partner's Pocket lock. Used by the ride wallet merge and by Pocket withdrawals of partners
 * in Ride & Parcel mode, so both never decide on the same balance at the same moment. The lock expires by itself, so a
 * crashed process can never leave a partner locked out.
 */
export const withPartnerWalletLock = async (partnerId, fn) => {
    let locked = false;
    for (let attempt = 0; attempt < RETRIES && !locked; attempt += 1) {
        const now = new Date();
        const res = await FoodDeliveryPartner.updateOne(
            { _id: partnerId, $or: [{ 'rideMode.walletLockUntil': null }, { 'rideMode.walletLockUntil': { $lt: now } }] },
            { $set: { 'rideMode.walletLockUntil': new Date(now.getTime() + LOCK_MS) } }
        );
        locked = res.modifiedCount === 1;
        if (!locked) await wait(RETRY_DELAY_MS);
    }
    if (!locked) throw new ValidationError('Your wallet is being updated. Please try again in a few seconds.');

    try {
        return await fn();
    } finally {
        await FoodDeliveryPartner.updateOne({ _id: partnerId }, { $set: { 'rideMode.walletLockUntil': null } });
    }
};
