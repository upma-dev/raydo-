import crypto from 'node:crypto';
import { PoolingRoute } from '../../admin/models/PoolingRoute.js';
import { PoolingVehicle } from '../../admin/models/PoolingVehicle.js';
import { PoolingBooking } from '../../admin/models/PoolingBooking.js';
import { PoolingSeatReservation } from '../../admin/models/PoolingSeatReservation.js';
import { asyncHandler } from '../../../../utils/asyncHandler.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { resolveConfiguredGatewayCredentials } from '../../services/paymentGatewayService.js';

const ok = (res, data, message) => res.status(200).json({ success: true, data, message });
const created = (res, data, message) => res.status(201).json({ success: true, data, message });

const toCleanString = (value) => String(value || '').trim();

const normalizeTravelDate = (value) => {
  const rawValue = toCleanString(value);
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawValue)) {
    return rawValue;
  }

  const parsed = new Date(rawValue);
  if (!Number.isNaN(parsed.getTime())) {
    const year = parsed.getFullYear();
    const month = String(parsed.getMonth() + 1).padStart(2, '0');
    const day = String(parsed.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  throw new ApiError(400, 'travelDate must be in YYYY-MM-DD format');
};

const getCurrentUserId = (req) => String(req.auth?.sub || req.user?._id || '').trim();

const resolveRazorpayCredentials = async () => {
  return resolveConfiguredGatewayCredentials('razor_pay');
};

const razorpayRequest = async ({ method, path, body, keyId, keySecret }) => {
  const credentials = Buffer.from(`${keyId}:${keySecret}`).toString('base64');
  const response = await fetch(`https://api.razorpay.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${credentials}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.description || payload?.error?.message || 'Razorpay request failed');
  }

  return payload;
};

const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** The moment the schedule leaves on `travelDate` (India time), or null when the schedule has no usable time. */
const getDepartureMoment = (travelDate, schedule = {}, route = {}) => {
  const match = /^(\d{1,2}):(\d{2})/.exec(toCleanString(schedule?.departureTime || route?.departureTime));
  if (!match) return null;
  const [year, month, day] = travelDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, Number(match[1]), Number(match[2])) - IST_OFFSET_MS);
};

/** The route's own rules: seats per booking, how early you may book, and when booking closes before departure. */
const assertPoolingBookable = ({ route, schedule, travelDate, seatCount, now = new Date() }) => {
  const maxSeats = Number(route?.maxSeatsPerBooking || 0);
  if (maxSeats > 0 && seatCount > maxSeats) {
    throw new ApiError(400, `You can book at most ${maxSeats} seat(s) in one booking on this route`);
  }
  const departure = getDepartureMoment(travelDate, schedule, route);
  if (!departure) {
    // No departure time on the schedule: at least refuse a day that is already over (India time)
    const todayIst = new Date(now.getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);
    if (travelDate < todayIst) throw new ApiError(400, 'This travel date is in the past');
    return;
  }
  const bufferMs = Math.max(0, Number(route?.boardingBufferMinutes ?? 15)) * 60 * 1000;
  if (departure.getTime() - bufferMs <= now.getTime()) {
    throw new ApiError(400, 'Booking is closed for this departure');
  }
  const advanceHours = Number(route?.maxAdvanceBookingHours || 0);
  if (advanceHours > 0 && departure.getTime() - now.getTime() > advanceHours * 60 * 60 * 1000) {
    throw new ApiError(400, `This departure opens for booking ${advanceHours} hour(s) before it leaves`);
  }
};

const refundPayment = async ({ paymentId, amountPaise, reason, bookingCode = '' }) => {
  try {
    const { keyId, keySecret } = await resolveRazorpayCredentials();
    await razorpayRequest({
      method: 'POST',
      path: `/payments/${encodeURIComponent(paymentId)}/refund`,
      body: { amount: Math.round(amountPaise), notes: { reason, bookingId: bookingCode } },
      keyId,
      keySecret,
    });
    return true;
  } catch (refundError) {
    console.error('Pooling auto-refund failed (refund manually):', paymentId, refundError?.message || refundError);
    return false;
  }
};

const createPoolingBookingCode = () =>
  `POOL${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

const resolvePickupStop = (route, pickupStopId) => {
  const pickupPoints = Array.isArray(route?.pickupPoints) ? route.pickupPoints : [];
  const stops = Array.isArray(route?.stops) ? route.stops : [];
  return (
    pickupPoints.find((item) => String(item?.id || '') === String(pickupStopId || '')) ||
    stops.find((item) => String(item?.id || '') === String(pickupStopId || '')) ||
    pickupPoints[0] ||
    stops[0] ||
    null
  );
};

const resolveDropStop = (route, dropStopId) => {
  const dropPoints = Array.isArray(route?.dropPoints) ? route.dropPoints : [];
  const stops = Array.isArray(route?.stops) ? route.stops : [];
  return (
    dropPoints.find((item) => String(item?.id || '') === String(dropStopId || '')) ||
    stops.find((item) => String(item?.id || '') === String(dropStopId || '')) ||
    dropPoints[0] ||
    stops[stops.length - 1] ||
    null
  );
};

const getVehicleSeatIds = (vehicle = {}) => {
  const layout = Array.isArray(vehicle?.blueprint?.layout) ? vehicle.blueprint.layout : [];
  return layout
    .filter((item) => item?.type === 'seat')
    .map((item) => `${item.r}-${item.c}`);
};

const getBookedSeatIds = async ({ routeId, vehicleId, scheduleId, travelDate }) => {
  const reservations = await PoolingSeatReservation.find({
    route: routeId,
    vehicle: vehicleId,
    scheduleId,
    travelDate,
  })
    .select('seatId')
    .lean();

  return reservations.map((item) => String(item?.seatId || '')).filter(Boolean);
};

const computePoolingFareBreakdown = ({ route = {}, vehicle = {}, seatCount = 0 }) => {
  const safeSeatCount = Math.max(0, Number(seatCount || 0));
  const farePerSeat = Math.max(0, Number(route?.farePerSeat || 0));
  const baseFare = Math.round(farePerSeat * safeSeatCount * 100) / 100;
  const serviceTaxPercentage = Math.max(0, Math.min(100, Number(vehicle?.serviceTaxPercentage || 0)));
  const serviceTaxAmount = Math.round(baseFare * serviceTaxPercentage) / 100;
  const totalFare = Math.round((baseFare + serviceTaxAmount) * 100) / 100;

  return {
    farePerSeat,
    baseFare,
    serviceTaxPercentage,
    serviceTaxAmount,
    totalFare,
  };
};

const serializePoolingBooking = (booking) => {
  const route = booking?.route || booking?.routeId || {};
  const vehicle = booking?.vehicle || booking?.vehicleId || {};
  const user = booking?.user || booking?.userId || {};

  return {
    _id: booking?._id,
    bookingId: booking?.bookingId || '',
    user: user?._id ? user : undefined,
    route: route?._id ? route : undefined,
    vehicle: vehicle?._id ? vehicle : undefined,
    scheduleId: booking?.scheduleId || '',
    pickupStopId: booking?.pickupStopId || '',
    dropStopId: booking?.dropStopId || '',
    pickupLabel: booking?.pickupLabel || '',
    dropLabel: booking?.dropLabel || '',
    seatsBooked: Number(booking?.seatsBooked || 0),
    selectedSeats: Array.isArray(booking?.selectedSeats) ? booking.selectedSeats : [],
    fare: Number(booking?.fare || 0),
    baseFare: Number(booking?.baseFare || 0),
    serviceTaxPercentage: Number(booking?.serviceTaxPercentage || 0),
    serviceTaxAmount: Number(booking?.serviceTaxAmount || 0),
    currency: booking?.currency || 'INR',
    paymentStatus: booking?.paymentStatus || 'pending',
    bookingStatus: booking?.bookingStatus || 'confirmed',
    travelDate: booking?.travelDate || '',
    createdAt: booking?.createdAt || null,
    updatedAt: booking?.updatedAt || null,
    payment: booking?.payment || {},
  };
};

export const searchPoolingRoutes = asyncHandler(async (req, res) => {
  const { from, to } = req.query;

  const routes = await PoolingRoute.find({
    status: 'active',
    active: { $ne: false },
    $or: [
      { originLabel: { $regex: from || '', $options: 'i' } },
      { destinationLabel: { $regex: to || '', $options: 'i' } },
    ],
  }).populate('assignedVehicleTypeIds');

  return ok(res, routes, 'Routes fetched successfully');
});

export const getPoolingRouteDetails = asyncHandler(async (req, res) => {
  const route = await PoolingRoute.findById(req.params.id).populate('assignedVehicleTypeIds');

  if (!route) {
    throw new ApiError(404, 'Route not found');
  }

  const travelDate = toCleanString(req.query?.travelDate || req.query?.date);
  let seatAvailability = {};

  if (travelDate) {
    const normalizedTravelDate = normalizeTravelDate(travelDate);
    const vehicleIds = (Array.isArray(route.assignedVehicleTypeIds) ? route.assignedVehicleTypeIds : [])
      .map((item) => String(item?._id || item))
      .filter(Boolean);
    const scheduleIds = (Array.isArray(route.schedules) ? route.schedules : [])
      .filter((item) => String(item?.status || 'active') === 'active')
      .map((item) => String(item?.id || ''))
      .filter(Boolean);

    if (vehicleIds.length > 0 && scheduleIds.length > 0) {
      const reservations = await PoolingSeatReservation.find({
        route: route._id,
        vehicle: { $in: vehicleIds },
        scheduleId: { $in: scheduleIds },
        travelDate: normalizedTravelDate,
      })
        .select('vehicle scheduleId seatId')
        .lean();

      seatAvailability = reservations.reduce((accumulator, item) => {
        const key = `${String(item.vehicle)}:${String(item.scheduleId || '')}`;
        accumulator[key] = accumulator[key] || [];
        accumulator[key].push(String(item.seatId || ''));
        return accumulator;
      }, {});
    }
  }

  return ok(
    res,
    {
      ...route.toObject(),
      seatAvailability,
    },
    'Route details fetched successfully',
  );
});

export const createPoolingBookingOrder = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const routeId = toCleanString(req.body?.routeId);
  const vehicleId = toCleanString(req.body?.vehicleId);
  const scheduleId = toCleanString(req.body?.scheduleId);
  const travelDate = normalizeTravelDate(req.body?.travelDate || req.body?.date);
  const selectedSeats = Array.isArray(req.body?.selectedSeats)
    ? [...new Set(req.body.selectedSeats.map((item) => toCleanString(item)).filter(Boolean))]
    : [];
  const pickupStopId = toCleanString(req.body?.pickupStopId);
  const dropStopId = toCleanString(req.body?.dropStopId);

  if (!userId) {
    throw new ApiError(401, 'User authentication is required');
  }

  if (!routeId || !vehicleId || !scheduleId || selectedSeats.length === 0) {
    throw new ApiError(400, 'routeId, vehicleId, scheduleId and selectedSeats are required');
  }

  const [route, vehicle] = await Promise.all([
    PoolingRoute.findById(routeId).lean(),
    PoolingVehicle.findById(vehicleId).lean(),
  ]);

  if (!route || String(route.status || '') !== 'active' || route.active === false) {
    throw new ApiError(404, 'Pooling route not found');
  }

  if (!vehicle || String(vehicle.status || '') !== 'active') {
    throw new ApiError(404, 'Pooling vehicle not found');
  }

  const allowedVehicleIds = (Array.isArray(route.assignedVehicleTypeIds) ? route.assignedVehicleTypeIds : []).map((item) => String(item));
  if (allowedVehicleIds.length > 0 && !allowedVehicleIds.includes(vehicleId)) {
    throw new ApiError(400, 'Selected vehicle is not assigned to this route');
  }

  const schedule = (Array.isArray(route.schedules) ? route.schedules : []).find(
    (item) => String(item?.id || '') === scheduleId && String(item?.status || 'active') === 'active',
  );
  if (!schedule) {
    throw new ApiError(404, 'Selected route schedule is not available');
  }

  const pickupStop = resolvePickupStop(route, pickupStopId);
  const dropStop = resolveDropStop(route, dropStopId);
  if (!pickupStop || !dropStop) {
    throw new ApiError(400, 'Pickup and drop points are required for pooling booking');
  }

  assertPoolingBookable({ route, schedule, travelDate, seatCount: selectedSeats.length });

  const fareBreakdown = computePoolingFareBreakdown({ route, vehicle, seatCount: selectedSeats.length });
  if (!Number.isFinite(fareBreakdown.totalFare) || fareBreakdown.totalFare <= 0) {
    throw new ApiError(400, 'Pooling fare is not configured');
  }

  const vehicleSeatIds = new Set(getVehicleSeatIds(vehicle));
  const invalidSeatId = selectedSeats.find((seatId) => !vehicleSeatIds.has(seatId));
  if (invalidSeatId) {
    throw new ApiError(400, `Seat ${invalidSeatId} is not available in this vehicle`);
  }

  const alreadyBookedSeatIds = await getBookedSeatIds({
    routeId,
    vehicleId,
    scheduleId,
    travelDate,
  });
  const conflictingSeatId = selectedSeats.find((seatId) => alreadyBookedSeatIds.includes(seatId));
  if (conflictingSeatId) {
    throw new ApiError(409, `Seat ${conflictingSeatId} was already booked by another user`);
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const compactUserId = userId.replace(/[^a-zA-Z0-9]/g, '').slice(-8) || 'usr';
  const order = await razorpayRequest({
    method: 'POST',
    path: '/orders',
    body: {
      amount: Math.round(fareBreakdown.totalFare * 100),
      currency: 'INR',
      receipt: `upool_${compactUserId}_${Date.now().toString(36)}`,
      notes: {
        userId,
        routeId,
        vehicleId,
        scheduleId,
        travelDate,
        seats: selectedSeats.join(','),
        pickupStopId: String(pickupStop.id || pickupStopId),
        dropStopId: String(dropStop.id || dropStopId),
      },
    },
    keyId,
    keySecret,
  });

  return created(
    res,
    {
      keyId,
      orderId: order.id,
      amount: order.amount,
      currency: order.currency || 'INR',
      travelDate,
      fare: fareBreakdown.totalFare,
      baseFare: fareBreakdown.baseFare,
      serviceTaxPercentage: fareBreakdown.serviceTaxPercentage,
      serviceTaxAmount: fareBreakdown.serviceTaxAmount,
    },
    'Pooling payment order created successfully',
  );
});

const populateBooking = (query) => query
  .populate('route', 'routeName originLabel destinationLabel')
  .populate('vehicle', 'name vehicleNumber');

/**
 * Turn a PAID Razorpay order into a pooling booking. Safe to run any number of times and from several places at once
 * (the app's "verify" call and Razorpay's webhook): one payment id can only ever make one booking.
 *  - the paid amount and the seats must match the order that was created (nobody can pay for 1 seat and book 4)
 *  - a seat somebody else took first -> the customer is refunded automatically
 * Returns { booking, alreadyConfirmed }.
 */
export const finalizePoolingBooking = async ({
  userId, orderId, paymentId, signature = '', routeId, vehicleId, scheduleId, travelDate, selectedSeats,
  pickupStopId = '', dropStopId = '', skipOrderCheck = false, rzOrder = null,
}) => {
  const existingBooking = await populateBooking(PoolingBooking.findOne({ 'payment.paymentId': paymentId }));
  if (existingBooking) {
    if (String(existingBooking.user) !== String(userId) && String(existingBooking.user?._id || '') !== String(userId)) {
      throw new ApiError(403, 'This payment belongs to another booking');
    }
    return { booking: existingBooking, alreadyConfirmed: true };
  }

  const { keyId, keySecret } = await resolveRazorpayCredentials();
  const order = rzOrder || (skipOrderCheck ? null : await razorpayRequest({ method: 'GET', path: `/orders/${encodeURIComponent(orderId)}`, keyId, keySecret }));
  const paidPaise = Number(order?.amount_paid ?? order?.amount ?? 0);

  // The order was created for ONE user and ONE set of seats: that is what was paid for
  if (order?.notes?.userId && String(order.notes.userId) !== String(userId)) {
    throw new ApiError(403, 'This payment belongs to another user');
  }

  const [route, vehicle] = await Promise.all([
    PoolingRoute.findById(routeId).lean(),
    PoolingVehicle.findById(vehicleId).lean(),
  ]);
  if (!route || String(route.status || '') !== 'active' || route.active === false) {
    throw new ApiError(404, 'Pooling route not found');
  }
  if (!vehicle || String(vehicle.status || '') !== 'active') {
    throw new ApiError(404, 'Pooling vehicle not found');
  }
  const schedule = (Array.isArray(route.schedules) ? route.schedules : []).find(
    (item) => String(item?.id || '') === scheduleId && String(item?.status || 'active') === 'active',
  );
  if (!schedule) {
    throw new ApiError(404, 'Selected route schedule is not available');
  }
  const pickupStop = resolvePickupStop(route, pickupStopId);
  const dropStop = resolveDropStop(route, dropStopId);
  if (!pickupStop || !dropStop) {
    throw new ApiError(400, 'Pickup and drop points are required for pooling booking');
  }

  const fareBreakdown = computePoolingFareBreakdown({ route, vehicle, seatCount: selectedSeats.length });
  if (!Number.isFinite(fareBreakdown.totalFare) || fareBreakdown.totalFare <= 0) {
    throw new ApiError(400, 'Pooling fare is not configured');
  }
  const expectedPaise = Math.round(fareBreakdown.totalFare * 100);

  const notedSeats = toCleanString(order?.notes?.seats).split(',').map((x) => x.trim()).filter(Boolean).sort().join(',');
  const asked = {
    route: routeId, vehicle: vehicleId, schedule: scheduleId, date: travelDate, seats: [...selectedSeats].sort().join(','),
  };
  const noted = order?.notes
    ? { route: toCleanString(order.notes.routeId), vehicle: toCleanString(order.notes.vehicleId), schedule: toCleanString(order.notes.scheduleId), date: toCleanString(order.notes.travelDate), seats: notedSeats }
    : null;
  const sameRequest = !noted || (noted.route === asked.route && noted.vehicle === asked.vehicle && noted.schedule === asked.schedule && noted.date === asked.date && noted.seats === asked.seats);
  if (order && (!sameRequest || paidPaise !== expectedPaise)) {
    // Paid for something else (different seats, or the fare changed meanwhile): book nothing, give the money back
    await refundPayment({ paymentId, amountPaise: paidPaise, reason: 'Automatic refund: paid amount did not match the seats requested' });
    throw new ApiError(409, 'The payment did not match the selected seats or the current fare, so no booking was made. Your payment will be refunded automatically.');
  }

  const invalidSeatId = selectedSeats.find((seatId) => !new Set(getVehicleSeatIds(vehicle)).has(seatId));
  if (invalidSeatId) {
    throw new ApiError(400, `Seat ${invalidSeatId} is not available in this vehicle`);
  }

  const booking = await PoolingBooking.create({
    bookingId: createPoolingBookingCode(),
    user: userId,
    route: routeId,
    vehicle: vehicleId,
    scheduleId,
    pickupStopId: String(pickupStop.id || pickupStopId),
    dropStopId: String(dropStop.id || dropStopId),
    seatsBooked: selectedSeats.length,
    selectedSeats,
    fare: fareBreakdown.totalFare,
    baseFare: fareBreakdown.baseFare,
    serviceTaxPercentage: fareBreakdown.serviceTaxPercentage,
    serviceTaxAmount: fareBreakdown.serviceTaxAmount,
    currency: 'INR',
    paymentStatus: 'paid',
    bookingStatus: 'confirmed',
    travelDate: new Date(`${travelDate}T00:00:00.000Z`),
    pickupLabel: pickupStop.name || pickupStop.address || route.originLabel || '',
    dropLabel: dropStop.name || dropStop.address || route.destinationLabel || '',
    payment: { provider: 'razorpay', orderId, paymentId, signature, status: 'paid', paidAt: new Date() },
  }).catch(async (error) => {
    // Two requests for the same payment at once: the unique payment id makes the second one fail, return the first
    if (error?.code === 11000) return null;
    throw error;
  });
  if (!booking) {
    const winner = await populateBooking(PoolingBooking.findOne({ 'payment.paymentId': paymentId }));
    if (winner) return { booking: winner, alreadyConfirmed: true };
    throw new ApiError(409, 'This booking is being processed. Please check My Bookings.');
  }

  try {
    await PoolingSeatReservation.insertMany(
      selectedSeats.map((seatId) => ({ route: routeId, vehicle: vehicleId, booking: booking._id, scheduleId, travelDate, seatId })),
      { ordered: true },
    );
  } catch (error) {
    // Undo EVERYTHING of this booking: seats reserved before the conflicting one must not stay blocked
    await PoolingSeatReservation.deleteMany({ booking: booking._id });
    await PoolingBooking.deleteOne({ _id: booking._id });
    if (error?.code === 11000) {
      // The user already paid for a seat somebody else got first: give the money back automatically
      await refundPayment({ paymentId, amountPaise: paidPaise || expectedPaise, reason: 'Automatic refund: pooling seat was taken by another user', bookingCode: String(booking.bookingId || '') });
      throw new ApiError(409, 'One or more selected seats were just booked by another user. Your payment will be refunded automatically.');
    }
    throw error;
  }

  return { booking: await populateBooking(PoolingBooking.findById(booking._id)), alreadyConfirmed: false };
};

export const verifyPoolingBookingPayment = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  const orderId = toCleanString(req.body?.razorpay_order_id);
  const paymentId = toCleanString(req.body?.razorpay_payment_id);
  const signature = toCleanString(req.body?.razorpay_signature);
  const routeId = toCleanString(req.body?.routeId);
  const vehicleId = toCleanString(req.body?.vehicleId);
  const scheduleId = toCleanString(req.body?.scheduleId);
  const travelDate = normalizeTravelDate(req.body?.travelDate || req.body?.date);
  const selectedSeats = Array.isArray(req.body?.selectedSeats)
    ? [...new Set(req.body.selectedSeats.map((item) => toCleanString(item)).filter(Boolean))]
    : [];

  if (!userId) {
    throw new ApiError(401, 'User authentication is required');
  }
  if (!orderId || !paymentId || !signature) {
    throw new ApiError(400, 'Payment verification fields are required');
  }
  if (!routeId || !vehicleId || !scheduleId || selectedSeats.length === 0) {
    throw new ApiError(400, 'routeId, vehicleId, scheduleId and selectedSeats are required');
  }

  const { keySecret } = await resolveRazorpayCredentials();
  const expectedSignature = crypto.createHmac('sha256', keySecret).update(`${orderId}|${paymentId}`).digest('hex');
  if (expectedSignature !== signature) {
    throw new ApiError(400, 'Invalid payment signature');
  }

  const { booking, alreadyConfirmed } = await finalizePoolingBooking({
    userId, orderId, paymentId, signature, routeId, vehicleId, scheduleId, travelDate, selectedSeats,
    pickupStopId: toCleanString(req.body?.pickupStopId), dropStopId: toCleanString(req.body?.dropStopId),
  });

  return alreadyConfirmed
    ? ok(res, serializePoolingBooking(booking), 'Pooling booking already confirmed')
    : created(res, serializePoolingBooking(booking), 'Pooling booking confirmed successfully');
});

/**
 * Razorpay webhook for pooling: the customer paid but the app closed / lost network before "verify".
 * The order notes carry everything (user, route, seats, stops), so the booking is made from them.
 * Returns true when the event was a pooling order.
 */
export const confirmPoolingFromWebhook = async ({ orderId, paymentId, rzOrder }) => {
  const notes = rzOrder?.notes || {};
  if (!notes.routeId || !notes.vehicleId || !notes.userId || !notes.seats) return false;
  try {
    await finalizePoolingBooking({
      userId: String(notes.userId), orderId, paymentId, routeId: String(notes.routeId), vehicleId: String(notes.vehicleId),
      scheduleId: String(notes.scheduleId || ''), travelDate: String(notes.travelDate || ''),
      selectedSeats: String(notes.seats).split(',').map((x) => x.trim()).filter(Boolean),
      pickupStopId: String(notes.pickupStopId || ''), dropStopId: String(notes.dropStopId || ''), rzOrder,
    });
  } catch (err) {
    console.error(`Pooling webhook could not confirm order ${orderId}:`, err?.message || err);
  }
  return true;
};

export const createPoolingBooking = asyncHandler(async (_req, _res) => {
  throw new ApiError(405, 'Direct pooling booking is disabled. Please complete online payment first.');
});

export const getMyPoolingBookings = asyncHandler(async (req, res) => {
  const userId = getCurrentUserId(req);
  if (!userId) {
    return ok(res, [], 'My bookings fetched successfully');
  }

  const bookings = await PoolingBooking.find({ user: userId })
    .populate('route', 'routeName originLabel destinationLabel')
    .populate('vehicle', 'name vehicleNumber')
    .sort({ createdAt: -1 });

  return ok(res, bookings.map(serializePoolingBooking), 'My bookings fetched successfully');
});
