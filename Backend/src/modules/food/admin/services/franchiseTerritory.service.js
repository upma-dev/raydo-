import mongoose from 'mongoose';
import FranchiseTerritory from '../models/franchiseTerritory.model.js';
import FranchiseApplication from '../models/franchiseApplication.model.js';
import FranchiseCommissionRule from '../models/franchiseCommissionRule.model.js';
import { FoodZone } from '../models/zone.model.js';
import { MoneyError, parseRupeesInput, fromPaise } from './franchiseMoney.js';
import { createRuleVersion, ruleToDto } from './commissionRules.service.js';
import { writeAudit } from './franchiseAudit.service.js';

/**
 * Territories = zone-wise franchise pricing. Changing a territory's price affects only franchises created (or charges
 * set) afterwards: existing franchises keep the amounts snapshotted on their own charges.
 */

const model = (name) => mongoose.models[name] || null;
const validId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));

const toDto = (t, extra = {}) => ({
    id: t._id,
    name: t.name,
    code: t.code,
    city: t.city,
    notes: t.notes,
    isActive: t.isActive !== false,
    foodZoneId: t.foodZoneId,
    taxiZoneId: t.taxiZoneId,
    joiningFee: fromPaise(t.joiningFeePaise),
    securityDeposit: fromPaise(t.securityDepositPaise),
    updatedAt: t.updatedAt,
    createdAt: t.createdAt,
    ...extra,
});

/** Zones the admin can pick, marked with the territory that already uses each. */
export async function listZoneOptions() {
    const TaxiZone = model('TaxiZone');
    const [food, taxi, territories] = await Promise.all([
        FoodZone.find({}).select('name zoneName serviceLocation isActive').sort({ name: 1 }).lean(),
        TaxiZone ? TaxiZone.find({}).select('name service_location_name').sort({ name: 1 }).lean() : [],
        FranchiseTerritory.find({}).select('name foodZoneId taxiZoneId').lean(),
    ]);
    const foodUsed = new Map(territories.filter((t) => t.foodZoneId).map((t) => [String(t.foodZoneId), t]));
    const taxiUsed = new Map(territories.filter((t) => t.taxiZoneId).map((t) => [String(t.taxiZoneId), t]));
    return {
        food: food.map((z) => ({ id: z._id, name: z.name || z.zoneName, location: z.serviceLocation || '', active: z.isActive !== false, territoryId: foodUsed.get(String(z._id))?._id || null, territoryName: foodUsed.get(String(z._id))?.name || null })),
        taxi: taxi.map((z) => ({ id: z._id, name: z.name || z.service_location_name || 'Zone', territoryId: taxiUsed.get(String(z._id))?._id || null, territoryName: taxiUsed.get(String(z._id))?.name || null })),
    };
}

export async function listTerritories({ includeInactive = true } = {}) {
    const filter = includeInactive ? {} : { isActive: true };
    const rows = await FranchiseTerritory.find(filter).sort({ name: 1 }).lean();
    const ids = rows.map((t) => t._id);
    const TaxiZone = model('TaxiZone');
    const [counts, foodZones, taxiZones, rules] = await Promise.all([
        FranchiseApplication.aggregate([
            { $match: { territoryId: { $in: ids }, archived: { $ne: true } } },
            { $group: { _id: '$territoryId', total: { $sum: 1 }, active: { $sum: { $cond: [{ $eq: ['$accountStatus', 'active'] }, 1, 0] } } } },
        ]),
        FoodZone.find({ _id: { $in: rows.map((t) => t.foodZoneId).filter(Boolean) } }).select('name zoneName').lean(),
        TaxiZone ? TaxiZone.find({ _id: { $in: rows.map((t) => t.taxiZoneId).filter(Boolean) } }).select('name').lean() : [],
        FranchiseCommissionRule.aggregate([
            { $match: { scope: 'territory', scopeId: { $in: ids }, effectiveFrom: { $lte: new Date() } } },
            { $sort: { effectiveFrom: -1, version: -1 } },
            { $group: { _id: '$scopeId', rule: { $first: '$$ROOT' } } },
        ]),
    ]);
    const countBy = new Map(counts.map((c) => [String(c._id), c]));
    const foodName = new Map(foodZones.map((z) => [String(z._id), z.name || z.zoneName]));
    const taxiName = new Map(taxiZones.map((z) => [String(z._id), z.name]));
    const ruleBy = new Map(rules.map((r) => [String(r._id), r.rule]));
    return rows.map((t) => {
        const rule = ruleBy.get(String(t._id));
        return toDto(t, {
            foodZoneName: t.foodZoneId ? foodName.get(String(t.foodZoneId)) || '(deleted zone)' : null,
            taxiZoneName: t.taxiZoneId ? taxiName.get(String(t.taxiZoneId)) || '(deleted zone)' : null,
            franchises: countBy.get(String(t._id))?.total || 0,
            activeFranchises: countBy.get(String(t._id))?.active || 0,
            commission: rule && !rule.inherit ? ruleToDto(rule) : null, // null = uses the global default
        });
    });
}

export async function getTerritory(id) {
    if (!validId(id)) throw new MoneyError('Invalid territory id');
    const t = await FranchiseTerritory.findById(id).lean();
    if (!t) throw new MoneyError('Territory not found', 404);
    return t;
}

