import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
let replSet; let mongoose; let admin; let FoodCategory; let FoodZone;

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    admin = await import('../src/modules/food/admin/services/admin.service.js');
    ({ FoodCategory } = await import('../src/modules/food/admin/models/category.model.js'));
    ({ FoodZone } = await import('../src/modules/food/admin/models/zone.model.js'));
});
after(async () => { await mongoose?.disconnect(); await replSet?.stop(); });

const sq = (x) => [{ latitude: x, longitude: x }, { latitude: x + 1, longitude: x }, { latitude: x + 1, longitude: x + 1 }];

describe('category stores its zone name', () => {
    it('create saves the name; global has none; moving zone changes it; renaming the zone follows', async () => {
        const a = await FoodZone.create({ name: 'Indore Central', coordinates: sq(1) });
        const b = await FoodZone.create({ name: 'Bhopal', coordinates: sq(5) });

        const c = await admin.createCategory({ name: 'Pizza', zoneId: String(a._id) });
        const g = await admin.createCategory({ name: 'Drinks', zoneId: 'global' });
        assert.equal((await FoodCategory.findById(c._id || c.id).lean()).zoneName, 'Indore Central');
        assert.equal((await FoodCategory.findById(g._id || g.id).lean()).zoneName, '');

        await admin.updateCategory(String(c._id || c.id), { zoneId: String(b._id) });
        assert.equal((await FoodCategory.findById(c._id || c.id).lean()).zoneName, 'Bhopal');

        await admin.updateZone(String(b._id), { name: 'Bhopal City' });
        assert.equal((await FoodCategory.findById(c._id || c.id).lean()).zoneName, 'Bhopal City');
    });
});
