import express from 'express';
import {
    getMaintenanceSettings,
    upsertMaintenanceSetting,
    deleteMaintenanceSetting,
    getPublicMaintenanceStatus,
    getMaintenanceTargetZones
} from '../controllers/maintenanceSetting.controller.js';
import { authMiddleware } from '../../auth/auth.middleware.js';
import { requireRoles } from '../../roles/role.middleware.js';

const router = express.Router();

// Public routes to check if service is under maintenance & fetch zone options
router.get('/public/status', getPublicMaintenanceStatus);
router.get('/public/target-zones', getMaintenanceTargetZones);
router.get('/target-zones', getMaintenanceTargetZones);

// Admin routes
router.use(authMiddleware);
router.use(requireRoles('ADMIN'));

router.get('/', getMaintenanceSettings);
router.put('/', upsertMaintenanceSetting);
router.delete('/:id', deleteMaintenanceSetting);

export default router;
