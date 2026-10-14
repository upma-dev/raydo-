/**
 * One-time backfill: save the zone NAME on every zone-bound food category that does not have it yet.
 *   node scripts/backfillCategoryZoneName.js           (dry run: only shows what would change)
 *   node scripts/backfillCategoryZoneName.js --apply   (writes zoneName)
 * New and edited categories get zoneName automatically; renaming a zone updates its categories.
 */
import 'dotenv/config';
import mongoose from 'mongoose';

const apply = process.argv.includes('--apply');
await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });
const cats = mongoose.connection.collection('food_categories');
const zones = mongoose.connection.collection('food_zones');

const zoneName = new Map((await zones.find({}, { projection: { name: 1, zoneName: 1 } }).toArray()).map((z) => [String(z._id), z.name || z.zoneName || '']));
const todo = await cats.find({ zoneId: { $ne: null, $exists: true }, $or: [{ zoneName: { $exists: false } }, { zoneName: '' }] }).toArray();

let fixed = 0; let missing = 0;
for (const c of todo) {
  const name = zoneName.get(String(c.zoneId));
  if (!name) { missing += 1; console.log(`  zone not found for category "${c.name}" (${c._id})`); continue; }
  console.log(`  ${apply ? 'SET ' : 'would set'} "${c.name}" -> ${name}`);
  if (apply) await cats.updateOne({ _id: c._id }, { $set: { zoneName: name } });
  fixed += 1;
}
console.log(`${apply ? 'Updated' : 'Would update'} ${fixed} categories; ${missing} point to a zone that no longer exists.`);
await mongoose.disconnect();
