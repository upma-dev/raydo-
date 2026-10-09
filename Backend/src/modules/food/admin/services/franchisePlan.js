/**
 * Franchise plan helper — the ONE place that defines how fees / commissions are keyed.
 *
 * A franchise holds one or both modules: 'food', 'taxi'.
 * Fees and commissions are configured at exactly three keys:
 *   food  -> franchise holds food only
 *   taxi  -> franchise holds taxi only
 *   both  -> franchise holds food + taxi (one combined fee / one combined commission %)
 */

export const FRANCHISE_MODULES = ['food', 'taxi'];
export const PLAN_KEYS = ['food', 'taxi', 'both'];

export const DEFAULT_FEES = { food: 50000, taxi: 50000, both: 80000 };
export const DEFAULT_COMMISSIONS = { food: 10, taxi: 10, both: 10 };

/** Maps any legacy value (taxiDriver, taxiFleet, ...) to 'taxi'; keeps only valid modules; defaults to ['food']. */
export function normalizeModules(list) {
    const out = new Set();
    (Array.isArray(list) ? list : []).forEach((m) => {
        const v = String(m || '').trim();
        if (v === 'food') out.add('food');
        else if (v === 'taxi' || v.startsWith('taxi')) out.add('taxi');
    });
    return out.size ? FRANCHISE_MODULES.filter((m) => out.has(m)) : ['food'];
}

export function getPlanKey(modules) {
    const mods = normalizeModules(modules);
    return mods.length === 2 ? 'both' : mods[0];
}

/** Returns a clean {food, taxi, both} map; falls back to defaults (and to legacy taxi* keys). */
export function normalizeAmountMap(input, defaults) {
    const src = input && typeof input.toObject === 'function' ? input.toObject() : (input || {});
    const num = (v, d) => (Number.isFinite(Number(v)) && v !== '' && v !== null && v !== undefined ? Number(v) : d);
    return {
        food: num(src.food, defaults.food),
        taxi: num(src.taxi ?? src.taxiDriver, defaults.taxi),
        both: num(src.both, defaults.both),
    };
}

export const normalizeFees = (input) => normalizeAmountMap(input, DEFAULT_FEES);
export const normalizeCommissions = (input) => normalizeAmountMap(input, DEFAULT_COMMISSIONS);

/** Onboarding fee for the chosen modules. */
export function getFranchiseFee(modules, fees) {
    return normalizeFees(fees)[getPlanKey(modules)];
}

/** Commission % that applies to `module` for a franchise holding `modules`. */
export function getCommissionRate(modules, commissions, module) {
    const map = normalizeCommissions(commissions);
    return getPlanKey(modules) === 'both' ? map.both : map[module];
}

export const roundMoney = (n) => Math.round((Number(n) || 0) * 100) / 100;
