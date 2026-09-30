import Franchise from './franchise.model.js';
import FranchiseAudit from './franchiseAudit.model.js';
import { sendResponse, sendError } from '../../utils/response.js';

// Get all franchises for Super Admin
export const getAllFranchises = async (req, res, next) => {
    try {
        const franchises = await Franchise.find()
            .populate('ownerAdminId', 'name email phone')
            .populate('territoryId')
            .sort({ createdAt: -1 });
        return sendResponse(res, 200, 'Franchises fetched successfully', franchises);
    } catch (error) {
        next(error);
    }
};

// Create a new franchise application (Public / Super Admin)
export const createFranchise = async (req, res, next) => {
    try {
        const { name, legalName, email, phone, businessAddress, businessType, franchiseType, services, businessRegistrationDetails } = req.body;

        const existingFranchise = await Franchise.findOne({ 
            $or: [
                { email },
                { phone },
                { 'businessRegistrationDetails.taxId': businessRegistrationDetails?.taxId }
            ] 
        });
        
        if (existingFranchise) {
            return sendError(res, 400, 'A franchise with this email, phone, or tax ID already exists');
        }

        const franchise = new Franchise({
            name,
            legalName,
            email,
            phone,
            businessAddress,
            businessType,
            franchiseType,
            services,
            status: 'SUBMITTED' // Phase 1 enum
        });

        await franchise.save();

        await FranchiseAudit.create({
            actor: req.user ? req.user._id : null,
            role: req.user ? req.user.role : 'APPLICANT',
            action: 'Application Submitted',
            entity: 'Franchise',
            entityId: franchise._id,
            newValue: { status: 'SUBMITTED' }
        });

        return sendResponse(res, 201, 'Franchise application submitted successfully', franchise);
    } catch (error) {
        next(error);
    }
};

// Update Franchise Status
export const updateFranchiseStatus = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;

        const franchise = await Franchise.findById(id);
        if (!franchise) {
            return sendError(res, 404, 'Franchise not found');
        }

        const validTransitions = {
            'DRAFT': ['SUBMITTED'],
            'SUBMITTED': ['UNDER_REVIEW', 'REJECTED'],
            'UNDER_REVIEW': ['DOCUMENTS_REQUIRED', 'INTERVIEW_PENDING', 'REJECTED'],
            'DOCUMENTS_REQUIRED': ['DOCUMENTS_VERIFIED', 'REJECTED'],
            'DOCUMENTS_VERIFIED': ['COMMERCIAL_REVIEW', 'INTERVIEW_PENDING'],
            'INTERVIEW_PENDING': ['COMMERCIAL_REVIEW', 'REJECTED'],
            'COMMERCIAL_REVIEW': ['APPROVED', 'REJECTED'],
            'APPROVED': ['AGREEMENT_PENDING', 'ACTIVATION_PENDING'],
            'AGREEMENT_PENDING': ['PAYMENT_PENDING', 'ACTIVATION_PENDING'],
            'PAYMENT_PENDING': ['ACTIVATION_PENDING'],
            'ACTIVATION_PENDING': ['ACTIVE'],
            'ACTIVE': ['SUSPENDED', 'TERMINATED'],
            'SUSPENDED': ['ACTIVE', 'TERMINATED'],
            'REJECTED': [],
            'TERMINATED': []
        };

        const oldStatus = franchise.status;
        
        // Strict Transition Validation
        if (!validTransitions[oldStatus]?.includes(status)) {
            return sendError(res, 400, `Invalid state transition from ${oldStatus} to ${status}`);
        }

        franchise.status = status;
        await franchise.save();

        await FranchiseAudit.create({
            actor: req.user._id,
            role: req.user.role || 'ADMIN',
            action: 'Status Changed',
            entity: 'Franchise',
            entityId: franchise._id,
            oldValue: { status: oldStatus },
            newValue: { status }
        });

        return sendResponse(res, 200, 'Franchise status updated successfully', franchise);
    } catch (error) {
        next(error);
    }
};

export const getFranchiseById = async (req, res, next) => {
    try {
        const query = { _id: req.params.id };
        
        // If query is isolated by middleware, it will have franchiseId
        if (req.query.franchiseId && req.query.franchiseId !== req.params.id) {
            return sendError(res, 403, 'Unauthorized cross-franchise access');
        }

        const franchise = await Franchise.findOne(query)
            .populate('ownerAdminId', 'name email phone')
            .populate('territoryId');
            
        if (!franchise) return sendError(res, 404, 'Not found');
        return sendResponse(res, 200, 'Success', franchise);
    } catch (error) {
        next(error);
    }
};

export const getFranchiseStats = async (req, res, next) => {
    try {
        const query = {};
        
        // Respect Data Isolation
        if (req.query.franchiseId) {
            query._id = req.query.franchiseId;
        }

        const total = await Franchise.countDocuments(query);
        const active = await Franchise.countDocuments({ ...query, status: 'ACTIVE' });
        const pendingApps = await Franchise.countDocuments({ ...query, status: { $in: ['SUBMITTED', 'UNDER_REVIEW'] } });
        
        return sendResponse(res, 200, 'Success', {
            total,
            active,
            pendingApps
        });
    } catch (error) {
        next(error);
    }
};
