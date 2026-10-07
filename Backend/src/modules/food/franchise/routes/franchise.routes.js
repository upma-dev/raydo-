import express from 'express';
import {
    getFormConfigController,
    getStatesController,
    getCitiesController,
    getPincodesController,
    submitApplicationController,
    getApplicationStatusController,
    getPartnerDashboardController,
} from '../controllers/franchise.public.controller.js';

const router = express.Router();

// Public — no auth required
router.get('/form-config', getFormConfigController);
router.get('/states', getStatesController);
router.get('/cities', getCitiesController);
router.get('/pincodes', getPincodesController);
router.post('/apply', submitApplicationController);
router.get('/status', getApplicationStatusController);
router.get('/partner-dashboard', getPartnerDashboardController);

export default router;
