import mongoose from 'mongoose';
import { ApiError } from '../../../../utils/ApiError.js';
import { SubscriptionPlan } from '../../admin/models/SubscriptionPlan.js';
import { Driver } from '../models/Driver.js';
import { DriverSubscription } from '../models/DriverSubscription.js';
import { applyDriverWalletAdjustment } from './walletService.js';
import { findLiveDriverSubscription, getDriverSubscriptionMode } from './driverSubscriptionCore.js';

const round2 = (value) => Math.round(Number(value || 0) * 100) / 100;
const DAY_MS = 24 * 60 * 60 * 1000;

const driverTransport = (driver = {}) => String(driver.registerFor || '').trim().toLowerCase();

/** A plan is offered to a driver when its transport type and (optional) vehicle type fit the driver. */
export const isPlanAvailableForDriver = (plan = {}, driver = {}) => {
  const planTransport = String(plan.transport_type || '').trim().toLowerCase();
  const transport = driverTransport(driver);
  const transportOk =
    !planTransport || planTransport === 'all' || planTransport === 'both' || transport === 'both' || transport === planTransport;

  const planVehicle = plan.vehicle_type_id?._id || plan.vehicle_type_id;
  const vehicleOk = !planVehicle || (driver.vehicleTypeId && String(driver.vehicleTypeId) === String(planVehicle));

  return Boolean(transportOk && vehicleOk);
};

const serializePlan = (plan = {}, driver = {}) => ({
  id: String(plan._id),
  name: plan.name || '',
  description: plan.description || '',
  how_it_works: plan.how_it_works || '',
  amount: round2(plan.amount),
  duration: Math.max(1, Number(plan.duration || 1)),
  transport_type: plan.transport_type || '',
  vehicle_type: plan.vehicle_type_id?._id ? { id: String(plan.vehicle_type_id._id), name: plan.vehicle_type_id.name || '' } : null,
  available: isPlanAvailableForDriver(plan, driver),
});

const serializeSubscription = (item = {}, now = new Date()) => {
  const started = new Date(item.startedAt);
  const expires = new Date(item.expiresAt);
  let state = 'active';
  if (item.status === 'cancelled') state = 'cancelled';
  else if (expires <= now) state = 'expired';
  else if (started > now) state = 'upcoming';

  return {
    id: String(item._id),
    planId: String(item.planId || ''),
    name: item.name || '',
    amount: round2(item.amount),
    durationDays: item.durationDays,
    state,
    purchasedAt: item.purchasedAt || item.createdAt || null,
    startedAt: item.startedAt,
    expiresAt: item.expiresAt,
    daysLeft: state === 'active' ? Math.max(0, Math.ceil((expires - now) / DAY_MS)) : null,
  };
};

/** Everything the driver's Subscription screen needs in one call. */
export const getDriverSubscriptionState = async (driverId) => {
  const [mode, driver, plans, passes] = await Promise.all([
    getDriverSubscriptionMode(),
    Driver.findById(driverId).select('registerFor vehicleTypeId wallet').lean(),
    SubscriptionPlan.find({ audience: 'driver', active: true }).sort({ amount: 1, createdAt: -1 }).populate('vehicle_type_id', 'name').lean(),
    DriverSubscription.find({ driverId }).sort({ expiresAt: -1 }).limit(20).lean(),
  ]);

  if (!driver) {
    throw new ApiError(404, 'Driver not found');
  }

  const now = new Date();
  const history = passes.map((item) => serializeSubscription(item, now));
  const current = history.find((item) => item.state === 'active') || null;
  const upcoming = history.filter((item) => item.state === 'upcoming');

  return {
    mode,
    enabled: mode !== 'commissionOnly',
    required: mode === 'subscriptionOnly',
    // With a live pass the ride commission is not charged
    commissionWaived: mode !== 'commissionOnly' && Boolean(current),
    current,
    upcoming,
    history,
    walletBalance: round2(driver.wallet?.balance),
    plans: mode === 'commissionOnly' ? [] : plans.map((plan) => serializePlan(plan, driver)).filter((plan) => plan.available),
  };
};

/**
 * Buy a plan from the driver's wallet. The wallet check, the debit and the pass are one database transaction, so
 * two taps (or two devices) cannot both pass the balance check, and a failure never leaves money taken without a pass.
 * A renewal bought while a pass is running starts when that pass ends.
 */
