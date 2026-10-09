import { ApiError } from '../../../utils/ApiError.js';
import { Ride } from '../user/models/Ride.js';
import { UserWallet } from '../user/models/UserWallet.js';
import { applyDriverWalletAdjustment } from '../driver/services/walletService.js';
import { reverseFranchiseCommission } from '../admin/services/taxiFranchiseService.js';
import { resolveConfiguredGatewayCredentials } from './paymentGatewayService.js';
import { sendPushNotificationToEntities } from './pushNotificationService.js';

/**
 * REFUND OF A COMPLETED TAXI RIDE (admin).
 * Before this existed a completed ride could never be refunded: the rider was out of money with no way back.
 *
 *  - Rider side:   paid with Razorpay  -> refunded to the original payment method through Razorpay
 *                  paid with wallet / cash -> credited to the rider's Raydo wallet
 *  - Driver side:  the driver's earning for this ride is taken back from the driver wallet (proportional to the refund),
 *                  unless the admin chooses that the platform bears it
 *  - Franchise:    a FULL refund also takes back the franchise commission of the ride
 *  - Safe to retry: a ride is claimed atomically ('processing'), so double clicks / two admins cannot refund twice.
 *    A failed gateway refund can be retried.
 */

const round2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const PAID = new Set(['paid', 'captured', 'completed']);

const razorpayCall = async ({ method, path, body, keyId, keySecret }) => {
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(502, payload?.error?.description || payload?.error?.message || 'Razorpay request failed');
  }
  return payload;
};

/** The ride stores the QR / payment-link id when the driver collected the money; find the real payment id behind it. */
const resolveRazorpayPaymentId = async (collection, creds) => {
  if (collection.providerPaymentId) return String(collection.providerPaymentId);
  const providerId = String(collection.providerId || '').trim();
  if (!providerId) return '';
  if (providerId.startsWith('pay_')) return providerId;
  if (String(collection.providerMode || '').includes('payment_link')) {
    const link = await razorpayCall({ method: 'GET', path: `/payment_links/${encodeURIComponent(providerId)}`, ...creds });
    return String(link?.payments?.[0]?.payment_id || '');
  }
  const list = await razorpayCall({ method: 'GET', path: `/payments/qr_codes/${encodeURIComponent(providerId)}/payments`, ...creds });
  return String(list?.items?.[0]?.id || '');
};

const creditRiderWallet = async ({ userId, amount, rideId, reason }) => {
  const referenceKey = `ride_refund_${rideId}`;
  await UserWallet.updateOne(
    { userId },
    { $setOnInsert: { userId, balance: 0, refundWallet: 0, transactions: [] } },
    { upsert: true },
  ).catch(() => null);

  const result = await UserWallet.updateOne(
    { userId, 'transactions.referenceKey': { $ne: referenceKey } }, // never credited twice for the same ride
    {
      $inc: { balance: amount },
      $push: {
        transactions: {
          $each: [{ kind: 'credit', amount, title: reason || 'Ride refund', provider: 'ride_refund', providerPaymentId: referenceKey, referenceKey }],
          $slice: -50,
        },
      },
    },
  );
  return { credited: result.modifiedCount > 0, referenceKey };
};

