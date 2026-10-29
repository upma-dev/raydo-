/**
 * One-time cleanup: ride drivers (taxidrivers) whose images were stored inline as base64 (data: URLs) get real files in the
 * upload folder, and the database field is replaced by the file's URL. Any field, at any depth (also inside arrays).
 *
 * Why: one driver document with inline photos was 4+ MB and is loaded on every ride-mode / session / availability call.
 *
 * Usage (from the Backend folder, with the same .env as the server):
 *   UPLOAD_PATH=/var/www/uploads/ node scripts/migrateInlineDriverImages.js            -> dry run: only lists what would change
 *   UPLOAD_PATH=/var/www/uploads/ node scripts/migrateInlineDriverImages.js --apply    -> writes the files and updates the database
 * Safe to run again: a field is only replaced after its file was written.
 */
import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';
import mongoose from 'mongoose';
import { Driver } from '../src/modules/taxi/driver/models/Driver.js';
import { saveImageBuffer, getUploadRoot } from '../src/services/storage.service.js';

const APPLY = process.argv.includes('--apply');
const DATA_URL = /^data:([^;,]+);base64,(.*)$/s;
const kb = (bytes) => `${Math.round(bytes / 1024)} KB`;

if (!path.isAbsolute(String(process.env.UPLOAD_PATH || ''))) {
  console.error('Set UPLOAD_PATH to the real upload folder, e.g.: UPLOAD_PATH=/var/www/uploads/ node scripts/migrateInlineDriverImages.js');
  process.exit(1);
}
if (!process.env.UPLOAD_PUBLIC_URL) {
  console.error('UPLOAD_PUBLIC_URL is not set in .env: the new image URLs would be relative. Set it and run again.');
  process.exit(1);
}

// Every inline image of a plain-object document as [dotted path, value]; the path works as a $set key (array index included)
const collect = (value, prefix, out) => {
  if (typeof value === 'string') {
    if (value.startsWith('data:')) out.push([prefix, value]);
  } else if (Array.isArray(value)) {
    value.forEach((item, index) => collect(item, `${prefix}.${index}`, out));
  } else if (value && Object.getPrototypeOf(value) === Object.prototype) {
    Object.entries(value).forEach(([key, item]) => collect(item, prefix ? `${prefix}.${key}` : key, out));
  }
};

await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI, {
  dbName: process.env.MONGODB_DB_NAME || undefined,
});

console.log(`${APPLY ? 'APPLY' : 'DRY RUN'}: upload folder ${getUploadRoot()}`);

let drivers = 0;
let fields = 0;
let bytesBefore = 0;
let failed = 0;

for await (const doc of Driver.find({}).lean().cursor()) {
  const found = [];
  collect(doc, '', found);
  if (found.length === 0) continue;

  const set = {};
  const notes = [];
  for (const [field, value] of found) {
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
      const saved = await saveImageBuffer(Buffer.from(match[2], 'base64'), 'taxi/driver', match[1]);
      // Only trust the new URL once the file is really on disk
      await fs.access(path.join(getUploadRoot(), saved.fileName));
      set[field] = saved.url;
    } catch (error) {
      failed += 1;
      notes.push(`${field}: FAILED (${error.message})`);
    }
  }

  drivers += 1;
  console.log(`driver ${doc._id}: ${notes.join(' | ')}`);

  if (APPLY && Object.keys(set).length > 0) {
    await Driver.collection.updateOne({ _id: doc._id }, { $set: set });
  }
}

console.log('---');
console.log(`${drivers} driver(s), ${fields} inline image(s), ${kb(bytesBefore)} of base64 text${APPLY ? ' moved to files' : ' would be moved'}, ${failed} problem(s)`);
if (!APPLY && fields > 0) console.log('Run again with --apply to do it.');
await mongoose.disconnect();
process.exit(0);
