/**
 * Franchise finance: integration tests against the real Express app and an in-memory MongoDB replica set
 * (replica set = real multi-document transactions, like Atlas in production).
 *
 *   npm test
 *
 * Covers the 15 acceptance scenarios: manual creation per service, zone pricing, overrides, separate Food/Taxi
 * commission, history preservation, refunds/retries, idempotency, wallet = ledger, unpaid dues, isolation,
 * authorization of financial actions and franchise assignment of orders/rides.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.RATE_LIMIT_MAX = '100000';
process.env.FINANCE_WRITE_RATE_LIMIT = '100000';

let replSet;
let mongoose;
let request;
let app;
let M = {};
let svc = {};
const tok = {};
const ids = {};

const api = (method, url, token) => {
    const r = request(app)[method](`/api${url}`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
};

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());

    ({ default: request } = await import('supertest'));
    ({ default: app } = await import('../src/app.js'));
    const { signAccessToken } = await import('../src/core/auth/token.util.js');
    M.FoodAdmin = (await import('../src/core/admin/admin.model.js')).FoodAdmin;
    M.FoodZone = (await import('../src/modules/food/admin/models/zone.model.js')).FoodZone;
    M.TaxiZone = (await import('../src/modules/taxi/driver/models/Zone.js')).Zone;
    M.App = (await import('../src/modules/food/admin/models/franchiseApplication.model.js')).default;
    M.Ledger = (await import('../src/modules/food/admin/models/franchiseLedger.model.js')).default;
    M.Charge = (await import('../src/modules/food/admin/models/franchiseCharge.model.js')).default;
    M.Audit = (await import('../src/modules/food/admin/models/franchiseAuditLog.model.js')).default;
    svc.ledger = await import('../src/modules/food/admin/services/franchiseLedger.service.js');
    svc.taxi = await import('../src/modules/food/admin/services/franchiseTaxi.service.js');
    svc.finance = await import('../src/modules/food/admin/services/franchiseFinance.service.js');
    svc.money = await import('../src/modules/food/admin/services/franchiseMoney.js');

    // Build all indexes first (unique indexes are what make postings idempotent)
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));

    const platform = await M.FoodAdmin.create({
        email: 'owner@test.local', password: 'Passw0rd!x', name: 'Platform Owner', adminLevel: 'platform_superadmin',
        admin_type: 'superadmin', permissions: ['*'], servicesAccess: ['food', 'taxi'],
    });
    const foodSuper = await M.FoodAdmin.create({
        email: 'foodsuper@test.local', password: 'Passw0rd!x', name: 'Food Super', adminLevel: 'food_superadmin',
        admin_type: 'superadmin', permissions: ['*'], servicesAccess: ['food'], module: 'food',
    });
    ids.platformAdmin = platform._id;
    tok.platform = signAccessToken({ userId: String(platform._id), role: 'ADMIN' });
    tok.foodSuper = signAccessToken({ userId: String(foodSuper._id), role: 'ADMIN' });
    tok.sign = (userId) => signAccessToken({ userId: String(userId), role: 'ADMIN' });

    const square = (x) => [{ latitude: x, longitude: x }, { latitude: x + 1, longitude: x }, { latitude: x + 1, longitude: x + 1 }];
    const poly = (x) => ({ type: 'Polygon', coordinates: [[[x, x], [x + 1, x], [x + 1, x + 1], [x, x]]] });
    ids.foodZoneA = (await M.FoodZone.create({ name: 'Food A', coordinates: square(1) }))._id;
    ids.foodZoneB = (await M.FoodZone.create({ name: 'Food B', coordinates: square(5) }))._id;
    ids.taxiZoneA = (await M.TaxiZone.create({ name: 'Taxi A', geometry: poly(1) }))._id;
    ids.taxiZoneB = (await M.TaxiZone.create({ name: 'Taxi B', geometry: poly(5) }))._id;
});

after(async () => {
    await mongoose?.disconnect();
    await replSet?.stop();
});

const ledgerOf = (franchiseId, extra = {}) => M.Ledger.find({ franchiseId, ...extra }).lean();
const paise = (rows, type) => rows.filter((r) => r.type === type).reduce((s, r) => s + r.amountPaise, 0);

/** A delivered, paid food order + its FoodTransaction split (raw inserts: the full order flow is out of scope here). */
async function deliveredOrder(franchiseId, { platformNetProfit, total }) {
    const _id = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('food_transactions').insertOne({
        orderId: _id, status: 'captured', amounts: { platformNetProfit, totalCustomerPaid: total },
    });
    return {
        _id, franchiseId, order_id: `FOD-${String(_id).slice(-5)}`, orderStatus: 'delivered',
        payment: { method: 'razorpay', status: 'paid' }, pricing: { total }, deliveryState: { deliveredAt: new Date() },
    };
}

