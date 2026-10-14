/**
 * Refund / cancel money flow: real services against an in-memory MongoDB replica set.
 *
 * One reference order is used everywhere so every rupee can be checked by hand:
 *   subtotal 400 + packaging 20 + tax 20 + delivery fee 40 + platform fee 10 = customer pays 490
 *   restaurant commission 40  -> restaurant gets 400 + 20 - 40 = 380
 *   rider payout 40
 *   platform net profit = platform fee 10 + commission 40 = 50
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID || 'rzp_test_dummy';
process.env.RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET || 'dummy_secret';

let replSet;
let mongoose;
const S = {};     // services + models

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());

    S.cancel = await import('../src/modules/food/orders/services/order-cancel.service.js');
    S.ftx = await import('../src/modules/food/orders/services/foodTransaction.service.js');
    S.admin = await import('../src/modules/food/admin/services/admin.service.js');
    S.ledger = await import('../src/modules/food/admin/services/franchiseLedger.service.js');
    S.franchise = await import('../src/modules/food/admin/services/franchise.service.js');
    S.partner = await import('../src/modules/food/franchise/services/franchise.public.service.js');
    S.pay = await import('../src/core/payments/transaction.service.js');
    S.FoodOrder = (await import('../src/modules/food/orders/models/order.model.js')).FoodOrder;
    S.FoodSettings = (await import('../src/modules/food/orders/models/order.model.js')).FoodSettings;
    S.FoodTransaction = (await import('../src/modules/food/orders/models/foodTransaction.model.js')).FoodTransaction;
    S.Txn = (await import('../src/core/payments/models/transaction.model.js')).Transaction;
    S.App = (await import('../src/modules/food/admin/models/franchiseApplication.model.js')).default;
    S.Ledger = (await import('../src/modules/food/admin/models/franchiseLedger.model.js')).default;
    S.UserWallet = (await import('../src/modules/food/user/models/userWallet.model.js')).FoodUserWallet;
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));
});

after(async () => {
    await mongoose?.disconnect();
    await replSet?.stop();
});

const oid = () => new mongoose.Types.ObjectId();
const bal = async (type, id) => (await S.pay.getBalance(type, String(id))).balance;
const userBal = async (id) => Number((await S.UserWallet.findOne({ userId: id }).lean())?.balance || 0);
const ord = (id) => S.FoodOrder.findById(id).lean();
const tx = (id) => S.FoodTransaction.findOne({ orderId: id }).lean();

async function setRefundMode(refundMode, extra = {}) {
    await S.cancel.updateOrderCancellationRules({ refundMode, ...extra });
}

/** Create the reference order (+ its finance record). `captured` posts the restaurant / rider wallet credits like a paid order does. */
async function makeOrder({ method = 'wallet', status = 'created', franchiseId = null, withRider = true, captured = true, paid = true, restaurantId = oid(), riderId = oid(), userId = oid() } = {}) {
    const doc = await S.FoodOrder.create({
        userId, restaurantId, franchiseId: franchiseId || undefined,
        items: [{ itemId: 'i1', name: 'Pizza', price: 200, quantity: 2 }],
        deliveryAddress: { street: 's', city: 'c', state: 'st', location: { type: 'Point', coordinates: [77.2, 28.6] } },
        pricing: { subtotal: 400, tax: 20, packagingFee: 20, deliveryFee: 40, platformFee: 10, restaurantCommission: 40, total: 490 },
        payment: { method, status: paid ? 'paid' : 'cod_pending', ...(method.startsWith('razorpay') ? { razorpay: { paymentId: 'pay_TEST123', orderId: 'order_X' } } : {}) },
        orderStatus: status,
        riderTotalPayout: 40, riderEarning: 40,
        ...(withRider ? { dispatch: { deliveryPartnerId: riderId, status: 'assigned' } } : {}),
    });
    await S.ftx.createInitialTransaction(doc);
    if (captured) await S.ftx.updateTransactionStatus(doc._id, 'captured', { status: 'captured' });
    return { id: doc._id, userId, restaurantId, riderId };
}

