import { sendResponse, sendError } from '../../../../utils/response.js';
import {
    listPendingFoodApprovals,
    approveFoodItem,
    rejectFoodItem
} from '../services/foodApproval.service.js';
import { resolveFranchiseScopeId } from '../middlewares/foodAdmin.middleware.js';

export async function getPendingFoodApprovals(req, res, next) {
    try {
        const query = req.query || {};
        const isFranchiseContext = req.headers['x-portal-context'] === 'franchise' || req.query?.portalContext === 'franchise';
        const isFranchiseUser = req.adminContext?.admin_type === 'subadmin' || req.adminContext?.admin_type === 'franchise' || req.adminContext?.admin_type === 'franchise_partner' || req.adminContext?.franchiseId;

        if (isFranchiseContext || isFranchiseUser) {
            const explicitFid = resolveFranchiseScopeId(req);
            if (explicitFid) {
                query.franchiseId = String(explicitFid);
            } else if (isFranchiseUser) {
                const { default: FranchiseApplication } = await import('../models/franchiseApplication.model.js');
                const franchise = await FranchiseApplication.findOne({ subAdminId: req.adminContext.id }).select('_id').lean();
                if (franchise) {
                    query.franchiseId = String(franchise._id);
                } else {
                    query.franchiseId = '000000000000000000000000';
                }
            } else {
                query.franchiseId = '000000000000000000000000';
            }
        }
        const data = await listPendingFoodApprovals(query);
        return sendResponse(res, 200, 'Pending food approvals fetched successfully', data);
    } catch (error) {
        next(error);
    }
}

export async function approveFoodItemController(req, res, next) {
    try {
        const updated = await approveFoodItem(req.params.id);
        if (!updated) return sendError(res, 404, 'Food item not found or not pending');
        return sendResponse(res, 200, 'Food item approved successfully', { food: updated });
    } catch (error) {
        next(error);
    }
}

export async function rejectFoodItemController(req, res, next) {
    try {
        const updated = await rejectFoodItem(req.params.id, req.body?.reason);
        if (!updated) return sendError(res, 404, 'Food item not found or not pending');
        return sendResponse(res, 200, 'Food item rejected successfully', { food: updated });
    } catch (error) {
        next(error);
    }
}

