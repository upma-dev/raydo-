/**
 * Read-only check: why does a delivery partner's bike (ride profile) not get ride requests?
 * Usage (from the Backend folder): node scripts/inspectRideDriver.js <partner phone, 10 digits>
 * Prints each thing ride dispatch needs and marks the ones that are not met.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';

const phone = String(process.argv[2] || '').replace(/\D/g, '').slice(-10);
if (phone.length !== 10) {
  console.error('Usage: node scripts/inspectRideDriver.js <10 digit partner phone>');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
  dbName: process.env.MONGODB_DB_NAME || undefined,
});

const check = (ok, label, value) => console.log(`${ok ? 'OK  ' : 'FAIL'}  ${label}${value !== undefined ? `: ${value}` : ''}`);

const partner = await FoodDeliveryPartner.findOne({ phone })
  .select('name status availabilityStatus rideMode lastLat lastLng lastLocationAt fcmTokens fcmTokenMobile')
  .lean();
if (!partner) {
  console.log('No delivery partner with this phone');
  process.exit(0);
}

console.log(`Partner ${partner._id} (${partner.name || 'no name'})`);
check(partner.status === 'approved', 'partner status is approved', partner.status);
check(partner.availabilityStatus === 'online', 'partner is online in the delivery app', partner.availabilityStatus);
console.log(`      rideMode: activeMode=${partner.rideMode?.activeMode} foodOrdersEnabled=${partner.rideMode?.foodOrdersEnabled} walletLockUntil=${partner.rideMode?.walletLockUntil || '-'}`);
console.log(`      push tokens: mobile=${(partner.fcmTokenMobile || []).length} web=${(partner.fcmTokens || []).length}`);

const driverId = partner.rideMode?.taxiDriverId;
if (!driverId) {
  check(false, 'partner has a linked ride profile (rideMode.taxiDriverId)', 'none: never switched Ride & Parcel on');
  process.exit(0);
}

const driver = await Driver.findById(driverId)
  .select('status approve isOnline isOnRide location zoneId vehicleTypeId vehicleType vehicleIconType serviceCategories wallet.isBlocked fcmTokenMobile fcmTokenWeb socketId')
  .lean();
if (!driver) {
  check(false, 'linked ride profile exists', 'missing');
  process.exit(0);
}

console.log(`Ride profile ${driver._id}`);
check(driver.status === 'approved', 'driver status is approved', driver.status);
check(driver.isOnline === true, 'driver isOnline', driver.isOnline);
check(driver.isOnRide !== true, 'driver is not on a ride', driver.isOnRide);
check(driver.wallet?.isBlocked !== true, 'ride wallet not blocked', driver.wallet?.isBlocked);
check(Array.isArray(driver.location?.coordinates) && driver.location.coordinates.length === 2, 'driver has a location', JSON.stringify(driver.location?.coordinates));
check(Boolean(driver.zoneId), 'driver has a zone (dispatch also tries without a zone within 35 km)', String(driver.zoneId || '-'));
check(Boolean(driver.vehicleTypeId), 'driver has a vehicle type', `${driver.vehicleType || '-'} / ${driver.vehicleIconType || '-'}`);
console.log(`      serviceCategories: ${JSON.stringify(driver.serviceCategories || [])}`);
console.log(`      push token on driver: mobile=${driver.fcmTokenMobile ? 'yes' : 'no'} web=${driver.fcmTokenWeb ? 'yes' : 'no'}; socket=${driver.socketId ? 'connected' : 'none'}`);

await mongoose.disconnect();
process.exit(0);
