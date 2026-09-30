import express from 'express';
import {
    getMaintenanceSettings,
    upsertMaintenanceSetting,
    deleteMaintenanceSetting,
    getPublicMaintenanceStatus
} from '../controllers/maintenanceSetting.controller.js';
import { authMiddleware } from '../../auth/auth.middleware.js';
import { requireRoles } from '../../roles/role.middleware.js';

const router = express.Router();

// Public route to check if service is under maintenance
router.get('/public/status', getPublicMaintenanceStatus);

// Admin routes
router.use(authMiddleware);
router.use(requireRoles('ADMIN'));

router.get('/', getMaintenanceSettings);
router.put('/', upsertMaintenanceSetting);
router.delete('/:id', deleteMaintenanceSetting);

export default router;
