/**
 * One-time cleanup: delivery partner images that were stored inline as base64 (data: URLs) are written to the upload
 * folder as real files and the database field is replaced by the file's URL.
 *
 * Why: one partner document with a few inline photos is megabytes, and it is loaded and sent on login, on /auth/me and
 * on every availability change, which is what made login take 20+ seconds on mobile data.
 *
 * Usage (from the Backend folder, with the same .env as the server):
 *   node scripts/migrateInlineImages.js            -> dry run: only lists what would change
 *   node scripts/migrateInlineImages.js --apply    -> writes the files and updates the database
 * Safe to run again: fields that are already normal URLs are skipped, and a field is only replaced after its file
 * was written.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { FoodDeliveryPartner } from '../src/modules/food/delivery/models/deliveryPartner.model.js';
import { saveImageBuffer, getUploadRoot } from '../src/services/storage.service.js';

const APPLY = process.argv.includes('--apply');

const FIELDS = [
  'profilePhoto',
  'aadharPhoto',
  'aadharPhotoBack',
  'panPhoto',
  'panPhotoBack',
  'drivingLicensePhoto',
  'drivingLicensePhotoBack',
  'bankPassbookPhoto',
  'upiQrCode',
  'onlineSelfie.imageUrl',
];

const DATA_URL = /^data:([^;,]+);base64,(.*)$/s;

const readPath = (doc, dotted) => dotted.split('.').reduce((value, key) => (value == null ? value : value[key]), doc);
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

if (!process.env.UPLOAD_PUBLIC_URL) {
  console.error('UPLOAD_PUBLIC_URL is not set in .env: the new image URLs would be relative. Set it and run again.');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
  dbName: process.env.MONGODB_DB_NAME || undefined,
});

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: upload folder ${getUploadRoot()}`);

let partners = 0;
let fields = 0;
let bytesBefore = 0;
let failed = 0;

const cursor = FoodDeliveryPartner.find({}).select(['_id', ...FIELDS].join(' ')).lean().cursor();

for await (const doc of cursor) {
  const set = {};
  const notes = [];

  for (const field of FIELDS) {
    const value = readPath(doc, field);
    if (typeof value !== 'string' || !value.startsWith('data:')) continue;

    const match = value.match(DATA_URL);
    if (!match) {
      notes.push(`${field}: not a valid data URL (${kb(value.length)}), skipped`);
      failed += 1;
      continue;
    }

    bytesBefore += value.length;
    fields += 1;
    notes.push(`${field}: ${kb(value.length)}`);

    if (!APPLY) continue;

    try {
      const buffer = Buffer.from(match[2], 'base64');
      const saved = await saveImageBuffer(buffer, `food/delivery/${field.split('.')[0]}`, match[1]);
      // Only trust the new URL once the file is really on disk
      await fs.access(path.join(getUploadRoot(), saved.fileName));
      set[field] = saved.url;
    } catch (error) {
      failed += 1;
      notes.push(`${field}: FAILED (${error.message})`);
    }
  }

  if (notes.length === 0) continue;
  partners += 1;
  console.log(`partner ${doc._id}: ${notes.join(' | ')}`);

  if (APPLY && Object.keys(set).length > 0) {
    await FoodDeliveryPartner.updateOne({ _id: doc._id }, { $set: set }, { timestamps: false });
  }
}

console.log('---');
console.log(`${partners} partner(s), ${fields} inline image(s), ${kb(bytesBefore)} of base64 text${APPLY ? ' moved to files' : ' would be moved'}, ${failed} problem(s)`);
if (!APPLY && fields > 0) console.log('Run again with --apply to do it.');

await mongoose.disconnect();
process.exit(failed > 0 ? 2 : 0);
