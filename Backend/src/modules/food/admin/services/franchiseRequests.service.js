import mongoose from 'mongoose';
import crypto from 'crypto';
import FranchiseApplication from '../models/franchiseApplication.model.js';
import FranchiseTerritory from '../models/franchiseTerritory.model.js';
import { normalizeModules } from './franchisePlan.js';
import { writeAudit } from './franchiseAudit.service.js';
import { changeTerritory } from './franchise.service.js';
import { suspendFranchise } from './franchiseOverview.service.js';
import { notifyAdminsSafely, sendNotificationToOwners } from '../../../../core/notifications/firebase.service.js';
import { logger } from '../../../../utils/logger.js';

/**
 * Requests a franchise partner sends to the admin: change of zone, or closing (deactivating) the account.
 * Nothing changes until a super admin approves it.
 */

export class RequestError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const TYPES = ['zone_change', 'deactivate'];
const TYPE_LABEL = { zone_change: 'zone change', deactivate: 'account deactivation' };

const requestDto = (r, territoryNames = new Map()) => ({
    requestId: r.requestId,
    type: r.type,
    status: r.status,
    reason: r.reason,
    requestedTerritoryId: r.requestedTerritoryId || null,
    requestedTerritoryName: r.requestedTerritoryId ? territoryNames.get(String(r.requestedTerritoryId)) || '' : '',
    adminNote: r.adminNote || '',
    requestedAt: r.requestedAt,
    decidedAt: r.decidedAt || null,
});

async function territoryNamesFor(requests = []) {
    const ids = [...new Set(requests.map((r) => r.requestedTerritoryId).filter(Boolean).map(String))];
    if (!ids.length) return new Map();
    const rows = await FranchiseTerritory.find({ _id: { $in: ids } }).select('name city').lean();
    return new Map(rows.map((t) => [String(t._id), t.name]));
}

async function safeNotify(fn) {
    try { await fn(); } catch (e) { logger.warn(`franchise request notification failed: ${e?.message || e}`); }
}

/** Everything the partner can see about its own account, plus the zones it may ask to move to. */
export async function getPartnerProfile(franchiseId) {
    if (!isId(franchiseId)) throw new RequestError('Franchise login required', 401);
    const app = await FranchiseApplication.findById(franchiseId)
        .select('applicantName companyName applicationId email phone state city area pincode selectedModules territoryId zoneId taxiZoneId accountStatus status createdAt documents changeRequests payoutCycle minPayoutThreshold')
        .lean();
    if (!app) throw new RequestError('Franchise account not found', 404);

    const mods = normalizeModules(app.selectedModules);
    const FoodRestaurant = mongoose.models.FoodRestaurant;
    const [territory, restaurants, options] = await Promise.all([
        app.territoryId ? FranchiseTerritory.findById(app.territoryId).select('name city').lean() : null,
        FoodRestaurant ? FoodRestaurant.countDocuments({ franchiseId: app._id }) : 0,
        FranchiseTerritory.find({ isActive: { $ne: false }, _id: { $ne: app.territoryId || null } }).select('name city foodZoneId taxiZoneId').sort({ name: 1 }).lean(),
    ]);
    const fits = (t) => (!mods.includes('food') || t.foodZoneId) && (!mods.includes('taxi') || t.taxiZoneId);
    const requests = [...(app.changeRequests || [])].sort((a, b) => new Date(b.requestedAt) - new Date(a.requestedAt));
    const names = await territoryNamesFor(requests);

    return {
        franchise: {
            id: app._id, applicationId: app.applicationId, name: app.applicantName, companyName: app.companyName || '',
            email: app.email, phone: app.phone, state: app.state, city: app.city, area: app.area || '', pincode: app.pincode || '',
            services: mods, accountStatus: app.accountStatus || 'active', joinedAt: app.createdAt,
            payoutCycle: app.payoutCycle, minPayoutThreshold: app.minPayoutThreshold,
            documents: (app.documents || []).map((d) => ({ key: d.key, label: d.label, url: d.url })),
        },
        zone: territory ? { id: String(territory._id), _id: String(territory._id), name: territory.name, city: territory.city || '' } : (app.zoneId ? { id: String(app.zoneId), _id: String(app.zoneId), name: app.city || app.area || 'Franchise Zone', city: app.city || '' } : null),
        restaurantCount: restaurants,
        zoneOptions: options.filter(fits).map((t) => ({ id: t._id, name: t.name, city: t.city || '' })),
        requests: requests.map((r) => requestDto(r, names)),
    };
}

