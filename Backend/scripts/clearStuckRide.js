/**
 * Testing helper: ends ride / parcel trips that are stuck open, and frees the driver.
 *
 * Usage (from the Backend folder). Every form is a dry run unless --apply is added:
 *   node scripts/clearStuckRide.js <partner phone>        trips of a delivery partner's ride profile (10 digits)
 *   node scripts/clearStuckRide.js <driver id>            trips of one ride driver (24 character id)
 *   node scripts/clearStuckRide.js <ride id>              one trip (24 character id)
 *   node scripts/clearStuckRide.js --stale <hours>        every open trip not updated for that many hours
 *
 * An open trip is one that is searching / accepted / ongoing. Each is marked cancelled (by admin, with a reason), the
 * parcel record and the customer's "current ride" are cleared, and its driver is no longer "on a ride".
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { Delivery } from '../src/modules/taxi/user/models/Delivery.js';
import { RIDE_STATUS, RIDE_LIVE_STATUS } from '../src/modules/taxi/constants/index.js';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const staleIndex = args.indexOf('--stale');
const staleHours = staleIndex >= 0 ? Number(args[staleIndex + 1]) : null;
const target = args.find((arg) => !arg.startsWith('--') && arg !== String(staleHours));

if (staleIndex >= 0 ? !(staleHours > 0) : !target) {
  console.error('Usage: node scripts/clearStuckRide.js <partner phone | driver id | ride id | --stale <hours>> [--apply]');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
  dbName: process.env.MONGODB_DB_NAME || undefined,
});

const OPEN = [RIDE_STATUS.SEARCHING, RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING];
const isObjectId = (value) => /^[0-9a-f]{24}$/i.test(String(value || ''));
let filter;
let label;
let driverIdsToFree = [];

if (staleIndex >= 0) {
  filter = { status: { $in: OPEN }, updatedAt: { $lt: new Date(Date.now() - staleHours * 3600 * 1000) } };
  label = `open trips not updated for ${staleHours}h`;
} else if (isObjectId(target)) {
  const asDriver = await Driver.findById(target).select('name phone').lean();
  if (asDriver) {
    filter = { driverId: target, status: { $in: OPEN } };
    driverIdsToFree = [String(target)];
    label = `driver ${asDriver.name || ''} ${asDriver.phone || ''} (${target})`;
  } else {
    filter = { _id: target, status: { $in: OPEN } };
    label = `trip ${target}`;
  }
} else {
  const phone = String(target).replace(/\D/g, '').slice(-10);
  const partner = phone.length === 10 ? await FoodDeliveryPartner.findOne({ phone }).select('name rideMode').lean() : null;
  const driverId = partner?.rideMode?.taxiDriverId;
  if (!partner || !driverId) {
    console.log('No delivery partner with a linked ride profile for this phone');
    process.exit(0);
  }
  filter = { driverId, status: { $in: OPEN } };
  driverIdsToFree = [String(driverId)];
  label = `partner ${partner.name || partner._id} (ride profile ${driverId})`;
}

const rides = await Ride.find(filter)
  .select('_id status liveStatus serviceType userId driverId deliveryId pickupAddress createdAt updatedAt')
  .lean();

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: ${label}`);
if (rides.length === 0) console.log('No open trip found');
rides.forEach((ride) => {
  console.log(`  trip ${ride._id}  ${ride.serviceType || 'ride'}  ${ride.status}/${ride.liveStatus}  driver=${ride.driverId || '-'}  created ${ride.createdAt?.toISOString?.() || '-'}  updated ${ride.updatedAt?.toISOString?.() || '-'}  ${ride.pickupAddress || ''}`);
});

if (!APPLY) {
  if (rides.length > 0) console.log('Run again with --apply to end them.');
  await mongoose.disconnect();
  process.exit(0);
}

const freed = new Set(driverIdsToFree);
for (const ride of rides) {
  await Ride.updateOne(
    { _id: ride._id },
    {
      $set: {
        status: RIDE_STATUS.CANCELLED,
        liveStatus: RIDE_LIVE_STATUS.CANCELLED,
        'cancellation.cancelled_by': 'admin',
        'cancellation.reason': 'Cleared by admin (testing)',
      },
    },
  );
  if (ride.deliveryId) {
    await Delivery.updateOne({ _id: ride.deliveryId }, { $set: { status: RIDE_STATUS.CANCELLED, liveStatus: RIDE_LIVE_STATUS.CANCELLED } });
  }
  if (ride.userId) {
    await User.updateOne({ _id: ride.userId, currentRideId: ride._id }, { $set: { currentRideId: null } });
  }
  if (ride.driverId) freed.add(String(ride.driverId));
  console.log(`  ended trip ${ride._id}`);
}

if (freed.size > 0) {
  await Driver.updateMany({ _id: { $in: [...freed] } }, { $set: { isOnRide: false } });
  console.log(`Driver(s) freed (isOnRide=false): ${[...freed].join(', ')}`);
}

await mongoose.disconnect();
process.exit(0);
