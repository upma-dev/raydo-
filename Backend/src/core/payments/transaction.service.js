import mongoose from 'mongoose';
import { Transaction } from './models/transaction.model.js';
import { FoodUserWallet } from '../../modules/food/user/models/userWallet.model.js';
import { FoodRestaurantWallet } from '../../modules/food/restaurant/models/restaurantWallet.model.js';
import { FoodDeliveryWallet } from '../../modules/food/delivery/models/deliveryWallet.model.js';
import { FoodAdminWallet } from '../../modules/food/admin/models/adminWallet.model.js';
import { logger } from '../../utils/logger.js';

/**
 * Resolve the wallet model + id-field for a given entity.
 * Returns { Model, filter } so callers can findOne/updateOne generically.
 */
function resolveWallet(entityType, entityId) {
    switch (entityType) {
        case 'user': {
            const id = new mongoose.Types.ObjectId(entityId);
            return { Model: FoodUserWallet, filter: { userId: id }, idField: 'userId' };
        }
        case 'restaurant': {
            const id = new mongoose.Types.ObjectId(entityId);
            return { Model: FoodRestaurantWallet, filter: { restaurantId: id }, idField: 'restaurantId' };
        }
        case 'deliveryBoy': {
            const id = new mongoose.Types.ObjectId(entityId);
            return { Model: FoodDeliveryWallet, filter: { deliveryPartnerId: id }, idField: 'deliveryPartnerId' };
        }
        case 'admin':
            return { Model: FoodAdminWallet, filter: { key: 'platform' }, idField: 'key' };
        default:
            throw new Error(`Unknown entityType: ${entityType}`);
    }
}

const round2 = (value) => Math.round((Number(value) || 0) * 100) / 100;

/** Thrown when a posting with the same dedupeKey already exists: the money was already moved once. */
export class DuplicateTransactionError extends Error {
    constructor(dedupeKey) {
        super(`Transaction already recorded (${dedupeKey})`);
        this.name = 'DuplicateTransactionError';
        this.code = 'DUPLICATE_TRANSACTION';
        this.dedupeKey = dedupeKey;
    }
}

/** Fixed ObjectId for admin entity used in Transaction documents (singleton) */
const ADMIN_ENTITY_OID = new mongoose.Types.ObjectId('000000000000000000000001');

/**
 * Ensure wallet exists, creating it if needed. Returns the wallet document.
 */
export async function ensureWallet(entityType, entityId) {
    const { Model, filter, idField } = resolveWallet(entityType, entityId);
    let wallet = await Model.findOne(filter);
    if (!wallet) {
        const createPayload = { ...filter, balance: 0 };
        wallet = await Model.create(createPayload);
    }
    return wallet;
}

/**
 * Get balance for an entity wallet.
 */
export async function getBalance(entityType, entityId) {
    const wallet = await ensureWallet(entityType, entityId);
    return {
        balance: Number(wallet.balance) || 0,
        lockedAmount: Number(wallet.lockedAmount) || 0,
        availableBalance: (Number(wallet.balance) || 0) - (Number(wallet.lockedAmount) || 0)
    };
}

/**
 * CORE ATOMIC OPERATION: Record a transaction AND update wallet balance
 * in a single MongoDB transaction. This is the ONLY way to change wallet balances.
 *
 * @param {Object} payload
 * @param {string} payload.entityType - 'user' | 'restaurant' | 'deliveryBoy' | 'admin'
 * @param {string} payload.entityId - ObjectId of the entity
 * @param {string} payload.type - 'credit' | 'debit'
 * @param {number} payload.amount - positive amount
 * @param {string} payload.description - human readable
 * @param {string} [payload.category] - transaction category
 * @param {string} [payload.orderId] - linked order
 * @param {string} [payload.paymentId] - linked payment
 * @param {Object} [payload.metadata] - extra data
 * @returns {Object} { transaction, wallet }
 */
export async function recordTransaction(payload) {
    // Two postings to the same wallet at the same moment conflict inside MongoDB (WriteConflict, labelled
    // TransientTransactionError). The database's own advice is "retry": without it one of the two payouts is simply lost.
    const MAX_ATTEMPTS = 8;
    for (let attempt = 1; ; attempt += 1) {
        try {
            return await recordTransactionOnce(payload);
        } catch (err) {
            const transient = err?.code === 112
                || err?.hasErrorLabel?.('TransientTransactionError')
                || err?.errorLabelSet?.has?.('TransientTransactionError');
            if (!transient || attempt >= MAX_ATTEMPTS) throw err;
            await new Promise((resolve) => setTimeout(resolve, 10 * attempt + Math.random() * 30));
        }
    }
}

