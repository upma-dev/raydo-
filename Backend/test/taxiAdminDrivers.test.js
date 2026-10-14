/**
 * Taxi admin: driver service + vehicle type are saved, kept consistent and shown correctly.
 */
import { describe, it, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

process.env.NODE_ENV = 'test';
let replSet; let mongoose; const S = {};
const oid = () => new mongoose.Types.ObjectId();
const phone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

before(async () => {
    replSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: 'wiredTiger' } });
    mongoose = (await import('mongoose')).default;
    await mongoose.connect(replSet.getUri());
    S.admin = await import('../src/modules/taxi/admin/services/adminService.js');
    S.rules = await import('../src/modules/taxi/services/vehicleServiceRules.js');
    S.Vehicle = (await import('../src/modules/taxi/admin/models/Vehicle.js')).Vehicle;
    S.Driver = (await import('../src/modules/taxi/driver/models/Driver.js')).Driver;
    S.Location = (await import('../src/modules/taxi/admin/models/ServiceLocation.js')).ServiceLocation;
    await Promise.all(Object.values(mongoose.models).map((m) => m.createIndexes().catch(() => null)));
});
after(async () => { await mongoose?.disconnect(); await replSet?.stop(); });

const vehicle = (extra) => S.Vehicle.collection.insertOne({
    name: 'Sedan', transport_type: 'taxi', dispatch_type: 'normal', icon_types: 'car', status: 1, active: true, capacity: 4, createdAt: new Date(), updatedAt: new Date(), ...extra,
}).then((r) => r.insertedId);

describe('vehicle type must fit the service', () => {
    let sedan; let bike; let truck; let both; let disabled;
    before(async () => {
        sedan = await vehicle({ name: 'Sedan' });
        bike = await vehicle({ name: 'Bike Taxi', icon_types: 'bike', transport_type: 'both' });
        truck = await vehicle({ name: 'Mini Truck', icon_types: 'truck', transport_type: 'delivery' });
        both = bike;
        disabled = await vehicle({ name: 'Old Auto', icon_types: 'auto', status: 0, active: false });
    });

    it('rule table: taxi + outstation -> taxi/both, delivery -> delivery/both, pooling -> pooling/both', async () => {
        assert.equal(S.rules.vehicleFitsService({ transport_type: 'taxi' }, 'taxi'), true);
        assert.equal(S.rules.vehicleFitsService({ transport_type: 'taxi' }, 'outstation'), true);
        assert.equal(S.rules.vehicleFitsService({ transport_type: 'taxi' }, 'delivery'), false);
        assert.equal(S.rules.vehicleFitsService({ transport_type: 'delivery' }, 'taxi'), false);
        assert.equal(S.rules.vehicleFitsService({ transport_type: 'both' }, 'delivery'), true);
        assert.equal(S.rules.vehicleFitsService({ transport_type: 'pooling' }, 'pooling'), true);
    });

    it('unknown, malformed and disabled vehicle types are refused; a fitting one is returned; none given is fine (owner)', async () => {
        await assert.rejects(S.rules.assertVehicleTypeFitsServices({ vehicleTypeId: String(oid()), serviceCategories: ['taxi'] }), /does not exist/);
        await assert.rejects(S.rules.assertVehicleTypeFitsServices({ vehicleTypeId: 'abc', serviceCategories: ['taxi'] }), /valid vehicle type/);
        await assert.rejects(S.rules.assertVehicleTypeFitsServices({ vehicleTypeId: String(disabled), serviceCategories: ['taxi'] }), /disabled/);
        await assert.rejects(S.rules.assertVehicleTypeFitsServices({ vehicleTypeId: String(truck), serviceCategories: ['taxi'] }), /cannot be used for the taxi service/);
        const ok = await S.rules.assertVehicleTypeFitsServices({ vehicleTypeId: String(sedan), serviceCategories: ['taxi', 'outstation'] });
        assert.equal(ok.name, 'Sedan');
        assert.equal(await S.rules.assertVehicleTypeFitsServices({ vehicleTypeId: '', serviceCategories: ['taxi'] }), null);
    });

    it('admin creates a driver: services + vehicle type are saved together and a wrong combination is refused', async () => {
        const p = phone();
        const d = await S.admin.createDriver({ name: 'Rahul', phone: p, password: 'secret1', transport_type: 'taxi', serviceCategories: ['taxi', 'outstation'], vehicle_type_id: String(sedan) });
        assert.deepEqual(d.service_categories, ['taxi', 'outstation']);
        assert.equal(String(d.vehicle_type_id), String(sedan));
        assert.equal(d.vehicle_type, 'car');

        await assert.rejects(S.admin.createDriver({ name: 'X', phone: phone(), password: 'secret1', transport_type: 'delivery', serviceCategories: ['delivery'], vehicle_type_id: String(sedan) }), /cannot be used for the delivery service/);
        await assert.rejects(S.admin.createDriver({ name: 'X', phone: phone(), password: 'secret1', serviceCategories: ['taxi'], vehicle_type_id: String(disabled) }), /disabled/);
        await assert.rejects(S.admin.createDriver({ name: 'X', phone: phone(), password: 'secret1', serviceCategories: ['taxi'], vehicle_type_id: String(oid()) }), /does not exist/);
        const delivery = await S.admin.createDriver({ name: 'Dev', phone: phone(), password: 'secret1', transport_type: 'delivery', serviceCategories: ['delivery'], vehicle_type_id: String(truck) });
        assert.equal(delivery.register_for, 'delivery');
    });

    it('admin changes the vehicle type: the dispatch fields (vehicleType / vehicleIconType) follow it', async () => {
        const d = await S.admin.createDriver({ name: 'Rahul', phone: phone(), password: 'secret1', serviceCategories: ['taxi'], vehicle_type_id: String(sedan) });
        const updated = await S.admin.updateDriver(String(d._id), { vehicle_type_id: String(bike) });
        assert.equal(String(updated.vehicle_type_id), String(bike));
        assert.equal(updated.vehicle_type, 'bike');
        assert.equal(updated.vehicleIconType, 'bike');
        const saved = await S.Driver.findById(d._id).lean();
        assert.equal(saved.vehicleType, 'bike');                  // before: stayed "car" while the id said bike
        assert.equal(saved.vehicleIconType, 'bike');
    });

    it('admin changes the services: serviceCategories + registerFor stay in step, and an unfitting vehicle is refused', async () => {
        const d = await S.admin.createDriver({ name: 'Rahul', phone: phone(), password: 'secret1', serviceCategories: ['taxi'], vehicle_type_id: String(sedan) });
        const both2 = await S.admin.updateDriver(String(d._id), { serviceCategories: ['taxi', 'outstation'] });
        assert.deepEqual(both2.service_categories, ['taxi', 'outstation']);
        assert.equal(both2.register_for, 'both');

        await assert.rejects(S.admin.updateDriver(String(d._id), { serviceCategories: ['delivery'] }), /cannot be used for the delivery service/);
        assert.deepEqual((await S.Driver.findById(d._id).lean()).serviceCategories, ['taxi', 'outstation']);   // nothing half-saved

        const viaTransport = await S.admin.updateDriver(String(d._id), { transport_type: 'taxi', serviceCategories: ['taxi'] });
        assert.deepEqual(viaTransport.service_categories, ['taxi']);
    });

    it('changing the phone to one that already belongs to another driver is a clean 409', async () => {
        const a = await S.admin.createDriver({ name: 'A', phone: phone(), password: 'secret1', serviceCategories: ['taxi'] });
        const b = await S.admin.createDriver({ name: 'B', phone: phone(), password: 'secret1', serviceCategories: ['taxi'] });
        await assert.rejects(S.admin.updateDriver(String(b._id), { phone: a.phone }), /already uses this phone/);
    });
});

