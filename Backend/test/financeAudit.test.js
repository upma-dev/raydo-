import { after, before, beforeEach, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import mongoose from 'mongoose';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

import { Transaction } from '../src/core/payments/models/transaction.model.js';
import { recordTransaction, DuplicateTransactionError } from '../src/core/payments/transaction.service.js';
import { lockWalletAmount } from '../src/core/payments/wallet.service.js';
import { FoodDeliveryWallet } from '../src/modules/food/delivery/models/deliveryWallet.model.js';
import { FoodRestaurantWallet } from '../src/modules/food/restaurant/models/restaurantWallet.model.js';
import { FoodDeliveryWithdrawal } from '../src/modules/food/delivery/models/foodDeliveryWithdrawal.model.js';
import { FoodDeliveryCashDeposit } from '../src/modules/food/delivery/models/foodDeliveryCashDeposit.model.js';
import { FoodUserWallet } from '../src/modules/food/user/models/userWallet.model.js';
import { FoodItem } from '../src/modules/food/admin/models/food.model.js';
import { FoodOffer } from '../src/modules/food/admin/models/offer.model.js';
import { FoodOfferUsage } from '../src/modules/food/admin/models/offerUsage.model.js';
import { FoodOrder } from '../src/modules/food/orders/models/order.model.js';
import { creditWalletsForTransaction } from '../src/modules/food/orders/services/foodTransaction.service.js';
import { resolveOrderItems, reserveStock, releaseStock } from '../src/modules/food/orders/services/order-items.service.js';
import { claimCoupon } from '../src/modules/food/orders/services/order-coupon.service.js';
import { validateCreateOrderDto } from '../src/modules/food/orders/validators/order.validator.js';
import { deductWalletBalance, refundWalletBalance } from '../src/modules/food/user/services/userWallet.service.js';
import '../src/modules/food/restaurant/models/restaurant.model.js';
import { createOrder } from '../src/modules/food/orders/services/order.service.js';
import { updateDeliveryWithdrawalStatus } from '../src/modules/food/admin/services/admin.service.js';

let replSet;
const oid = () => new mongoose.Types.ObjectId();

before(async () => {
  replSet = await MongoMemoryReplSet.create({ replSet: { count: 1 } });
  await mongoose.connect(replSet.getUri());
  for (const model of Object.values(mongoose.models)) {
    await model.createCollection().catch(() => {});
    await model.init().catch(() => {});
  }
});

after(async () => {
  await mongoose.disconnect();
  await replSet?.stop();
});

beforeEach(async () => {
  for (const model of Object.values(mongoose.models)) {
    await model.collection.deleteMany({});
  }
});

const settle = (promises) => Promise.allSettled(promises);
const ok = (results) => results.filter((r) => r.status === 'fulfilled').length;

describe('ledger: one posting per key, exact paise', () => {
  it('10 parallel credits with the same dedupeKey move the money once', async () => {
    const restaurantId = String(oid());
    const results = await settle(Array.from({ length: 10 }, () => recordTransaction({
      entityType: 'restaurant', entityId: restaurantId, type: 'credit', amount: 450, category: 'order_payout', dedupeKey: 'order_payout:o1:r1',
    })));
    assert.equal(ok(results), 1);
    results.filter((r) => r.status === 'rejected').forEach((r) => assert.ok(r.reason instanceof DuplicateTransactionError));
    const wallet = await FoodRestaurantWallet.findOne({ restaurantId }).lean();
    assert.equal(wallet.balance, 450);
    assert.equal(await Transaction.countDocuments({ entityId: restaurantId }), 1);
  });

  it('amounts are rounded to paise and balanceAfter is the real post-update balance', async () => {
    const id = String(oid());
    await recordTransaction({ entityType: 'restaurant', entityId: id, type: 'credit', amount: 0.1 });
    const second = await recordTransaction({ entityType: 'restaurant', entityId: id, type: 'credit', amount: 0.2 });
    assert.equal(second.wallet.balance, 0.3);                 // not 0.30000000000000004
    assert.equal(second.transaction.balanceAfter, 0.3);
    const rows = await Transaction.find({ entityId: id }).sort({ createdAt: 1 }).lean();
    assert.deepEqual(rows.map((r) => r.balanceAfter), [0.1, 0.3]);
  });

  it('parallel credits keep a correct balanceAfter on every row', async () => {
    const id = String(oid());
    await Promise.all(Array.from({ length: 8 }, () => recordTransaction({ entityType: 'restaurant', entityId: id, type: 'credit', amount: 10 })));
    const rows = await Transaction.find({ entityId: id }).lean();
    assert.deepEqual(rows.map((r) => r.balanceAfter).sort((a, b) => a - b), [10, 20, 30, 40, 50, 60, 70, 80]);
  });
});

describe('order payout: webhook + app verify at the same moment', () => {
  it('restaurant and rider are paid once, not twice', async () => {
    const orderId = oid();
    const restaurantId = oid();
    const deliveryPartnerId = oid();
    await FoodOrder.collection.insertOne({ _id: orderId, orderStatus: 'created' });
    const tx = { orderId, restaurantId, deliveryPartnerId, amounts: { restaurantShare: 450, riderShare: 40 } };

    await Promise.all(Array.from({ length: 6 }, () => creditWalletsForTransaction({ ...tx })));

    assert.equal((await FoodRestaurantWallet.findOne({ restaurantId }).lean()).balance, 450);
    assert.equal((await FoodDeliveryWallet.findOne({ deliveryPartnerId }).lean()).balance, 40);
    assert.equal(await Transaction.countDocuments({ orderId, category: 'order_payout' }), 1);
    assert.equal(await Transaction.countDocuments({ orderId, category: 'delivery_payout' }), 1);
  });

  it('a cancelled order is never paid out by a late confirmation', async () => {
    const orderId = oid();
    const restaurantId = oid();
    await FoodOrder.collection.insertOne({ _id: orderId, orderStatus: 'cancelled_by_user' });
    await creditWalletsForTransaction({ orderId, restaurantId, amounts: { restaurantShare: 450, riderShare: 0 } });
    assert.equal(await Transaction.countDocuments({ orderId }), 0);
  });
});

describe('prices come from the database', () => {
  const makeFood = (restaurantId, extra = {}) => FoodItem.create({ restaurantId, name: 'Paneer Tikka', price: 250, ...extra });

  it('ignores the price the app sends', async () => {
    const restaurantId = oid();
    const food = await makeFood(restaurantId);
    const { items, subtotal } = await resolveOrderItems(restaurantId, [{ itemId: String(food._id), name: 'x', price: 1, quantity: 2 }]);
    assert.equal(items[0].price, 250);
    assert.equal(subtotal, 500);
  });

  it('uses the variant price from the database', async () => {
    const restaurantId = oid();
    const food = await makeFood(restaurantId, { variants: [{ name: 'Full', price: 400 }] });
    const variantId = String(food.variants[0]._id);
    const { subtotal } = await resolveOrderItems(restaurantId, [{ itemId: String(food._id), variantId, price: 1, quantity: 1 }]);
    assert.equal(subtotal, 400);
    await assert.rejects(resolveOrderItems(restaurantId, [{ itemId: String(food._id), variantId: String(oid()), quantity: 1 }]), /no longer available/);
  });

  it('rejects an item of another restaurant, an unavailable item and too much quantity', async () => {
    const restaurantId = oid();
    const other = await makeFood(oid());
    await assert.rejects(resolveOrderItems(restaurantId, [{ itemId: String(other._id), quantity: 1 }]), /not available at this restaurant/);
    const off = await makeFood(restaurantId, { isAvailable: false });
    await assert.rejects(resolveOrderItems(restaurantId, [{ itemId: String(off._id), quantity: 1 }]), /currently unavailable/);
    const few = await makeFood(restaurantId, { stockQuantity: 2 });
    await assert.rejects(resolveOrderItems(restaurantId, [{ itemId: String(few._id), quantity: 3 }]), /Only 2/);
  });
});

describe('stock: no overselling under parallel orders', () => {
  it('stock 5, 10 parallel single-item orders -> exactly 5 succeed, stock ends at 0 and item switches off', async () => {
    const food = await FoodItem.create({ restaurantId: oid(), name: 'Burger', price: 100, stockQuantity: 5 });
    const results = await settle(Array.from({ length: 10 }, () => reserveStock([{ itemId: String(food._id), quantity: 1 }])));
    assert.equal(ok(results), 5);
    const after = await FoodItem.findById(food._id).lean();
    assert.equal(after.stockQuantity, 0);
    assert.equal(after.isAvailable, false);
  });

  it('releasing a reservation puts the stock back and re-enables the item', async () => {
    const food = await FoodItem.create({ restaurantId: oid(), name: 'Burger', price: 100, stockQuantity: 1 });
    const reserved = await reserveStock([{ itemId: String(food._id), quantity: 1 }]);
    assert.equal((await FoodItem.findById(food._id).lean()).isAvailable, false);
    await releaseStock(reserved);
    const after = await FoodItem.findById(food._id).lean();
    assert.equal(after.stockQuantity, 1);
    assert.equal(after.isAvailable, true);
  });
});

describe('coupons', () => {
  it('create-order DTO keeps the coupon (top level and inside pricing)', () => {
    const base = {
      items: [{ itemId: 'a', name: 'x', price: 10, quantity: 1 }],
      address: { street: 's', city: 'c', state: 'st' },
      restaurantId: 'r',
      paymentMethod: 'cash',
    };
    assert.equal(validateCreateOrderDto({ ...base, pricing: { subtotal: 10, total: 10 }, couponCode: 'SAVE10' }).couponCode, 'SAVE10');
    assert.equal(validateCreateOrderDto({ ...base, pricing: { subtotal: 10, total: 10, couponCode: 'SAVE10' } }).pricing.couponCode, 'SAVE10');
  });

  it('usageLimit 3 with 10 parallel claims -> exactly 3 succeed', async () => {
    await FoodOffer.create({ couponCode: 'SAVE10', discountValue: 10, usageLimit: 3 });
    const results = await settle(Array.from({ length: 10 }, () => claimCoupon({ code: 'SAVE10', userId: oid() })));
    assert.equal(ok(results), 3);
    assert.equal((await FoodOffer.findOne({ couponCode: 'SAVE10' }).lean()).usedCount, 3);
  });

  it('perUserLimit 1: the same user can only use it once, even in parallel', async () => {
    await FoodOffer.create({ couponCode: 'ONCE', discountValue: 10, perUserLimit: 1 });
    const userId = oid();
    const results = await settle(Array.from({ length: 5 }, () => claimCoupon({ code: 'ONCE', userId })));
    assert.equal(ok(results), 1);
    const offer = await FoodOffer.findOne({ couponCode: 'ONCE' }).lean();
    assert.equal(offer.usedCount, 1);                         // the failed attempts gave their global use back
    assert.equal((await FoodOfferUsage.findOne({ offerId: offer._id, userId }).lean()).count, 1);
  });
});

describe('user wallet', () => {
  it('two parallel payments of 80 from a balance of 100 -> only one succeeds', async () => {
    const userId = oid();
    await FoodUserWallet.create({ userId, balance: 100, transactions: [] });
    const results = await settle([deductWalletBalance(userId, 80), deductWalletBalance(userId, 80)]);
    assert.equal(ok(results), 1);
    assert.equal((await FoodUserWallet.findOne({ userId }).lean()).balance, 20);
  });

  it('parallel refunds are all kept (no lost update)', async () => {
    const userId = oid();
    await FoodUserWallet.create({ userId, balance: 0, transactions: [] });
    await Promise.all(Array.from({ length: 10 }, () => refundWalletBalance(userId, 10)));
    const wallet = await FoodUserWallet.findOne({ userId }).lean();
    assert.equal(wallet.balance, 100);
    assert.equal(wallet.transactions.length, 10);
  });
});

describe('delivery withdrawal approval', () => {
  const makeWithdrawal = async (amount = 1000) => {
    const deliveryPartnerId = oid();
    await FoodDeliveryWallet.create({ deliveryPartnerId, balance: 5000 });
    const w = await FoodDeliveryWithdrawal.create({ deliveryPartnerId, amount, status: 'pending' });
    return { deliveryPartnerId, w };
  };

  it('approving twice (double click) debits the wallet once', async () => {
    const { deliveryPartnerId, w } = await makeWithdrawal(1000);
    const results = await settle([
      updateDeliveryWithdrawalStatus(String(w._id), { status: 'approved', transactionId: 'UTR12345' }),
      updateDeliveryWithdrawalStatus(String(w._id), { status: 'approved', transactionId: 'UTR12345' }),
    ]);
    assert.equal(ok(results), 1);
    const wallet = await FoodDeliveryWallet.findOne({ deliveryPartnerId }).lean();
    assert.equal(wallet.balance, 4000);
    assert.equal(wallet.totalSettled, 1000);
  });

  it('an approved withdrawal cannot be moved back to pending/rejected, and junk statuses are refused', async () => {
    const { w } = await makeWithdrawal(1000);
    await updateDeliveryWithdrawalStatus(String(w._id), { status: 'approved', transactionId: 'UTR12345' });
    await assert.rejects(updateDeliveryWithdrawalStatus(String(w._id), { status: 'rejected' }), /cannot be changed/);
    await assert.rejects(updateDeliveryWithdrawalStatus(String(w._id), { status: 'pending' }), /approved or rejected/);
    await assert.rejects(updateDeliveryWithdrawalStatus(String(w._id), { status: 'whatever' }), /approved or rejected/);
  });

  it('rejecting does not touch the wallet', async () => {
    const { deliveryPartnerId, w } = await makeWithdrawal(1000);
    await updateDeliveryWithdrawalStatus(String(w._id), { status: 'rejected', rejectionReason: 'bad details' });
    assert.equal((await FoodDeliveryWallet.findOne({ deliveryPartnerId }).lean()).balance, 5000);
  });
});

describe('rider cash deposit', () => {
  it('the same Razorpay payment can be stored only once', async () => {
    const base = { amount: 2500, paymentMethod: 'razorpay', status: 'Completed', razorpayPaymentId: 'pay_123' };
    await FoodDeliveryCashDeposit.create({ ...base, deliveryPartnerId: oid(), razorpayOrderId: 'order_1' });
    await assert.rejects(FoodDeliveryCashDeposit.create({ ...base, deliveryPartnerId: oid(), razorpayOrderId: 'order_2' }), (e) => e.code === 11000);
    // cash deposits without a payment id are unaffected
    await FoodDeliveryCashDeposit.create({ amount: 10, deliveryPartnerId: oid() });
    await FoodDeliveryCashDeposit.create({ amount: 10, deliveryPartnerId: oid() });
  });
});

describe('wallet lock', () => {
  it('parallel locks can never lock more than the balance', async () => {
    const deliveryPartnerId = String(oid());
    await recordTransaction({ entityType: 'deliveryBoy', entityId: deliveryPartnerId, type: 'credit', amount: 100 });
    const results = await settle(Array.from({ length: 5 }, () => lockWalletAmount('deliveryBoy', deliveryPartnerId, 40)));
    assert.equal(ok(results), 2);
    assert.equal((await FoodDeliveryWallet.findOne({ deliveryPartnerId }).lean()).lockedAmount, 80);
  });
});

describe('placing an order end to end (createOrder)', () => {
  // These tests build a tiny city: one restaurant, fee settings, one delivery slab.
  const setup = async ({ stock = null } = {}) => {
    const restaurantId = oid();
    await mongoose.connection.collection('food_restaurants').insertOne({
      _id: restaurantId, restaurantName: 'Test Kitchen', status: 'approved', isActive: true, isAcceptingOrders: true,
      location: { type: 'Point', coordinates: [75.8, 22.7] },
    });
    await mongoose.connection.collection('food_fee_settings').insertOne({
      deliveryFeeComputationMode: 'distance_order_value', platformFee: 5, gstRate: 5, isActive: true, createdAt: new Date(),
    });
    await mongoose.connection.collection('food_delivery_commission_rules').insertOne({
      minDistance: 0, maxDistance: null, commissionPerKm: 10, basePayout: 20, status: true, zoneId: null,
    });
    const food = await FoodItem.create({ restaurantId, name: 'Paneer Tikka', price: 250, ...(stock === null ? {} : { stockQuantity: stock }) });
    return { restaurantId, food };
  };

  const body = ({ restaurantId, food }, over = {}) => validateCreateOrderDto({
    restaurantId: String(restaurantId),
    items: [{ itemId: String(food._id), name: 'Paneer Tikka', price: 250, quantity: 2 }],
    address: { street: 'MG Road', city: 'Indore', state: 'MP', location: { type: 'Point', coordinates: [75.81, 22.71] } },
    pricing: { subtotal: 500, total: 600 },
    paymentMethod: 'cash',
    ...over,
  });

  it('charges the database price even when the app sends a fake price', async () => {
    const shop = await setup();
    const { order } = await createOrder(String(oid()), body(shop, { items: [{ itemId: String(shop.food._id), name: 'x', price: 1, quantity: 2 }] }));
    assert.equal(order.pricing.subtotal, 500);
    const saved = await FoodOrder.findById(order._id || order.id).lean();
    assert.equal(saved.items[0].price, 250);
    // total = items + delivery + platform fee + GST - discount, all from the server
    const p = saved.pricing;
    const expected = Math.round((p.subtotal + p.deliveryFee + p.platformFee + p.tax + p.surgeAmount + p.deliveryPartnerTip - p.discount) * 100) / 100;
    assert.equal(p.total, expected);
  });

  it('applies the coupon the cart sent inside pricing and counts its use exactly once', async () => {
    const shop = await setup();
    await FoodOffer.create({ couponCode: 'FLAT100', discountType: 'flat-price', discountValue: 100, usageLimit: 1 });
    const first = await createOrder(String(oid()), body(shop, { pricing: { subtotal: 500, total: 400, couponCode: 'FLAT100' } }));
    assert.equal(first.order.pricing.discount, 100);
    assert.equal((await FoodOffer.findOne({ couponCode: 'FLAT100' }).lean()).usedCount, 1);
    // the single use is gone: the next customer pays full price instead of getting a second discount
    const second = await createOrder(String(oid()), body(shop, { pricing: { subtotal: 500, total: 400, couponCode: 'FLAT100' } }));
    assert.equal(second.order.pricing.discount, 0);
    assert.equal((await FoodOffer.findOne({ couponCode: 'FLAT100' }).lean()).usedCount, 1);
  });

  it('takes stock atomically: stock 2, 5 parallel orders of 1 -> exactly 2 are placed', async () => {
    const shop = await setup({ stock: 2 });
    const one = () => createOrder(String(oid()), body(shop, { items: [{ itemId: String(shop.food._id), name: 'x', price: 250, quantity: 1 }] }));
    const results = await settle(Array.from({ length: 5 }, one));
    assert.equal(ok(results), 2);
    assert.equal((await FoodItem.findById(shop.food._id).lean()).stockQuantity, 0);
    assert.equal(await FoodOrder.countDocuments({}), 2);
  });

  it('pays from the wallet before the order exists; a too-small wallet places nothing and keeps stock and coupon', async () => {
    const shop = await setup({ stock: 5 });
    await FoodOffer.create({ couponCode: 'FLAT100', discountType: 'flat-price', discountValue: 100, usageLimit: 5 });
    const poor = oid();
    await FoodUserWallet.create({ userId: poor, balance: 10, transactions: [] });
    await assert.rejects(createOrder(String(poor), body(shop, { paymentMethod: 'wallet', pricing: { subtotal: 500, total: 400, couponCode: 'FLAT100' } })), /Insufficient wallet balance/);
    assert.equal(await FoodOrder.countDocuments({}), 0);
    assert.equal((await FoodItem.findById(shop.food._id).lean()).stockQuantity, 5);
    assert.equal((await FoodOffer.findOne({ couponCode: 'FLAT100' }).lean()).usedCount, 0);
    assert.equal((await FoodUserWallet.findOne({ userId: poor }).lean()).balance, 10);

    const rich = oid();
    await FoodUserWallet.create({ userId: rich, balance: 5000, transactions: [] });
    const { order } = await createOrder(String(rich), body(shop, { paymentMethod: 'wallet' }));
    const wallet = await FoodUserWallet.findOne({ userId: rich }).lean();
    assert.equal(wallet.balance, Math.round((5000 - order.pricing.total) * 100) / 100);
  });
});
