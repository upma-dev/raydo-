import { MaintenanceSetting } from './maintenanceSetting.model.js';
import { sendResponse } from '../../utils/response.js';

export const checkMaintenanceMiddleware = async (req, res, next) => {
    try {
        // Paths that should not be blocked (like admin endpoints, public status, auth)
        if (req.originalUrl.includes('/admin') || 
            req.originalUrl.includes('/public') || 
            req.originalUrl.includes('/auth') ||
            req.originalUrl.includes('/maintenance')) {
            return next();
        }

        const moduleType = req.originalUrl.includes('/food') ? 'food' : (req.originalUrl.includes('/taxi') ? 'taxi' : null);
        
        // Find if there is any active maintenance setting
        const settings = await MaintenanceSetting.find({ isMaintenance: true });
        
        if (settings.length > 0) {
            // Very simple check: If there's an 'all' rule, block everything
            const globalBlock = settings.find(s => s.module === 'all');
            if (globalBlock) {
                return sendResponse(res, 503, globalBlock.maintenanceMessage, null, false);
            }

            // Module specific block (e.g., all of food)
            if (moduleType) {
                const moduleBlock = settings.find(s => s.module === moduleType && s.zoneId === null && s.serviceType === 'all');
                if (moduleBlock) {
                    return sendResponse(res, 503, moduleBlock.maintenanceMessage, null, false);
                }
            }
        }
        
        next();
    } catch (err) {
        // If there's an error checking maintenance, just continue to not break the app
        next();
    }
};