export async function createRequest(franchiseId, { type, reason, territoryId } = {}, actor = {}) {
    if (!isId(franchiseId)) throw new RequestError('Franchise login required', 401);
    if (!TYPES.includes(type)) throw new RequestError('Unknown request type');
    const why = String(reason || '').trim().slice(0, 500);
    if (why.length < 5) throw new RequestError('Please explain the reason (at least 5 characters)');

    const app = await FranchiseApplication.findById(franchiseId);
    if (!app || app.archived || (app.accountStatus || 'active') !== 'active') throw new RequestError('This franchise account is not active', 403);
    if ((app.changeRequests || []).some((r) => r.type === type && r.status === 'pending')) {
        throw new RequestError('You already have a pending request of this kind. Please wait for the admin.', 409);
    }

    let requestedTerritoryId = null;
    let territoryName = '';
    if (type === 'zone_change') {
        if (!isId(territoryId)) throw new RequestError('Choose the zone you want to move to');
        const t = await FranchiseTerritory.findById(territoryId).select('name isActive foodZoneId taxiZoneId').lean();
        if (!t || t.isActive === false) throw new RequestError('That zone is not available');
        if (String(app.territoryId || '') === String(t._id)) throw new RequestError('You are already in this zone');
        const mods = normalizeModules(app.selectedModules);
        if ((mods.includes('food') && !t.foodZoneId) || (mods.includes('taxi') && !t.taxiZoneId)) throw new RequestError('That zone does not support your services');
        requestedTerritoryId = t._id;
        territoryName = t.name;
    }

    const requestId = `REQ-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
    app.changeRequests.push({ requestId, type, reason: why, requestedTerritoryId, status: 'pending', requestedAt: new Date() });
    await app.save();

    await writeAudit({
        actor, franchiseId: app._id, entity: 'franchise', entityId: app._id, action: `franchise.request.${type}`,
        after: { requestId, territory: territoryName || undefined }, reason: why,
    });
    await safeNotify(() => notifyAdminsSafely({
        title: `Franchise ${TYPE_LABEL[type]} request`,
        body: `${app.applicantName} (${app.applicationId}) asked for ${TYPE_LABEL[type]}${territoryName ? ` to ${territoryName}` : ''}.`,
        data: { type: 'franchise_request', link: `/admin/food/franchise-management/${app._id}?tab=requests` },
    }));
    return getPartnerProfile(app._id);
}

/** Admin decision. Approving a zone change moves the franchise; approving a deactivation suspends it and tells its restaurants. */
export async function decideRequest(franchiseId, requestId, { decision, note } = {}, actor = {}) {
    if (!['approve', 'reject'].includes(decision)) throw new RequestError('Decision must be approve or reject');
    const app = await FranchiseApplication.findById(franchiseId);
    if (!app) throw new RequestError('Franchise not found', 404);
    const req = (app.changeRequests || []).find((r) => r.requestId === requestId);
    if (!req) throw new RequestError('Request not found', 404);
    if (req.status !== 'pending') throw new RequestError('This request is already decided', 409);
    const adminNote = String(note || '').trim().slice(0, 500);

    if (decision === 'approve') {
        if (req.type === 'zone_change') {
            await changeTerritory(app._id, { territoryId: req.requestedTerritoryId, reason: `Partner request: ${req.reason}` }, actor);
        } else {
            await suspendFranchise(app._id, `Deactivated on partner request: ${req.reason}`, actor);
        }
    }

    // changeTerritory / suspendFranchise saved the document, so load it again before marking the request
    const fresh = await FranchiseApplication.findById(franchiseId);
    const target = fresh.changeRequests.find((r) => r.requestId === requestId);
    target.status = decision === 'approve' ? 'approved' : 'rejected';
    target.adminNote = adminNote;
    target.decidedAt = new Date();
    target.decidedBy = actor?.id || null;
    await fresh.save();

    await writeAudit({
        actor, franchiseId: fresh._id, entity: 'franchise', entityId: fresh._id, action: `franchise.request.${decision}`,
        after: { requestId, type: target.type }, reason: adminNote || target.reason,
    });

    if (decision === 'approve' && target.type === 'deactivate') {
        await safeNotify(async () => {
            const FoodRestaurant = mongoose.models.FoodRestaurant;
            if (!FoodRestaurant) return;
            const rows = await FoodRestaurant.find({ franchiseId: fresh._id }).select('_id').lean();
            if (!rows.length) return;
            await sendNotificationToOwners(rows.map((r) => ({ ownerType: 'RESTAURANT', ownerId: r._id })), {
                title: 'Your franchise partner has deactivated their account',
                body: 'Your franchise partner is no longer active. Raydo support will contact you about the next steps. Your orders and menu are not affected.',
                data: { type: 'franchise_deactivated', link: '/food/restaurant' },
            });
        });
    }
    return { requestId, status: target.status };
}