async function recordTransactionOnce(payload) {
    const {
        entityType, entityId, type,
        description = '', category = 'other',
        orderId = null, paymentId = null,
        metadata = undefined, module = 'food',
        allowNegative = false,  // reversals must always succeed, even if the wallet was already paid out
        dedupeKey = null        // same key twice = second call throws DuplicateTransactionError and moves nothing
    } = payload;

    if (!['credit', 'debit'].includes(type)) throw new Error('type must be credit or debit');
    // Money is always whole paise: this stops float drift (0.1 + 0.2) from building up in wallets
    const amount = round2(payload.amount);
    if (!Number.isFinite(amount) || amount <= 0) throw new Error('amount must be positive');

    const { Model, filter } = resolveWallet(entityType, entityId);

    let session = null;
    let useTransaction = true;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
    } catch (sessionErr) {
        useTransaction = false;
        if (session) {
            try { session.endSession(); } catch (e) {}
            session = null;
        }
    }

    try {
        const sessionOption = useTransaction && session ? { session } : {};
        const createSessionOption = useTransaction && session ? { session } : undefined;

        // 1. Ensure wallet exists
        let wallet = await Model.findOne(filter, null, sessionOption);
        if (!wallet) {
            if (useTransaction && session) {
                [wallet] = await Model.create([{ ...filter, balance: 0 }], createSessionOption);
            } else {
                wallet = await Model.create({ ...filter, balance: 0 });
            }
        }

        // 2. Pre-check for a clean error message (the real guard is the atomic update in step 4)
        const currentBalance = Number(wallet.balance) || 0;
        const delta = type === 'credit' ? amount : -amount;
        if (type === 'debit' && entityType !== 'admin' && !allowNegative && currentBalance < amount) {
            throw new Error(`Insufficient balance. Current: ${currentBalance}, Debit: ${amount}`);
        }

        // 3. Ledger row FIRST. If its validation fails nothing has touched the wallet yet.
        const entityOid = entityType === 'admin'
            ? ADMIN_ENTITY_OID
            : new mongoose.Types.ObjectId(entityId);

        const txnPayload = {
            paymentId: paymentId ? new mongoose.Types.ObjectId(paymentId) : null,
            orderId: orderId ? new mongoose.Types.ObjectId(orderId) : null,
            entityType,
            entityId: entityOid,
            type,
            amount,
            balanceAfter: currentBalance + delta,   // informational; the wallet balance itself is changed atomically below
            currency: 'INR',
            status: 'completed',
            description,
            category,
            module,
            metadata,
            ...(dedupeKey ? { dedupeKey: String(dedupeKey) } : {})
        };

        let txn = null;
        try {
            if (useTransaction && session) {
                const [createdTxn] = await Transaction.create([txnPayload], createSessionOption);
                txn = createdTxn;
            } else {
                txn = await Transaction.create(txnPayload);
            }
        } catch (createErr) {
            if (dedupeKey && createErr?.code === 11000) throw new DuplicateTransactionError(dedupeKey);
            throw createErr;
        }

        // 4. Change the balance ATOMICALLY with $inc (never read-modify-write: two credits at the same moment
        //    used to overwrite each other). A debit is guarded inside the same update so it cannot go negative.
        const incOps = { balance: delta };
        if (type === 'credit') {
            if (entityType === 'restaurant' || entityType === 'deliveryBoy') incOps.totalEarnings = amount;
            else if (entityType === 'admin') incOps.totalRevenue = amount;
        }
        const guardedFilter = (type === 'debit' && entityType !== 'admin' && !allowNegative)
            ? { ...filter, balance: { $gte: amount } }
            : filter;

        const updatedWallet = await Model.findOneAndUpdate(guardedFilter, { $inc: incOps }, { new: true, ...sessionOption });
        if (!updatedWallet) {
            if (!(useTransaction && session) && txn?._id) {
                await Transaction.deleteOne({ _id: txn._id }).catch(() => {});   // no DB transaction to roll back: undo the row
            }
            throw new Error(`Insufficient balance for debit of ${amount}`);
        }
        const newBalance = round2(updatedWallet.balance);
        // The ledger row was written before the atomic $inc, so its balanceAfter came from a possibly stale read.
        // Now that the real post-update balance is known, store that one.
        if (txn?._id && txn.balanceAfter !== newBalance) {
            await Transaction.updateOne({ _id: txn._id }, { $set: { balanceAfter: newBalance } }, sessionOption);
            txn.balanceAfter = newBalance;
        }

        if (useTransaction && session) {
            await session.commitTransaction();
        }

        logger.info(`Transaction recorded: ${type} ${amount} INR for ${entityType}:${entityId} → balance ${newBalance}`);

        return {
            transaction: typeof txn?.toObject === 'function' ? txn.toObject() : txn,
            wallet: { balance: newBalance }
        };
    } catch (err) {
        if (useTransaction && session) {
            try { await session.abortTransaction(); } catch (e) {}
        }
        const expected = err instanceof DuplicateTransactionError || err?.code === 112;
        if (!expected) logger.error(`recordTransaction failed: ${err.message}`);
        throw err;
    } finally {
        if (useTransaction && session) {
            try { session.endSession(); } catch (e) {}
        }
    }
}

/**
 * List transactions for an entity with pagination.
 */
export async function getTransactionsByEntity(entityType, entityId, { page = 1, limit = 20 } = {}) {
    const skip = (Math.max(1, page) - 1) * limit;
    const entityOid = entityType === 'admin'
        ? ADMIN_ENTITY_OID
        : new mongoose.Types.ObjectId(entityId);
    const filter = {
        entityType,
        entityId: entityOid
    };

    const [docs, total] = await Promise.all([
        Transaction.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        Transaction.countDocuments(filter)
    ]);

    return {
        transactions: docs,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit)
    };
}

/**
 * Get transactions for a specific order across all entities.
 */
export async function getTransactionsByOrder(orderId) {
    return Transaction.find({ orderId: new mongoose.Types.ObjectId(orderId) })
        .sort({ createdAt: -1 })
        .lean();
}
