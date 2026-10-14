import mongoose from 'mongoose';

const isNoReplicaSet = (err) =>
    err?.code === 20 || /Transaction numbers are only allowed|replica set/i.test(String(err?.message || ''));

/**
 * Run `fn(session)` inside a MongoDB transaction (retried by the driver on transient errors, so `fn` must only do DB
 * work). Production runs on a replica set (Atlas). On a standalone dev server transactions do not exist: we then run
 * without one and say so in the log; the ledger's unique indexes still prevent double posting there.
 */
export async function withTransaction(fn) {
    const session = await mongoose.startSession();
    try {
        let result;
        await session.withTransaction(async () => {
            result = await fn(session);
        });
        return result;
    } catch (err) {
        if (!isNoReplicaSet(err)) throw err;
        console.warn('[FranchiseFinance] MongoDB has no replica set: running without a transaction');
        return fn(null);
    } finally {
        await session.endSession();
    }
}

export const opts = (session) => (session ? { session } : {});
