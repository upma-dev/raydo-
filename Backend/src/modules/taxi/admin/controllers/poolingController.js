import { PoolingVehicle } from '../models/PoolingVehicle.js';
import { PoolingBooking } from '../models/PoolingBooking.js';
import { PoolingRoute } from '../models/PoolingRoute.js';
import { PoolingSeatReservation } from '../models/PoolingSeatReservation.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { uploadDataUrlToCloudinary } from '../../../../utils/cloudinaryUpload.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });
const created = (res, data, message) => res.status(201).json({ success: true, data, message });

// --- Pooling Vehicles ---

export const getPoolingVehicles = asyncHandler(async (req, res) => {
  const vehicles = await PoolingVehicle.find().sort({ createdAt: -1 });
  return ok(res, vehicles, 'Pooling vehicles fetched successfully');
});

export const createPoolingVehicle = asyncHandler(async (req, res) => {
  const vehicle = await PoolingVehicle.create(req.body);
  return created(res, vehicle, 'Pooling vehicle created successfully');
});

export const updatePoolingVehicle = asyncHandler(async (req, res) => {
  const vehicle = await PoolingVehicle.findByIdAndUpdate(req.params.id, req.body, { new: true });
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  return ok(res, vehicle, 'Pooling vehicle updated successfully');
});

export const deletePoolingVehicle = asyncHandler(async (req, res) => {
  const vehicle = await PoolingVehicle.findByIdAndDelete(req.params.id);
  if (!vehicle) throw new ApiError(404, 'Vehicle not found');
  return ok(res, null, 'Pooling vehicle deleted successfully');
});

// --- Pooling Bookings ---

export const getPoolingBookings = asyncHandler(async (req, res) => {
  const bookings = await PoolingBooking.find()
    .populate('user', 'name phone email')
    .populate('route', 'routeName originLabel destinationLabel')
    .populate('vehicle', 'name vehicleNumber')
    .sort({ createdAt: -1 });
  return ok(res, bookings, 'Pooling bookings fetched successfully');
});

const ALLOWED_BOOKING_STATUSES = ['confirmed', 'cancelled', 'completed', 'no_show'];

export const updatePoolingBookingStatus = asyncHandler(async (req, res) => {
  const status = String(req.body?.status || '').toLowerCase();
  if (!ALLOWED_BOOKING_STATUSES.includes(status)) {
    throw new ApiError(400, `status must be one of: ${ALLOWED_BOOKING_STATUSES.join(', ')}`);
  }
  const booking = await PoolingBooking.findByIdAndUpdate(req.params.id, { bookingStatus: status }, { new: true });
  if (!booking) throw new ApiError(404, 'Booking not found');

  if (['cancelled', 'no_show'].includes(status)) {
    await PoolingSeatReservation.deleteMany({ booking: booking._id });
  }

  // A trip the operator cancels is refunded in full, once. (No-show: the fare is kept.)
  // `refund: false` in the body skips the refund (for example when it was already paid back by hand).
  let refund = null;
  if (status === 'cancelled' && req.body?.refund !== false) {
    const claimed = await PoolingBooking.findOneAndUpdate(
      { _id: booking._id, paymentStatus: 'paid', 'payment.paymentId': { $exists: true, $ne: '' } },
      { $set: { paymentStatus: 'refunding' } },
    );
    if (claimed) {
      try {
        const { keyId, keySecret } = await resolveConfiguredGatewayCredentials('razor_pay');
        const response = await fetch(`https://api.razorpay.com/v1/payments/${encodeURIComponent(claimed.payment.paymentId)}/refund`, {
          method: 'POST',
          headers: { Authorization: `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ amount: Math.round(Number(claimed.fare) * 100), notes: { reason: 'Pooling trip cancelled', bookingId: claimed.bookingId } }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error?.description || 'Razorpay refund failed');
        refund = { status: 'processed', refundId: payload?.id || '', amount: claimed.fare };
        await PoolingBooking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'refunded', 'payment.refundId': payload?.id || '', 'payment.refundedAt': new Date() } });
      } catch (err) {
        refund = { status: 'failed', error: err?.message || 'Refund failed' };
        await PoolingBooking.updateOne({ _id: booking._id }, { $set: { paymentStatus: 'paid' } });   // can be retried
      }
    }
  }

  return ok(res, { ...booking.toObject(), refund }, 'Booking status updated successfully');
});

// --- Routes & Stops (Already mostly handled, but adding placeholders for consistency) ---

export const getPoolingRoutes = asyncHandler(async (req, res) => {
  const routes = await PoolingRoute.find().sort({ createdAt: -1 });
  return ok(res, routes, 'Pooling routes fetched successfully');
});

// --- Common Upload ---

export const uploadImage = asyncHandler(async (req, res) => {
  const { image } = req.body;
  if (!image) throw new ApiError(400, 'Image data is required');

  const result = await uploadDataUrlToCloudinary({
    dataUrl: image,
    publicIdPrefix: 'pooling-vehicle',
  });

  return ok(res, { url: result.secureUrl }, 'Image uploaded successfully');
});