describe('admin driver list shows the right data', () => {
    it('shows the services and the real vehicle type name; filters by city, service and vehicle type; search keeps the online filter', async () => {
        const loc = (await S.Location.collection.insertOne({ service_location_name: 'Indore', name: 'Indore', createdAt: new Date(), updatedAt: new Date() })).insertedId;
        const loc2 = (await S.Location.collection.insertOne({ service_location_name: 'Bhopal', name: 'Bhopal', createdAt: new Date(), updatedAt: new Date() })).insertedId;
        const sedan = await vehicle({ name: 'Prime Sedan' });
        const truck = await vehicle({ name: 'Tata Ace', icon_types: 'truck', transport_type: 'delivery' });
        const tag = `Zed${Math.floor(Math.random() * 1e6)}`;
        const mk = (name, extra) => S.admin.createDriver({ name: `${tag} ${name}`, phone: phone(), password: 'secret1', approve: true, ...extra });
        const d1 = await mk('Taxi', { serviceCategories: ['taxi', 'outstation'], vehicle_type_id: String(sedan), service_location_id: String(loc) });
        const d2 = await mk('Cargo', { transport_type: 'delivery', serviceCategories: ['delivery'], vehicle_type_id: String(truck), service_location_id: String(loc2) });
        await S.Driver.updateOne({ _id: d1._id }, { $set: { isOnline: true, socketId: 'sock1' } });

        const all = await S.admin.listDrivers({ search: tag, limit: 50 });
        const row1 = all.results.find((r) => String(r._id) === String(d1._id));
        const row2 = all.results.find((r) => String(r._id) === String(d2._id));
        assert.deepEqual(row1.service_categories, ['taxi', 'outstation']);
        assert.equal(row1.vehicle_type_name, 'Prime Sedan');
        assert.deepEqual(row2.service_categories, ['delivery']);
        assert.equal(row2.vehicle_type_name, 'Tata Ace');

        const indore = await S.admin.listDrivers({ search: tag, service_location_id: String(loc) });
        assert.deepEqual(indore.results.map((r) => String(r._id)), [String(d1._id)]);
        const delivery = await S.admin.listDrivers({ search: tag, transport_type: 'delivery' });
        assert.deepEqual(delivery.results.map((r) => String(r._id)), [String(d2._id)]);
        const byVehicle = await S.admin.listDrivers({ search: tag, vehicle_type_id: String(truck) });
        assert.deepEqual(byVehicle.results.map((r) => String(r._id)), [String(d2._id)]);

        // search + online: only the online match (the search used to wipe out the online filter)
        const onlineOnly = await S.admin.listDrivers({ search: tag, isOnline: 'true' });
        assert.deepEqual(onlineOnly.results.map((r) => String(r._id)), [String(d1._id)]);
        const offlineOnly = await S.admin.listDrivers({ search: tag, isOnline: 'false' });
        assert.deepEqual(offlineOnly.results.map((r) => String(r._id)), [String(d2._id)]);
    });
});