describe('reference order maths', () => {
    it('finance record splits 490 exactly: restaurant 380, rider 40, platform 50', async () => {
        const o = await makeOrder();
        const t = await tx(o.id);
        assert.equal(t.amounts.totalCustomerPaid, 490);
        assert.equal(t.amounts.restaurantShare, 380);
        assert.equal(t.amounts.riderTotalPayout, 40);
        assert.equal(t.amounts.platformNetProfit, 50);
        assert.equal(await bal('restaurant', o.restaurantId), 380);
        assert.equal(await bal('deliveryBoy', o.riderId), 40);
    });
});

describe('cancel before delivery (automatic)', () => {
    it('restaurant rejects a wallet-paid new order: customer gets 490 back, restaurant + rider wallets back to 0, no penalty', async () => {
        await setRefundMode('manual', { restaurantCancelPenalty: 25 });
        const o = await makeOrder({ status: 'created' });
        const r = await S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'Out of stock');
        assert.equal(r.refund.status, 'processed');
        assert.equal(await userBal(o.userId), 490);
        assert.equal(await bal('restaurant', o.restaurantId), 0);       // before accept -> no penalty
        assert.equal(await bal('deliveryBoy', o.riderId), 0);
        const d = await ord(o.id);
        assert.equal(d.payment.status, 'refunded');
        assert.equal(d.payment.refund.refundedTotal, 490);
        assert.equal((await tx(o.id)).status, 'refunded');
    });

    it('restaurant cancels AFTER accepting: 380 reversed and the admin penalty (25) is charged once', async () => {
        await setRefundMode('manual', { restaurantCancelPenalty: 25 });
        const o = await makeOrder({ status: 'preparing' });
        await S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'Kitchen closed');
        assert.equal(await bal('restaurant', o.restaurantId), -25);
        assert.equal(await userBal(o.userId), 490);
        // a second penalty for the same order must never be posted
        await S.ftx.chargeRestaurantCancelPenalty(o.id, o.restaurantId, 25);
        assert.equal(await bal('restaurant', o.restaurantId), -25);
        await setRefundMode('manual', { restaurantCancelPenalty: 0 });
    });

    it('cancel twice is harmless (customer refunded once)', async () => {
        const o = await makeOrder({ status: 'created' });
        await S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'x');
        await assert.rejects(S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'x'), /already|moved/i);
        assert.equal(await userBal(o.userId), 490);
    });

    it('admin cancels AFTER pickup: customer refunded in full, restaurant 380 reversed, rider KEEPS 40', async () => {
        const o = await makeOrder({ status: 'picked_up' });
        await S.cancel.cancelOrderByAdmin(o.id, oid(), 'Customer unreachable');
        assert.equal(await userBal(o.userId), 490);
        assert.equal(await bal('restaurant', o.restaurantId), 0);
        assert.equal(await bal('deliveryBoy', o.riderId), 40);
    });

    it('admin cancels after pickup but the rider was never credited yet: rider is paid 40 once', async () => {
        const o = await makeOrder({ status: 'picked_up', withRider: false, captured: false });
        await S.FoodOrder.updateOne({ _id: o.id }, { $set: { 'dispatch.deliveryPartnerId': o.riderId } });
        await S.cancel.cancelOrderByAdmin(o.id, oid(), 'Accident');
        assert.equal(await bal('deliveryBoy', o.riderId), 40);
        await S.ftx.creditRiderForCancelledOrder(o.id);
        assert.equal(await bal('deliveryBoy', o.riderId), 40);
    });

    it('admin cancels BEFORE pickup: rider payout reversed to 0', async () => {
        const o = await makeOrder({ status: 'confirmed' });
        await S.cancel.cancelOrderByAdmin(o.id, oid(), 'Duplicate');
        assert.equal(await bal('deliveryBoy', o.riderId), 0);
    });

    it('COD order cancelled before delivery: nothing to refund, no wallet money invented', async () => {
        const o = await makeOrder({ method: 'cash', status: 'created', paid: false, captured: false });
        const r = await S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'x');
        assert.equal(r.refund.status, 'not_required');
        assert.equal(await userBal(o.userId), 0);
    });
});

