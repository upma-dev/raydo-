import { FranchiseLedger } from './franchiseLedger.model.js';
import { FranchiseWallet } from './franchiseWallet.model.js';
import { Franchise } from './franchise.model.js';
import { ApiError } from '../../utils/ApiError.js';
import mongoose from 'mongoose';

export const getFranchiseWallet = async (req, res, next) => {
    try {
        const franchiseId = req.franchiseId || req.query.franchiseId;
        
        if (!franchiseId) {
            throw new ApiError(400, 'Franchise ID is required');
        }

        if (req.franchiseId && req.franchiseId.toString() !== franchiseId.toString()) {
            throw new ApiError(403, 'Unauthorized access to another franchise wallet');
        }

        let wallet = await FranchiseWallet.findOne({ franchiseId }).lean();
        
        if (!wallet) {
            // Provide empty state safely
            wallet = {
                franchiseId,
                balance: 0,
                totalCredits: 0,
                totalDebits: 0,
                currency: 'INR',
                updatedAt: new Date()
            };
        }

        res.json({ success: true, data: wallet });
    } catch (err) {
        next(err);
    }
};

export const getFranchiseLedgerList = async (req, res, next) => {
    try {
        const { serviceType, transactionType, status, page = 1, limit = 20, search, startDate, endDate, type } = req.query;
        const franchiseId = req.franchiseId || req.query.franchiseId;

        const filter = {};
        
        if (req.franchiseId) {
            filter.franchiseId = req.franchiseId; // Strict RBAC
        } else if (franchiseId) {
            filter.franchiseId = franchiseId;
        }

        if (serviceType) filter.sourceType = serviceType; // Map service to sourceType
        if (transactionType) filter.transactionType = transactionType;
        if (status) filter.status = status;
        
        if (type === 'CREDIT') filter.credit = { $gt: 0 };
        if (type === 'DEBIT') filter.debit = { $gt: 0 };

        if (startDate || endDate) {
            filter.createdAt = {};
            if (startDate) filter.createdAt.$gte = new Date(startDate);
            if (endDate) filter.createdAt.$lte = new Date(endDate);
        }

        if (search) {
            filter.ledgerTransactionId = { $regex: search, $options: 'i' };
        }

        const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

        const [docs, total] = await Promise.all([
            FranchiseLedger.find(filter)
                .populate('franchiseId', 'name')
                .populate('commissionRuleId', 'ruleId')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            FranchiseLedger.countDocuments(filter)
        ]);

        const totalPages = Math.ceil(total / limit) || 1;

        res.json({
            success: true,
            data: {
                docs,
                totalPages,
                total,
                page: parseInt(page),
                limit: parseInt(limit)
            }
        });
    } catch (err) {
        next(err);
    }
};

export const getFranchiseLedgerDetail = async (req, res, next) => {
    try {
        const ledger = await FranchiseLedger.findById(req.params.id)
            .populate('franchiseId', 'name email phone')
            .populate('territoryId', 'name')
            .populate('commissionRuleId', 'ruleId serviceType calculationType')
            .lean();

        if (!ledger) throw new ApiError(404, 'Ledger entry not found');

        if (req.franchiseId && ledger.franchiseId._id.toString() !== req.franchiseId.toString()) {
            throw new ApiError(403, 'Unauthorized access to ledger entry');
        }

        // If it's a reversal, find the original
        if (ledger.transactionType === 'REVERSAL') {
            const original = await FranchiseLedger.findOne({
                sourceId: ledger.sourceId,
                transactionType: 'COMMISSION'
            }).select('ledgerTransactionId').lean();
            if (original) ledger.originalLedgerTransactionId = original.ledgerTransactionId;
        }

        res.json({ success: true, data: ledger });
    } catch (err) {
        next(err);
    }
};

export const getFranchiseFinancialDashboard = async (req, res, next) => {
    try {
        const isSuperAdmin = !req.franchiseId;
        const franchiseId = req.franchiseId || req.query.franchiseId;

        const matchStage = {};
        if (franchiseId) {
            matchStage.franchiseId = new mongoose.Types.ObjectId(franchiseId);
        } else if (!isSuperAdmin) {
            throw new ApiError(403, 'Unauthorized');
        }

        // Aggregate Ledger for totals
        const [totals] = await FranchiseLedger.aggregate([
            { $match: matchStage },
            {
                $group: {
                    _id: null,
                    totalGrossAmount: { $sum: '$grossAmount' },
                    totalCommissionableAmount: { $sum: '$commissionableAmount' },
                    totalFranchiseShare: { $sum: '$franchiseShare' },
                    totalCompanyShare: { $sum: '$companyShare' },
                    totalPartnerShare: { $sum: '$partnerShare' },
                    totalCredits: { $sum: '$credit' },
                    totalDebits: { $sum: '$debit' }
                }
            }
        ]);

        let walletAggregates = null;
        if (isSuperAdmin && !franchiseId) {
            // Super Admin global view: aggregate all wallets
            const [wTotals] = await FranchiseWallet.aggregate([
                {
                    $group: {
                        _id: null,
                        globalBalance: { $sum: '$balance' },
                        globalLocked: { $sum: '$lockedAmount' }
                    }
                }
            ]);
            walletAggregates = wTotals;
        }

        const data = {
            totals: totals || {
                totalGrossAmount: 0,
                totalCommissionableAmount: 0,
                totalFranchiseShare: 0,
                totalCompanyShare: 0,
                totalPartnerShare: 0,
                totalCredits: 0,
                totalDebits: 0
            }
        };

        if (walletAggregates) {
            data.globalWallet = walletAggregates;
        }

        res.json({ success: true, data });
    } catch (err) {
        next(err);
    }
};