describe('Territories (zone-wise pricing)', () => {
    it('platform super admin creates zone pricing with different fees, deposits and commission', async () => {
        const a = await api('post', '/v1/food/admin/franchise/territories', tok.platform).send({
            name: 'Zone A', foodZoneId: ids.foodZoneA, taxiZoneId: ids.taxiZoneA, joiningFee: '100000', securityDeposit: '50000',
            commission: { mode: 'separate', food: { rate: '8' }, taxi: { rate: '15' }, reason: 'Launch pricing' },
        });
        assert.equal(a.status, 201, a.text);
        ids.territoryA = a.body.data.id;

        const b = await api('post', '/v1/food/admin/franchise/territories', tok.platform).send({
            name: 'Zone B', foodZoneId: ids.foodZoneB, taxiZoneId: ids.taxiZoneB, joiningFee: '150000', securityDeposit: '75000',
            commission: { mode: 'separate', food: { rate: '12' }, taxi: { rate: '10' } },
        });
        assert.equal(b.status, 201, b.text);
        ids.territoryB = b.body.data.id;

        const list = await api('get', '/v1/food/admin/franchise/territories', tok.platform);
        const zA = list.body.data.find((t) => t.id === ids.territoryA);
        assert.equal(zA.joiningFee, 100000);
        assert.equal(zA.securityDeposit, 50000);
        assert.equal(zA.commission.food.rate, 8);
        assert.equal(zA.commission.taxi.rate, 15);
    });

    it('a zone cannot belong to two territories', async () => {
        const r = await api('post', '/v1/food/admin/franchise/territories', tok.platform).send({
            name: 'Dup', foodZoneId: ids.foodZoneA, joiningFee: '1', securityDeposit: '1',
        });
        assert.equal(r.status, 400);
    });

    it('a non-platform super admin cannot configure zone pricing (403)', async () => {
        const r = await api('post', '/v1/food/admin/franchise/territories', tok.foodSuper).send({
            name: 'X', foodZoneId: new mongoose.Types.ObjectId(), joiningFee: '1', securityDeposit: '1',
        });
        assert.equal(r.status, 403);
    });

    it('rejects invalid money and percentages', async () => {
        const neg = await api('post', '/v1/food/admin/franchise/territories', tok.platform).send({ name: 'Bad', taxiZoneId: ids.taxiZoneA, joiningFee: '-5', securityDeposit: '1' });
        assert.equal(neg.status, 400);
        const pct = await api('post', `/v1/food/admin/franchise/commission-rules/territory/${ids.territoryA}`, tok.platform)
            .send({ mode: 'separate', food: { rate: '101' }, taxi: { rate: '5' }, reason: 'bad' });
        assert.equal(pct.status, 400);
    });
});

