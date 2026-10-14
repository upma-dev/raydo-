/**
 * Franchise portal: data isolation on the shared food admin API, platform-only actions, taxi admin lockout,
 * and the franchise features (riders, taxi drivers, payments).  Run: npm test
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
const tok = {};
const ids = {};
const col = (modelName) => mongoose.models[modelName].collection;
const api = (method, url, token) => {
    const r = request(app)[method](`/api${url}`);
    return token ? r.set('Authorization', `Bearer ${token}`) : r;
};
const oid = () => new mongoose.Types.ObjectId();

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    ({ default: request } = await import('supertest'));
    ({ default: app } = await import('../src/app.js'));
    const { signAccessToken } = await import('../src/core/auth/token.util.js');
    const { FoodAdmin } = await import('../src/core/admin/admin.model.js');
    const { FoodZone } = await import('../src/modules/food/admin/models/zone.model.js');
    const { Zone: TaxiZone } = await import('../src/modules/taxi/driver/models/Zone.js');
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));
    tok.sign = (id) => signAccessToken({ userId: String(id), role: 'ADMIN' });

    const platform = await FoodAdmin.create({ email: 'owner@t.local', password: 'Passw0rd!x', name: 'Owner', adminLevel: 'platform_superadmin', admin_type: 'superadmin', permissions: ['*'], servicesAccess: ['food', 'taxi'] });
    const foodSuper = await FoodAdmin.create({ email: 'fs@t.local', password: 'Passw0rd!x', name: 'Food Super', adminLevel: 'food_superadmin', admin_type: 'superadmin', permissions: ['*'], servicesAccess: ['food'], module: 'food' });
    tok.platform = tok.sign(platform._id);
    tok.foodSuper = tok.sign(foodSuper._id);

    const sq = (x) => [{ latitude: x, longitude: x }, { latitude: x + 1, longitude: x }, { latitude: x + 1, longitude: x + 1 }];
    const poly = (x) => ({ type: 'Polygon', coordinates: [[[x, x], [x + 1, x], [x + 1, x + 1], [x, x]]] });
    ids.foodA = (await FoodZone.create({ name: 'FA', coordinates: sq(1) }))._id;
    ids.foodB = (await FoodZone.create({ name: 'FB', coordinates: sq(5) }))._id;
    ids.taxiA = (await TaxiZone.create({ name: 'TA', geometry: poly(1) }))._id;
    ids.taxiB = (await TaxiZone.create({ name: 'TB', geometry: poly(5) }))._id;

    const terr = async (body) => (await api('post', '/v1/food/admin/franchise/territories', tok.platform).send({ joiningFee: '0', securityDeposit: '0', ...body })).body.data.id;
    const tA = await terr({ name: 'Zone A', foodZoneId: ids.foodA, taxiZoneId: ids.taxiA });
    const tB = await terr({ name: 'Zone B', foodZoneId: ids.foodB, taxiZoneId: ids.taxiB });
    const make = async (email, phone, territoryId, services) => {
        const r = await api('post', '/v1/food/admin/franchise/applications', tok.platform).send({
            applicantName: email, email, phone, state: 'MP', city: 'Indore', selectedModules: services, territoryId, createSubAdmin: true,
        });
        assert.equal(r.status, 201, r.text);
        return r.body.data;
    };
    const A = await make('a@t.local', '9000000001', tA, ['food', 'taxi']);
    const B = await make('b@t.local', '9000000002', tB, ['food']);
    ids.A = A._id; ids.B = B._id;
    const loginA = await FoodAdmin.findOne({ franchiseId: ids.A });
    const loginB = await FoodAdmin.findOne({ franchiseId: ids.B });
    ids.loginA = loginA._id;
    tok.A = tok.sign(loginA._id);
    tok.B = tok.sign(loginB._id);

    // restaurants: rA (franchise A), rB (franchise B), rJoin (pending in zone A, unclaimed), rJoinB (pending in zone B)
    const R = col('FoodRestaurant');
    ids.rA = oid(); ids.rB = oid(); ids.rJoin = oid(); ids.rJoinB = oid();
    await R.insertMany([
        { _id: ids.rA, restaurantName: 'Rest A', franchiseId: ids.A && new mongoose.Types.ObjectId(ids.A), zoneId: ids.foodA, status: 'approved', isActive: true },
        { _id: ids.rB, restaurantName: 'Rest B', franchiseId: new mongoose.Types.ObjectId(ids.B), zoneId: ids.foodB, status: 'approved', isActive: true },
        { _id: ids.rJoin, restaurantName: 'Join A', franchiseId: null, zoneId: ids.foodA, status: 'pending' },
        { _id: ids.rJoinB, restaurantName: 'Join B', franchiseId: null, zoneId: ids.foodB, status: 'pending' },
    ]);
    ids.fA = oid(); ids.fB = oid();
    await col('FoodItem').insertMany([
        { _id: ids.fA, name: 'Paneer', restaurantId: ids.rA, price: 100, isDeleted: false },
        { _id: ids.fB, name: 'Dosa', restaurantId: ids.rB, price: 90, isDeleted: false },
    ]);
    ids.cB = oid();
    await col('FoodCategory').insertOne({ _id: ids.cB, name: 'B only', franchiseId: new mongoose.Types.ObjectId(ids.B), isActive: true });
    ids.oA = oid(); ids.oB = oid();
    await col('FoodOrder').insertMany([
        { _id: ids.oA, order_id: 'FOD-A1', franchiseId: new mongoose.Types.ObjectId(ids.A), restaurantId: ids.rA, orderStatus: 'delivered', pricing: { total: 500 }, payment: { method: 'razorpay', status: 'paid' }, createdAt: new Date() },
        { _id: ids.oB, order_id: 'FOD-B1', franchiseId: new mongoose.Types.ObjectId(ids.B), restaurantId: ids.rB, orderStatus: 'delivered', pricing: { total: 700 }, payment: { method: 'cash', status: 'paid' }, createdAt: new Date() },
    ]);
    await col('FoodTransaction').insertOne({ orderId: ids.oA, status: 'captured', amounts: { restaurantShare: 400, riderShare: 40, platformNetProfit: 60, totalCustomerPaid: 500 } });
    await col('FoodSupportTicket').insertMany([
        { type: 'order', restaurantId: ids.rA, issueType: 'late', status: 'open', createdAt: new Date() },
        { type: 'order', restaurantId: ids.rB, issueType: 'cold', status: 'open', createdAt: new Date() },
    ]);
    ids.riderA = oid(); ids.riderB = oid();
    await col('FoodDeliveryPartner').insertMany([
        { _id: ids.riderA, name: 'Rider A', phone: '8000000001', zoneId: ids.foodA, status: 'pending', aadharNumber: '123412341234', createdAt: new Date() },
        { _id: ids.riderB, name: 'Rider B', phone: '8000000002', zoneId: ids.foodB, status: 'pending', createdAt: new Date() },
    ]);
    ids.drvA = oid(); ids.drvB = oid();
    await col('TaxiDriver').insertMany([
        { _id: ids.drvA, name: 'Driver A', phone: '7000000001', zoneId: ids.taxiA, approve: false, status: 'pending', deletedAt: null, createdAt: new Date() },
        { _id: ids.drvB, name: 'Driver B', phone: '7000000002', zoneId: ids.taxiB, approve: true, status: 'approved', deletedAt: null, createdAt: new Date() },
    ]);
});

after(async () => {
    await mongoose?.disconnect();
    await replSet?.stop();
});

describe('Food admin API: a franchise only reaches its own records', () => {
    it('own restaurant: yes; another franchise\'s restaurant: 404 for read, edit, status, delete', async () => {
        assert.equal((await api('get', `/v1/food/admin/restaurants/${ids.rA}`, tok.A)).status, 200);
        assert.equal((await api('get', `/v1/food/admin/restaurants/${ids.rB}`, tok.A)).status, 404);
        assert.equal((await api('patch', `/v1/food/admin/restaurants/${ids.rB}`, tok.A).send({ restaurantName: 'hacked' })).status, 404);
        assert.equal((await api('patch', `/v1/food/admin/restaurants/${ids.rB}/status`, tok.A).send({ isActive: false })).status, 404);
        assert.equal((await api('delete', `/v1/food/admin/restaurants/${ids.rB}`, tok.A)).status, 404);
        const rb = await col('FoodRestaurant').findOne({ _id: ids.rB });
        assert.equal(rb.restaurantName, 'Rest B');
    });

    it('a franchise cannot move its restaurant to another franchise or zone', async () => {
        const r = await api('patch', `/v1/food/admin/restaurants/${ids.rA}`, tok.A).send({ franchiseId: ids.B, zoneId: String(ids.foodB) });
        assert.equal(r.status, 403);
        const ra = await col('FoodRestaurant').findOne({ _id: ids.rA });
        assert.equal(String(ra.franchiseId), String(ids.A));
    });

    it('join requests: only its zone; approving claims the restaurant', async () => {
        const list = await api('get', '/v1/food/admin/restaurants/pending', tok.A);
        assert.equal(list.status, 200, list.text);
        const names = JSON.stringify(list.body);
        assert.ok(names.includes('Join A'));
        assert.ok(!names.includes('Join B'));
        assert.equal((await api('patch', `/v1/food/admin/restaurants/${ids.rJoinB}/approve`, tok.A)).status, 404);
        const ok = await api('patch', `/v1/food/admin/restaurants/${ids.rJoin}/approve`, tok.A);
        assert.equal(ok.status, 200, ok.text);
        const claimed = await col('FoodRestaurant').findOne({ _id: ids.rJoin });
        assert.equal(String(claimed.franchiseId), String(ids.A));
    });

    it('foods, categories and orders of another franchise are not reachable', async () => {
        assert.equal((await api('patch', `/v1/food/admin/foods/${ids.fB}`, tok.A).send({ price: 1 })).status, 404);
        assert.equal((await api('delete', `/v1/food/admin/foods/${ids.fB}`, tok.A)).status, 404);
        assert.equal((await api('post', '/v1/food/admin/foods', tok.A).send({ restaurantId: String(ids.rB), name: 'x', price: 1 })).status, 404);
        assert.equal((await api('post', '/v1/food/admin/foods/bulk-approve', tok.A).send({})).status, 404);
        assert.equal((await api('patch', `/v1/food/admin/categories/${ids.cB}`, tok.A).send({ name: 'x' })).status, 404);
        assert.equal((await api('get', `/v1/food/admin/orders/${ids.oB}`, tok.A)).status, 404);
        assert.equal((await api('get', '/v1/food/admin/orders/FOD-B1', tok.A)).status, 404);
        assert.equal((await api('post', `/v1/food/admin/orders/${ids.oB}/cancel`, tok.A).send({ reason: 'x' })).status, 404);
    });

    it('complaints list shows only its own restaurants', async () => {
        const r = await api('get', '/v1/food/admin/restaurants/complaints', tok.A);
        assert.equal(r.status, 200, r.text);
        const body = JSON.stringify(r.body);
        assert.ok(body.includes('late'));
        assert.ok(!body.includes('cold'));
    });

    it('platform-only actions are refused for franchises', async () => {
        const refused = (st) => assert.ok([401, 403].includes(st), `expected refusal, got ${st}`);
        refused((await api('get', '/v1/food/admin/restaurant-commissions', tok.A)).status);
        refused((await api('post', '/v1/food/admin/restaurant-commissions', tok.A).send({ restaurantId: String(ids.rA), value: 0 })).status);
        assert.equal((await api('get', '/v1/food/admin/reports/transactions', tok.A)).status, 403);
        assert.equal((await api('patch', `/v1/food/admin/categories/${ids.cB}/make-global`, tok.A)).status, 403);
        assert.equal((await api('delete', `/v1/food/admin/orders/${ids.oA}`, tok.A)).status, 403);
        assert.equal((await api('patch', `/v1/food/admin/restaurants/${ids.rA}/zone-featured-rank`, tok.A).send({ rank: 1 })).status, 403);
        assert.equal((await api('get', '/v1/food/admin/zones', tok.A)).status, 401);
        assert.equal((await api('get', '/v1/food/admin/delivery/commission-rules', tok.A)).status, 401);
        assert.equal((await api('get', '/v1/food/admin/withdrawals', tok.A)).status, 401);
    });

    it('a stored "*" permission does not widen a franchise login', async () => {
        const { FoodAdmin } = await import('../src/core/admin/admin.model.js');
        await FoodAdmin.updateOne({ _id: ids.loginA }, { $set: { permissions: ['*'] } });
        assert.equal((await api('get', '/v1/food/admin/zones', tok.A)).status, 401);
        assert.equal((await api('get', '/v1/food/admin/customers', tok.A)).status, 401);
        assert.equal((await api('get', `/v1/food/admin/restaurants/${ids.rA}`, tok.A)).status, 200);
    });

    it('platform admin still reaches everything', async () => {
        assert.equal((await api('get', `/v1/food/admin/restaurants/${ids.rB}`, tok.platform)).status, 200);
        assert.equal((await api('get', '/v1/food/admin/restaurant-commissions', tok.platform)).status, 200);
    });
});

describe('Taxi admin API is closed to franchise logins', () => {
    it('franchise and food-only admins get 403; platform admin passes', async () => {
        assert.equal((await api('get', '/v1/taxi/admin/drivers', tok.A)).status, 403);
        assert.equal((await api('post', `/v1/taxi/admin/wallet/drivers/${ids.drvB}/adjust`, tok.A).send({ amount: 999999 })).status, 403);
        assert.equal((await api('get', '/v1/taxi/admin/users', tok.foodSuper)).status, 403);
        assert.notEqual((await api('get', '/v1/taxi/admin/drivers', tok.platform)).status, 403);
    });
});

describe('Franchise portal features', () => {
    it('riders: only its zone; approve stamps the franchise; other zone 404; reject needs a reason', async () => {
        const list = await api('get', '/v1/franchise/food/riders?status=', tok.A);
        assert.equal(list.status, 200, list.text);
        const names = list.body.data.items.map((r) => r.name);
        assert.deepEqual(names, ['Rider A']);
        const detail = await api('get', `/v1/franchise/food/riders/${ids.riderA}`, tok.A);
        assert.equal(detail.body.data.aadharNumber.endsWith('1234'), true);
        assert.ok(!detail.body.data.aadharNumber.includes('12341234'));
        assert.equal((await api('get', `/v1/franchise/food/riders/${ids.riderB}`, tok.A)).status, 404);
        assert.equal((await api('post', `/v1/franchise/food/riders/${ids.riderB}/approve`, tok.A)).status, 404);
        assert.equal((await api('post', `/v1/franchise/food/riders/${ids.riderA}/reject`, tok.A).send({})).status, 400);
        const ok = await api('post', `/v1/franchise/food/riders/${ids.riderA}/approve`, tok.A);
        assert.equal(ok.status, 200, ok.text);
        const rider = await col('FoodDeliveryPartner').findOne({ _id: ids.riderA });
        assert.equal(rider.status, 'approved');
        assert.equal(String(rider.franchiseId), String(ids.A));
    });

    it('taxi drivers: approve, block (with reason), unblock own; other zone 404; food-only franchise 403', async () => {
        assert.equal((await api('get', `/v1/franchise/taxi/drivers/${ids.drvB}`, tok.A)).status, 404);
        assert.equal((await api('post', `/v1/franchise/taxi/drivers/${ids.drvB}/block`, tok.A).send({ reason: 'x y z' })).status, 404);
        const ap = await api('post', `/v1/franchise/taxi/drivers/${ids.drvA}/approve`, tok.A);
        assert.equal(ap.status, 200, ap.text);
        assert.equal(ap.body.data.state, 'approved');
        assert.equal((await api('post', `/v1/franchise/taxi/drivers/${ids.drvA}/block`, tok.A).send({})).status, 400);
        const bl = await api('post', `/v1/franchise/taxi/drivers/${ids.drvA}/block`, tok.A).send({ reason: 'Rude to riders' });
        assert.equal(bl.body.data.state, 'blocked');
        const d = await col('TaxiDriver').findOne({ _id: ids.drvA });
        assert.equal(d.approve, false);
        assert.equal(d.isOnline, false);
        const blockedList = await api('get', '/v1/franchise/taxi/drivers?state=blocked', tok.A);
        assert.deepEqual(blockedList.body.data.items.map((x) => x.name), ['Driver A']);
        const ub = await api('post', `/v1/franchise/taxi/drivers/${ids.drvA}/unblock`, tok.A);
        assert.equal(ub.body.data.state, 'approved');
        assert.equal((await api('get', '/v1/franchise/taxi/drivers', tok.B)).status, 403);
    });

    it('payments: only its own orders, with the money split', async () => {
        const r = await api('get', '/v1/franchise/food/payments', tok.A);
        assert.equal(r.status, 200, r.text);
        assert.deepEqual(r.body.data.items.map((p) => p.orderId), ['FOD-A1']);
        assert.equal(r.body.data.items[0].platformEarning, 60);
        assert.equal(r.body.data.summary.totalAmount, 500);
    });

    it('every portal action is audited', async () => {
        const actions = await col('FranchiseAuditLog').distinct('action', { franchiseId: new mongoose.Types.ObjectId(ids.A) });
        for (const a of ['rider.approve', 'driver.approve', 'driver.block', 'driver.unblock']) assert.ok(actions.includes(a), `missing ${a}`);
    });
});

describe('Regression: addons, categories, delivery fee', () => {
    it('addons list accepts limit=1000 and only shows its own restaurants', async () => {
        await col('FoodAddon').insertMany([
            { restaurantId: ids.rA, isDeleted: false, approvalStatus: 'pending', draft: { name: 'Extra cheese A' }, published: { name: 'Extra cheese A' } },
            { restaurantId: ids.rB, isDeleted: false, approvalStatus: 'pending', draft: { name: 'Extra sauce B' }, published: { name: 'Extra sauce B' } },
        ]);
        const r = await api('get', '/v1/food/admin/addons?limit=1000', tok.A);
        assert.equal(r.status, 200, r.text);
        const body = JSON.stringify(r.body);
        assert.ok(body.includes('Extra cheese A'));
        assert.ok(!body.includes('Extra sauce B'));
        const zoneTrick = await api('get', `/v1/food/admin/addons?zoneId=${ids.foodB}`, tok.A);
        assert.ok(!JSON.stringify(zoneTrick.body).includes('Extra sauce B'));
    });

    it('a category the franchise creates shows up in its own list (and not in another franchise list)', async () => {
        const c = await api('post', '/v1/food/admin/categories', tok.A).send({ name: 'A Specials' });
        assert.ok([200, 201].includes(c.status), c.text);
        assert.ok(JSON.stringify((await api('get', '/v1/food/admin/categories', tok.A)).body).includes('A Specials'));
        assert.ok(!JSON.stringify((await api('get', '/v1/food/admin/categories', tok.B)).body).includes('A Specials'));
    });

    it('delivery fee: only its own zone, validated, used by pricing, reset to platform', async () => {
        const { loadDeliveryRules } = await import('../src/modules/food/orders/services/order-pricing.service.js');
        await col('FoodDeliveryCommissionRule').insertOne({ minDistance: 0, maxDistance: null, basePayout: 25, commissionPerKm: 6, userDeliveryFee: 6, status: true, zoneId: null });
        const bad = await api('put', '/v1/franchise/food/delivery-fees', tok.A).send({ slabs: [{ minDistance: 0, maxDistance: 5, basePayout: 10, commissionPerKm: 5 }, { minDistance: 4, maxDistance: null, basePayout: 0, commissionPerKm: 7 }] });
        assert.equal(bad.status, 400);
        assert.equal((await api('put', '/v1/franchise/food/delivery-fees', tok.A).send({ slabs: [{ minDistance: 0, basePayout: -1, commissionPerKm: 5 }] })).status, 400);
        const ok = await api('put', '/v1/franchise/food/delivery-fees', tok.A).send({ slabs: [{ minDistance: 0, maxDistance: 5, basePayout: 10, commissionPerKm: 5 }, { minDistance: 5, maxDistance: null, basePayout: 0, commissionPerKm: 7 }] });
        assert.equal(ok.status, 200, ok.text);
        assert.equal(ok.body.data.usingZoneFees, true);
        const zoneA = await loadDeliveryRules(ids.foodA);
        assert.equal(zoneA.source, 'zone');
        assert.equal(zoneA.rules.length, 2);
        assert.equal((await loadDeliveryRules(ids.foodB)).source, 'platform');
        // franchise B never sees or changes zone A fees; admin global list is unaffected
        const b = await api('get', '/v1/franchise/food/delivery-fees', tok.B);
        assert.equal(b.body.data.usingZoneFees, false);
        const adminList = await api('get', '/v1/food/admin/delivery/commission-rules', tok.platform);
        assert.equal(adminList.status, 200, adminList.text);
        assert.equal(JSON.stringify(adminList.body).includes('"basePayout":10'), false);
        const reset = await api('delete', '/v1/franchise/food/delivery-fees', tok.A);
        assert.equal(reset.body.data.usingZoneFees, false);
        assert.equal((await loadDeliveryRules(ids.foodA)).source, 'platform');
    });
});