describe('Razorpay orders', () => {
    it('manual mode parks the refund; manual-done closes it (490 total, books settled)', async () => {
        await setRefundMode('manual');
        const o = await makeOrder({ method: 'razorpay', status: 'created' });
        const r = await S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'x');
        assert.equal(r.refund.status, 'manual_pending');
        let d = await ord(o.id);
        assert.equal(d.payment.status, 'paid');                    // not refunded yet: no money moved
        assert.equal(d.payment.refund.status, 'manual_pending');
        assert.equal(await bal('restaurant', o.restaurantId), 0);   // but the restaurant wallet is already clean

        await assert.rejects(S.cancel.markRefundDoneManually(o.id, { referenceId: 'ab' }, null), /4-120/);
        const done = await S.cancel.markRefundDoneManually(o.id, { referenceId: 'UTR-AAA111' }, oid());
        assert.equal(done.refundedTotal, 490);
        d = await ord(o.id);
        assert.equal(d.payment.status, 'refunded');
        assert.equal(d.payment.refund.status, 'processed');
        assert.equal(d.payment.refund.refundId, 'UTR-AAA111');
        await assert.rejects(S.cancel.markRefundDoneManually(o.id, { referenceId: 'UTR-AAA111' }, oid()), /already refunded/);
    });

    it('the same refund reference cannot be used on a second order', async () => {
        const o = await makeOrder({ method: 'razorpay', status: 'created' });
        await S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'x');
        await assert.rejects(S.cancel.markRefundDoneManually(o.id, { referenceId: 'UTR-AAA111' }, oid()), /another order/);
        await S.cancel.markRefundDoneManually(o.id, { referenceId: 'UTR-BBB222' }, oid());
    });

    it('a made-up rfnd_ id is rejected when Razorpay can be asked (never trusted blindly)', async () => {
        const { isRazorpayConfigured } = await import('../src/modules/food/orders/helpers/razorpay.helper.js');
        const o = await makeOrder({ method: 'razorpay', status: 'created' });
        await S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'x');
        if (!isRazorpayConfigured()) return;                                                  // nothing to ask: accepted as typed
        await assert.rejects(S.cancel.markRefundDoneManually(o.id, { referenceId: 'rfnd_FAKE000000001' }, oid()), /Razorpay does not know/);
        assert.equal((await ord(o.id)).payment.refund.status, 'manual_pending');            // still waiting, nothing marked refunded
    });

    it('auto mode with Razorpay unreachable -> failed (customer is told the team will refund), then manual-done fixes it', async () => {
        await setRefundMode('auto');
        const o = await makeOrder({ method: 'razorpay', status: 'created' });
        const r = await S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'x');
        assert.equal(r.refund.status, 'failed');
        assert.equal((await ord(o.id)).payment.refund.status, 'failed');
        await S.cancel.markRefundDoneManually(o.id, { referenceId: 'bank-utr-998877' }, oid());
        assert.equal((await ord(o.id)).payment.status, 'refunded');
        await setRefundMode('manual');
    });
});

