import mongoose from 'mongoose';
import { FranchiseCommissionRule } from './franchiseCommissionRule.model.js';
import { FranchiseLedger } from './franchiseLedger.model.js';
import { FranchiseWallet } from './franchiseWallet.model.js';
import { logger } from '../../utils/logger.js';

/**
 * Calculates and posts the franchise commission into the ledger and wallet safely.
 * @param {Object} transaction - The transaction object (FoodOrder or TaxiRide)
 * @param {String} sourceType - 'FOOD_ORDER' | 'TAXI_RIDE'
 */
export async function calculateAndPostCommission(transaction, sourceType) {
    if (!transaction.franchiseId || !transaction.territoryId) {
        logger.info(`Skipping commission for ${sourceType} ${transaction._id}: Platform Global Transaction (No Franchise).`);
        return null;
    }

    // Determine values safely based on Service Type
    let grossAmount = 0;
    let commissionableAmount = 0;
    let partnerShare = 0;
    let serviceType = '';

    if (sourceType === 'FOOD_ORDER') {
        serviceType = 'FOOD';
        grossAmount = Number(transaction.pricing?.total) || 0;
        
        // The commissionable amount is the platform profit (platform fee + restaurant commission)
        // Delivery fee & surge go directly to driver in Raydo architecture.
        commissionableAmount = Number(transaction.pricing?.platformNetProfit) || 0; 
        
        // Partner share here means Restaurant Share (net of commission) + Driver share
        partnerShare = (Number(transaction.pricing?.restaurantShare) || 0) + (Number(transaction.pricing?.riderEarning) || 0);

    } else if (sourceType === 'TAXI_RIDE') {
        serviceType = 'TAXI';
        grossAmount = Number(transaction.fare) || 0;
        
        // Commissionable amount for taxi is the platform fee collected
        commissionableAmount = Number(transaction.commissionAmount) || 0; 
        
        partnerShare = Number(transaction.driverEarnings) || 0;
    } else {
        throw new Error(`Unsupported sourceType: ${sourceType}`);
    }

    if (commissionableAmount <= 0) {
        logger.info(`Skipping commission for ${sourceType} ${transaction._id}: Zero commissionable amount.`);
        return null;
    }

    let session = null;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
    } catch (e) {
        throw new Error('FINANCIAL BLOCKER: MongoDB Transactions are unavailable. A ReplicaSet must be configured to process financial ledgers atomically.');
    }

    try {
        const sessionOption = { session };

        // 1. Fetch Effective Rule
        const rule = await FranchiseCommissionRule.findOne({
            franchiseId: transaction.franchiseId,
            serviceType,
            status: 'ACTIVE'
        }).session(session).lean();

        if (!rule) {
            logger.warn(`No active commission rule found for Franchise ${transaction.franchiseId} and Service ${serviceType}. Cannot post commission.`);
            if (session) await session.abortTransaction();
            return null;
        }

        // 2. Calculate Shares
        let franchiseShare = 0;
        if (rule.calculationType === 'PERCENTAGE') {
            franchiseShare = (commissionableAmount * (rule.franchiseShare / 100));
        } else if (rule.calculationType === 'FIXED') {
            franchiseShare = rule.franchiseShare;
        }
        
        // Round safely to 2 decimal places (standard financial practice if not using minor units purely)
        franchiseShare = Math.round(franchiseShare * 100) / 100;
        
        let companyShare = commissionableAmount - franchiseShare;
        companyShare = Math.round(companyShare * 100) / 100;

        // 3. Update or Create Wallet
        let wallet = await FranchiseWallet.findOne({ franchiseId: transaction.franchiseId }).session(session);
        if (!wallet) {
            wallet = await FranchiseWallet.create([{ franchiseId: transaction.franchiseId, balance: 0 }], sessionOption);
            if (Array.isArray(wallet)) wallet = wallet[0];
        }

        const currentBalance = Number(wallet.balance) || 0;
        const newBalance = currentBalance + franchiseShare;

        // 4. Create Ledger Entry (Append Only)
        // This will enforce idempotency via compound index { sourceId: 1, transactionType: 'COMMISSION' }
        const ledgerEntry = new FranchiseLedger({
            franchiseId: transaction.franchiseId,
            territoryId: transaction.territoryId,
            transactionType: 'COMMISSION',
            sourceType,
            sourceId: transaction._id,
            ledgerTransactionId: 'TRX-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            commissionRuleId: rule._id,
            commissionRuleVersion: rule.version,
            
            grossAmount,
            commissionableAmount,
            partnerShare,
            franchiseShare,
            companyShare,
            
            credit: franchiseShare,
            debit: 0,
            balanceAfter: newBalance,
            
            status: 'POSTED',
            createdBy: 'SYSTEM'
        });

        await ledgerEntry.save(sessionOption);

        // 5. Update Wallet
        await FranchiseWallet.updateOne(
            { _id: wallet._id },
            { 
                $set: { balance: newBalance },
                $inc: { totalCredits: franchiseShare }
            },
            sessionOption
        );

        if (session) {
            await session.commitTransaction();
        }

        logger.info(`Successfully posted commission for ${sourceType} ${transaction._id}. Franchise Share: ${franchiseShare}`);
        return ledgerEntry;

    } catch (error) {
        if (session) {
            await session.abortTransaction();
        }
        
        if (error.code === 11000) {
            logger.warn(`Idempotency trigger: Commission already posted for ${sourceType} ${transaction._id}. Skipping duplicate.`);
            return null; // Gracefully handle duplicates
        }
        
        logger.error(`Failed to post franchise commission for ${transaction._id}: ${error.message}`);
        throw error;
    } finally {
        if (session) {
            session.endSession();
        }
    }
}

