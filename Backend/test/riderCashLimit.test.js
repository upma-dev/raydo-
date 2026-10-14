/**
 * COD cash limit: a rider can never hold more COD cash than the admin's limit.
 * Reference COD order = ₹490. Admin limit = ₹1000.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
let replSet; let mongoose; const S = {};
const oid = () => new mongoose.Types.ObjectId();

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    S.cash = await import('../src/modules/food/delivery/services/riderCash.service.js');
    S.admin = await import('../src/modules/food/admin/services/admin.service.js');
    S.delivery = await import('../src/modules/food/orders/services/order-delivery.service.js');
    S.payment = await import('../src/modules/food/orders/services/order-payment.service.js');
    S.FoodOrder = (await import('../src/modules/food/orders/models/order.model.js')).FoodOrder;
    S.FoodTransaction = (await import('../src/modules/food/orders/models/foodTransaction.model.js')).FoodTransaction;
    S.ftx = await import('../src/modules/food/orders/services/foodTransaction.service.js');
    S.Deposit = (await import('../src/modules/food/delivery/models/foodDeliveryCashDeposit.model.js')).FoodDeliveryCashDeposit;
    S.Partner = (await import('../src/modules/food/delivery/models/deliveryPartner.model.js')).FoodDeliveryPartner;
    S.Limit = (await import('../src/modules/food/admin/models/deliveryCashLimit.model.js')).FoodDeliveryCashLimit;
});
after(async () => { await mongoose?.disconnect(); await replSet?.stop(); });

const setLimit = async (n) => { await S.Limit.deleteMany({}); await S.Limit.create({ deliveryCashLimit: n, isActive: true }); };

async function order({ riderId, method = 'cash', status = 'preparing', payStatus } = {}) {
    const doc = await S.FoodOrder.create({
        userId: oid(), restaurantId: oid(),
        items: [{ itemId: 'i1', name: 'Pizza', price: 200, quantity: 2 }],
        deliveryAddress: { street: 's', city: 'c', state: 'st', location: { type: 'Point', coordinates: [77.2, 28.6] } },
        pricing: { subtotal: 400, tax: 20, packagingFee: 20, deliveryFee: 40, platformFee: 10, restaurantCommission: 40, total: 490 },
        payment: { method, status: payStatus || (method === 'cash' ? 'cod_pending' : 'paid') },
        orderStatus: status,
        ...(riderId ? { dispatch: { deliveryPartnerId: riderId, status: 'assigned' } } : {}),
    });
    await S.ftx.createInitialTransaction(doc);
    return doc;
}
const pos = (riderId) => S.cash.getRiderCashPosition(riderId);

describe('cash in hand', () => {
    it('= delivered COD - deposits; COD still on the way is counted separately; online orders never count', async () => {
        const r = oid();
        await order({ riderId: r, status: 'delivered' });
        await order({ riderId: r, status: 'delivered' });
        await order({ riderId: r, status: 'delivered', method: 'razorpay' });          // online: no cash
        await order({ riderId: r, status: 'picked_up' });                                // on the way
        await order({ riderId: r, status: 'cancelled_by_user' });                        // cancelled: nothing
        await S.Deposit.create({ deliveryPartnerId: r, amount: 300, status: 'Completed' });
        await S.Deposit.create({ deliveryPartnerId: r, amount: 999, status: 'Pending' });   // not completed: ignored
        const p = await pos(r);
        assert.equal(p.cashCollected, 980);
        assert.equal(p.deposited, 300);
        assert.equal(p.cashInHand, 680);
        assert.equal(p.activeCod, 490);
    });
});

describe('limit ₹1000 on COD orders', () => {
    before(() => setLimit(1000));

    it('two COD orders fit (980), the third is refused even though nothing is delivered yet', async () => {
        const r = oid();
        const o1 = await order({ riderId: r });
        const o2 = await order({ riderId: r });
        const o3 = await order({ riderId: null });
        await S.cash.assertRiderCanTakeCod(r, o1);                       // 490 (itself excluded) fine
        await S.cash.assertRiderCanTakeCod(r, o2);                       // 490 + other 490 = 980 fine
        await assert.rejects(S.cash.assertRiderCanTakeCod(r, o3), /Cash limit reached/);   // 980 + 490 = 1470
        await assert.rejects(S.delivery.acceptOrderDelivery(o3._id, r), /Cash limit reached/);
        assert.equal((await S.FoodOrder.findById(o3._id).lean()).dispatch.deliveryPartnerId ?? null, null);   // nothing assigned
    });

    it('holding delivered cash blocks new COD; depositing frees room again', async () => {
        const r = oid();
        await order({ riderId: r, status: 'delivered' });
        await order({ riderId: r, status: 'delivered' });                   // 980 in hand
        const next = await order({ riderId: null });
        await assert.rejects(S.cash.assertRiderCanTakeCod(r, next), /Cash limit reached/);
        await S.Deposit.create({ deliveryPartnerId: r, amount: 600, status: 'Completed' });   // 380 in hand
        await S.cash.assertRiderCanTakeCod(r, next);                         // 380 + 490 = 870 fine
    });

    it('online (prepaid) orders are never blocked by the cash limit', async () => {
        const r = oid();
        await order({ riderId: r, status: 'delivered' });
        await order({ riderId: r, status: 'delivered' });
        await S.cash.assertRiderCanTakeCod(r, await order({ riderId: null, method: 'razorpay' }));
        await S.cash.assertRiderCanTakeCod(r, await order({ riderId: null, method: 'wallet' }));
    });

    it('limit 0 means no limit', async () => {
        await setLimit(0);
        const r = oid();
        for (let i = 0; i < 4; i += 1) await order({ riderId: r, status: 'delivered' });
        await S.cash.assertRiderCanTakeCod(r, await order({ riderId: null }));
        await setLimit(1000);
    });
});

describe('dispatch only offers a COD order to riders who can still carry the cash', () => {
    it('rider A (980 in hand) and rider B (490 on the way) are skipped; rider C (clean) and D (380 after deposit) get the offer; online orders go to everyone', async () => {
        await setLimit(1000);
        const { filterPartnersByCodCashLimit } = await import('../src/modules/food/orders/services/order-dispatch.service.js');
        const A = oid(); const B = oid(); const C = oid(); const D = oid();
        await order({ riderId: A, status: 'delivered' }); await order({ riderId: A, status: 'delivered' });
        await order({ riderId: B, status: 'picked_up' }); await order({ riderId: B, status: 'picked_up' });
        await order({ riderId: D, status: 'delivered' }); await order({ riderId: D, status: 'delivered' });
        await S.Deposit.create({ deliveryPartnerId: D, amount: 600, status: 'Completed' });
        const partners = [A, B, C, D].map((id) => ({ partnerId: id }));

        const cod = await order({ riderId: null });
        const got = (await filterPartnersByCodCashLimit(partners, cod)).map((p) => String(p.partnerId));
        assert.deepEqual(got.sort(), [String(C), String(D)].sort());

        const online = await order({ riderId: null, method: 'razorpay' });
        assert.equal((await filterPartnersByCodCashLimit(partners, online)).length, 4);
    });
});

describe('rider switches a QR order to cash', () => {
    before(() => setLimit(1000));

    it('allowed under the limit: the ORDER becomes cash (so it is counted), QR info cleared', async () => {
        const r = oid();
        const o = await order({ riderId: r, method: 'razorpay_qr', status: 'reached_drop', payStatus: 'pending_qr' });
        await S.payment.switchToCash(o._id, r);
        const d = await S.FoodOrder.findById(o._id).lean();
        assert.equal(d.payment.method, 'cash');
        assert.equal(d.payment.status, 'cod_pending');
        // once delivered it is real cash in hand
        await S.FoodOrder.updateOne({ _id: o._id }, { $set: { orderStatus: 'delivered' } });
        assert.equal((await pos(r)).cashInHand, 490);
    });

    it('refused when it would break the limit - the order stays a QR order', async () => {
        const r = oid();
        await order({ riderId: r, status: 'delivered' });
        await order({ riderId: r, status: 'delivered' });                   // 980 in hand
        const o = await order({ riderId: r, method: 'razorpay_qr', status: 'reached_drop', payStatus: 'pending_qr' });
        await assert.rejects(S.payment.switchToCash(o._id, r), /Cash limit reached/);
        assert.equal((await S.FoodOrder.findById(o._id).lean()).payment.method, 'razorpay_qr');
    });

    it('an order the customer already paid online can never be turned into cash', async () => {
        const r = oid();
        const o = await order({ riderId: r, method: 'razorpay_qr', status: 'reached_drop', payStatus: 'paid' });
        await assert.rejects(S.payment.switchToCash(o._id, r), /already paid online/);
        assert.equal((await S.FoodOrder.findById(o._id).lean()).payment.method, 'razorpay_qr');
    });

    it('a rider cannot switch somebody else\'s order', async () => {
        const o = await order({ riderId: oid(), method: 'razorpay_qr', status: 'reached_drop', payStatus: 'pending_qr' });
        await assert.rejects(S.payment.switchToCash(o._id, oid()), /Not your order/);
    });
});

describe('admin and rider screens show the same numbers', () => {
    it('admin delivery-wallet list: cash collected and remaining limit come from the real orders', async () => {
        await setLimit(1000);
        const p = await S.Partner.create({ name: 'Ravi', phone: '9000000077', status: 'approved' }).catch(async () => (await S.Partner.collection.insertOne({ name: 'Ravi', phone: '9000000077', status: 'approved' })));
        const id = p._id || p.insertedId;
        await order({ riderId: id, status: 'delivered' });
        await S.Deposit.create({ deliveryPartnerId: id, amount: 100, status: 'Completed' });
        const res = await S.admin.getDeliveryWallets({ limit: 50 });
        const row = res.wallets.find((w) => String(w.deliveryId) === String(id));
        assert.ok(row, 'rider row present');
        assert.equal(row.cashCollected, 390);
        assert.equal(row.remainingCashLimit, 610);
    });
});