describe('Razorpay auto refund (Razorpay API stubbed, so no real money moves)', () => {
    let proto; let original; let calls;
    before(async () => {
        const Rz = (await import('razorpay')).default;
        // The SDK builds its resources per instance, so the one shared piece to stub is its HTTP layer
        proto = Object.getPrototypeOf(new Rz({ key_id: 'a', key_secret: 'b' }).api);
        original = proto.post;
        calls = [];
        proto.post = async ({ url, data }) => {
            const m = /\/payments\/([^/]+)\/refund$/.exec(url);
            assert.ok(m, `unexpected Razorpay call ${url}`);
            calls.push({ paymentId: m[1], body: data });
            return { id: `rfnd_STUB${calls.length}`, status: 'processed' };
        };
        await setRefundMode('auto');
    });
    after(async () => { proto.post = original; await setRefundMode('manual'); });

    it('cancel -> Razorpay is called with the right payment id and exact paise (490 -> 49000), order becomes refunded', async () => {
        calls.length = 0;
        const o = await makeOrder({ method: 'razorpay', status: 'created' });
        const r = await S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'x');
        assert.equal(r.refund.status, 'processed');
        assert.equal(calls.length, 1);
        assert.equal(calls[0].paymentId, 'pay_TEST123');
        assert.equal(calls[0].body.amount, 49000);
        const d = await ord(o.id);
        assert.equal(d.payment.status, 'refunded');
        assert.equal(d.payment.refund.refundId, 'rfnd_STUB1');
        assert.equal(await bal('restaurant', o.restaurantId), 0);
    });

    it('two partial refunds (100 + 390) -> two Razorpay calls (10000 + 39000 paise), total 490, a third is refused without calling Razorpay', async () => {
        calls.length = 0;
        const o = await makeOrder({ method: 'razorpay', status: 'delivered' });
        await S.admin.processRefund(o.id, 100);
        assert.equal((await ord(o.id)).payment.status, 'paid');
        await S.admin.processRefund(o.id, 390);
        assert.deepEqual(calls.map((c) => c.body.amount), [10000, 39000]);
        const d = await ord(o.id);
        assert.equal(d.payment.refund.refundedTotal, 490);
        assert.equal(d.payment.status, 'refunded');
        await assert.rejects(S.admin.processRefund(o.id, 1), /already been refunded/);
        assert.equal(calls.length, 2);
    });

    it('Razorpay rejects the refund -> failed, nothing marked refunded; retry via API works once Razorpay is fine', async () => {
        const good = proto.post;
        proto.post = async () => { throw new Error('Insufficient balance in Razorpay account'); };
        const o = await makeOrder({ method: 'razorpay', status: 'created' });
        const r = await S.cancel.cancelOrderByRestaurant(o.id, o.restaurantId, 'x');
        assert.equal(r.refund.status, 'failed');
        let d = await ord(o.id);
        assert.equal(d.payment.status, 'paid');
        assert.equal(d.payment.refund.refundedTotal || 0, 0);
        proto.post = good;
        const again = await S.cancel.refundViaApiNow(o.id);
        assert.equal(again.status, 'processed');
        d = await ord(o.id);
        assert.equal(d.payment.status, 'refunded');
        assert.equal(d.payment.refund.refundedTotal, 490);
    });
});

