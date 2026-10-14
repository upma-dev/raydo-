import mongoose from 'mongoose';
import FranchiseCommissionRule from '../models/franchiseCommissionRule.model.js';
import FranchiseFormConfig from '../models/franchiseFormConfig.model.js';
import FranchiseTerritory from '../models/franchiseTerritory.model.js';
import FranchiseApplication from '../models/franchiseApplication.model.js';
import { normalizeCommissions } from './franchisePlan.js';
import { MoneyError, parsePercentInput, bpsToPercent } from './franchiseMoney.js';
import { writeAudit } from './franchiseAudit.service.js';
import { withTransaction, opts } from './franchiseTx.js';

/**
 * PLATFORM COMMISSION RULES
 * Which % of a franchise's eligible earnings the platform keeps, per service.
 *
 * Priority (first scope that has a rule in force wins, the whole rule is used):
 *   1. franchise override
 *   2. territory (zone) setting
 *   3. global default
 * "In force at time T" = the version with the latest effectiveFrom <= T. Rules are append-only, so calculating an old
 * transaction again always finds the rule that applied to it then.
 */

const SCOPES = ['franchise', 'territory', 'global'];

const ruleInForce = (scope, scopeId, at, session) =>
    FranchiseCommissionRule.findOne({ scope, scopeId: scopeId || null, effectiveFrom: { $lte: at } })
        .sort({ effectiveFrom: -1, version: -1 })
        .session(session || null)
        .lean();

/** The global rule must always exist. First use: copy the old "Fees & Commission" food/taxi % so nothing jumps to 0. */
let globalRuleSeen = false;
export async function ensureGlobalRule() {
    if (globalRuleSeen) return null;
    const existing = await FranchiseCommissionRule.findOne({ scope: 'global', scopeId: null }).sort({ version: 1 }).lean();
    if (existing) { globalRuleSeen = true; return existing; }
    const cfg = await FranchiseFormConfig.findOne().select('moduleCommissions').lean();
    const legacy = normalizeCommissions(cfg?.moduleCommissions);
    try {
        const [row] = await FranchiseCommissionRule.create([{
            scope: 'global', scopeId: null, version: 1, mode: 'separate',
            food: { enabled: true, rateBps: Math.round(legacy.food * 100) },
            taxi: { enabled: true, rateBps: Math.round(legacy.taxi * 100) },
            combinedRateBps: Math.round(legacy.both * 100),
            effectiveFrom: new Date(0),
            reason: 'Initial global default (copied from the previous Fees & Commission settings)',
        }]);
        globalRuleSeen = true;
        return row.toObject();
    } catch (err) {
        if (err?.code === 11000) return FranchiseCommissionRule.findOne({ scope: 'global', scopeId: null, version: 1 }).lean();
        throw err;
    }
}

/** Expand a rule into per-service rates. Combined mode = the same rate for both services. */
function ratesFromRule(rule) {
    if (rule.mode === 'combined') {
        const r = { enabled: true, rateBps: rule.combinedRateBps || 0 };
        return { food: { ...r }, taxi: { ...r } };
    }
    return {
        food: { enabled: rule.food?.enabled !== false, rateBps: rule.food?.enabled === false ? 0 : (rule.food?.rateBps || 0) },
        taxi: { enabled: rule.taxi?.enabled !== false, rateBps: rule.taxi?.enabled === false ? 0 : (rule.taxi?.rateBps || 0) },
    };
}

/**
 * Rates that apply to `franchise` at time `at`.
 * Returns { mode, scope, ruleId, version, food: {enabled, rateBps}, taxi: {enabled, rateBps}, chain }.
 */
export async function resolveRates(franchise, at = new Date(), { session } = {}) {
    await ensureGlobalRule();
    const chain = {};
    const lookups = [
        ['franchise', franchise?._id],
        ['territory', franchise?.territoryId],
        ['global', null],
    ];
    let chosen = null;
    for (const [scope, scopeId] of lookups) {
        if (scope !== 'global' && !scopeId) { chain[scope] = null; continue; }
        const rule = await ruleInForce(scope, scopeId, at, session);
        chain[scope] = rule || null;
        if (!chosen && rule && !rule.inherit) chosen = rule;
    }
    if (!chosen) throw new Error('No global commission rule in force');
    return {
        mode: chosen.mode,
        scope: chosen.scope,
        ruleId: chosen._id,
        version: chosen.version,
        ...ratesFromRule(chosen),
        chain,
    };
}

export const ruleToDto = (r) => (r ? {
    id: r._id,
    scope: r.scope,
    scopeId: r.scopeId,
    version: r.version,
    inherit: Boolean(r.inherit),
    mode: r.mode,
    food: { enabled: r.food?.enabled !== false, rate: bpsToPercent(r.food?.rateBps) },
    taxi: { enabled: r.taxi?.enabled !== false, rate: bpsToPercent(r.taxi?.rateBps) },
    combinedRate: bpsToPercent(r.combinedRateBps),
    effectiveFrom: r.effectiveFrom,
    reason: r.reason,
    createdByName: r.createdByName,
    createdAt: r.createdAt,
} : null);

export const ratesToDto = (rates) => ({
    mode: rates.mode,
    appliedFrom: rates.scope,
    ruleId: rates.ruleId,
    version: rates.version,
    food: { enabled: rates.food.enabled, rate: bpsToPercent(rates.food.rateBps) },
    taxi: { enabled: rates.taxi.enabled, rate: bpsToPercent(rates.taxi.rateBps) },
});

