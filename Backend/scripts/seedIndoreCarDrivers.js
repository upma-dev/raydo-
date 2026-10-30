/**
 * Test data: online car drivers in the Indore zone, one per car vehicle type (Taxi, Cab, SUV), so a car ride can be booked
 * and matched. Safe to run again: a driver is found by phone number and updated, never duplicated.
 *
 * Usage (from the Backend folder). Dry run unless --apply is added:
 *   node scripts/seedIndoreCarDrivers.js
 *   node scripts/seedIndoreCarDrivers.js --apply
 *   node scripts/seedIndoreCarDrivers.js --apply --lat=22.7196 --lng=75.8577   (where the drivers wait; default: near Vijay Nagar)
 * Drivers log in with an OTP on their phone number; these numbers are fake, so use them for matching tests, not to log in.
 */
import 'dotenv/config';
import bcrypt from 'bcryptjs';
import mongoose from 'mongoose';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { Vehicle } from '../src/modules/taxi/admin/models/Vehicle.js';
import { Zone } from '../src/modules/taxi/driver/models/Zone.js';

const APPLY = process.argv.includes('--apply');
const argNumber = (name, fallback) => {
  const raw = process.argv.find((arg) => arg.startsWith(`--${name}=`));
  const value = raw ? Number(raw.split('=')[1]) : NaN;
  return Number.isFinite(value) ? value : fallback;
};
const CENTER = { lat: argNumber('lat', 22.7173), lng: argNumber('lng', 75.8716) };

// One test driver per car vehicle type; `match` finds the vehicle type by its name in the admin's Vehicle Type list
const PLAN = [
  { phone: '9000000101', name: 'Test Car Driver (Taxi)', match: /^taxi$/i, iconType: 'car', number: 'MP09TC0101', make: 'Maruti', model: 'Dzire', color: 'White', offset: [0.0006, 0.0004] },
  { phone: '9000000102', name: 'Test Car Driver (Cab)', match: /^cab$/i, iconType: 'car', number: 'MP09TC0102', make: 'Hyundai', model: 'Aura', color: 'Silver', offset: [-0.0005, 0.0007] },
  { phone: '9000000103', name: 'Test Car Driver (SUV)', match: /^suv$/i, iconType: 'suv', number: 'MP09TC0103', make: 'Toyota', model: 'Innova', color: 'Black', offset: [0.0009, -0.0006] },
];

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
  dbName: process.env.MONGODB_DB_NAME || undefined,
});
console.log(APPLY ? 'APPLY' : 'DRY RUN', `- drivers wait near ${CENTER.lat}, ${CENTER.lng}`);

const zone = await Zone.findOne({ name: /^indore$/i, status: 'active' }).lean();
if (!zone) {
  console.error('No active "Indore" zone found. Create it in Admin > Pricing > Zone first.');
  process.exit(1);
}
console.log(`Zone: ${zone.name} (${zone._id})`);

const vehicles = await Vehicle.find({ active: true, status: 1 }).select('name icon_types allowed_services').lean();
const password = await bcrypt.hash('Test@12345', 10);
const now = new Date();

for (const item of PLAN) {
  const vehicle = vehicles.find((v) => item.match.test(String(v.name || '').trim()));
  if (!vehicle) {
    console.log(`  SKIP ${item.name}: no active vehicle type named like ${item.match}`);
    continue;
  }

  const fields = {
    name: item.name,
    vehicleType: 'car',
    vehicleTypeId: vehicle._id,
    vehicleIconType: item.iconType,
    vehicleNumber: item.number,
    vehicleMake: item.make,
    vehicleModel: item.model,
    vehicleColor: item.color,
    serviceCategories: ['taxi'],
    registerFor: 'taxi',
    city: 'indore',
    zoneId: zone._id,
    status: 'approved',
    approve: true,
    isOnline: true,
    isOnRide: false,
    deletedAt: null,
    wallet: { balance: 500, cashLimit: 1000, isBlocked: false },
    location: { type: 'Point', coordinates: [CENTER.lng + item.offset[0], CENTER.lat + item.offset[1]] },
    // Online needs a selfie from today
    onlineSelfie: {
      imageUrl: 'https://raydo.in/uploads/test-driver-selfie.jpg',
      capturedAt: now,
      uploadedAt: now,
      forDate: now.toISOString().slice(0, 10),
    },
  };

  const existing = await Driver.findOne({ phone: item.phone });
  console.log(`  ${existing ? 'UPDATE' : 'CREATE'} ${item.name}  phone=${item.phone}  vehicle type=${vehicle.name}`);
  if (!APPLY) continue;

  if (existing) {
    existing.set(fields);
    await existing.save();
  } else {
    await Driver.create({ ...fields, phone: item.phone, password });
  }
}

if (!APPLY) console.log('\nNothing was written. Add --apply to create / update these drivers.');
await mongoose.disconnect();