describe('delivered order refunds (admin) - restaurant / rider / franchise maths', () => {
    let F;
    before(async () => {
        await setRefundMode('manual');
        F = (await S.App.collection.insertOne({
            status: 'approved', selectedModules: ['food'], walletBalancePaise: 0, walletBalance: 0, franchiseFeeStatus: 'paid',
            accountStatus: 'active', refundRequests: [], payoutRequests: [],
            city: 'c', state: 's', phone: '9999999999', email: 'f@test.local', applicantName: 'Fran',
        })).insertedId;
    });
    const franchiseNet = async () => (await S.Ledger.find({ franchiseId: F, account: 'wallet' }).lean()).reduce((s, r) => s + r.amountPaise, 0);
    const walletPaise = async () => (await S.App.findById(F).lean()).walletBalancePaise;

    it('wallet-paid delivered order credited to the franchise: earning 50 less platform commission', async () => {
        const o = await makeOrder({ status: 'delivered', franchiseId: F });
        S.d1 = o;
        await S.ledger.creditFoodOrder(await S.FoodOrder.findById(o.id).lean());
        const rows = await S.Ledger.find({ franchiseId: F, sourceId: String(o.id) }).lean();
        assert.equal(rows.find((r) => r.type === 'earning').amountPaise, 5000);
        const comm = rows.find((r) => r.type === 'platform_commission');
        assert.equal(comm.amountPaise, -Math.round(5000 * comm.rateBps / 10000));
        assert.equal(await walletPaise(), await franchiseNet());
        S.net1 = await franchiseNet();
    });

    it('partial refund 98 (20%) reverses 20% of the earning; then the rest reverses the remainder -> net exactly 0', async () => {
        const o = S.d1;
        const r1 = await S.admin.processRefund(o.id, 98);
        assert.equal(r1.refund.status, 'processed');
        assert.equal(await userBal(o.userId), 98);
        let d = await ord(o.id);
        assert.equal(d.payment.status, 'paid');               // partial: order is not "refunded" yet
        assert.equal(d.payment.refund.refundedTotal, 98);
        const rev1 = (await S.Ledger.find({ franchiseId: F, sourceId: String(o.id), type: 'earning_reversal' }).lean()).reduce((s, r) => s + r.amountPaise, 0);
        assert.equal(rev1, -1000);                              // 20% of 5000 paise
        assert.equal(await walletPaise(), await franchiseNet());

        await assert.rejects(S.admin.processRefund(o.id, 500), /between/);       // 98 + 500 > 490
        const r2 = await S.admin.processRefund(o.id, 392);                       // the remaining 392
        assert.equal(r2.refund.refundedTotal, 490);
        assert.equal(await userBal(o.userId), 490);
        d = await ord(o.id);
        assert.equal(d.payment.status, 'refunded');
        assert.equal(await franchiseNet(), S.net1 - S.net1);                      // earning + commission fully taken back -> 0
        assert.equal(await walletPaise(), 0);
        await assert.rejects(S.admin.processRefund(o.id), /already been refunded/);
        // the platform bears it: restaurant + rider keep what they earned
        assert.equal(await bal('restaurant', o.restaurantId), 380);
        assert.equal(await bal('deliveryBoy', o.riderId), 40);
    });

    it('"deduct from restaurant": 380 taken back from the restaurant, rider keeps 40, franchise earning untouched', async () => {
        const o = await makeOrder({ status: 'delivered', franchiseId: F });
        await S.ledger.creditFoodOrder(await S.FoodOrder.findById(o.id).lean());
        const before = await franchiseNet();
        const r = await S.admin.processRefund(o.id, undefined, { deductFromRestaurant: true });
        assert.equal(r.refund.status, 'processed');
        assert.equal(await bal('restaurant', o.restaurantId), 0);
        assert.equal(await bal('deliveryBoy', o.riderId), 40);
        assert.equal((await ord(o.id)).payoutReversed, true);
        assert.equal((await tx(o.id)).payoutReversed, true);
        assert.equal(await franchiseNet(), before);
    });

    it('delivered Razorpay order in manual mode: NOTHING is reversed until the refund is really done', async () => {
        const o = await makeOrder({ method: 'razorpay', status: 'delivered', franchiseId: F });
        await S.ledger.creditFoodOrder(await S.FoodOrder.findById(o.id).lean());
        const before = await franchiseNet();
        const r = await S.admin.processRefund(o.id, undefined, { deductFromRestaurant: true });
        assert.equal(r.refund.status, 'manual_pending');
        assert.equal(await bal('restaurant', o.restaurantId), 380);       // still there
        assert.equal(await franchiseNet(), before);
        assert.equal((await ord(o.id)).payoutReversed, false);

        await S.cancel.markRefundDoneManually(o.id, { referenceId: 'UTR-DELIV01' }, oid());   // the saved "deduct" choice is applied now
        assert.equal(await bal('restaurant', o.restaurantId), 0);
        assert.equal((await ord(o.id)).payoutReversed, true);
        assert.equal(await bal('deliveryBoy', o.riderId), 40);
        // running the books again must change nothing
        await S.cancel.applyRefundBooks(o.id, { refundAmount: 490, refundedTotal: 490, deductFromRestaurant: true });
        assert.equal(await bal('restaurant', o.restaurantId), 0);
    });

    it('delivered Razorpay order, platform bears it: franchise earning reversed only after manual-done', async () => {
        const o = await makeOrder({ method: 'razorpay', status: 'delivered', franchiseId: F });
        await S.ledger.creditFoodOrder(await S.FoodOrder.findById(o.id).lean());
        const before = await franchiseNet();
        await S.admin.processRefund(o.id);
        assert.equal(await franchiseNet(), before);
        await S.cancel.markRefundDoneManually(o.id, { referenceId: 'UTR-DELIV02' }, oid());
        const own = (await S.Ledger.find({ franchiseId: F, sourceId: String(o.id) }).lean()).reduce((t, r) => t + r.amountPaise, 0);
        assert.equal(own, 0);                                              // full refund: this order earns the franchise exactly nothing
        assert.ok(await franchiseNet() < before);
        assert.equal(await walletPaise(), await franchiseNet());
    });

    it('delivered COD order: refund goes to the customer wallet (cash was paid), rider cash stays on the rider', async () => {
        const o = await makeOrder({ method: 'cash', status: 'delivered', paid: false, captured: false });
        const r = await S.admin.processRefund(o.id, 100);
        assert.equal(r.refund.status, 'processed');
        assert.equal(r.refund.method, 'wallet');
        assert.equal(await userBal(o.userId), 100);
    });

    it('unpaid / undelivered COD: "nothing to refund"', async () => {
        const o = await makeOrder({ method: 'cash', status: 'created', paid: false, captured: false });
        await assert.rejects(S.admin.processRefund(o.id), /Nothing to refund/);
    });
});

