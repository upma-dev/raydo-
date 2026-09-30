import { FranchiseCommissionRule } from './franchiseCommissionRule.model.js';
import { Franchise } from './franchise.model.js';
import { FranchiseLedger } from './franchiseLedger.model.js';
import { ApiError } from '../../utils/ApiError.js';

export const getCommissionRules = async (req, res, next) => {
    try {
        const { serviceType, status, franchiseId, page = 1, limit = 20, search } = req.query;
        const filter = {};

        // RBAC: Only Super Admin can view all rules. 
        // Note: We'll assume SuperAdmin if req.user.role === 'SUPER_ADMIN' or similar.
        // But per requirements, Franchise Admin doesn't manage rules.
        if (req.franchiseId) {
            // If they are a franchise, they can only view rules applicable to them
            filter.$or = [
                { franchiseId: req.franchiseId },
                { franchiseId: null } // Global rules
            ];
        } else if (franchiseId) {
            filter.franchiseId = franchiseId;
        }

        if (serviceType) filter.serviceType = serviceType;
        if (status) filter.status = status;
        if (search) filter.ruleId = { $regex: search, $options: 'i' };

        const skip = (Math.max(1, parseInt(page)) - 1) * parseInt(limit);

        const [docs, total] = await Promise.all([
            FranchiseCommissionRule.find(filter)
                .populate('franchiseId', 'name email phone status')
                .populate('createdBy', 'name email role')
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(parseInt(limit))
                .lean(),
            FranchiseCommissionRule.countDocuments(filter)
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

export const getCommissionRuleById = async (req, res, next) => {
    try {
        const rule = await FranchiseCommissionRule.findById(req.params.id)
            .populate('franchiseId', 'name email phone')
            .populate('createdBy', 'name email role')
            .lean();

        if (!rule) throw new ApiError(404, 'Commission rule not found');

        // Check if rule is in use
        const inUseCount = await FranchiseLedger.countDocuments({ commissionRuleId: rule._id });
        rule.isAppliedToTransactions = inUseCount > 0;

        res.json({ success: true, data: rule });
    } catch (err) {
        next(err);
    }
};

export const createCommissionRuleVersion = async (req, res, next) => {
    try {
        // Only Super Admin can create rules
        if (req.franchiseId) {
            throw new ApiError(403, 'Franchises cannot create commission rules');
        }

        const {
            ruleId,
            serviceType,
            franchiseId,
            calculationType,
            franchiseShare,
            companyShare,
            effectiveFrom,
            effectiveTo
        } = req.body;

        if (!ruleId || !serviceType || franchiseShare == null || companyShare == null) {
            throw new ApiError(400, 'Missing required fields');
        }

        if (franchiseShare < 0 || companyShare < 0) {
            throw new ApiError(400, 'Shares cannot be negative');
        }

        if (calculationType === 'PERCENTAGE' && (franchiseShare + companyShare > 100)) {
            throw new ApiError(400, 'Total percentage shares cannot exceed 100%');
        }

        // Validate overlapping active rules
        const overlapFilter = {
            serviceType,
            franchiseId: franchiseId || null,
            status: 'ACTIVE'
        };

        const existingActive = await FranchiseCommissionRule.find(overlapFilter);
        
        // Find highest version for this ruleId
        const existingVersions = await FranchiseCommissionRule.find({ ruleId }).sort({ version: -1 }).limit(1);
        const nextVersion = existingVersions.length > 0 ? existingVersions[0].version + 1 : 1;

        const newRule = new FranchiseCommissionRule({
            ruleId,
            version: nextVersion,
            serviceType,
            franchiseId: franchiseId || null,
            calculationType: calculationType || 'PERCENTAGE',
            franchiseShare,
            companyShare,
            effectiveFrom: effectiveFrom || Date.now(),
            effectiveTo: effectiveTo || null,
            status: 'ACTIVE',
            createdBy: req.user?._id
        });

        await newRule.save();

        // Deactivate previous active rules for this scope safely
        if (existingActive.length > 0) {
            await FranchiseCommissionRule.updateMany(
                { _id: { $in: existingActive.map(r => r._id) } },
                { $set: { status: 'INACTIVE', effectiveTo: new Date() } }
            );
        }

        res.status(201).json({ success: true, data: newRule });
    } catch (err) {
        next(err);
    }
};

export const updateCommissionRuleStatus = async (req, res, next) => {
    try {
        if (req.franchiseId) {
            throw new ApiError(403, 'Franchises cannot modify commission rules');
        }

        const { status } = req.body;
        if (!['ACTIVE', 'INACTIVE', 'EXPIRED'].includes(status)) {
            throw new ApiError(400, 'Invalid status');
        }

        const rule = await FranchiseCommissionRule.findById(req.params.id);
        if (!rule) throw new ApiError(404, 'Rule not found');

        // If activating, ensure no conflicts
        if (status === 'ACTIVE' && rule.status !== 'ACTIVE') {
            const overlapFilter = {
                serviceType: rule.serviceType,
                franchiseId: rule.franchiseId,
                status: 'ACTIVE',
                _id: { $ne: rule._id }
            };
            const conflicting = await FranchiseCommissionRule.findOne(overlapFilter);
            if (conflicting) {
                throw new ApiError(400, `Cannot activate. Rule ${conflicting.ruleId} (v${conflicting.version}) is currently active for this scope.`);
            }
        }

        rule.status = status;
        if (status === 'INACTIVE' || status === 'EXPIRED') {
            rule.effectiveTo = new Date();
        }
        await rule.save();

        res.json({ success: true, data: rule });
    } catch (err) {
        next(err);
    }
};
