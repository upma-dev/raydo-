import mongoose from 'mongoose';
import { sendResponse } from '../../../../utils/response.js';
import { ForbiddenError } from '../../../../core/auth/errors.js';
import { isSuperAdminLike } from '../../../../core/admin/adminHierarchy.service.js';
import { ADMIN_LEVELS } from '../../../../core/admin/adminHierarchy.constants.js';
import { actorOf, listAudit } from '../services/franchiseAudit.service.js';
import * as finance from '../services/franchiseFinance.service.js';
import * as charges from '../services/franchiseCharges.service.js';
import * as rules from '../services/commissionRules.service.js';
import * as territories from '../services/franchiseTerritory.service.js';
import { MoneyError } from '../services/franchiseMoney.js';

/**
 * Only the PLATFORM super admin may move or configure franchise money (create franchises, prices, commission,
 * payment confirmation, payouts, deposits). Food / Taxi module super admins can still view.
 * Identity comes from req.adminContext, which the middleware loaded from the database.
 */
export const requireFinanceAdmin = (req, _res, next) => {
    const ctx = req.adminContext || {};
    if (isSuperAdminLike(ctx) && ctx.adminLevel === ADMIN_LEVELS.PLATFORM_SUPERADMIN && !ctx.franchiseId) return next();
    return next(new ForbiddenError('Only the platform super admin can change franchise money or settings'));
};

const validId = (req, key = 'id') => {
    if (!mongoose.Types.ObjectId.isValid(String(req.params[key] || ''))) throw new MoneyError('Invalid id');
    return req.params[key];
};

const wrap = (fn, message, code = 200) => async (req, res, next) => {
    try {
        return sendResponse(res, code, message, await fn(req));
    } catch (err) {
        next(err);
    }
};

// ---- finance views ----
export const getFinanceSummary = wrap((req) => finance.getFinanceSummary(req.query), 'Franchise finance summary');
export const getFranchiseFinance = wrap((req) => finance.getFranchiseFinance(validId(req), req.query), 'Franchise finance');
export const getFinanceEntries = wrap((req) => finance.getFinanceEntries(validId(req), req.query), 'Finance entries');
export const getReconciliation = wrap((req) => finance.reconcileFranchise(validId(req)), 'Reconciliation report');
export const fixReconciliation = wrap((req) => finance.fixReconciliation(validId(req), actorOf(req), req.body?.reason), 'Reconciliation repaired');
export const getAuditLog = wrap((req) => listAudit({ franchiseId: validId(req), page: req.query.page, limit: req.query.limit }), 'Audit log');

// ---- fees & deposit ----
export const listCharges = wrap((req) => charges.listCharges(validId(req)), 'Charges');
export const confirmChargePayment = wrap((req) => charges.confirmPayment(validId(req, 'chargeId'), {
    amount: req.body?.amount, reference: req.body?.reference, method: req.body?.method, paidAt: req.body?.paidAt, note: req.body?.note, provider: 'manual',
}, actorOf(req)), 'Payment recorded');
export const waiveCharge = wrap((req) => charges.waiveCharge(validId(req, 'chargeId'), { reason: req.body?.reason }, actorOf(req)), 'Charge waived');
export const updateChargeAmount = wrap((req) => charges.updateExpected(validId(req, 'chargeId'), { amount: req.body?.amount, reason: req.body?.reason }, actorOf(req)), 'Amount updated');
export const refundDeposit = wrap((req) => charges.refundDeposit(validId(req, 'chargeId'), { amount: req.body?.amount, reference: req.body?.reference, reason: req.body?.reason }, actorOf(req)), 'Deposit refunded');
export const deductDeposit = wrap((req) => charges.deductDeposit(validId(req, 'chargeId'), { amount: req.body?.amount, reason: req.body?.reason }, actorOf(req)), 'Deposit deducted');

// ---- commission rules ----
const ruleScope = (req) => {
    const scope = String(req.params.scope || req.query.scope || '');
    if (!['global', 'territory', 'franchise'].includes(scope)) throw new MoneyError('Scope must be global, territory or franchise');
    const scopeId = scope === 'global' ? null : (req.params.scopeId || req.query.scopeId);
    return { scope, scopeId };
};
export const listRuleVersions = wrap((req) => {
    const { scope, scopeId } = ruleScope(req);
    return rules.listRuleVersions(scope, scopeId);
}, 'Commission rules');
export const createRuleVersion = wrap((req) => {
    const { scope, scopeId } = ruleScope(req);
    return rules.createRuleVersion({ scope, scopeId, body: req.body || {} }, actorOf(req));
}, 'Commission rule saved', 201);
export const getEffectiveRates = wrap((req) => rules.effectiveRatesFor(validId(req)), 'Effective commission');

// ---- territories ----
export const listTerritories = wrap(() => territories.listTerritories(), 'Territories');
export const listZoneOptions = wrap(() => territories.listZoneOptions(), 'Zones');
export const createTerritory = wrap((req) => territories.createTerritory(req.body || {}, actorOf(req)), 'Territory created', 201);
export const updateTerritory = wrap((req) => territories.updateTerritory(validId(req, 'territoryId'), req.body || {}, actorOf(req)), 'Territory updated');