async function assertScopeTarget(scope, scopeId) {
    if (scope === 'global') return null;
    if (!mongoose.Types.ObjectId.isValid(String(scopeId || ''))) throw new MoneyError(`A valid ${scope} id is required`);
    const Model = scope === 'territory' ? FranchiseTerritory : FranchiseApplication;
    const exists = await Model.exists({ _id: scopeId });
    if (!exists) throw new MoneyError(`${scope === 'territory' ? 'Territory' : 'Franchise'} not found`, 404);
    return new mongoose.Types.ObjectId(String(scopeId));
}

/** Validate an admin's rule payload into a clean document (never trusts unknown keys). */
export function parseRuleInput(body = {}, scope) {
    const inherit = scope !== 'global' && body.inherit === true;
    const reason = String(body.reason || '').trim();
    if (reason.length < 3) throw new MoneyError('A reason is required for every commission change');
    if (reason.length > 500) throw new MoneyError('Reason is too long');

    let effectiveFrom = new Date();
    if (body.effectiveFrom) {
        const d = new Date(body.effectiveFrom);
        if (Number.isNaN(d.getTime())) throw new MoneyError('Invalid effective date');
        // No back-dating: a past start would silently change commission that was already calculated
        if (d.getTime() < Date.now() - 60 * 1000) throw new MoneyError('Effective date cannot be in the past');
        if (d.getTime() > Date.now() + 366 * 86400000) throw new MoneyError('Effective date can be at most one year ahead');
        effectiveFrom = d;
    }
    if (inherit) return { inherit: true, mode: 'separate', food: { enabled: true, rateBps: 0 }, taxi: { enabled: true, rateBps: 0 }, combinedRateBps: 0, effectiveFrom, reason };

    const mode = body.mode === 'combined' ? 'combined' : 'separate';
    const svc = (key) => {
        const s = body[key] || {};
        const enabled = s.enabled !== false;
        return { enabled, rateBps: enabled ? parsePercentInput(s.rate, { field: `${key === 'food' ? 'Food' : 'Taxi'} commission %` }) : 0 };
    };
    if (mode === 'combined') {
        const combinedRateBps = parsePercentInput(body.combinedRate, { field: 'Combined commission %' });
        return { inherit: false, mode, food: { enabled: true, rateBps: combinedRateBps }, taxi: { enabled: true, rateBps: combinedRateBps }, combinedRateBps, effectiveFrom, reason };
    }
    return { inherit: false, mode, food: svc('food'), taxi: svc('taxi'), combinedRateBps: 0, effectiveFrom, reason };
}

/** Append a new version of the rule for a scope. Audited in the same transaction. */
export async function createRuleVersion({ scope, scopeId, body }, actor) {
    if (!SCOPES.includes(scope)) throw new MoneyError('Scope must be global, territory or franchise');
    await ensureGlobalRule();
    const target = await assertScopeTarget(scope, scopeId);
    const clean = parseRuleInput(body, scope);

    for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
            return await withTransaction(async (session) => {
                const last = await FranchiseCommissionRule.findOne({ scope, scopeId: target }).sort({ version: -1 }).session(session || null).lean();
                const [row] = await FranchiseCommissionRule.create([{
                    ...clean,
                    scope,
                    scopeId: target,
                    version: (last?.version || 0) + 1,
                    createdBy: actor?.id || null,
                    createdByName: actor?.name || actor?.email || '',
                }], opts(session));
                await writeAudit({
                    actor,
                    franchiseId: scope === 'franchise' ? target : null,
                    entity: 'commission_rule',
                    entityId: `${scope}:${target || 'global'}`,
                    action: 'rule.new_version',
                    before: ruleToDto(last),
                    after: ruleToDto(row.toObject()),
                    reason: clean.reason,
                }, { session });
                return ruleToDto(row.toObject());
            });
        } catch (err) {
            if (err?.code !== 11000 || attempt === 2) throw err; // two admins saved at once: take the next version number
        }
    }
    return null;
}

export async function listRuleVersions(scope, scopeId) {
    if (!SCOPES.includes(scope)) throw new MoneyError('Invalid scope');
    if (scope === 'global') await ensureGlobalRule();
    const target = scope === 'global' ? null : await assertScopeTarget(scope, scopeId);
    const rows = await FranchiseCommissionRule.find({ scope, scopeId: target }).sort({ version: -1 }).limit(100).lean();
    const now = new Date();
    const current = rows.find((r) => r.effectiveFrom <= now) || null;
    return {
        scope,
        scopeId: target,
        current: ruleToDto(current),
        scheduled: rows.filter((r) => r.effectiveFrom > now).map(ruleToDto),
        versions: rows.map(ruleToDto),
    };
}

/** What a franchise pays right now and where it comes from (for the admin UI). */
export async function effectiveRatesFor(franchiseId) {
    const app = await FranchiseApplication.findById(franchiseId).select('territoryId selectedModules').lean();
    if (!app) throw new MoneyError('Franchise not found', 404);
    const rates = await resolveRates(app, new Date());
    return {
        ...ratesToDto(rates),
        chain: {
            franchise: ruleToDto(rates.chain.franchise),
            territory: ruleToDto(rates.chain.territory),
            global: ruleToDto(rates.chain.global),
        },
    };
}
