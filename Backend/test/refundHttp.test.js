/**
 * Refund buttons over HTTP (auth + routing) and the Razorpay refund webhook, on an in-memory MongoDB replica set.
 * Same reference order as refundFlow.test.js: customer pays 490, restaurant 380, rider 40.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'crypto';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.RATE_LIMIT_MAX = '100000';

let replSet; let mongoose; let request; let app; let sign;
const S = {};
const tok = {};
const oid = () => new mongoose.Types.ObjectId();
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
    ({ signAccessToken: sign } = await import('../src/core/auth/token.util.js'));
    S.ftx = await import('../src/modules/food/orders/services/foodTransaction.service.js');
    S.pay = await import('../src/core/payments/transaction.service.js');
    S.FoodOrder = (await import('../src/modules/food/orders/models/order.model.js')).FoodOrder;
    S.UserWallet = (await import('../src/modules/food/user/models/userWallet.model.js')).FoodUserWallet;
    S.Restaurant = (await import('../src/modules/food/restaurant/models/restaurant.model.js')).FoodRestaurant;
    S.Partner = (await import('../src/modules/food/delivery/models/deliveryPartner.model.js')).FoodDeliveryPartner;
    const { FoodAdmin } = await import('../src/core/admin/admin.model.js');
    S.FoodAdmin = FoodAdmin;
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));
    const admin = await FoodAdmin.create({
        email: 'owner@test.local', password: 'Passw0rd!x', name: 'Owner', adminLevel: 'platform_superadmin',
        admin_type: 'superadmin', permissions: ['*'], servicesAccess: ['food', 'taxi'],
    });
    tok.admin = sign({ userId: String(admin._id), role: 'ADMIN' });
});

after(async () => {
    await mongoose?.disconnect();
    await replSet?.stop();
});

async function makeOrder({ method = 'wallet', status = 'created', restaurantId = oid(), riderId = oid(), userId = oid(), franchiseId = null } = {}) {
    const doc = await S.FoodOrder.create({
        userId, restaurantId, franchiseId: franchiseId || undefined,
        items: [{ itemId: 'i1', name: 'Pizza', price: 200, quantity: 2 }],
        deliveryAddress: { street: 's', city: 'c', state: 'st', location: { type: 'Point', coordinates: [77.2, 28.6] } },
        pricing: { subtotal: 400, tax: 20, packagingFee: 20, deliveryFee: 40, platformFee: 10, restaurantCommission: 40, total: 490 },
        payment: { method, status: 'paid', ...(method === 'razorpay' ? { razorpay: { paymentId: 'pay_HTTP1', orderId: 'order_H' } } : {}) },
        orderStatus: status, riderTotalPayout: 40, riderEarning: 40,
        dispatch: { deliveryPartnerId: riderId, status: 'assigned' },
    });
    await S.ftx.createInitialTransaction(doc);
    await S.ftx.updateTransactionStatus(doc._id, 'captured', { status: 'captured' });
    return { id: doc._id, userId, restaurantId, riderId };
}
const userBal = async (id) => Number((await S.UserWallet.findOne({ userId: id }).lean())?.balance || 0);
const bal = async (type, id) => (await S.pay.getBalance(type, String(id))).balance;

describe('refund endpoints need the right login', () => {
    it('no token -> 401 on restaurant, delivery and admin endpoints', async () => {
        const id = String(oid());
        for (const url of [`/v1/food/restaurant/orders/${id}/refund-request`, `/v1/food/delivery/orders/${id}/refund-request`, `/v1/food/admin/orders/${id}/refund-request/decision`]) {
            const r = await api('post', url).send({ reason: 'x' });
            assert.equal(r.status, 401, url);
        }
    });

    it('a customer token cannot use the restaurant / delivery / admin buttons', async () => {
        const user = sign({ userId: String(oid()), role: 'USER' });
        const id = String(oid());
        for (const url of [`/v1/food/restaurant/orders/${id}/refund-request`, `/v1/food/delivery/orders/${id}/refund-request`, `/v1/food/admin/orders/${id}/refund-request/decision`]) {
            const r = await api('post', url, user).send({ reason: 'free money' });
            assert.ok([401, 403].includes(r.status), `${url} -> ${r.status}`);
        }
    });

    it('delivery partner token: a stranger rider cannot raise a request on another rider\'s order', async () => {
        const o = await makeOrder({ status: 'reached_drop' });
        const stranger = sign({ userId: String(oid()), role: 'DELIVERY_PARTNER' });
        const r = await api('post', `/v1/food/delivery/orders/${o.id}/refund-request`, stranger).send({ reason: 'Customer refused' });
        assert.ok([403, 404].includes(r.status), `got ${r.status} ${r.text}`);
        assert.equal((await S.FoodOrder.findById(o.id).lean()).refundRequest.status, 'none');
    });
});

describe('full chain over HTTP', () => {
    it('rider asks -> admin approves over HTTP -> money lands exactly', async () => {
        const o = await makeOrder({ status: 'picked_up' });
        const rider = sign({ userId: String(o.riderId), role: 'DELIVERY_PARTNER' });
        const ask = await api('post', `/v1/food/delivery/orders/${o.id}/refund-request`, rider).send({ reason: 'Customer not answering' });
        if (ask.status !== 200) {
            // The rider route may also require the partner profile to exist; report that clearly
            assert.fail(`rider request failed: ${ask.status} ${ask.text}`);
        }
        assert.equal(ask.body.data.mode, 'requested');

        const decide = await api('post', `/v1/food/admin/orders/${o.id}/refund-request/decision`, tok.admin).send({ approve: true, note: 'ok' });
        assert.equal(decide.status, 200, decide.text);
        assert.equal(await userBal(o.userId), 490);
        assert.equal(await bal('deliveryBoy', o.riderId), 40);
        assert.equal(await bal('restaurant', o.restaurantId), 0);
    });

    it('restaurant clicks refund on a new order -> cancelled + customer refunded automatically over HTTP', async () => {
        const o = await makeOrder({ status: 'created' });
        const rest = sign({ userId: String(o.restaurantId), role: 'RESTAURANT' });
        const r = await api('post', `/v1/food/restaurant/orders/${o.id}/refund-request`, rest).send({ reason: 'Ran out of stock' });
        assert.equal(r.status, 200, r.text);
        assert.equal(r.body.data.mode, 'cancelled_and_refunded');
        assert.equal(await userBal(o.userId), 490);
        assert.equal(await bal('restaurant', o.restaurantId), 0);
    });

    it('admin refund endpoint on a delivered wallet order: 200, then a second try is refused', async () => {
        const o = await makeOrder({ status: 'delivered' });
        const r = await api('post', `/v1/food/admin/orders/${o.id}/refund`, tok.admin).send({ refundAmount: 490 });
        assert.equal(r.status, 200, r.text);
        assert.equal(await userBal(o.userId), 490);
        const again = await api('post', `/v1/food/admin/orders/${o.id}/refund`, tok.admin).send({});
        assert.equal(again.status, 400, again.text);
        assert.equal(await userBal(o.userId), 490);                // no second payout
    });
});

describe('a franchise login can never move customer money on its own', () => {
    it('refund / refund-via-api / request decision -> 403; recording a manual refund works for ITS order only', async () => {
        const mkFranchise = async () => (await mongoose.connection.collection('franchiseapplications').insertOne({
            status: 'approved', selectedModules: ['food'], walletBalancePaise: 0, walletBalance: 0, franchiseFeeStatus: 'paid',
            accountStatus: 'active', refundRequests: [], payoutRequests: [],
            city: 'c', state: 's', phone: '9999999999', email: `f${Date.now()}@test.local`, applicantName: 'Fran',
        })).insertedId;
        const fA = await mkFranchise(); const fB = await mkFranchise();
        const mkAdmin = async (email, franchiseId) => S.FoodAdmin.create({
            email, password: 'Passw0rd!x', name: email, role: 'franchise', adminLevel: 'franchise_admin', admin_type: 'franchise',
            module: 'food', permissions: ['*'], franchiseId, servicesAccess: ['food'], active: true, isActive: true, status: 'active',
        });
        const tA = sign({ userId: String((await mkAdmin('fa@t.local', fA))._id), role: 'ADMIN' });
        const mine = await makeOrder({ method: 'razorpay', status: 'delivered', franchiseId: fA });
        const other = await makeOrder({ method: 'razorpay', status: 'delivered', franchiseId: fB });

        for (const url of [`/v1/food/admin/orders/${mine.id}/refund`, `/v1/food/admin/orders/${mine.id}/refund/via-api`, `/v1/food/admin/orders/${mine.id}/refund-request/decision`]) {
            const r = await api('post', url, tA).send({ approve: true });
            assert.equal(r.status, 403, `${url} -> ${r.status} ${r.text}`);
        }
        assert.equal(await userBal(mine.userId), 0);

        // super admin parks the refund (manual mode is the default), then the franchise records its own manual payout
        const park = await api('post', `/v1/food/admin/orders/${mine.id}/refund`, tok.admin).send({});
        assert.equal(park.status, 200, park.text);
        const parkOther = await api('post', `/v1/food/admin/orders/${other.id}/refund`, tok.admin).send({});
        assert.equal(parkOther.status, 200, parkOther.text);

        const bad = await api('post', `/v1/food/admin/orders/${other.id}/refund/manual-done`, tA).send({ referenceId: 'UTR-OTHER-1' });
        assert.ok([403, 404].includes(bad.status), `other franchise order -> ${bad.status}`);
        assert.equal((await S.FoodOrder.findById(other.id).lean()).payment.refund.status, 'manual_pending');
        const ok = await api('post', `/v1/food/admin/orders/${mine.id}/refund/manual-done`, tA).send({ referenceId: 'UTR-MINE-1' });
        assert.equal(ok.status, 200, ok.text);
        const d = await S.FoodOrder.findById(mine.id).lean();
        assert.equal(d.payment.refund.paidBy, 'franchise');
        assert.equal(d.payment.status, 'refunded');
    });
});

describe('Razorpay refund.processed webhook', () => {
    async function fire(paymentId, refundId, rupees) {
        const { handleRazorpayWebhook } = await import('../src/core/payments/controllers/razorpayWebhook.controller.js');
        const { config } = await import('../src/config/env.js');
        config.razorpayWebhookSecret = config.razorpayWebhookSecret || 'whsec_test';
        const body = { event: 'refund.processed', payload: { refund: { entity: { id: refundId, payment_id: paymentId, amount: Math.round(rupees * 100) } } } };
        const raw = Buffer.from(JSON.stringify(body));
        const sig = crypto.createHmac('sha256', config.razorpayWebhookSecret).update(raw).digest('hex');
        const res = { code: 0, status(c) { this.code = c; return this; }, json() { return this; }, send() { return this; } };
        await handleRazorpayWebhook({ headers: { 'x-razorpay-signature': sig }, rawBody: raw, body }, res);
        return res.code;
    }

    it('partial refund from the Razorpay dashboard: order stays "paid", cumulative amount kept; same event twice changes nothing; the rest marks it refunded', async () => {
        const o = await makeOrder({ method: 'razorpay', status: 'created' });
        await S.FoodOrder.updateOne({ _id: o.id }, { $set: { 'payment.razorpay.paymentId': 'pay_WH1' } });
        assert.equal(await fire('pay_WH1', 'rfnd_W1', 100), 200);
        let d = await S.FoodOrder.findOne({ _id: o.id }).lean();
        assert.equal(d.payment.status, 'paid');
        assert.equal(d.payment.refund.refundedTotal, 100);

        await fire('pay_WH1', 'rfnd_W1', 100);                    // duplicate delivery of the same event
        d = await S.FoodOrder.findOne({ _id: o.id }).lean();
        assert.equal(d.payment.refund.refundedTotal, 100);

        await fire('pay_WH1', 'rfnd_W2', 390);
        d = await S.FoodOrder.findOne({ _id: o.id }).lean();
        assert.equal(d.payment.refund.refundedTotal, 490);
        assert.equal(d.payment.status, 'refunded');
    });
});

describe('Razorpay refund.failed webhook', () => {
    it('a refund Razorpay later rejects is re-opened (not silently "refunded"), amounts rolled back, ready to retry', async () => {
        const { handleRazorpayWebhook } = await import('../src/core/payments/controllers/razorpayWebhook.controller.js');
        const { config } = await import('../src/config/env.js');
        config.razorpayWebhookSecret = config.razorpayWebhookSecret || 'whsec_test';
        const o = await makeOrder({ method: 'razorpay', status: 'created' });
        await S.FoodOrder.updateOne({ _id: o.id }, { $set: {
            'payment.razorpay.paymentId': 'pay_FAIL1', 'payment.status': 'refunded',
            'payment.refund': { status: 'processed', amount: 490, refundedTotal: 490, refundId: 'rfnd_F1', processedAt: new Date() },
        } });
        const body = { event: 'refund.failed', payload: { refund: { entity: { id: 'rfnd_F1', payment_id: 'pay_FAIL1', amount: 49000 } } } };
        const raw = Buffer.from(JSON.stringify(body));
        const sig = crypto.createHmac('sha256', config.razorpayWebhookSecret).update(raw).digest('hex');
        const res = { code: 0, status(c) { this.code = c; return this; }, json() { return this; }, send() { return this; } };
        await handleRazorpayWebhook({ headers: { 'x-razorpay-signature': sig }, rawBody: raw, body }, res);
        assert.equal(res.code, 200);
        const d = await S.FoodOrder.findById(o.id).lean();
        assert.equal(d.payment.status, 'paid');
        assert.equal(d.payment.refund.status, 'failed');
        assert.equal(d.payment.refund.refundedTotal, 0);
    });
});
