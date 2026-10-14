/**
 * Demo franchises for testing the franchise portal (dev / test databases only).
 *
 *   node src/scripts/seedDemoFranchises.js            -> creates what is missing, prints logins
 *   node src/scripts/seedDemoFranchises.js --reset    -> also sets NEW passwords on existing demo logins
 *
 * Creates (once):
 *  - Zone pricing "Orai" (Orai food + Orai taxi zone): fee ₹1,50,000, deposit ₹75,000, commission Food 10% / Taxi 12%
 *  - Food zone "Raydo Demo Zone" + zone pricing: fee ₹1,00,000, deposit ₹50,000, commission Food 8%
 *  - "Demo Food Franchise"        (Food only)   in Raydo Demo Zone
 *  - "Demo Food+Taxi Franchise"   (Food + Taxi) in Orai
 * Fee and deposit of the demo franchises are WAIVED (reason recorded) so their logins work right away.
 * Refuses to run when NODE_ENV=production.
 */
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '../../.env') });

if (process.env.NODE_ENV === 'production') {
    console.error('Refusing to seed demo franchises into a production environment.');
    process.exit(1);
}

const RESET = process.argv.includes('--reset');
const ACTOR = { id: null, name: 'Demo seed script', email: '', level: 'system', ip: '' };
const newPassword = () => `Raydo@${crypto.randomBytes(4).toString('hex')}`;

async function run() {
    await mongoose.connect(process.env.MONGODB_URI);
    // Registers every model (food, taxi, franchise) exactly like the server does
    await import('../app.js');
    const { FoodZone } = await import('../modules/food/admin/models/zone.model.js');
    const { Zone: TaxiZone } = await import('../modules/taxi/driver/models/Zone.js');
    const { FoodAdmin } = await import('../core/admin/admin.model.js');
    const FranchiseApplication = (await import('../modules/food/admin/models/franchiseApplication.model.js')).default;
    const FranchiseTerritory = (await import('../modules/food/admin/models/franchiseTerritory.model.js')).default;
    const FranchiseCharge = (await import('../modules/food/admin/models/franchiseCharge.model.js')).default;
    const { ensureGlobalRule } = await import('../modules/food/admin/services/commissionRules.service.js');
    const { createTerritory } = await import('../modules/food/admin/services/franchiseTerritory.service.js');
    const { createApplication } = await import('../modules/food/admin/services/franchise.service.js');
    const { waiveCharge } = await import('../modules/food/admin/services/franchiseCharges.service.js');

    await ensureGlobalRule();

    // ---- zones ----
    const oraiFood = await FoodZone.findOne({ name: /^orai$/i }).lean();
    const oraiTaxi = await TaxiZone.findOne({ name: /^orai$/i }).lean();
    if (!oraiFood || !oraiTaxi) throw new Error('Orai food / taxi zone not found');

    let demoZone = await FoodZone.findOne({ name: 'Raydo Demo Zone' }).lean();
    if (!demoZone) {
        demoZone = (await FoodZone.create({
            name: 'Raydo Demo Zone', zoneName: 'Raydo Demo Zone', serviceLocation: 'Demo (Bhopal)',
            coordinates: [
                { latitude: 23.300, longitude: 77.300 }, { latitude: 23.300, longitude: 77.360 },
                { latitude: 23.250, longitude: 77.360 }, { latitude: 23.250, longitude: 77.300 },
            ],
        })).toObject();
        console.log('created food zone "Raydo Demo Zone"');
    }

    // ---- zone pricing ----
    const territory = async (foodZoneId, body) => {
        const existing = await FranchiseTerritory.findOne({ foodZoneId }).lean();
        if (existing) return existing._id;
        const t = await createTerritory({ foodZoneId, ...body }, ACTOR);
        console.log(`created zone pricing "${t.name}"`);
        return t.id;
    };
    const oraiTerritory = await territory(oraiFood._id, {
        name: 'Orai', city: 'Orai', code: 'ORAI', taxiZoneId: oraiTaxi._id, joiningFee: '150000', securityDeposit: '75000',
        commission: { mode: 'separate', food: { rate: '10' }, taxi: { rate: '12' }, reason: 'Demo zone pricing' },
    });
    const demoTerritory = await territory(demoZone._id, {
        name: 'Raydo Demo Zone', city: 'Bhopal (demo)', code: 'DEMO', joiningFee: '100000', securityDeposit: '50000',
        commission: { mode: 'separate', food: { rate: '8' }, taxi: { rate: '0' }, reason: 'Demo zone pricing' },
    });

    // ---- franchises ----
    const demos = [
        { name: 'Demo Food Franchise', email: 'food.franchise@raydo.demo', phone: '9999000011', territoryId: demoTerritory, services: ['food'], city: 'Bhopal', state: 'Madhya Pradesh' },
        { name: 'Demo Food+Taxi Franchise', email: 'both.franchise@raydo.demo', phone: '9999000022', territoryId: oraiTerritory, services: ['food', 'taxi'], city: 'Orai', state: 'Uttar Pradesh' },
    ];
    const out = [];
    for (const d of demos) {
        let app = await FranchiseApplication.findOne({ email: d.email }).lean();
        let password = null;
        if (!app) {
            password = newPassword();
            const created = await createApplication({
                applicantName: d.name, companyName: `${d.name} Pvt Ltd`, email: d.email, phone: d.phone,
                state: d.state, city: d.city, selectedModules: d.services, territoryId: d.territoryId,
                createSubAdmin: true, subAdminPassword: password, adminNote: 'Demo franchise for testing',
            }, ACTOR);
            app = await FranchiseApplication.findById(created._id).lean();
            console.log(`created franchise "${d.name}" (${app.applicationId})`);
        } else if (RESET) {
            password = newPassword();
            const login = await FoodAdmin.findById(app.subAdminId);
            login.password = password; // hashed by the model
            await login.save();
        }
        // Demo accounts: waive fee + deposit so the login works immediately
        for (const c of await FranchiseCharge.find({ franchiseId: app._id }).lean()) {
            if (['pending', 'partially_paid'].includes(c.status)) await waiveCharge(c._id, { reason: 'Demo franchise for testing' }, ACTOR);
        }
        const login = await FoodAdmin.findById(app.subAdminId).select('email active status').lean();
        out.push({ franchise: d.name, id: app.applicationId, services: d.services.join(' + '), email: login?.email, password: password || '(unchanged - run with --reset for a new one)', loginActive: login?.active !== false && login?.status !== 'inactive' });
    }
    console.table(out);
    await mongoose.disconnect();
    process.exit(0);
}

run().catch(async (err) => {
    console.error(err);
    await mongoose.disconnect().catch(() => {});
    process.exit(1);
});