/**
 * Reverses a previously posted commission (e.g. for refund / cancellation).
 */
export async function reverseCommission(transactionId, sourceType, adminId = 'SYSTEM') {
    let session = null;
    try {
        session = await mongoose.startSession();
        session.startTransaction();
    } catch (e) {
        throw new Error('FINANCIAL BLOCKER: MongoDB Transactions are unavailable. A ReplicaSet must be configured to process reversals atomically.');
    }

    try {
        const sessionOption = { session };

        // 1. Find the original commission ledger
        const originalLedger = await FranchiseLedger.findOne({
            sourceId: transactionId,
            transactionType: 'COMMISSION',
            status: 'POSTED'
        }).session(session);

        if (!originalLedger) {
            if (session) await session.abortTransaction();
            return null; // Nothing to reverse
        }

        // Idempotency for reversal
        const existingReversal = await FranchiseLedger.findOne({
            sourceId: transactionId,
            transactionType: 'REVERSAL'
        }).session(session);

        if (existingReversal) {
            if (session) await session.abortTransaction();
            return null; // Already reversed
        }

        // 2. Fetch Wallet
        const wallet = await FranchiseWallet.findOne({ franchiseId: originalLedger.franchiseId }).session(session);
        const currentBalance = Number(wallet?.balance) || 0;
        const newBalance = currentBalance - originalLedger.franchiseShare;

        // 3. Create Reversal Ledger
        const reversalEntry = new FranchiseLedger({
            franchiseId: originalLedger.franchiseId,
            territoryId: originalLedger.territoryId,
            transactionType: 'REVERSAL',
            sourceType,
            sourceId: transactionId,
            ledgerTransactionId: 'REV-' + Date.now() + '-' + Math.floor(Math.random() * 1000),
            commissionRuleId: originalLedger.commissionRuleId,
            commissionRuleVersion: originalLedger.commissionRuleVersion,
            
            grossAmount: -originalLedger.grossAmount,
            commissionableAmount: -originalLedger.commissionableAmount,
            partnerShare: -originalLedger.partnerShare,
            franchiseShare: -originalLedger.franchiseShare,
            companyShare: -originalLedger.companyShare,
            
            credit: 0,
            debit: originalLedger.franchiseShare,
            balanceAfter: newBalance,
            
            status: 'POSTED',
            createdBy: adminId
        });

        await reversalEntry.save(sessionOption);

        // 4. Update original ledger status
        originalLedger.status = 'REVERSED';
        await originalLedger.save(sessionOption);

        // 5. Update Wallet
        await FranchiseWallet.updateOne(
            { _id: wallet._id },
            { 
                $set: { balance: newBalance },
                $inc: { totalDebits: originalLedger.franchiseShare }
            },
            sessionOption
        );

        if (session) {
            await session.commitTransaction();
        }

        logger.info(`Successfully reversed commission for ${sourceType} ${transactionId}. Debited: ${originalLedger.franchiseShare}`);
        return reversalEntry;

    } catch (error) {
        if (session) {
            await session.abortTransaction();
        }
        throw error;
    } finally {
        if (session) {
            session.endSession();
        }
    }
}