describe('refund button of restaurant / delivery partner', () => {
    it('restaurant before pickup -> automatic cancel + refund', async () => {
        const o = await makeOrder({ status: 'confirmed' });
        const r = await S.cancel.requestOrderRefund(o.id, { byRole: 'RESTAURANT', byId: o.restaurantId, reason: 'Item finished' });
        assert.equal(r.mode, 'cancelled_and_refunded');
        assert.equal(await userBal(o.userId), 490);
    });

    it('delivery partner: always a request; no money moves; duplicate blocked; stranger blocked; reason required', async () => {
        const o = await makeOrder({ status: 'reached_drop' });
        await assert.rejects(S.cancel.requestOrderRefund(o.id, { byRole: 'DELIVERY_PARTNER', byId: o.riderId, reason: '' }), /reason/i);
        await assert.rejects(S.cancel.requestOrderRefund(o.id, { byRole: 'DELIVERY_PARTNER', byId: oid(), reason: 'Customer refused' }), /not found/i);
        const r = await S.cancel.requestOrderRefund(o.id, { byRole: 'DELIVERY_PARTNER', byId: o.riderId, reason: 'Customer refused' });
        assert.equal(r.mode, 'requested');
        assert.equal(r.amount, 490);
        assert.equal(await userBal(o.userId), 0);
        await assert.rejects(S.cancel.requestOrderRefund(o.id, { byRole: 'DELIVERY_PARTNER', byId: o.riderId, reason: 'again' }), /already waiting/);
        S.reqOrder = o;
    });

    it('admin approves the rider request on an in-flight order: cancelled, customer 490, rider keeps 40 (picked up)', async () => {
        const o = await makeOrder({ status: 'picked_up' });
        await S.cancel.requestOrderRefund(o.id, { byRole: 'DELIVERY_PARTNER', byId: o.riderId, reason: 'Spilled' });
        const r = await S.admin.decideRefundRequest(o.id, { approve: true }, oid());
        assert.equal(r.status, 'approved');
        assert.equal(await userBal(o.userId), 490);
        assert.equal(await bal('deliveryBoy', o.riderId), 40);
        assert.equal(await bal('restaurant', o.restaurantId), 0);
        await assert.rejects(S.admin.decideRefundRequest(o.id, { approve: true }, oid()), /no refund request/i);
    });

    it('admin rejects: nothing moves', async () => {
        const o = S.reqOrder;
        const r = await S.admin.decideRefundRequest(o.id, { approve: false, note: 'Not valid' }, oid());
        assert.equal(r.status, 'rejected');
        assert.equal(await userBal(o.userId), 0);
        assert.equal((await ord(o.id)).orderStatus, 'reached_drop');
    });

    it('restaurant asks refund of a DELIVERED order -> request; approve with 150 partial', async () => {
        const o = await makeOrder({ status: 'delivered' });
        const q = await S.cancel.requestOrderRefund(o.id, { byRole: 'RESTAURANT', byId: o.restaurantId, reason: 'Wrong order sent', amount: 150 });
        assert.equal(q.mode, 'requested');
        assert.equal(q.amount, 150);
        await S.admin.decideRefundRequest(o.id, { approve: true }, oid());
        assert.equal(await userBal(o.userId), 150);
        assert.equal((await ord(o.id)).payment.refund.refundedTotal, 150);
    });

    it('request amount above what is left is refused', async () => {
        const o = await makeOrder({ status: 'delivered' });
        await assert.rejects(S.cancel.requestOrderRefund(o.id, { byRole: 'RESTAURANT', byId: o.restaurantId, reason: 'Wrong item sent', amount: 9999 }), /between/);
    });
});

