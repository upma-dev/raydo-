/**
 * Seeds "complete N orders, earn a fixed amount" incentives for the Indore zone.
 *   node scripts/seedIndoreEarningAddons.js           (dry run: shows what would be created)
 *   node scripts/seedIndoreEarningAddons.js --apply   (creates them)
 * Safe to run again: an incentive with the same title in the same zone is not created twice.
 * Admin can edit / switch off / delete them in Admin > Food > Delivery Partners > Earning Addon.
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import { FoodZone } from '../src/modules/food/admin/models/zone.model.js';
import { FoodEarningAddon } from '../src/modules/food/admin/models/earningAddon.model.js';

const apply = process.argv.includes('--apply');
const TIERS = [
  { title: 'Indore Starter: 5 orders', requiredOrders: 5, earningAmount: 50 },
  { title: 'Indore Booster: 10 orders', requiredOrders: 10, earningAmount: 120 },
  { title: 'Indore Pro: 20 orders', requiredOrders: 20, earningAmount: 300 },
];
const DAYS = 30;

await mongoose.connect(process.env.MONGODB_URI, { dbName: process.env.MONGODB_DB_NAME || undefined });

const zone = await FoodZone.findOne({ $or: [{ name: /indore/i }, { zoneName: /indore/i }] }).select('_id name zoneName').lean();
if (!zone) {
  console.log('No zone with "Indore" in its name was found. Create the Indore zone in Admin > Zone Setup first.');
  await mongoose.disconnect();
  process.exit(1);
}
const zoneName = zone.name || zone.zoneName || 'Indore';
console.log(`Zone: ${zoneName} (${zone._id})`);

const startDate = new Date();
startDate.setUTCHours(0, 0, 0, 0);
const endDate = new Date(startDate.getTime() + DAYS * 24 * 60 * 60 * 1000);

for (const tier of TIERS) {
  const exists = await FoodEarningAddon.findOne({ title: tier.title, zoneId: zone._id }).lean();
  if (exists) { console.log(`  exists   ${tier.title}`); continue; }
  console.log(`  ${apply ? 'CREATE ' : 'would create'} ${tier.title}  ${tier.requiredOrders} orders -> Rs ${tier.earningAmount}  (${startDate.toISOString().slice(0, 10)} to ${endDate.toISOString().slice(0, 10)})`);
  if (apply) {
    await FoodEarningAddon.create({
      ...tier,
      description: `Complete ${tier.requiredOrders} orders in ${zoneName} and earn Rs ${tier.earningAmount} extra.`,
      zoneId: zone._id,
      zoneName,
      startDate,
      endDate,
      status: 'active',
    });
  }
}
await mongoose.disconnect();
console.log(apply ? 'Done.' : 'Dry run only. Run with --apply to create.');
