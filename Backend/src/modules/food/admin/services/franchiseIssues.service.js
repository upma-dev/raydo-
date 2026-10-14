import mongoose from 'mongoose';
import { FoodSupportTicket } from '../../user/models/supportTicket.model.js';
import { FoodRestaurantSupportTicket } from '../../restaurant/models/supportTicket.model.js';
import { writeAudit } from './franchiseAudit.service.js';
import { notifyAdminsSafely } from '../../../../core/notifications/firebase.service.js';
import { logger } from '../../../../utils/logger.js';

/**
 * ISSUES of a franchise zone: complaints / support tickets raised by users and restaurants of the zone.
 * The franchise partner sees and answers them; the admin sees the same tickets (and the partner's answer) in the support desk.
 */

export class IssueError extends Error {
    constructor(message, statusCode = 400) {
        super(message);
        this.statusCode = statusCode;
    }
}

const isId = (v) => mongoose.Types.ObjectId.isValid(String(v || ''));
const STATUSES = ['open', 'in-progress', 'resolved'];

/** Franchise that owns the restaurant (null when the restaurant is not under a franchise). */
export async function franchiseIdForRestaurant(restaurantId) {
    try {
        if (!isId(restaurantId)) return null;
        const FoodRestaurant = mongoose.models.FoodRestaurant;
        if (!FoodRestaurant) return null;
        const r = await FoodRestaurant.findById(restaurantId).select('franchiseId').lean();
        return r?.franchiseId || null;
    } catch {
        return null;
    }
}

/** Push to the franchise portal logins (and super admins). Never blocks or fails the ticket. */
export function notifyFranchiseOfTicket(franchiseId, title, body) {
    if (!franchiseId) return;
    notifyAdminsSafely({
        title,
        body: String(body || 'A new issue was raised in your zone').slice(0, 160),
        franchiseId: String(franchiseId),
        data: { type: 'franchise_issue', link: '/food/franchise/dashboard/food/issues' },
    }, { franchiseId: String(franchiseId) }).catch((e) => logger.warn(`franchise issue notification failed: ${e?.message || e}`));
}

async function scopeFor(franchiseId) {
    if (!isId(franchiseId)) throw new IssueError('Franchise login required', 401);
    const FoodRestaurant = mongoose.models.FoodRestaurant;
    const ids = FoodRestaurant ? await FoodRestaurant.find({ franchiseId }).distinct('_id') : [];
    return { $or: [{ franchiseId: new mongoose.Types.ObjectId(String(franchiseId)) }, { restaurantId: { $in: ids } }] };
}

const dto = (source, t, restaurants, users) => ({
    id: t._id,
    source,
    status: t.status,
    issueType: t.issueType,
    subject: t.subject || '',
    description: t.description || '',
    category: t.category || t.type || '',
    priority: t.priority || '',
    orderRef: t.orderRef || '',
    restaurantName: restaurants.get(String(t.restaurantId)) || '',
    raisedBy: source === 'user' ? (users.get(String(t.userId)) || 'Customer') : (restaurants.get(String(t.restaurantId)) || 'Restaurant'),
    adminResponse: t.adminResponse || '',
    franchiseResponse: t.franchiseResponse || '',
    franchiseRespondedAt: t.franchiseRespondedAt || null,
    createdAt: t.createdAt,
});

export async function listIssues(franchiseId, { status, source = 'all', page = 1, limit = 30 } = {}) {
    const scope = await scopeFor(franchiseId);
    const filter = { ...scope };
    if (STATUSES.includes(status)) filter.status = status;
    const l = Math.min(100, Math.max(1, parseInt(limit, 10) || 30));
    const p = Math.max(1, parseInt(page, 10) || 1);

    const wantUser = source === 'all' || source === 'user';
    const wantRest = source === 'all' || source === 'restaurant';
    const take = p * l;
    const [users, usersTotal, rests, restsTotal, openUser, openRest] = await Promise.all([
        wantUser ? FoodSupportTicket.find(filter).sort({ createdAt: -1 }).limit(take).lean() : [],
        wantUser ? FoodSupportTicket.countDocuments(filter) : 0,
        wantRest ? FoodRestaurantSupportTicket.find(filter).sort({ createdAt: -1 }).limit(take).lean() : [],
        wantRest ? FoodRestaurantSupportTicket.countDocuments(filter) : 0,
        FoodSupportTicket.countDocuments({ ...scope, status: 'open' }),
        FoodRestaurantSupportTicket.countDocuments({ ...scope, status: 'open' }),
    ]);

    const FoodRestaurant = mongoose.models.FoodRestaurant;
    const FoodUser = mongoose.models.FoodUser;
    const restIds = [...new Set([...users, ...rests].map((t) => t.restaurantId).filter(Boolean).map(String))];
    const userIds = [...new Set(users.map((t) => t.userId).filter(Boolean).map(String))];
    const [restRows, userRows] = await Promise.all([
        FoodRestaurant && restIds.length ? FoodRestaurant.find({ _id: { $in: restIds } }).select('restaurantName').lean() : [],
        FoodUser && userIds.length ? FoodUser.find({ _id: { $in: userIds } }).select('name').lean() : [],
    ]);
    const restaurants = new Map(restRows.map((r) => [String(r._id), r.restaurantName]));
    const userNames = new Map(userRows.map((u) => [String(u._id), u.name]));

    const merged = [
        ...users.map((t) => dto('user', t, restaurants, userNames)),
        ...rests.map((t) => dto('restaurant', t, restaurants, userNames)),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice((p - 1) * l, p * l);

    return { items: merged, total: usersTotal + restsTotal, page: p, limit: l, openCount: openUser + openRest };
}

export async function respondIssue(franchiseId, source, id, { status, response } = {}, actor = {}) {
    const scope = await scopeFor(franchiseId);
    if (!isId(id)) throw new IssueError('Issue not found', 404);
    const Model = source === 'restaurant' ? FoodRestaurantSupportTicket : FoodSupportTicket;
    const set = {};
    if (STATUSES.includes(status)) set.status = status;
    if (typeof response === 'string') {
        const text = response.trim().slice(0, 1000);
        if (!text) throw new IssueError('Write a reply first');
        set.franchiseResponse = text;
        set.franchiseRespondedAt = new Date();
    }
    if (!Object.keys(set).length) throw new IssueError('Nothing to update');

    // the scope guard means a franchise can only touch tickets of its own zone
    const updated = await Model.findOneAndUpdate({ _id: id, ...scope }, { $set: set }, { new: true }).lean();
    if (!updated) throw new IssueError('Issue not found', 404);
    await writeAudit({
        actor, franchiseId, entity: 'support_ticket', entityId: updated._id, action: 'issue.respond',
        after: { source, status: updated.status }, reason: set.franchiseResponse || '',
    });
    return { id: updated._id, status: updated.status, franchiseResponse: updated.franchiseResponse || '' };
}