describe('franchise paid a refund from its own pocket -> claim -> reimbursement', () => {
    it('claim is capped to what was paid, approval credits the wallet exactly once, wallet == ledger', async () => {
        await setRefundMode('manual');
        const F = (await S.App.collection.insertOne({
            status: 'approved', selectedModules: ['food'], walletBalancePaise: 0, walletBalance: 0, franchiseFeeStatus: 'paid',
            accountStatus: 'active', refundRequests: [], payoutRequests: [],
            city: 'c', state: 's', phone: '9999999999', email: 'f@test.local', applicantName: 'Fran',
        })).insertedId;
        const o = await makeOrder({ method: 'razorpay', status: 'delivered', franchiseId: F });
        await S.ledger.creditFoodOrder(await S.FoodOrder.findById(o.id).lean());
        await S.admin.processRefund(o.id, 200);                                            // parked
        await S.cancel.markRefundDoneManually(o.id, { referenceId: 'UPI-UTR-55501' }, oid(), { paidBy: 'franchise', franchiseId: F });

        const net = async () => (await S.Ledger.find({ franchiseId: F, account: 'wallet' }).lean()).reduce((s, r) => s + r.amountPaise, 0);
        const afterRefund = await net();
        // earning 5000p, 200/490 of it reversed
        assert.ok(afterRefund < 5000);

        // a claim for an order whose refund was NOT paid by this franchise is refused
        const other = await makeOrder({ method: 'razorpay', status: 'delivered', franchiseId: F });
        await assert.rejects(S.partner.claimRefundFromSuperAdmin(F, { orderId: String(other.id), amount: 100 }), /Record the refund/);

        await S.partner.claimRefundFromSuperAdmin(F, { orderId: String(o.id), amount: 99999, claimReason: 'paid by UPI' });
        const app = await S.App.findById(F).lean();
        const claim = app.refundRequests[0];
        assert.equal(claim.amount, 200);                                                   // capped to the refund that was really paid

        await S.franchise.updateRefundClaimStatus(String(F), claim.id, { status: 'approved_by_admin' });
        const reimb = await S.Ledger.find({ franchiseId: F, type: 'refund_reimbursement' }).lean();
        assert.equal(reimb.length, 1);
        assert.equal(reimb[0].amountPaise, 20000);
        assert.equal(await net(), afterRefund + 20000);
        assert.equal((await S.App.findById(F).lean()).walletBalancePaise, await net());

        await assert.rejects(S.franchise.updateRefundClaimStatus(String(F), claim.id, { status: 'approved_by_admin' }), /already/);
        assert.equal((await S.Ledger.find({ franchiseId: F, type: 'refund_reimbursement' }).lean()).length, 1);
    });
});