describe('Manual franchise creation', () => {
    const base = (over) => ({
        applicantName: 'Partner', phone: '9876543210', state: 'MP', city: 'Indore', createSubAdmin: true, ...over,
    });

    it('creates a Food-only franchise with territory pricing; status/fee fields in the body are ignored', async () => {
        const r = await api('post', '/v1/food/admin/franchise/applications', tok.platform).send(base({
            applicantName: 'Food Only', email: 'food@test.local', selectedModules: ['food'], territoryId: ids.territoryA,
            status: 'rejected', franchiseFeeStatus: 'paid', walletBalance: 999999, // mass-assignment attempt
        }));
        assert.equal(r.status, 201, r.text);
        ids.F1 = r.body.data._id;
        ids.F1login = r.body.data.subAdminId?._id || r.body.data.subAdminId;
        const app1 = await M.App.findById(ids.F1).lean();
        assert.equal(app1.status, 'approved');
        assert.equal(app1.franchiseFeeStatus, 'pending');
        assert.equal(app1.walletBalance, 0);
        assert.deepEqual(app1.selectedModules, ['food']);
        assert.equal(String(app1.zoneId), String(ids.foodZoneA));
        assert.equal(app1.taxiZoneId, null);
        const charges = await M.Charge.find({ franchiseId: ids.F1 }).lean();
        assert.equal(charges.find((c) => c.kind === 'joining_fee').expectedPaise, 100000_00);
        assert.equal(charges.find((c) => c.kind === 'security_deposit').expectedPaise, 50000_00);
    });

    it('creates a Taxi-only franchise in the same territory (taxi zone)', async () => {
        const r = await api('post', '/v1/food/admin/franchise/applications', tok.platform).send(base({
            applicantName: 'Taxi Only', email: 'taxi@test.local', phone: '9876543211', selectedModules: ['taxi'], territoryId: ids.territoryA,
            joiningFee: '0', securityDeposit: '0', overrideReason: 'Pilot partner, no fee',
        }));
        assert.equal(r.status, 201, r.text);
        ids.F2 = r.body.data._id;
        const a = await M.App.findById(ids.F2).lean();
        assert.equal(String(a.taxiZoneId), String(ids.taxiZoneA));
        assert.equal(a.zoneId, null);
        assert.equal(a.franchiseFeeStatus, 'waived'); // nothing to pay -> can operate
    });

    it('creates a Food + Taxi franchise with zone B pricing', async () => {
        const r = await api('post', '/v1/food/admin/franchise/applications', tok.platform).send(base({
            applicantName: 'Both', email: 'both@test.local', phone: '9876543212', selectedModules: ['food', 'taxi'], territoryId: ids.territoryB,
            createSubAdmin: false,
        }));
        assert.equal(r.status, 201, r.text);
        ids.F3 = r.body.data._id;
        const charges = await M.Charge.find({ franchiseId: ids.F3 }).lean();
        assert.equal(charges.find((c) => c.kind === 'joining_fee').expectedPaise, 150000_00);
        assert.equal(charges.find((c) => c.kind === 'security_deposit').expectedPaise, 75000_00);
    });

    it('an overridden fee needs a reason', async () => {
        const r = await api('post', '/v1/food/admin/franchise/applications', tok.platform).send(base({
            email: 'x@test.local', selectedModules: ['food'], territoryId: ids.territoryB, joiningFee: '1',
        }));
        assert.equal(r.status, 400);
    });

    it('a zone already owned by a franchise cannot be given to another one', async () => {
        const r = await api('post', '/v1/food/admin/franchise/applications', tok.platform).send(base({
            email: 'second@test.local', selectedModules: ['food'], territoryId: ids.territoryA, createSubAdmin: false,
        }));
        assert.equal(r.status, 409);
    });

    it('cannot take over an existing admin account through the franchise email', async () => {
        const t = await api('post', '/v1/food/admin/franchise/territories', tok.platform).send({ name: 'Zone T', taxiZoneId: (await M.TaxiZone.create({ name: 'T', geometry: { type: 'Polygon', coordinates: [[[9, 9], [10, 9], [10, 10], [9, 9]]] } }))._id, joiningFee: '0', securityDeposit: '0' });
        const r = await api('post', '/v1/food/admin/franchise/applications', tok.platform).send(base({
            email: 'owner@test.local', selectedModules: ['taxi'], territoryId: t.body.data.id,
        }));
        assert.equal(r.status, 409);
        const owner = await M.FoodAdmin.findById(ids.platformAdmin).lean();
        assert.equal(owner.franchiseId, null);
        assert.equal(owner.admin_type, 'superadmin');
    });

    it('a food super admin cannot create franchises (403)', async () => {
        const r = await api('post', '/v1/food/admin/franchise/applications', tok.foodSuper).send(base({
            email: 'nope@test.local', selectedModules: ['food'], territoryId: ids.territoryB,
        }));
        assert.equal(r.status, 403);
    });
});

