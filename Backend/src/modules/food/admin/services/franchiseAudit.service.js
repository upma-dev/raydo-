import FranchiseAuditLog from '../models/franchiseAuditLog.model.js';

/** Actor snapshot from req.adminContext (what the auth middleware loaded from the DB, never from the request body). */
export const actorOf = (req) => {
    const ctx = req?.adminContext || {};
    return {
        id: ctx.id || null,
        name: ctx.name || '',
        email: ctx.email || '',
        level: ctx.adminLevel || '',
        ip: String(req?.ip || req?.headers?.['x-forwarded-for'] || '').slice(0, 64),
    };
};

/** Strip values that must never be copied into the audit trail. */
const SECRET_KEYS = new Set(['password', 'accountNumber', 'resetPasswordOtp']);
function scrub(value, depth = 0) {
    if (value === null || value === undefined || depth > 4) return value ?? null;
    if (Array.isArray(value)) return value.slice(0, 50).map((v) => scrub(v, depth + 1));
    if (value instanceof Date) return value;
    if (typeof value === 'object') {
        if (typeof value.toHexString === 'function') return String(value);
        const out = {};
        Object.entries(value).forEach(([k, v]) => {
            out[k] = SECRET_KEYS.has(k) ? (v ? '***' : v) : scrub(v, depth + 1);
        });
        return out;
    }
    return value;
}

/**
 * Write one audit row. Accepts a session so the audit row commits/aborts with the change it describes.
 * Throws on failure: a financial change that cannot be audited must not happen.
 */
export async function writeAudit({ actor = {}, franchiseId = null, entity, entityId = '', action, before = null, after = null, reason = '' }, { session } = {}) {
    const [row] = await FranchiseAuditLog.create([{
        franchiseId,
        entity,
        entityId: String(entityId || ''),
        action,
        before: scrub(before),
        after: scrub(after),
        reason: String(reason || '').slice(0, 500),
        actor: { id: actor.id || null, name: actor.name || '', email: actor.email || '', level: actor.level || '' },
        ip: actor.ip || '',
    }], session ? { session } : undefined);
    return row;
}

export async function listAudit({ franchiseId, entity, entityId, page = 1, limit = 30 } = {}) {
    const p = Math.max(1, parseInt(page, 10) || 1);
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const filter = {};
    if (franchiseId) filter.franchiseId = franchiseId;
    if (entity) filter.entity = entity;
    if (entityId) filter.entityId = String(entityId);
    const [items, total] = await Promise.all([
        FranchiseAuditLog.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l).lean(),
        FranchiseAuditLog.countDocuments(filter),
    ]);
    return { items, total, page: p, limit: l };
}
