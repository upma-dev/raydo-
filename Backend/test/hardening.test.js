/**
 * Security / robustness regressions found by probing every route without a login.
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

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    ({ default: request } = await import('supertest'));
    ({ default: app } = await import('../src/app.js'));
    S.User = (await import('../src/modules/taxi/user/models/User.js')).User;
    S.Driver = (await import('../src/modules/taxi/driver/models/Driver.js')).Driver;
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));
});
after(async () => { await mongoose?.disconnect(); await replSet?.stop(); });

describe('anonymous visitors cannot change admin content', () => {
    const writes = [
        ['post', '/food/hero-banners/multiple'], ['delete', '/food/hero-banners/64b000000000000000000001'], ['patch', '/food/hero-banners/64b000000000000000000001'],
        ['patch', '/food/hero-banners/64b000000000000000000001/status'], ['put', '/food/hero-banners/64b000000000000000000001/link-restaurants'],
        ['post', '/food/hero-banners/under-250/multiple'], ['delete', '/food/hero-banners/dining/64b000000000000000000001'],
        ['post', '/food/hero-banners/home-promotion'], ['patch', '/food/hero-banners/home-promotion/64b000000000000000000001'],
        ['delete', '/food/hero-banners/landing/explore-more/64b000000000000000000001'], ['post', '/food/hero-banners/gourmet'],
        ['patch', '/food/hero-banners/landing/settings'],
        ['post', '/taxi/on-boarding'], ['patch', '/taxi/on-boarding/64b000000000000000000001'], ['delete', '/taxi/on-boarding/64b000000000000000000001'],
    ];
    for (const [method, url] of writes) {
        it(`${method.toUpperCase()} ${url} -> 401 without a token`, async () => {
            const r = await request(app)[method](`/api/v1${url}`).send({});
            assert.equal(r.status, 401, `${r.status} ${r.text.slice(0, 80)}`);
        });
    }

    it('reading the public banners still works without login', async () => {
        for (const url of ['/food/hero-banners/public', '/food/hero-banners', '/food/hero-banners/dining/public', '/taxi/on-boarding']) {
            const r = await request(app).get(`/api/v1${url}`);
            assert.equal(r.status, 200, `${url} -> ${r.status}`);
        }
    });
});

describe('a bad request can no longer crash the server', () => {
    it('unified OTP request / verify with an empty body answers 400 (it threw "next is not a function" and killed the process)', async () => {
        const a = await request(app).post('/api/v1/food/auth/unified/request-otp').send({});
        assert.equal(a.status, 400, a.text);
        const b = await request(app).post('/api/v1/auth/unified/verify-otp').send({});
        assert.equal(b.status, 400, b.text);
        const alive = await request(app).get('/api/v1/health');
        assert.equal(alive.status, 200);
    });
});

describe('legacy sign-up endpoints can no longer create accounts for free', () => {
    it('POST /taxi/drivers/register is gone (410) and creates nothing - it used to make an already APPROVED driver with a token', async () => {
        const p = phone();
        const r = await request(app).post('/api/v1/taxi/drivers/register').send({ name: 'Fake', phone: p, password: 'secret1', vehicleType: 'car', location: [75.8, 22.7] });
        assert.equal(r.status, 410, r.text);
        assert.equal(await S.Driver.countDocuments({ phone: p }), 0);
    });

    it('POST /taxi/users/register needs a verified OTP: nobody can register (or take) a phone number that is not theirs', async () => {
        const p = phone();
        const r = await request(app).post('/api/v1/taxi/users/register').send({ name: 'Asha Verma', phone: p, email: `${p}@t.local` });
        assert.ok([400, 404].includes(r.status), `${r.status} ${r.text}`);
        assert.equal(await S.User.countDocuments({ phone: p }), 0);

        // with the OTP proof it works, exactly like signup
        await request(app).post('/api/v1/taxi/users/auth/send-otp').send({ phone: p }).expect(201);
        await request(app).post('/api/v1/taxi/users/auth/verify-otp').send({ phone: p, otp: '1234' }).expect(200);
        const ok = await request(app).post('/api/v1/taxi/users/register').send({ name: 'Asha Verma', phone: p, email: `${p}@t.local` });
        assert.equal(ok.status, 201, ok.text);
        assert.equal(await S.User.countDocuments({ phone: p }), 1);
    });

    it('driver password login refuses a blocked or deleted driver', async () => {
        const { hashPassword } = await import('../src/modules/taxi/services/passwordService.js');
        const p = phone();
        await S.Driver.collection.insertOne({ name: 'Bad', phone: p, password: await hashPassword('secret1'), vehicleType: 'car', status: 'blocked', approve: true, createdAt: new Date(), updatedAt: new Date() });
        const r = await request(app).post('/api/v1/taxi/drivers/login').send({ phone: p, password: 'secret1' });
        assert.equal(r.status, 403, r.text);
        await S.Driver.collection.updateOne({ phone: p }, { $set: { status: 'approved' } });
        const ok = await request(app).post('/api/v1/taxi/drivers/login').send({ phone: p, password: 'secret1' });
        assert.equal(ok.status, 200, ok.text);
    });
});