describe('Joining fee and deposit (unpaid dues, manual confirmation)', () => {
    it('login stays locked while the fee/deposit are unpaid', async () => {
        const login = await M.FoodAdmin.findOne({ franchiseId: ids.F1 }).lean();
        assert.ok(login);
        ids.F1login = login._id;
        assert.equal(login.active, false);
        const r = await api('get', '/v1/franchise/finance', tok.sign(login._id));
        assert.equal(r.status, 401);
    });

    it('a non-platform admin cannot confirm payments', async () => {
        const joining = await M.Charge.findOne({ franchiseId: ids.F1, kind: 'joining_fee' }).lean();
        const r = await api('post', `/v1/food/admin/franchise/charges/${joining._id}/confirm-payment`, tok.foodSuper)
            .send({ amount: '100000', reference: 'UTR-FAKE-1', note: 'trust me' });
        assert.equal(r.status, 403);
    });

    it('partial payment keeps the login locked; full payment unlocks; references are single-use', async () => {
        const joining = await M.Charge.findOne({ franchiseId: ids.F1, kind: 'joining_fee' }).lean();
        const deposit = await M.Charge.findOne({ franchiseId: ids.F1, kind: 'security_deposit' }).lean();
        const pay = (id, body) => api('post', `/v1/food/admin/franchise/charges/${id}/confirm-payment`, tok.platform).send(body);

        const over = await pay(joining._id, { amount: '100000.01', reference: 'UTR-0001', note: 'bank statement' });
        assert.equal(over.status, 400);
        const ok1 = await pay(joining._id, { amount: '100000', reference: 'UTR-0001', method: 'neft', note: 'Checked bank statement' });
        assert.equal(ok1.status, 200, ok1.text);
        assert.equal((await M.App.findById(ids.F1).lean()).franchiseFeeStatus, 'pending');
        assert.equal((await M.FoodAdmin.findById(ids.F1login).lean()).active, false);

        const dup = await pay(deposit._id, { amount: '100', reference: 'UTR-0001', note: 'same ref' });
        assert.equal(dup.status, 409);

        const [x, y] = await Promise.all([
            pay(deposit._id, { amount: '50000', reference: 'UTR-0002', note: 'deposit received' }),
            pay(deposit._id, { amount: '50000', reference: 'UTR-0002', note: 'double click' }),
        ]);
        assert.deepEqual([x.status, y.status].sort(), [200, 409]);

        const app1 = await M.App.findById(ids.F1).lean();
        assert.equal(app1.franchiseFeeStatus, 'paid');
        assert.equal((await M.FoodAdmin.findById(ids.F1login).lean()).active, true);
        const dep = await M.Charge.findById(deposit._id).lean();
        assert.equal(dep.paidPaise, 50000_00);
        // fee/deposit money never enters the wallet
        assert.equal(app1.walletBalance, 0);
        const audit = await M.Audit.countDocuments({ franchiseId: ids.F1, action: 'charge.confirm_payment' });
        assert.equal(audit, 2);
    });

    it('settle F3 by waiving (with reason)', async () => {
        for (const c of await M.Charge.find({ franchiseId: ids.F3 }).lean()) {
            const r = await api('post', `/v1/food/admin/franchise/charges/${c._id}/waive`, tok.platform).send({ reason: 'Founding partner' });
            assert.equal(r.status, 200, r.text);
        }
        assert.equal((await M.App.findById(ids.F3).lean()).franchiseFeeStatus, 'waived');
    });
});

