/**
 * Food apps: block / deactivate -> unblock -> the person can log in again.
 * (customer, restaurant, delivery partner). Test OTP 1234 works outside production.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
process.env.JWT_ACCESS_SECRET = 'test-access-secret';
process.env.JWT_SECRET = 'test-access-secret';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret';
process.env.RATE_LIMIT_MAX = '100000';
process.env.AUTH_RATE_LIMIT_MAX = '100000';
process.env.SMS_INDIA_HUB_API_KEY = '';
process.env.SMS_API_KEY = '';

let replSet; let mongoose; let request; let app; const S = {};
const phone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;
const food = (method, url) => request(app)[method](`/api/v1/food${url}`);

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    ({ default: request } = await import('supertest'));
    ({ default: app } = await import('../src/app.js'));
    S.admin = await import('../src/modules/food/admin/services/admin.service.js');
    S.FoodUser = (await import('../src/core/users/user.model.js')).FoodUser;
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));
});
after(async () => { await mongoose?.disconnect(); await replSet?.stop(); });

describe('food customer: deactivate -> reactivate -> login again', () => {
    it('works', async () => {
        const p = phone();
        const user = await S.FoodUser.create({ name: 'Asha', phone: p, email: `${p}@t.local`, isVerified: true, isActive: true });
        const login = async () => {
            await food('post', '/auth/user/request-otp').send({ phone: p });
            return food('post', '/auth/user/verify-otp').send({ phone: p, otp: '1234' });
        };

        const ok = await login();
        assert.equal(ok.status, 200, ok.text);
        const token = ok.body?.data?.accessToken || ok.body?.accessToken || ok.body?.data?.token;

        await S.admin.updateCustomerStatus(String(user._id), false);                 // BLOCK
        const blocked = await login();
        assert.ok([401, 403].includes(blocked.status), `blocked login -> ${blocked.status} ${blocked.text}`);
        if (token) assert.equal((await food('get', '/auth/me').set('Authorization', `Bearer ${token}`)).status, 401, 'old token stops working');

        await S.admin.updateCustomerStatus(String(user._id), true);                  // UNBLOCK
        const again = await login();
        assert.equal(again.status, 200, again.text);
        assert.equal((await S.FoodUser.findById(user._id).lean()).isActive, true);
        if (token) assert.equal((await food('get', '/auth/me').set('Authorization', `Bearer ${token}`)).status, 200, 'the old token works again');
    });
});

describe('restaurant and delivery partner: disable -> enable keeps no stale markers', () => {
    it('restaurant: enabling clears the old "Disabled by admin" markers', async () => {
        const { FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js');
        const r = await FoodRestaurant.collection.insertOne({ restaurantName: 'Kitchen', status: 'approved', ownerName: 'O', ownerPhone: phone(), createdAt: new Date(), updatedAt: new Date() });
        const id = String(r.insertedId);
        const off = await S.admin.updateRestaurantStatus(id, { status: false });
        assert.equal(off.status, 'rejected');
        assert.equal(off.rejectionReason, 'Disabled by admin');
        const on = await S.admin.updateRestaurantStatus(id, { status: true });
        assert.equal(on.status, 'approved');
        assert.equal(on.rejectionReason, undefined);
        assert.equal(on.rejectedAt, undefined);
        assert.ok(on.approvedAt);
    });

    it('delivery partner: blocking sets him offline; approving again clears the block markers', async () => {
        const { FoodDeliveryPartner } = await import('../src/modules/food/delivery/models/deliveryPartner.model.js');
        const p = phone();
        const ins = await FoodDeliveryPartner.collection.insertOne({ name: 'Ravi', phone: p, status: 'approved', availabilityStatus: 'online', createdAt: new Date(), updatedAt: new Date() });
        const id = String(ins.insertedId);
        const blocked = await S.admin.rejectDeliveryPartner(id, 'Misbehaviour');
        assert.equal(blocked.status, 'rejected');
        assert.equal(blocked.availabilityStatus, 'offline');
        const back = await S.admin.approveDeliveryPartner(id);
        const saved = await FoodDeliveryPartner.findById(id).lean();
        assert.equal(saved.status, 'approved');
        assert.equal(saved.rejectionReason, undefined);
        assert.ok(back);
    });
});


describe('admin accounts: a deactivated admin stays locked until re-enabled', () => {
    it('login is refused while deactivated (it used to switch itself back on); works again after the admin is re-enabled', async () => {
        const { adminLogin } = await import('../src/core/auth/auth.service.js');
        const { FoodAdmin } = await import('../src/core/admin/admin.model.js');
        const email = `sub${Math.floor(Math.random() * 1e6)}@t.local`;
        const admin = await FoodAdmin.create({
            email, password: 'Passw0rd!x', name: 'Support Admin', adminLevel: 'food_superadmin', admin_type: 'superadmin',
            permissions: ['*'], servicesAccess: ['food'], module: 'food', isActive: true, active: true, status: 'active',
        });
        assert.ok((await adminLogin(email, 'Passw0rd!x')).accessToken);

        await FoodAdmin.updateOne({ _id: admin._id }, { $set: { isActive: false, active: false, status: 'inactive' } });
        await assert.rejects(adminLogin(email, 'Passw0rd!x'), /inactive/);
        const still = await FoodAdmin.findById(admin._id).lean();
        assert.equal(still.isActive, false);                       // login did NOT re-enable it
        assert.equal(still.status, 'inactive');

        await FoodAdmin.updateOne({ _id: admin._id }, { $set: { isActive: true, active: true, status: 'active' } });
        assert.ok((await adminLogin(email, 'Passw0rd!x')).accessToken);
    });

    it('no hard-coded super admin: with no DEFAULT_ADMIN_* in the environment nobody can create one by logging in', async () => {
        const { adminLogin } = await import('../src/core/auth/auth.service.js');
        await assert.rejects(adminLogin('Raydoindia@gmail.com', 'sahin.raydo@2004#'), /Invalid credentials/);
    });
});
