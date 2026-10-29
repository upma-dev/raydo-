/**
 * Testing helper: ends the ride / parcel trip that is stuck on a delivery partner's ride profile, so the partner can go
 * back to a clean state.
 *
 * Usage (from the Backend folder):
 *   node scripts/clearStuckRide.js <partner phone>            -> dry run: only lists what would be ended
 *   node scripts/clearStuckRide.js <partner phone> --apply    -> ends the trip(s) and frees the driver
 *
 * Every accepted / ongoing trip of the partner's ride profile is marked cancelled (by admin, with a reason), the
 * matching parcel record and the customer's "current ride" are cleared, and the driver is no longer "on a ride".
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';
import { User } from '../src/modules/taxi/user/models/User.js';
import { Delivery } from '../src/modules/taxi/user/models/Delivery.js';
import { RIDE_STATUS, RIDE_LIVE_STATUS } from '../src/modules/taxi/constants/index.js';

const phone = String(process.argv[2] || '').replace(/\D/g, '').slice(-10);
const APPLY = process.argv.includes('--apply');
if (phone.length !== 10) {
  console.error('Usage: node scripts/clearStuckRide.js <10 digit partner phone> [--apply]');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
  dbName: process.env.MONGODB_DB_NAME || undefined,
});

const partner = await FoodDeliveryPartner.findOne({ phone }).select('name rideMode').lean();
const driverId = partner?.rideMode?.taxiDriverId;
if (!partner || !driverId) {
  console.log('No delivery partner with a linked ride profile for this phone');
  process.exit(0);
}

const driver = await Driver.findById(driverId).select('isOnRide').lean();
const rides = await Ride.find({ driverId, status: { $in: [RIDE_STATUS.ACCEPTED, RIDE_STATUS.ONGOING] } })
  .select('_id status liveStatus serviceType userId deliveryId pickupAddress updatedAt')
  .lean();

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: partner ${partner.name || partner._id}, ride profile ${driverId}, isOnRide=${Boolean(driver?.isOnRide)}`);
if (rides.length === 0) console.log('No accepted / ongoing trip found');
rides.forEach((ride) => {
  console.log(`  trip ${ride._id}  ${ride.serviceType || 'ride'}  ${ride.status}/${ride.liveStatus}  last update ${ride.updatedAt?.toISOString?.() || '-'}  ${ride.pickupAddress || ''}`);
});

if (!APPLY) {
  if (rides.length > 0 || driver?.isOnRide) console.log('Run again with --apply to end them.');
  await mongoose.disconnect();
  process.exit(0);
}

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
  console.log(`  ended trip ${ride._id}`);
}

await Driver.updateOne({ _id: driverId }, { $set: { isOnRide: false } });
console.log(`Ride profile ${driverId} is free (isOnRide=false)`);

await mongoose.disconnect();
process.exit(0);