describe('Commission calculation (separate Food and Taxi)', () => {
    it('Scenario B: Food-only, ₹20,000 at 8% -> ₹1,600 commission, ₹18,400 net; Taxi 0', async () => {
        ids.orderF1a = await deliveredOrder(ids.F1, { platformNetProfit: 12000, total: 24000 });
        ids.orderF1b = await deliveredOrder(ids.F1, { platformNetProfit: 8000, total: 16000 });
        await svc.ledger.creditFoodOrder(ids.orderF1a);
        await svc.ledger.creditFoodOrder(ids.orderF1b);
        const rows = await ledgerOf(ids.F1, { engineVersion: 2, account: 'wallet' });
        assert.equal(paise(rows, 'earning'), 20000_00);
        assert.equal(paise(rows, 'platform_commission'), -1600_00);
        assert.equal((await M.App.findById(ids.F1).lean()).walletBalancePaise, 18400_00);
        assert.ok(rows.every((r) => r.module === 'food' && r.rateBps === 800 && r.ruleScope === 'territory'));
    });

    it('Scenario C: Taxi-only, ₹12,000 at 15% -> ₹1,800, net ₹10,200; Food orders earn nothing', async () => {
        await svc.ledger.creditTaxiRide({ franchiseId: ids.F2, rideId: new mongoose.Types.ObjectId(), base: 12000 });
        const foodTry = await svc.ledger.creditFoodOrder(await deliveredOrder(ids.F2, { platformNetProfit: 500, total: 900 }));
        assert.equal(foodTry, null);
        const rows = await ledgerOf(ids.F2, { engineVersion: 2 });
        assert.equal(paise(rows, 'earning'), 12000_00);
        assert.equal(paise(rows, 'platform_commission'), -1800_00);
        assert.ok(rows.every((r) => r.module === 'taxi'));
    });

    it('franchise override beats the territory rate (override 10% food / 12% taxi)', async () => {
        const r = await api('post', `/v1/food/admin/franchise/commission-rules/franchise/${ids.F3}`, tok.platform)
            .send({ mode: 'separate', food: { rate: '10' }, taxi: { rate: '12' }, reason: 'Negotiated rate' });
        assert.equal(r.status, 201, r.text);
        const eff = await api('get', `/v1/food/admin/franchise/applications/${ids.F3}/commission/effective`, tok.platform);
        assert.equal(eff.body.data.appliedFrom, 'franchise');
        assert.equal(eff.body.data.food.rate, 10);
        assert.equal(eff.body.data.taxi.rate, 12);
    });

    it('Scenario A: Food ₹10,000 @10% + Taxi ₹5,000 @12% = ₹1,600 commission, ₹13,400 net', async () => {
        ids.orderF3 = await deliveredOrder(ids.F3, { platformNetProfit: 10000, total: 20000 });
        await svc.ledger.creditFoodOrder(ids.orderF3);
        await svc.ledger.creditTaxiRide({ franchiseId: ids.F3, rideId: new mongoose.Types.ObjectId(), base: 5000 });
        const fin = await api('get', `/v1/food/admin/franchise/applications/${ids.F3}/finance`, tok.platform);
        assert.equal(fin.status, 200, fin.text);
        const t = fin.body.data.totals;
        assert.equal(t.foodEarning, 10000);
        assert.equal(t.foodCommission, 1000);
        assert.equal(t.taxiEarning, 5000);
        assert.equal(t.taxiCommission, 600);
        assert.equal(t.totalEarning, 15000);
        assert.equal(t.totalCommission, 1600);
        assert.equal(t.franchiseNet, 13400);
        assert.equal(fin.body.data.wallet.balance, 13400);
    });

    it('combined mode applies one % to Food + Taxi together', async () => {
        await api('post', `/v1/food/admin/franchise/commission-rules/franchise/${ids.F3}`, tok.platform)
            .send({ mode: 'combined', combinedRate: '10', reason: 'Switch to one rate' }).expect(201);
        const before = await ledgerOf(ids.F3);
        const o = await deliveredOrder(ids.F3, { platformNetProfit: 1000, total: 2000 });
        await svc.ledger.creditFoodOrder(o);
        await svc.ledger.creditTaxiRide({ franchiseId: ids.F3, rideId: new mongoose.Types.ObjectId(), base: 500 });
        const after = (await ledgerOf(ids.F3)).filter((r) => !before.some((b) => String(b._id) === String(r._id)));
        assert.equal(paise(after, 'platform_commission'), -150_00); // 10% of (1000 + 500)
    });

    it('changing a rate never alters historical rows', async () => {
        const original = await M.Ledger.find({ franchiseId: ids.F3, sourceId: String(ids.orderF3._id) }).lean();
        await api('post', `/v1/food/admin/franchise/commission-rules/franchise/${ids.F3}`, tok.platform)
            .send({ mode: 'separate', food: { rate: '20' }, taxi: { rate: '20' }, reason: 'New contract' }).expect(201);
        const again = await M.Ledger.find({ franchiseId: ids.F3, sourceId: String(ids.orderF3._id) }).lean();
        assert.deepEqual(again.map((r) => [r.type, r.amountPaise, r.rateBps]), original.map((r) => [r.type, r.amountPaise, r.rateBps]));
        assert.equal(original.find((r) => r.type === 'platform_commission').rateBps, 1000);
        await assert.rejects(M.Ledger.updateOne({ _id: original[0]._id }, { $set: { amount: 0 } }), /immutable/);
        const back = await api('post', `/v1/food/admin/franchise/commission-rules/franchise/${ids.F3}`, tok.platform)
            .send({ effectiveFrom: '2000-01-01', mode: 'separate', food: { rate: '1' }, taxi: { rate: '1' }, reason: 'backdate' });
        assert.equal(back.status, 400); // no back-dating
    });

    it('a disabled service rule charges 0% but still records the earning', async () => {
        await api('post', `/v1/food/admin/franchise/commission-rules/franchise/${ids.F3}`, tok.platform)
            .send({ mode: 'separate', food: { enabled: false }, taxi: { rate: '20' }, reason: 'Food commission paused' }).expect(201);
        const o = await deliveredOrder(ids.F3, { platformNetProfit: 700, total: 1400 });
        await svc.ledger.creditFoodOrder(o);
        const rows = await M.Ledger.find({ sourceId: String(o._id) }).lean();
        assert.deepEqual(rows.map((r) => r.type), ['earning']);
    });
});

