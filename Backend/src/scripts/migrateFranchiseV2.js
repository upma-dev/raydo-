/**
 * One-time migration for the simplified franchise model (food / taxi / both).
 *
 *   node src/scripts/migrateFranchiseV2.js            -> dry run (prints what would change)
 *   node src/scripts/migrateFranchiseV2.js --apply    -> writes the changes
 *
 * 1. Franchise applications: legacy modules (taxiDriver, taxiFleet, ...) -> 'taxi';
 *    fees / commissions -> the three keys {food, taxi, both}.
 * 2. Franchise config: same three keys.
 * 3. Existing restaurants in a franchise zone get that franchise's id, and
 *    existing orders get the id of their restaurant's franchise (ownership was never stamped before).
 * 4. Rebuilds each wallet from the ledger (credits for already delivered orders are NOT back-filled).
 *
 * Safe to run more than once.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import FranchiseApplication from '../modules/food/admin/models/franchiseApplication.model.js';
import FranchiseFormConfig from '../modules/food/admin/models/franchiseFormConfig.model.js';
import { FoodRestaurant } from '../modules/food/restaurant/models/restaurant.model.js';
import { FoodOrder } from '../modules/food/orders/models/order.model.js';
import { normalizeModules, normalizeFees, normalizeCommissions } from '../modules/food/admin/services/franchisePlan.js';
import { reconcileWallet } from '../modules/food/admin/services/franchiseLedger.service.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const APPLY = process.argv.includes('--apply');
const log = (...a) => console.log(APPLY ? '[APPLY]' : '[DRY-RUN]', ...a);

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);

    // 1 + 2: plan keys (read raw so legacy keys are still visible)
    const rawApps = await FranchiseApplication.collection.find({}).toArray();
    for (const raw of rawApps) {
        const set = {
            selectedModules: normalizeModules(raw.selectedModules),
            moduleFranchiseFees: normalizeFees(raw.moduleFranchiseFees),
            moduleCommissions: normalizeCommissions(raw.moduleCommissions),
        };
        log(`application ${raw.applicationId}: modules ${JSON.stringify(raw.selectedModules)} -> ${JSON.stringify(set.selectedModules)}`);
        if (APPLY) await FranchiseApplication.collection.updateOne({ _id: raw._id }, { $set: set });
    }

    const rawCfg = await FranchiseFormConfig.collection.findOne({});
    if (rawCfg) {
        log('form config -> fees/commissions on food/taxi/both');
        if (APPLY) {
            await FranchiseFormConfig.collection.updateOne({ _id: rawCfg._id }, {
                $set: {
                    moduleFranchiseFees: normalizeFees(rawCfg.moduleFranchiseFees),
                    moduleCommissions: normalizeCommissions(rawCfg.moduleCommissions),
                },
            });
        }
    }

    // 3: ownership stamping, zone by zone (only approved + fee settled franchises that hold food)
    const owners = await FranchiseApplication.find({
        zoneId: { $ne: null }, status: 'approved', franchiseFeeStatus: { $in: ['paid', 'waived'] }, selectedModules: 'food',
    }).select('_id zoneId applicationId').lean();

    const zoneCounts = new Map();
    for (const f of owners) {
        zoneCounts.set(String(f.zoneId), (zoneCounts.get(String(f.zoneId)) || 0) + 1);
    }
    for (const f of owners) {
        if (zoneCounts.get(String(f.zoneId)) > 1) {
            log(`SKIP ${f.applicationId}: zone ${f.zoneId} has more than one franchise - resolve manually`);
            continue;
        }
        const restFilter = { zoneId: f.zoneId, $or: [{ franchiseId: null }, { franchiseId: { $exists: false } }] };
        const restCount = await FoodRestaurant.countDocuments(restFilter);
        log(`${f.applicationId}: ${restCount} restaurants in zone get franchiseId`);
        if (APPLY) await FoodRestaurant.updateMany(restFilter, { $set: { franchiseId: f._id } });
    }

    // orders: copy from restaurant (the order model blocks franchiseId updates via mongoose hooks, so use the raw collection)
    const franchised = await FoodRestaurant.find({ franchiseId: { $ne: null } }).select('_id franchiseId').lean();
    for (const r of franchised) {
        const orderFilter = { restaurantId: r._id, $or: [{ franchiseId: null }, { franchiseId: { $exists: false } }] };
        const n = await FoodOrder.collection.countDocuments(orderFilter);
        if (n === 0) continue;
        log(`restaurant ${r._id}: ${n} orders get franchiseId ${r.franchiseId}`);
        if (APPLY) await FoodOrder.collection.updateMany(orderFilter, { $set: { franchiseId: r.franchiseId } });
    }

    // 4: wallet = sum of ledger
    if (APPLY) {
        for (const raw of rawApps) await reconcileWallet(raw._id);
        log('wallets reconciled from ledger');
    }

    await mongoose.disconnect();
    console.log('Done.');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
