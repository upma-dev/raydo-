import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
let replSet; let mongoose; let admin; let FoodZone; let FoodRestaurant;

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    admin = await import('../src/modules/food/admin/services/admin.service.js');
    ({ FoodZone } = await import('../src/modules/food/admin/models/zone.model.js'));
    ({ FoodRestaurant } = await import('../src/modules/food/restaurant/models/restaurant.model.js'));
});
after(async () => { await mongoose?.disconnect(); await replSet?.stop(); });

// "Rajkot" zone: lat 22.2-22.4, lng 70.7-70.9
const rajkot = [{ latitude: 22.2, longitude: 70.7 }, { latitude: 22.4, longitude: 70.7 }, { latitude: 22.4, longitude: 70.9 }, { latitude: 22.2, longitude: 70.9 }];
const body = (zoneId, lat, lng) => ({
    restaurantName: 'Test Kitchen', ownerName: 'Owner', ownerEmail: `o${Math.random()}@t.local`, ownerPhone: '9000000011',
    primaryContactNumber: '9000000012', zoneId: String(zoneId), pureVegRestaurant: true,
    location: { area: 'Kalawad Road', city: 'Rajkot', latitude: lat, longitude: lng },
});

describe('restaurant location must be inside its zone (server side)', () => {
    it('create: a location outside the zone is refused, inside is not refused for that reason', async () => {
        const z = await FoodZone.create({ name: 'Rajkot', coordinates: rajkot });
        await assert.rejects(admin.createRestaurantByAdmin(body(z._id, 23.0225, 72.5714)), /outside the selected zone \(Rajkot\)/);   // Ahmedabad
        assert.equal(await FoodRestaurant.countDocuments({ restaurantName: 'Test Kitchen' }), 0);        // nothing was saved
        try { await admin.createRestaurantByAdmin(body(z._id, 22.3039, 70.8022)); } catch (e) { assert.doesNotMatch(String(e.message), /outside the selected zone/); }
    });

    it('update: moving to a point outside the zone, or to another zone, is refused; a point inside is accepted', async () => {
        const rajkotZone = await FoodZone.create({ name: 'Rajkot 2', coordinates: rajkot });
        const surat = await FoodZone.create({ name: 'Surat', coordinates: [{ latitude: 21.1, longitude: 72.7 }, { latitude: 21.3, longitude: 72.7 }, { latitude: 21.3, longitude: 72.9 }, { latitude: 21.1, longitude: 72.9 }] });
        const r = await FoodRestaurant.collection.insertOne({
            restaurantName: 'R1', ownerName: 'Owner', ownerPhone: '9000000013', ownerEmail: 'r1@t.local', primaryContactNumber: '9000000014', pureVegRestaurant: true, zoneId: rajkotZone._id, status: 'approved',
            location: { type: 'Point', latitude: 22.3, longitude: 70.8, coordinates: [70.8, 22.3] },
        });
        const id = String(r.insertedId);
        await assert.rejects(admin.updateRestaurantLocation(id, { latitude: 23.0225, longitude: 72.5714, area: 'x', city: 'y' }), /outside the selected zone/);
        await assert.rejects(admin.updateRestaurantLocation(id, { zoneId: String(surat._id), area: 'x', city: 'y' }), /outside the selected zone \(Surat\)/);   // old point is not in Surat
        const ok = await admin.updateRestaurantLocation(id, { latitude: 22.31, longitude: 70.81, area: 'Kalawad', city: 'Rajkot' });
        assert.ok(ok);
        assert.equal((await FoodRestaurant.findById(id).lean()).location.latitude, 22.31);
    });
});
