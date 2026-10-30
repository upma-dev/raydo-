/**
 * One-time cleanup: rides the admin deleted BEFORE the "adminDeleted" flag existed still show in the passenger's and the
 * delivery partner's history. This marks the rides you name, so they disappear from both apps.
 *
 * Usage (from the Backend folder). Every form is a dry run unless --apply is added:
 *   node scripts/hideAdminDeletedRides.js <ride id or its last 6 characters> [more ids...]
 *   node scripts/hideAdminDeletedRides.js 27E390 B94C6D --apply
 * Only rides that are already cancelled are touched.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { Ride } from '../src/modules/taxi/user/models/Ride.js';

const APPLY = process.argv.includes('--apply');
const ids = process.argv.slice(2).filter((arg) => !arg.startsWith('--')).map((arg) => arg.trim().toLowerCase());

if (ids.length === 0) {
  console.error('Usage: node scripts/hideAdminDeletedRides.js <ride id or last 6 characters> [more...] [--apply]');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
  dbName: process.env.MONGODB_DB_NAME || undefined,
});

console.log(APPLY ? 'APPLY' : 'DRY RUN');

// Cancelled rides only; a short id matches the end of the real id
const candidates = await Ride.find({ status: 'cancelled' })
  .sort({ updatedAt: -1 })
  .limit(500)
  .select('_id status adminDeleted cancellation createdAt')
  .lean();

let matched = 0;
for (const ride of candidates) {
  const full = String(ride._id).toLowerCase();
  if (!ids.some((id) => full === id || full.endsWith(id))) continue;
  matched += 1;
  console.log(`  ${full.slice(-6).toUpperCase()}  by=${ride.cancellation?.cancelled_by || '-'}  already hidden=${Boolean(ride.adminDeleted)}`);
  if (APPLY && !ride.adminDeleted) {
    await Ride.collection.updateOne({ _id: ride._id }, { $set: { adminDeleted: true } });
    console.log('    hidden from the apps');
  }
}

if (matched === 0) console.log('No cancelled ride matched');
else if (!APPLY) console.log('Run again with --apply to hide them.');
await mongoose.disconnect();
process.exit(0);