export const refundCompletedRide = async ({ rideId, amount, reason = '', method = 'auto', deductFromDriver = true, adminId = null }) => {
  const ride = await Ride.findById(rideId);
  if (!ride) throw new ApiError(404, 'Ride not found');
  if (String(ride.status) !== 'completed') throw new ApiError(400, 'Only a completed ride can be refunded. Cancel the ride instead.');

  const fare = round2(ride.fare);
  if (!(fare > 0)) throw new ApiError(400, 'This ride has no fare to refund');

  const refundAmount = amount === undefined || amount === null || amount === '' ? fare : round2(amount);
  if (!(refundAmount > 0) || refundAmount > fare) throw new ApiError(400, `Refund must be between 0.01 and the ride fare (${fare})`);

  // Claim the ride. 'failed' may be retried; 'processing' / 'processed' may not.
  const claimed = await Ride.findOneAndUpdate(
    { _id: ride._id, 'adminRefund.status': { $nin: ['processing', 'processed'] } },
    { $set: { 'adminRefund.status': 'processing', 'adminRefund.amount': refundAmount, 'adminRefund.reason': String(reason || '').slice(0, 300), 'adminRefund.requestedAt': new Date(), 'adminRefund.error': '' } },
    { new: true },
  );
  if (!claimed) throw new ApiError(409, 'This ride has already been refunded (or a refund is in progress).');

  const fail = async (message, status = 502) => {
    await Ride.updateOne({ _id: ride._id }, { $set: { 'adminRefund.status': 'failed', 'adminRefund.error': String(message).slice(0, 300) } });
    throw new ApiError(status, `Refund failed: ${message}. You can try again.`);
  };

  // --- 1) Pay the rider back
  const collection = claimed.driverPaymentCollection?.toObject ? claimed.driverPaymentCollection.toObject() : (claimed.driverPaymentCollection || {});
  const paidOnline = String(claimed.paymentMethod) === 'online' && (collection.paidAt || PAID.has(String(collection.status || '').toLowerCase()));
  const paidWithRazorpay = paidOnline && String(collection.provider || '').toLowerCase() === 'razorpay';

  let chosen = String(method || 'auto').toLowerCase();
  if (chosen === 'auto') chosen = paidWithRazorpay ? 'razorpay' : 'wallet';
  if (chosen === 'razorpay' && !paidWithRazorpay) {
    return fail('this ride was not paid through Razorpay, so it can only be refunded to the rider wallet', 400);
  }

  let refundRef = '';
  try {
    if (chosen === 'razorpay') {
      const creds = await resolveConfiguredGatewayCredentials('razor_pay');
      const paymentId = await resolveRazorpayPaymentId(collection, creds);
      if (!paymentId) return fail('could not find the Razorpay payment for this ride (refund it to the rider wallet instead)', 422);
      const refund = await razorpayCall({
        method: 'POST',
        path: `/payments/${encodeURIComponent(paymentId)}/refund`,
        body: { amount: Math.round(refundAmount * 100), notes: { rideId: String(ride._id), reason: String(reason || 'Ride refund').slice(0, 200) } },
        ...creds,
      });
      refundRef = String(refund?.id || '');
    } else {
      const credit = await creditRiderWallet({ userId: claimed.userId, amount: refundAmount, rideId: String(ride._id), reason: reason ? `Ride refund: ${reason}` : 'Ride refund' });
      refundRef = credit.referenceKey;
    }
  } catch (err) {
    if (err instanceof ApiError && err.statusCode === 502) return fail(err.message.replace(/^Refund failed: /, ''));
    if (err?.status || err?.statusCode) throw err;
    return fail(err?.message || 'gateway error');
  }

  // --- 2) Take the earning back from the driver (the rider is already refunded, so errors here are recorded, not thrown)
  let driverDebited = 0;
  let driverNote = '';
  if (deductFromDriver && claimed.driverId && Number(claimed.driverEarnings) > 0) {
    const debit = round2(Number(claimed.driverEarnings) * (refundAmount / fare));
    try {
      await applyDriverWalletAdjustment({
        driverId: claimed.driverId,
        rideId: claimed._id,
        amount: -debit,
        type: 'adjustment',
        description: 'Ride refunded to rider: earning taken back',
        metadata: { source: 'ride_refund', rideId: String(claimed._id), refundAmount, refundRef },
      });
      driverDebited = debit;
    } catch (err) {
      driverNote = `Driver wallet could not be debited: ${err?.message || err}`;
    }
  }

  // --- 3) Franchise commission of a fully refunded ride
  if (refundAmount >= fare) {
    await reverseFranchiseCommission({ rideId: claimed._id }).catch((e) => console.error('[Franchise] taxi commission reversal failed:', e?.message || e));
    try {
      const { reverseTaxiRide } = await import('../../food/admin/services/franchiseLedger.service.js');
      await reverseTaxiRide(claimed._id);
    } catch (e) {
      console.error('[Franchise] taxi ledger reversal failed:', e?.message || e);
    }
  }

  await Ride.updateOne({ _id: ride._id }, {
    $set: {
      'adminRefund.status': 'processed',
      'adminRefund.method': chosen,
      'adminRefund.refundId': refundRef,
      'adminRefund.driverDebited': driverDebited,
      'adminRefund.error': driverNote,
      'adminRefund.processedAt': new Date(),
      'adminRefund.processedBy': adminId ? String(adminId) : '',
    },
  });

  try {
    await sendPushNotificationToEntities({
      entityType: 'user',
      entityIds: [claimed.userId],
      title: 'Ride refund',
      body: chosen === 'razorpay'
        ? `₹${refundAmount} for your ride is being refunded to your original payment method (5-7 working days).`
        : `₹${refundAmount} for your ride has been added to your Raydo wallet.`,
      data: { rideId: String(ride._id), scope: 'ride_refund' },
    });
  } catch {
    // The refund is done; a failed notification must not undo or fail it
  }

  return { rideId: String(ride._id), amount: refundAmount, method: chosen, refundId: refundRef, driverDebited, note: driverNote };
};
