import { MaintenanceSetting } from '../maintenanceSetting.model.js';
import { FoodZone } from '../../../modules/food/admin/models/zone.model.js';
import { Zone as TaxiZone } from '../../../modules/taxi/driver/models/Zone.js';
import { sendResponse } from '../../../utils/response.js';

export const getMaintenanceSettings = async (req, res, next) => {
    try {
        const rawSettings = await MaintenanceSetting.find().sort({ createdAt: -1 }).lean();

        const foodZoneIds = rawSettings.filter(s => (s.module === 'food' || s.module.startsWith('food')) && s.zoneId).map(s => s.zoneId);
        const taxiZoneIds = rawSettings.filter(s => (s.module === 'taxi' || s.module.startsWith('taxi')) && s.zoneId).map(s => s.zoneId);

        const [foodZones, taxiZones] = await Promise.all([
            foodZoneIds.length > 0 ? FoodZone.find({ _id: { $in: foodZoneIds } }).select('_id name zoneName serviceLocation').lean() : [],
            taxiZoneIds.length > 0 ? TaxiZone.find({ _id: { $in: taxiZoneIds } }).select('_id name service_location_name').lean() : []
        ]);

        const foodZoneMap = new Map(foodZones.map(z => [String(z._id), z]));
        const taxiZoneMap = new Map(taxiZones.map(z => [String(z._id), z]));

        const settings = rawSettings.map(s => {
            let populatedZone = null;
            if (s.zoneId) {
                const zIdStr = String(s.zoneId);
                if (s.module === 'food' || s.module.startsWith('food')) {
                    const fz = foodZoneMap.get(zIdStr);
                    populatedZone = fz ? { _id: fz._id, name: fz.name || fz.zoneName } : { _id: s.zoneId, name: 'Unknown Zone' };
                } else if (s.module === 'taxi' || s.module.startsWith('taxi')) {
                    const tz = taxiZoneMap.get(zIdStr);
                    populatedZone = tz ? { _id: tz._id, name: tz.service_location_name || tz.name } : { _id: s.zoneId, name: 'Unknown Zone' };
                }
            }
            return {
                ...s,
                zoneId: populatedZone
            };
        });

        return sendResponse(res, 200, 'Maintenance settings retrieved', settings);
    } catch (err) {
        next(err);
    }
};

export const upsertMaintenanceSetting = async (req, res, next) => {
    try {
        const { module, serviceType, zoneId, isMaintenance, maintenanceMessage } = req.body;
        
        const filter = {
            module: module || 'all',
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
        ).lean();

        let populatedZone = null;
        if (setting.zoneId) {
            if (setting.module === 'food' || setting.module.startsWith('food')) {
                const fz = await FoodZone.findById(setting.zoneId).select('_id name zoneName serviceLocation').lean();
                if (fz) populatedZone = { _id: fz._id, name: fz.name || fz.zoneName };
            } else if (setting.module === 'taxi' || setting.module.startsWith('taxi')) {
                const tz = await TaxiZone.findById(setting.zoneId).select('_id name service_location_name').lean();
                if (tz) populatedZone = { _id: tz._id, name: tz.service_location_name || tz.name };
            }
        }

        return sendResponse(res, 200, 'Maintenance setting updated', {
            ...setting,
            zoneId: populatedZone
        });
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
        const parentModule = module && module.startsWith('food_') ? 'food' : (module && module.startsWith('taxi_') ? 'taxi' : null);
        const allowedModules = [module, parentModule, 'all'].filter(Boolean);

        const query = {
            isMaintenance: true,
            module: { $in: allowedModules }
        };
        
        const settings = await MaintenanceSetting.find(query);
        
        if (settings.length === 0) {
            return sendResponse(res, 200, 'Services are active', { isMaintenance: false });
        }

        let activeRule = null;
        for (const rule of settings) {
            const moduleMatch = allowedModules.includes(rule.module);
            const serviceMatch = rule.serviceType === serviceType || rule.serviceType === 'all';
            const zoneMatch = (zoneId && rule.zoneId && rule.zoneId.toString() === zoneId) || !rule.zoneId;

            if (moduleMatch && serviceMatch && zoneMatch) {
                if (rule.module === module && rule.serviceType === serviceType && rule.zoneId?.toString() === zoneId) {
                    activeRule = rule;
                    break;
                }
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

export const getMaintenanceTargetZones = async (req, res, next) => {
    try {
        const [foodZones, taxiZones] = await Promise.all([
            FoodZone.find().select('_id name zoneName serviceLocation').sort({ name: 1 }).lean(),
            TaxiZone.find().select('_id name service_location_name').sort({ name: 1, service_location_name: 1 }).lean()
        ]);

        return sendResponse(res, 200, 'Target zones fetched', {
            foodZones: foodZones.map(z => ({
                _id: String(z._id),
                name: z.name || z.zoneName || z.serviceLocation || 'Food Zone',
                zoneName: z.zoneName || z.name || '',
                serviceLocation: z.serviceLocation || z.name || ''
            })),
            taxiZones: taxiZones.map(z => ({
                _id: String(z._id),
                name: z.service_location_name || z.name || z.zoneName || 'Taxi Zone',
                service_location_name: z.service_location_name || z.name || z.zoneName || '',
                zoneName: z.zoneName || z.name || ''
            }))
        });
    } catch (err) {
        next(err);
    }
};