export const purchaseDriverSubscription = async ({ driverId, planId }) => {
  const mode = await getDriverSubscriptionMode();
  if (mode === 'commissionOnly') {
    throw new ApiError(400, 'Subscription plans are not available right now');
  }
  if (!mongoose.Types.ObjectId.isValid(planId)) {
    throw new ApiError(400, 'Valid subscription plan id is required');
  }

  const [plan, driver] = await Promise.all([
    SubscriptionPlan.findOne({ _id: planId, audience: 'driver', active: true }).lean(),
    Driver.findById(driverId).select('registerFor vehicleTypeId').lean(),
  ]);
  if (!plan) throw new ApiError(404, 'Subscription plan not found');
  if (!driver) throw new ApiError(404, 'Driver not found');
  if (!isPlanAvailableForDriver(plan, driver)) {
    throw new ApiError(403, 'This plan is not available for your vehicle');
  }

  const amount = round2(plan.amount);
  const durationDays = Math.max(1, Math.round(Number(plan.duration || 0)));

  const session = await mongoose.startSession();
  try {
    session.startTransaction();

    // Locks the driver's document for this transaction: a second purchase at the same moment must wait or fail,
    // and only goes through if the balance still covers it.
    const guard = await Driver.updateOne(
      { _id: driverId, ...(amount > 0 ? { 'wallet.balance': { $gte: amount } } : {}) },
      { $inc: { 'wallet.balance': 0 } },
      { session },
    );
    if (!guard.matchedCount) {
      throw new ApiError(400, 'Insufficient wallet balance. Please top up your wallet.');
    }

    const now = new Date();
    const latest = await DriverSubscription.findOne({ driverId, status: 'active', expiresAt: { $gt: now } })
      .sort({ expiresAt: -1 })
      .session(session)
      .lean();
    const startedAt = latest ? new Date(latest.expiresAt) : now;
    const expiresAt = new Date(startedAt.getTime() + durationDays * DAY_MS);

    let wallet = null;
    let transactionId = null;
    if (amount > 0) {
      const adjustment = await applyDriverWalletAdjustment({
        driverId,
        amount: -amount,
        type: 'adjustment',
        description: `Subscription purchase: ${plan.name || 'Plan'}`,
        metadata: { source: 'DRIVER_SUBSCRIPTION', planId: String(plan._id), durationDays },
        session,
      });
      wallet = adjustment.wallet;
      transactionId = adjustment.transaction?._id || null;
    }

    const [subscription] = await DriverSubscription.create(
      [{
        driverId,
        planId: plan._id,
        name: plan.name || '',
        description: plan.description || '',
        amount,
        durationDays,
        transport_type: plan.transport_type || '',
        vehicle_type_id: plan.vehicle_type_id || null,
        status: 'active',
        purchaseSource: 'wallet',
        purchasedAt: now,
        startedAt,
        expiresAt,
        walletTransactionId: transactionId,
      }],
      { session },
    );

    await session.commitTransaction();

    return {
      subscription: serializeSubscription(subscription.toObject(), new Date()),
      wallet,
      startsLater: startedAt > now,
    };
  } catch (error) {
    await session.abortTransaction();
    // Two purchases at the same moment: one wins, the other is asked to retry (nothing was charged for it)
    if (error?.hasErrorLabel?.('TransientTransactionError')) {
      throw new ApiError(409, 'Another purchase is in progress. Please try again.');
    }
    throw error;
  } finally {
    session.endSession();
  }
};

/** Admin view: who holds a pass right now and which passes were sold. */
export const listDriverSubscribersForAdmin = async ({ page = 1, limit = 50, state = '' } = {}) => {
  const safePage = Math.max(1, Number(page) || 1);
  const safeLimit = Math.min(200, Math.max(1, Number(limit) || 50));
  const now = new Date();

  const filter = {};
  if (state === 'active') Object.assign(filter, { status: 'active', startedAt: { $lte: now }, expiresAt: { $gt: now } });
  else if (state === 'expired') filter.expiresAt = { $lte: now };
  else if (state === 'upcoming') Object.assign(filter, { status: 'active', startedAt: { $gt: now } });

  const [items, total, activeNow] = await Promise.all([
    DriverSubscription.find(filter)
      .sort({ purchasedAt: -1 })
      .skip((safePage - 1) * safeLimit)
      .limit(safeLimit)
      .populate('driverId', 'name phone vehicleType')
      .lean(),
    DriverSubscription.countDocuments(filter),
    DriverSubscription.countDocuments({ status: 'active', startedAt: { $lte: now }, expiresAt: { $gt: now } }),
  ]);

  return {
    results: items.map((item) => ({
      ...serializeSubscription(item, now),
      driver: item.driverId?._id
        ? { id: String(item.driverId._id), name: item.driverId.name || '', phone: item.driverId.phone || '', vehicleType: item.driverId.vehicleType || '' }
        : null,
    })),
    summary: { activeNow, total },
    paginator: { current_page: safePage, per_page: safeLimit, total, last_page: Math.max(1, Math.ceil(total / safeLimit)) },
  };
};

export { findLiveDriverSubscription };