describe('Idempotency, refunds and retries', () => {
    it('the same order processed concurrently and repeatedly posts exactly once', async () => {
        const o = await deliveredOrder(ids.F1, { platformNetProfit: 1000, total: 2000 });
        await Promise.all([1, 2, 3, 4, 5].map(() => svc.ledger.creditFoodOrder(o)));
        await svc.ledger.creditFoodOrder(o);
        const rows = await M.Ledger.find({ sourceId: String(o._id) }).lean();
        assert.equal(rows.filter((r) => r.type === 'earning').length, 1);
        assert.equal(rows.filter((r) => r.type === 'platform_commission').length, 1);
        ids.orderF1c = o;
    });

    it('unpaid / failed orders are not eligible', async () => {
        const o = await deliveredOrder(ids.F1, { platformNetProfit: 999, total: 1999 });
        o.payment = { method: 'razorpay', status: 'failed' };
        assert.equal(await svc.ledger.creditFoodOrder(o), null);
        const cancelled = await deliveredOrder(ids.F1, { platformNetProfit: 999, total: 1999 });
        cancelled.orderStatus = 'cancelled_by_user';
        assert.equal(await svc.ledger.creditFoodOrder(cancelled), null);
    });

    it('a 50% refund reverses half; a retry does nothing; a later full refund only reverses the rest', async () => {
        const o = ids.orderF1a; // earning 12000 @ 8% = 960 commission, order total 24000
        await svc.ledger.reverseFoodOrder(o._id, { refundAmount: 12000, orderTotal: 24000 });
        await svc.ledger.reverseFoodOrder(o._id, { refundAmount: 12000, orderTotal: 24000 }); // retry
        let rows = await M.Ledger.find({ sourceId: String(o._id) }).lean();
        assert.equal(paise(rows, 'earning_reversal'), -6000_00);
        assert.equal(paise(rows, 'commission_reversal'), 480_00);
        await svc.ledger.reverseFoodOrder(o._id, { refundKey: 'claim:1' });
        await svc.ledger.reverseFoodOrder(o._id, { refundKey: 'claim:2' });
        rows = await M.Ledger.find({ sourceId: String(o._id) }).lean();
        assert.equal(paise(rows, 'earning') + paise(rows, 'earning_reversal'), 0);
        assert.equal(paise(rows, 'platform_commission') + paise(rows, 'commission_reversal'), 0);
    });

    it('wallet always equals the ledger (reconciliation)', async () => {
        for (const id of [ids.F1, ids.F2, ids.F3]) {
            const r = await api('get', `/v1/food/admin/franchise/applications/${id}/reconcile`, tok.platform);
            assert.equal(r.status, 200, r.text);
            assert.equal(r.body.data.wallet.ok, true, JSON.stringify(r.body.data.wallet));
        }
    });

    it('rounding: half-up per transaction in integer paise', () => {
        assert.equal(svc.money.applyBps(1005, 1250), 126);  // 10.05 * 12.5% = 1.25625 -> 1.26
        assert.equal(svc.money.applyBps(1, 5000), 1);       // 0.005 -> 0.01
        assert.equal(svc.money.proportion(333, 1, 3), 111);
        assert.throws(() => svc.money.parseRupeesInput('1.234'));
        assert.throws(() => svc.money.parsePercentInput('100.01'));
    });
});

