/**
 * One-time migration for the franchise finance engine v2 (territories, versioned commission, fees & deposit).
 *
 *   node src/scripts/migrateFranchiseFinanceV3.js            -> dry run (prints what would change)
 *   node src/scripts/migrateFranchiseFinanceV3.js --apply    -> writes the changes
 *
 * 1. Builds the new indexes (ledger, charges, rules, territories, audit).
 * 2. Creates the global commission rule (version 1) from the old Fees & Commission food/taxi %.
 *    NOTE: from now on that % means "what the PLATFORM keeps of the franchise's earnings". Review it in the admin
 *    (Franchise > Commission rules) before real orders flow.
 * 3. Every existing franchise gets its two charges: joining fee = old franchiseFee with its old paid/waived state,
 *    security deposit = not required (0). Nothing gets locked by the migration.
 * 4. walletBalancePaise = exact sum of the wallet ledger rows (old rows are kept exactly as they are).
 *
 * Existing ledger rows, orders and rides are never modified. Safe to run more than once.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import FranchiseApplication from '../modules/food/admin/models/franchiseApplication.model.js';
import FranchiseLedger from '../modules/food/admin/models/franchiseLedger.model.js';
import FranchiseCharge from '../modules/food/admin/models/franchiseCharge.model.js';
import FranchiseCommissionRule from '../modules/food/admin/models/franchiseCommissionRule.model.js';
import FranchiseTerritory from '../modules/food/admin/models/franchiseTerritory.model.js';
import FranchiseAuditLog from '../modules/food/admin/models/franchiseAuditLog.model.js';
import '../core/admin/admin.model.js';
import { ensureGlobalRule } from '../modules/food/admin/services/commissionRules.service.js';
import { ensureLegacyCharges } from '../modules/food/admin/services/franchiseCharges.service.js';
import { ledgerWalletPaise } from '../modules/food/admin/services/franchiseLedger.service.js';
import { toPaise, fromPaise } from '../modules/food/admin/services/franchiseMoney.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

const APPLY = process.argv.includes('--apply');
const log = (...a) => console.log(APPLY ? '[APPLY]' : '[DRY-RUN]', ...a);

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);

    // 1. indexes
    for (const M of [FranchiseLedger, FranchiseCharge, FranchiseCommissionRule, FranchiseTerritory, FranchiseAuditLog]) {
        log(`indexes for ${M.collection.collectionName}`);
        if (APPLY) await M.createIndexes();
    }

    // 2. global rule
    const hasGlobal = await FranchiseCommissionRule.exists({ scope: 'global' });
    log(hasGlobal ? 'global commission rule exists' : 'create global commission rule v1 from old settings');
    if (APPLY && !hasGlobal) {
        const rule = await ensureGlobalRule();
        log(`global rule: food ${rule.food.rateBps / 100}%, taxi ${rule.taxi.rateBps / 100}% (review in admin!)`);
    }

    // 3 + 4. per franchise
    const apps = await FranchiseApplication.find({}).lean();
    for (const app of apps) {
        const charges = await FranchiseCharge.countDocuments({ franchiseId: app._id });
        if (!charges && app.status === 'approved') {
            log(`${app.applicationId} ${app.applicantName}: charges <- joining fee ₹${app.franchiseFee} (${app.franchiseFeeStatus}), deposit ₹0`);
            if (APPLY) await ensureLegacyCharges(app);
        }
        const ledger = await ledgerWalletPaise(app._id);
        const cached = Number.isFinite(app.walletBalancePaise) ? app.walletBalancePaise : toPaise(app.walletBalance);
        if (ledger !== cached || !Number.isFinite(app.walletBalancePaise)) {
            log(`${app.applicationId}: wallet ${fromPaise(cached)} -> ${fromPaise(ledger)} (from ledger)`);
            if (APPLY) await FranchiseApplication.updateOne({ _id: app._id }, { $set: { walletBalancePaise: ledger, walletBalance: fromPaise(ledger) } });
        }
    }

    await mongoose.disconnect();
    console.log('Done.');
}

run().catch((err) => {
    console.error(err);
    process.exit(1);
});