async function assertZones(foodZoneId, taxiZoneId, selfId = null) {
    const TaxiZone = model('TaxiZone');
    if (!foodZoneId && !taxiZoneId) throw new MoneyError('Choose a Food zone, a Taxi zone, or both');
    if (foodZoneId) {
        if (!validId(foodZoneId) || !(await FoodZone.exists({ _id: foodZoneId }))) throw new MoneyError('Food zone not found');
        const other = await FranchiseTerritory.findOne({ foodZoneId, _id: { $ne: selfId } }).select('name').lean();
        if (other) throw new MoneyError(`This Food zone already belongs to territory "${other.name}"`);
    }
    if (taxiZoneId) {
        if (!validId(taxiZoneId) || !TaxiZone || !(await TaxiZone.exists({ _id: taxiZoneId }))) throw new MoneyError('Taxi zone not found');
        const other = await FranchiseTerritory.findOne({ taxiZoneId, _id: { $ne: selfId } }).select('name').lean();
        if (other) throw new MoneyError(`This Taxi zone already belongs to territory "${other.name}"`);
    }
}

const cleanText = (v, max, field, required = false) => {
    const s = String(v ?? '').trim();
    if (required && s.length < 2) throw new MoneyError(`${field} is required`);
    if (s.length > max) throw new MoneyError(`${field} is too long`);
    return s;
};

export async function createTerritory(body = {}, actor) {
    const name = cleanText(body.name, 120, 'Name', true);
    const foodZoneId = body.foodZoneId || null;
    const taxiZoneId = body.taxiZoneId || null;
    await assertZones(foodZoneId, taxiZoneId);
    const doc = {
        name,
        code: cleanText(body.code, 30, 'Code').toUpperCase(),
        city: cleanText(body.city, 120, 'City'),
        notes: cleanText(body.notes, 500, 'Notes'),
        foodZoneId,
        taxiZoneId,
        joiningFeePaise: parseRupeesInput(body.joiningFee, { field: 'Joining fee' }),
        securityDepositPaise: parseRupeesInput(body.securityDeposit, { field: 'Security deposit' }),
        isActive: body.isActive !== false,
        createdBy: actor?.id || null,
        updatedBy: actor?.id || null,
    };
    let t;
    try {
        t = await FranchiseTerritory.create(doc);
    } catch (err) {
        if (err?.code === 11000) throw new MoneyError('One of these zones already belongs to another territory', 409);
        throw err;
    }
    await writeAudit({ actor, entity: 'territory', entityId: t._id, action: 'territory.create', after: toDto(t.toObject()), reason: 'Territory created' });

    // Optional territory commission (otherwise the global default applies)
    if (body.commission && body.commission.useGlobal !== true) {
        await createRuleVersion({ scope: 'territory', scopeId: t._id, body: { ...body.commission, reason: body.commission.reason || 'Set when the territory was created' } }, actor);
    }
    return toDto(t.toObject());
}

export async function updateTerritory(id, body = {}, actor) {
    const t = await FranchiseTerritory.findById(id);
    if (!t) throw new MoneyError('Territory not found', 404);
    const before = toDto(t.toObject());

    if (body.name !== undefined) t.name = cleanText(body.name, 120, 'Name', true);
    if (body.code !== undefined) t.code = cleanText(body.code, 30, 'Code').toUpperCase();
    if (body.city !== undefined) t.city = cleanText(body.city, 120, 'City');
    if (body.notes !== undefined) t.notes = cleanText(body.notes, 500, 'Notes');
    if (body.isActive !== undefined) t.isActive = body.isActive === true;

    const zonesChanged = (body.foodZoneId !== undefined && String(body.foodZoneId || '') !== String(t.foodZoneId || ''))
        || (body.taxiZoneId !== undefined && String(body.taxiZoneId || '') !== String(t.taxiZoneId || ''));
    if (zonesChanged) {
        const used = await FranchiseApplication.countDocuments({ territoryId: t._id, archived: { $ne: true }, accountStatus: { $ne: 'terminated' } });
        if (used > 0) throw new MoneyError('Zones cannot change while franchises use this territory. Move those franchises first, or create a new territory.');
        const foodZoneId = body.foodZoneId !== undefined ? (body.foodZoneId || null) : t.foodZoneId;
        const taxiZoneId = body.taxiZoneId !== undefined ? (body.taxiZoneId || null) : t.taxiZoneId;
        await assertZones(foodZoneId, taxiZoneId, t._id);
        t.foodZoneId = foodZoneId;
        t.taxiZoneId = taxiZoneId;
    }

    let priceChanged = false;
    if (body.joiningFee !== undefined) {
        const v = parseRupeesInput(body.joiningFee, { field: 'Joining fee' });
        priceChanged = priceChanged || v !== t.joiningFeePaise;
        t.joiningFeePaise = v;
    }
    if (body.securityDeposit !== undefined) {
        const v = parseRupeesInput(body.securityDeposit, { field: 'Security deposit' });
        priceChanged = priceChanged || v !== t.securityDepositPaise;
        t.securityDepositPaise = v;
    }
    const reason = String(body.reason || '').trim();
    if (priceChanged && reason.length < 3) throw new MoneyError('A reason is required when changing territory prices');

    t.updatedBy = actor?.id || null;
    try {
        await t.save();
    } catch (err) {
        if (err?.code === 11000) throw new MoneyError('One of these zones already belongs to another territory', 409);
        throw err;
    }
    const after = toDto(t.toObject());
    await writeAudit({ actor, entity: 'territory', entityId: t._id, action: priceChanged ? 'territory.update_price' : 'territory.update', before, after, reason: reason || 'Territory details updated' });
    return after;
}