describe('Payouts', () => {
    it('only the platform admin can approve, a reference is required, concurrent approvals debit once', async () => {
        const partner = tok.sign(ids.F1login);
        const req1 = await api('post', '/v1/franchise/payout-request', partner).send({ amount: 5000, payoutMethod: 'upi', upiId: 'partner@upi' });
        assert.equal(req1.status, 200, req1.text);
        const app1 = await M.App.findById(ids.F1).lean();
        const requestId = app1.payoutRequests[0].requestId;
        const url = `/v1/food/admin/franchise/applications/${ids.F1}/payout-requests/${requestId}`;
        const walletBefore = app1.walletBalancePaise;

        assert.equal((await api('patch', url, tok.foodSuper).send({ status: 'approved', transactionId: 'UTR-PAY-1' })).status, 403);
        assert.equal((await api('patch', url, tok.platform).send({ status: 'approved' })).status, 400);
        const results = await Promise.all([
            api('patch', url, tok.platform).send({ status: 'approved', transactionId: 'UTR-PAY-1' }),
            api('patch', url, tok.platform).send({ status: 'approved', transactionId: 'UTR-PAY-1' }),
            api('patch', url, tok.platform).send({ status: 'rejected' }),
        ]);
        assert.equal(results.filter((r) => r.status === 200).length, 1, results.map((r) => r.status).join(','));
        const after = await M.App.findById(ids.F1).lean();
        const payouts = await M.Ledger.countDocuments({ franchiseId: ids.F1, type: 'payout' });
        const st = after.payoutRequests[0].status;
        assert.equal(payouts, st === 'approved' ? 1 : 0);
        assert.equal(after.walletBalancePaise, walletBefore - (st === 'approved' ? 5000_00 : 0));
    });

    it('a payout larger than the wallet is refused', async () => {
        const partner = tok.sign(ids.F1login);
        const r = await api('post', '/v1/franchise/payout-request', partner).send({ amount: 999999, payoutMethod: 'upi', upiId: 'partner@upi' });
        assert.equal(r.status, 400);
    });
});

describe('Isolation and authorization', () => {
    it('a partner only sees its own finance, even when asking for another franchise', async () => {
        const partner = tok.sign(ids.F1login);
        const r = await api('get', `/v1/franchise/finance?franchiseId=${ids.F3}`, partner).set('x-franchise-id', String(ids.F3));
        assert.equal(r.status, 200, r.text);
        assert.equal(String(r.body.data.franchise.id), String(ids.F1));
        assert.equal(r.body.data.totals.taxiEarning, 0);
        assert.equal(r.body.data.rates.ruleId, undefined);
    });

    it('a partner login cannot reach admin finance routes', async () => {
        const partner = tok.sign(ids.F1login);
        assert.equal((await api('get', '/v1/food/admin/franchise/finance/summary', partner)).status, 403);
        assert.equal((await api('post', `/v1/food/admin/franchise/commission-rules/franchise/${ids.F1}`, partner).send({ mode: 'combined', combinedRate: '0', reason: 'free money' })).status, 403);
    });

    it('the old /commission route can no longer change fees, fee status or rates', async () => {
        const r = await api('patch', `/v1/food/admin/franchise/applications/${ids.F3}/commission`, tok.platform).send({ franchiseFeeStatus: 'paid' });
        assert.equal(r.status, 400);
        const r2 = await api('patch', `/v1/food/admin/franchise/applications/${ids.F3}/commission`, tok.platform).send({ moduleCommissions: { food: 0 } });
        assert.equal(r2.status, 400);
    });

    it('food super admin can view the summary but not change money', async () => {
        const r = await api('get', '/v1/food/admin/franchise/finance/summary', tok.foodSuper);
        assert.equal(r.status, 200);
        assert.equal(r.body.data.total, 3);
        assert.equal((await api('post', `/v1/food/admin/franchise/applications/${ids.F1}/suspend`, tok.foodSuper).send({ reason: 'x y z' })).status, 403);
    });
});

