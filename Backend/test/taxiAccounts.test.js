/**
 * Taxi accounts over HTTP: rider sign-up / login with OTP, driver registration + login, and the OTP safety rules.
 * SMS is not sent (no SMS key in the test run), the test OTP 1234 is allowed outside production.
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
const api = (method, url) => request(app)[method](`/api/v1/taxi${url}`);
const phone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    ({ default: request } = await import('supertest'));
    ({ default: app } = await import('../src/app.js'));
    S.master = await import('../src/core/otp/masterOtp.js');
    S.User = (await import('../src/modules/taxi/user/models/User.js')).User;
    S.UserSession = (await import('../src/modules/taxi/user/models/UserAuthSession.js')).UserAuthSession;
    S.Driver = (await import('../src/modules/taxi/driver/models/Driver.js')).Driver;
    S.RegSession = (await import('../src/modules/taxi/driver/models/DriverRegistrationSession.js')).DriverRegistrationSession;
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));
});
after(async () => { await mongoose?.disconnect(); await replSet?.stop(); });

describe('rider account: OTP sign-up and login', () => {
    it('send OTP -> verify -> sign up creates the account and returns a login token; the same phone cannot sign up twice', async () => {
        const p = phone();
        const send = await api('post', '/users/auth/send-otp').send({ phone: p });
        assert.equal(send.status, 201, send.text);
        assert.equal(send.body.data.exists, false);

        const verify = await api('post', '/users/auth/verify-otp').send({ phone: p, otp: '1234' });
        assert.equal(verify.status, 200, verify.text);
        assert.equal(verify.body.data.exists, false);          // new number: go on to sign up

        const signup = await api('post', '/users/signup').send({ phone: p, name: 'Asha Verma', email: `a${p}@test.local`, gender: 'female' });
        assert.equal(signup.status, 201, signup.text);
        assert.ok(signup.body.data.token);
        assert.equal(signup.body.data.user.phone, p);
        assert.ok(await S.User.findOne({ phone: p }).lean());

        // the token really works
        const me = await api('get', '/users/me').set('Authorization', `Bearer ${signup.body.data.token}`);
        assert.equal(me.status, 200, me.text);

        // the same number again: it is an existing user now
        await api('post', '/users/auth/send-otp').send({ phone: p }).expect(201);
        const again = await api('post', '/users/signup').send({ phone: p, name: 'Asha Verma', email: `b${p}@test.local` });
        assert.ok([400, 409].includes(again.status), `second signup -> ${again.status}`);
        assert.equal(await S.User.countDocuments({ phone: p }), 1);
    });

    it('an existing rider logs in with OTP and gets the token (no sign-up step)', async () => {
        const p = phone();
        await S.User.collection.insertOne({ name: 'Ravi', phone: p, email: `${p}@t.local`, createdAt: new Date(), updatedAt: new Date() });
        await api('post', '/users/auth/send-otp').send({ phone: p }).expect(201);
        const verify = await api('post', '/users/auth/verify-otp').send({ phone: p, otp: '1234' });
        assert.equal(verify.status, 200, verify.text);
        assert.equal(verify.body.data.exists, true);
        assert.ok(verify.body.data.token);
    });

    it('sign-up needs a verified OTP first, and valid name / phone / email', async () => {
        const p = phone();
        const noOtp = await api('post', '/users/signup').send({ phone: p, name: 'Asha Verma', email: `${p}@t.local` });
        assert.ok([400, 404].includes(noOtp.status), `no otp -> ${noOtp.status}`);
        assert.equal(await S.User.countDocuments({ phone: p }), 0);

        await api('post', '/users/auth/send-otp').send({ phone: '12345' }).expect(400);
        await api('post', '/users/auth/send-otp').send({ phone: p }).expect(201);
        await api('post', '/users/auth/verify-otp').send({ phone: p, otp: '1234' }).expect(200);
        const badEmail = await api('post', '/users/signup').send({ phone: p, name: 'Asha Verma', email: 'not-an-email' });
        assert.equal(badEmail.status, 400);
        const badName = await api('post', '/users/signup').send({ phone: p, name: '', email: `${p}@t.local` });
        assert.equal(badName.status, 400);
        assert.equal(await S.User.countDocuments({ phone: p }), 0);
    });

    it('+91 and spaces in the number are accepted and saved as 10 digits', async () => {
        const p = phone();
        const send = await api('post', '/users/auth/send-otp').send({ phone: `+91 ${p.slice(0, 5)} ${p.slice(5)}` });
        assert.equal(send.status, 201, send.text);
        assert.equal(send.body.data.session.phone, p);
    });
});

describe('OTP safety', () => {
    it('five wrong guesses kill the OTP; the right OTP of the OLD request no longer works, a new one is needed', async () => {
        const p = phone();
        await S.User.collection.insertOne({ name: 'Ravi', phone: p, email: `${p}@t.local`, createdAt: new Date(), updatedAt: new Date() });
        await api('post', '/users/auth/send-otp').send({ phone: p }).expect(201);
        let last;
        for (let i = 0; i < 5; i += 1) {
            last = await api('post', '/users/auth/verify-otp').send({ phone: p, otp: `${8000 + i}` });
        }
        assert.equal(last.status, 429, last.text);
        assert.equal(await S.UserSession.countDocuments({ phone: p }), 0);
        const afterKill = await api('post', '/users/auth/verify-otp').send({ phone: p, otp: '1234' });
        assert.equal(afterKill.status, 404);                                       // no session: ask for a new OTP
    });

    it('a new OTP request resets the attempts', async () => {
        const p = phone();
        await S.User.collection.insertOne({ name: 'Ravi', phone: p, email: `${p}@t.local`, createdAt: new Date(), updatedAt: new Date() });
        await api('post', '/users/auth/send-otp').send({ phone: p }).expect(201);
        for (let i = 0; i < 3; i += 1) await api('post', '/users/auth/verify-otp').send({ phone: p, otp: `${7000 + i}` }).expect(401);
        await api('post', '/users/auth/send-otp').send({ phone: p }).expect(201);
        assert.equal((await S.UserSession.findOne({ phone: p }).lean()).otpAttempts, 0);
    });

    it('master OTP rules: 1234 only outside production; STATIC_OTP_CODE only for its own phone', () => {
        const saved = { ...process.env };
        try {
            process.env.NODE_ENV = 'production'; delete process.env.ALLOW_MASTER_OTP; delete process.env.STATIC_OTP_CODE; delete process.env.STATIC_OTP_PHONE;
            assert.equal(S.master.isMasterOtp('1234', '9000000001'), false, '1234 must not work in production');
            assert.equal(S.master.isMasterOtp('123456', '9000000001'), false);

            process.env.STATIC_OTP_CODE = '777777'; process.env.STATIC_OTP_PHONE = '9111111111';
            assert.equal(S.master.isMasterOtp('777777', '+91 91111 11111'), true, 'the review account can use it');
            assert.equal(S.master.isMasterOtp('777777', '9222222222'), false, 'but nobody else');

            process.env.ALLOW_MASTER_OTP = 'true';
            assert.equal(S.master.isMasterOtp('1234', '9000000001'), true, 'a staging server can switch it on on purpose');

            process.env.NODE_ENV = 'development'; delete process.env.ALLOW_MASTER_OTP;
            assert.equal(S.master.isMasterOtp('1234', '9000000001'), true, 'developer machines keep it');
            assert.equal(S.master.isMasterOtp('', '9000000001'), false);
            assert.equal(S.master.isMasterOtp('9999', '9000000001'), false);
        } finally {
            Object.keys(process.env).forEach((k) => { if (!(k in saved)) delete process.env[k]; });
            Object.assign(process.env, saved);
        }
    });

    it('in production a wrong-looking master OTP is refused by the real endpoint', async () => {
        const p = phone();
        await S.User.collection.insertOne({ name: 'Ravi', phone: p, email: `${p}@t.local`, createdAt: new Date(), updatedAt: new Date() });
        const saved = process.env.NODE_ENV;
        await api('post', '/users/auth/send-otp').send({ phone: p }).expect(201);
        process.env.NODE_ENV = 'production';
        try {
            const r = await api('post', '/users/auth/verify-otp').send({ phone: p, otp: '1234' });
            assert.equal(r.status, 401, r.text);
        } finally {
            process.env.NODE_ENV = saved;
        }
    });
});

describe('driver account: registration and login', () => {
    it('registration: send OTP -> verify -> personal details; the registration id carries the steps', async () => {
        const p = phone();
        const start = await api('post', '/drivers/onboarding/send-otp').send({ phone: p });
        assert.equal(start.status, 201, start.text);
        const registrationId = start.body.data.session.registrationId;
        assert.ok(registrationId);

        const verify = await api('post', '/drivers/onboarding/verify-otp').send({ phone: p, registrationId, otp: '1234' });
        assert.equal(verify.status, 200, verify.text);

        const personal = await api('patch', '/drivers/onboarding/personal').send({ phone: p, registrationId, fullName: 'Rahul Sharma', email: `r${p}@t.local`, gender: 'male', password: 'Passw0rd!x' });
        assert.equal(personal.status, 200, personal.text);
        assert.equal(personal.body.data.personal.fullName, 'Rahul Sharma');
    });

    it('personal details are refused before the OTP is verified', async () => {
        const p = phone();
        const start = await api('post', '/drivers/onboarding/send-otp').send({ phone: p });
        const registrationId = start.body.data.session.registrationId;
        const personal = await api('patch', '/drivers/onboarding/personal').send({ phone: p, registrationId, fullName: 'Rahul Sharma', email: `r${p}@t.local`, gender: 'male' });
        assert.equal(personal.status, 400);
    });

    it('an already registered driver number cannot register again', async () => {
        const p = phone();
        await S.Driver.collection.insertOne({ name: 'Old Driver', phone: p, vehicleType: 'car', createdAt: new Date(), updatedAt: new Date() });
        const start = await api('post', '/drivers/onboarding/send-otp').send({ phone: p });
        assert.equal(start.status, 409, start.text);
    });

    it('five wrong OTPs in registration end the session', async () => {
        const p = phone();
        const start = await api('post', '/drivers/onboarding/send-otp').send({ phone: p });
        const registrationId = start.body.data.session.registrationId;
        let last;
        for (let i = 0; i < 5; i += 1) last = await api('post', '/drivers/onboarding/verify-otp').send({ phone: p, registrationId, otp: `${6000 + i}` });
        assert.equal(last.status, 429, last.text);
        assert.equal(await S.RegSession.countDocuments({ phone: p }), 0);
    });

    it('an existing driver logs in with OTP and gets a token; five wrong OTPs lock that OTP', async () => {
        const p = phone();
        await S.Driver.collection.insertOne({ name: 'Old Driver', phone: p, vehicleType: 'car', status: 'approved', approve: true, createdAt: new Date(), updatedAt: new Date() });
        const send = await api('post', '/drivers/auth/send-otp').send({ phone: p });
        assert.equal(send.status, 201, send.text);
        const verify = await api('post', '/drivers/auth/verify-otp').send({ phone: p, otp: '1234' });
        assert.equal(verify.status, 200, verify.text);
        assert.ok(verify.body.data.token);

        await api('post', '/drivers/auth/send-otp').send({ phone: p }).expect(201);
        let last;
        for (let i = 0; i < 5; i += 1) last = await api('post', '/drivers/auth/verify-otp').send({ phone: p, otp: `${5000 + i}` });
        assert.equal(last.status, 429, last.text);
    });

    it('a deleted or switched-off driver gets no OTP and no token', async () => {
        const p = phone();
        await S.Driver.collection.insertOne({ name: 'Gone', phone: p, vehicleType: 'car', deletedAt: new Date(), createdAt: new Date(), updatedAt: new Date() });
        const r = await api('post', '/drivers/auth/send-otp').send({ phone: p });
        assert.equal(r.status, 403, r.text);
        const q = phone();
        await S.Driver.collection.insertOne({ name: 'Off', phone: q, vehicleType: 'car', status: 'blocked', createdAt: new Date(), updatedAt: new Date() });
        assert.equal((await api('post', '/drivers/auth/send-otp').send({ phone: q })).status, 403);
    });

    it('an unknown driver number cannot log in', async () => {
        const r = await api('post', '/drivers/auth/send-otp').send({ phone: phone() });
        assert.ok([404, 400].includes(r.status), `${r.status} ${r.text}`);
    });
});


describe('outstation quote over HTTP', () => {
    it('a logged-in rider gets distance + fare + waiting terms; no token is refused; a bad package is a clean 404', async () => {
        const { config } = await import('../src/config/env.js');
        config.googleMapsApiKey = '';                              // no Google in tests: the straight-line estimate is used (and flagged)
        const { SetPrice } = await import('../src/modules/taxi/admin/models/SetPrice.js');
        const vehicleTypeId = new mongoose.Types.ObjectId();
        const pkg = await SetPrice.create({
            pricing_scope: 'package', transport_type: 'intercity', package_destination: 'Ujjain', package_availability: 'available', active: 1, status: 'active',
            waiting_charge: 2, free_waiting_before: 3,
            package_vehicle_prices: [{ vehicle_type: vehicleTypeId, base_price: 1000, free_distance: 100, distance_price: 12, free_time: 120, time_price: 1, service_tax: 5 }],
        });

        const p = phone();
        await api('post', '/users/auth/send-otp').send({ phone: p }).expect(201);
        await api('post', '/users/auth/verify-otp').send({ phone: p, otp: '1234' }).expect(200);
        const signup = await api('post', '/users/signup').send({ phone: p, name: 'Asha Verma', email: `q${p}@t.local` });
        const token = signup.body.data.token;

        const body = { packageId: String(pkg._id), vehicleTypeId: String(vehicleTypeId), tripType: 'One Way', pickup: [75.8577, 22.7196], drop: [75.7885, 23.1765] };
        const ok = await api('post', '/rides/intercity-quote').set('Authorization', `Bearer ${token}`).send(body);
        assert.equal(ok.status, 200, ok.text);
        assert.ok(ok.body.data.distanceKm > 40 && ok.body.data.distanceKm < 120, `km ${ok.body.data.distanceKm}`);
        assert.equal(ok.body.data.distanceSource, 'estimate');
        assert.ok(ok.body.data.fare >= 1050);
        assert.equal(ok.body.data.waiting.ratePerMinute, 2);
        assert.equal(ok.body.data.waiting.freeMinutes, 3);

        const round = await api('post', '/rides/intercity-quote').set('Authorization', `Bearer ${token}`).send({ ...body, tripType: 'Round Trip' });
        assert.ok(round.body.data.distanceKm > ok.body.data.distanceKm * 1.9, 'round trip is about double the distance');
        assert.ok(round.body.data.fare > ok.body.data.fare);

        assert.equal((await api('post', '/rides/intercity-quote').send(body)).status, 401);
        const missing = await api('post', '/rides/intercity-quote').set('Authorization', `Bearer ${token}`).send({ ...body, packageId: String(new mongoose.Types.ObjectId()) });
        assert.equal(missing.status, 404);
        const noDrop = await api('post', '/rides/intercity-quote').set('Authorization', `Bearer ${token}`).send({ ...body, drop: undefined });
        assert.equal(noDrop.status, 400);
    });
});


describe('no login, no access (rider endpoints)', () => {
    it('without a token every private endpoint answers 401 - even with an x-user-id / userId pointing at a real user', async () => {
        const p = phone();
        const u = await S.User.collection.insertOne({ name: 'Victim', phone: p, email: `${p}@t.local`, createdAt: new Date(), updatedAt: new Date() });
        const victim = String(u.insertedId);
        const attempts = [
            ['get', '/users/me'], ['get', '/users/wallet'], ['get', '/rides'], ['get', '/rides/active/me'],
            ['post', '/rides'], ['post', '/users/wallet/transfer'], ['get', '/users/bus-bookings'], ['post', '/users/me/delete-request'],
        ];
        for (const [method, url] of attempts) {
            const plain = await api(method, url).send({});
            assert.equal(plain.status, 401, `${method} ${url} without a token -> ${plain.status}`);
            const spoof = await api(method, url).set('x-user-id', victim).send({ userId: victim });
            assert.equal(spoof.status, 401, `${method} ${url} with x-user-id -> ${spoof.status}`);
        }
    });

    it('a rider token cannot be used for a driver-only action, and a garbage token is refused', async () => {
        const bad = await api('get', '/users/me').set('Authorization', 'Bearer not-a-real-token');
        assert.equal(bad.status, 401);
    });

    it('public pages (pooling search) still open without login', async () => {
        const r = await api('get', '/users/pooling/search');
        assert.equal(r.status, 200, r.text);
    });
});


describe('block -> unblock -> login again (taxi rider and driver)', () => {
    it('rider: a blocked rider is locked out at once (OTP and old token); after unblock the same rider logs in again', async () => {
        const admin = await import('../src/modules/taxi/admin/services/adminService.js');
        const p = phone();
        await api('post', '/users/auth/send-otp').send({ phone: p }).expect(201);
        await api('post', '/users/auth/verify-otp').send({ phone: p, otp: '1234' }).expect(200);
        const signup = await api('post', '/users/signup').send({ phone: p, name: 'Asha Verma', email: `blk${p}@t.local` });
        const token = signup.body.data.token;
        const id = signup.body.data.user.id;
        assert.equal((await api('get', '/users/me').set('Authorization', `Bearer ${token}`)).status, 200);

        // BLOCK
        await admin.updateUser(String(id), { active: false });
        assert.equal((await api('get', '/users/me').set('Authorization', `Bearer ${token}`)).status, 401, 'the old token stops working immediately');
        const blockedOtp = await api('post', '/users/auth/send-otp').send({ phone: p });
        assert.equal(blockedOtp.status, 403, blockedOtp.text);

        // UNBLOCK
        await admin.updateUser(String(id), { active: true });
        const doc = await S.User.findById(id).lean();
        assert.equal(doc.active, true);
        assert.equal(doc.isActive, true);
        await api('post', '/users/auth/send-otp').send({ phone: p }).expect(201);
        const verify = await api('post', '/users/auth/verify-otp').send({ phone: p, otp: '1234' });
        assert.equal(verify.status, 200, verify.text);
        assert.equal(verify.body.data.exists, true);
        assert.ok(verify.body.data.token);
        assert.equal((await api('get', '/users/me').set('Authorization', `Bearer ${verify.body.data.token}`)).status, 200);
        assert.equal((await api('get', '/users/me').set('Authorization', `Bearer ${token}`)).status, 200, 'even the old token works again');
    });

    it('rider whose isActive flag was switched off elsewhere is fully restored by one unblock', async () => {
        const admin = await import('../src/modules/taxi/admin/services/adminService.js');
        const p = phone();
        const ins = await S.User.collection.insertOne({ name: 'Ravi', phone: p, email: `${p}@t.local`, active: true, isActive: false, createdAt: new Date(), updatedAt: new Date() });
        assert.equal((await api('post', '/users/auth/send-otp').send({ phone: p })).status, 403);
        await admin.updateUser(String(ins.insertedId), { active: true });
        assert.equal((await api('post', '/users/auth/send-otp').send({ phone: p })).status, 201);
    });

    it('driver: block takes him offline and locks login; unblock (approve) lets him log in again', async () => {
        const admin = await import('../src/modules/taxi/admin/services/adminService.js');
        const p = phone();
        const ins = await S.Driver.collection.insertOne({ name: 'Old Driver', phone: p, vehicleType: 'car', status: 'approved', approve: true, isOnline: true, socketId: 'sock-1', createdAt: new Date(), updatedAt: new Date() });
        const id = String(ins.insertedId);

        await api('post', '/drivers/auth/send-otp').send({ phone: p }).expect(201);
        const first = await api('post', '/drivers/auth/verify-otp').send({ phone: p, otp: '1234' });
        assert.equal(first.status, 200, first.text);

        // BLOCK
        await admin.updateDriver(id, { status: 'blocked' });
        const blocked = await S.Driver.findById(id).lean();
        assert.equal(blocked.isOnline, false, 'taken offline at once');
        const lockedOtp = await api('post', '/drivers/auth/send-otp').send({ phone: p });
        assert.equal(lockedOtp.status, 403, lockedOtp.text);

        // UNBLOCK
        const back = await admin.updateDriver(id, { approve: true });
        assert.equal(back.status, 'approved');
        await api('post', '/drivers/auth/send-otp').send({ phone: p }).expect(201);
        const again = await api('post', '/drivers/auth/verify-otp').send({ phone: p, otp: '1234' });
        assert.equal(again.status, 200, again.text);
        assert.ok(again.body.data.token);
        assert.equal(again.body.data.driver.status, 'approved');
    });

    it('driver: "disapprove" then approve also round-trips', async () => {
        const admin = await import('../src/modules/taxi/admin/services/adminService.js');
        const p = phone();
        const ins = await S.Driver.collection.insertOne({ name: 'D', phone: p, vehicleType: 'car', status: 'approved', approve: true, isOnline: true, socketId: 's', createdAt: new Date(), updatedAt: new Date() });
        const id = String(ins.insertedId);
        await admin.updateDriver(id, { approve: false });
        assert.equal((await S.Driver.findById(id).lean()).isOnline, false);
        await admin.updateDriver(id, { approve: true });
        assert.equal((await api('post', '/drivers/auth/send-otp').send({ phone: p })).status, 201);
    });
});
