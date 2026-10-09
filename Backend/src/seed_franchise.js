import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { TaxiFranchisePartner } from './modules/taxi/admin/models/TaxiFranchisePartner.js';
import { Zone } from './modules/taxi/driver/models/Zone.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.join(__dirname, '../.env') });

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('Connected to DB');

  let zone = await Zone.findOne();
  if (!zone) {
    zone = await Zone.create({ name: 'Ghaziabad' });
  }

  const email = 'raydoindia@gmail.com';
  const password = 'om.raydo@2004#';
  const hashed = await bcrypt.hash(password, 12);

  await TaxiFranchisePartner.findOneAndUpdate(
    { email },
    {
      name: 'Raydo India',
      email,
      phone: '9876543210',
      password: hashed,
      zoneId: zone._id,
      zoneName: zone.name,
      status: 'active',
      isActive: true,
      franchiseCommissionRate: 10,
      platformCommissionRate: 5
    },
    { upsert: true, new: true }
  );
  
  console.log('Partner created/updated');
  process.exit(0);
}

run();