describe('Assignment and lifecycle', () => {
    it('food orders in a zone are assigned to the franchise that owns it; taxi rides via the driver zone', async () => {
        assert.equal(String(await svc.ledger.findFranchiseForZone(ids.foodZoneA, 'food')), String(ids.F1));
        assert.equal(String(await svc.ledger.findFranchiseForZone(ids.foodZoneB, 'food')), String(ids.F3));

        const driverId = new mongoose.Types.ObjectId();
        const rideId = new mongoose.Types.ObjectId();
        await mongoose.connection.collection(mongoose.models.TaxiDriver.collection.collectionName).insertOne({ _id: driverId, zoneId: ids.taxiZoneA });
        await mongoose.connection.collection(mongoose.models.TaxiRide.collection.collectionName).insertOne({
            _id: rideId, driverId, status: 'completed', walletSettledAt: new Date(), completedAt: new Date(),
            commissionAmount: 300, fare: 1500, serviceType: 'ride',
        });
        await svc.taxi.creditFranchiseForRide(rideId);
        await svc.taxi.creditFranchiseForRide(rideId); // retry
        const rows = await M.Ledger.find({ sourceId: String(rideId) }).lean();
        assert.equal(String(rows[0].franchiseId), String(ids.F2));
        assert.equal(paise(rows, 'earning'), 300_00);           // platform commission, not the ₹1,500 fare
        assert.equal(paise(rows, 'platform_commission'), -45_00); // 15%
    });

    it('a deposit is held while active; after termination it can be refunded (without touching the wallet)', async () => {
        const deposit = await M.Charge.findOne({ franchiseId: ids.F1, kind: 'security_deposit' }).lean();
        const refund = (body) => api('post', `/v1/food/admin/franchise/charges/${deposit._id}/refund`, tok.platform).send(body);
        assert.equal((await refund({ amount: '1000', reference: 'UTR-REF-1', reason: 'test' })).status, 400);

        const pending = (await M.App.findById(ids.F1).lean()).payoutRequests.filter((p) => p.status === 'pending');
        for (const p of pending) {
            await api('patch', `/v1/food/admin/franchise/applications/${ids.F1}/payout-requests/${p.requestId}`, tok.platform).send({ status: 'rejected' });
        }
        const term = await api('post', `/v1/food/admin/franchise/applications/${ids.F1}/terminate`, tok.platform).send({ reason: 'Agreement ended' });
        assert.equal(term.status, 200, term.text);
        const walletBefore = (await M.App.findById(ids.F1).lean()).walletBalancePaise;

        const ded = await api('post', `/v1/food/admin/franchise/charges/${deposit._id}/deduct`, tok.platform).send({ amount: '5000', reason: 'Unreturned equipment' });
        assert.equal(ded.status, 200, ded.text);
        assert.equal((await refund({ amount: '45000.01', reference: 'UTR-REF-1', reason: 'final settlement' })).status, 400);
        const ok = await refund({ amount: '45000', reference: 'UTR-REF-1', reason: 'final settlement' });
        assert.equal(ok.status, 200, ok.text);
        assert.equal(ok.body.data.held, 0);
        assert.equal((await M.App.findById(ids.F1).lean()).walletBalancePaise, walletBefore);
        // terminated franchise no longer receives new orders of its zone, and cannot log in
        assert.equal(await svc.ledger.findFranchiseForZone(ids.foodZoneA, 'food'), null);
        assert.equal((await api('get', '/v1/franchise/finance', tok.sign(ids.F1login))).status, 401);
    });

    it('every financial change left an audit row', async () => {
        const actions = await M.Audit.distinct('action');
        for (const a of ['territory.create', 'franchise.create', 'charge.confirm_payment', 'charge.waive', 'rule.new_version', 'franchise.terminate', 'deposit.refund', 'deposit.deduction']) {
            assert.ok(actions.includes(a), `missing audit action ${a} (have: ${actions.join(', ')})`);
        }
        assert.ok(actions.some((a) => a.startsWith('payout.')), 'missing payout audit');
        await assert.rejects(M.Audit.deleteMany({}), /cannot be modified/);
    });
});
