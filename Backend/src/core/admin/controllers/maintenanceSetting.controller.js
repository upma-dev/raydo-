import { MaintenanceSetting } from '../maintenanceSetting.model.js';
import { sendResponse } from '../../../utils/response.js';

export const getMaintenanceSettings = async (req, res, next) => {
    try {
        const settings = await MaintenanceSetting.find().populate('zoneId', 'name zoneName service_location_name');
        return sendResponse(res, 200, 'Maintenance settings retrieved', settings);
    } catch (err) {
        next(err);
    }
};

export const upsertMaintenanceSetting = async (req, res, next) => {
    try {
        const { module, serviceType, zoneId, isMaintenance, maintenanceMessage } = req.body;
        
        const filter = {
            module,
            serviceType: serviceType || 'all',
            zoneId: zoneId || null,
        };

        const update = {
            isMaintenance: isMaintenance !== undefined ? isMaintenance : true,
            maintenanceMessage: maintenanceMessage || 'Service is currently under maintenance. Please try again later.',
        };

        const setting = await MaintenanceSetting.findOneAndUpdate(
            filter,
            update,
            { new: true, upsert: true }
        ).populate('zoneId', 'name zoneName service_location_name');

        return sendResponse(res, 200, 'Maintenance setting updated', setting);
    } catch (err) {
        next(err);
    }
};

export const deleteMaintenanceSetting = async (req, res, next) => {
    try {
        const { id } = req.params;
        await MaintenanceSetting.findByIdAndDelete(id);
        return sendResponse(res, 200, 'Maintenance setting removed');
    } catch (err) {
        next(err);
    }
};

export const getPublicMaintenanceStatus = async (req, res, next) => {
    try {
        const { module, serviceType, zoneId } = req.query;
        // Check for specific match first, then broader matches
        const query = {
            isMaintenance: true
        };
        
        if (module) {
            query.module = { $in: [module, 'all'] };
        }
        
        // Find all active maintenance configs that match the criteria
        const settings = await MaintenanceSetting.find(query);
        
        if (settings.length === 0) {
            return sendResponse(res, 200, 'Services are active', { isMaintenance: false });
        }

        // We filter manually to prioritize most specific rule
        let activeRule = null;
        for (const rule of settings) {
            const moduleMatch = rule.module === module || rule.module === 'all';
            const serviceMatch = rule.serviceType === serviceType || rule.serviceType === 'all';
            const zoneMatch = (zoneId && rule.zoneId && rule.zoneId.toString() === zoneId) || !rule.zoneId;

            if (moduleMatch && serviceMatch && zoneMatch) {
                // If this is a specific rule, use it immediately
                if (rule.module === module && rule.serviceType === serviceType && rule.zoneId?.toString() === zoneId) {
                    activeRule = rule;
                    break;
                }
                // Otherwise keep it as a fallback if no specific rule found
                if (!activeRule) activeRule = rule;
            }
        }

        if (activeRule) {
            return sendResponse(res, 200, 'Service is under maintenance', {
                isMaintenance: true,
                message: activeRule.maintenanceMessage,
                rule: activeRule
            });
        }

        return sendResponse(res, 200, 'Services are active', { isMaintenance: false });
    } catch (err) {
        next(err);
    }
};
