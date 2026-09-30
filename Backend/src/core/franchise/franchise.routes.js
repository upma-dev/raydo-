import express from 'express';
import { authMiddleware } from '../auth/auth.middleware.js';
import { requireRoles } from '../roles/role.middleware.js';
import { getAllFranchises, createFranchise, updateFranchiseStatus, getFranchiseById, getFranchiseStats } from './franchise.controller.js';
import { getOperationalDashboard } from './franchiseDashboard.controller.js';
import { getStaffList, getStaffById, createStaff, updateStaff } from './franchiseStaff.controller.js';
import { getDriversList, getDriverById, createDriver, updateDriver } from './franchiseDriver.controller.js';
import { getRestaurantsList, getRestaurantById, createRestaurant, updateRestaurant } from './franchiseRestaurant.controller.js';
import { getDeliveryPartnersList, getDeliveryPartnerById, createDeliveryPartner, updateDeliveryPartner } from './franchiseDeliveryPartner.controller.js';
import { getVehiclesList, getVehicleById, createVehicle, updateVehicle } from './franchiseVehicle.controller.js';
import { getCommissionRules, getCommissionRuleById, createCommissionRuleVersion, updateCommissionRuleStatus } from './franchiseCommissionRule.controller.js';
import { getFranchiseWallet, getFranchiseLedgerList, getFranchiseLedgerDetail, getFranchiseFinancialDashboard } from './franchiseFinancial.controller.js';
import { getUploadPresignedUrl, submitKycDocument, getKycList, getDownloadPresignedUrl, updateKycStatus } from './franchiseKyc.controller.js';
import { franchiseIsolation } from './franchiseIsolation.middleware.js';

const router = express.Router();

// Public route for application
router.post('/apply', createFranchise);

// Protected Admin routes
router.use(authMiddleware, requireRoles('ADMIN'), franchiseIsolation);

// Core Franchise Admin/SuperAdmin Management
router.get('/', getAllFranchises);
router.get('/stats', getFranchiseStats);
router.get('/:id', getFranchiseById);
router.post('/', createFranchise); // Super admin creating
router.patch('/:id/status', updateFranchiseStatus);

// Phase 2A - Operational Dashboard
router.get('/operations/dashboard', getOperationalDashboard);

// Phase 2A - Staff Management
router.get('/operations/staff', getStaffList);
router.get('/operations/staff/:id', getStaffById);
router.post('/operations/staff', createStaff);
router.patch('/operations/staff/:id', updateStaff);

// Phase 2A - Driver Management
router.get('/operations/drivers', getDriversList);
router.get('/operations/drivers/:id', getDriverById);
router.post('/operations/drivers', createDriver);
router.patch('/operations/drivers/:id', updateDriver);

// Phase 2B - Restaurant Management
router.get('/operations/restaurants', getRestaurantsList);
router.get('/operations/restaurants/:id', getRestaurantById);
router.post('/operations/restaurants', createRestaurant);
router.patch('/operations/restaurants/:id', updateRestaurant);

// Phase 2B - Delivery Partner Management
router.get('/operations/delivery-partners', getDeliveryPartnersList);
router.get('/operations/delivery-partners/:id', getDeliveryPartnerById);
router.post('/operations/delivery-partners', createDeliveryPartner);
router.patch('/operations/delivery-partners/:id', updateDeliveryPartner);

// Phase 2B - Vehicle Management
router.get('/operations/vehicles', getVehiclesList);
router.get('/operations/vehicles/:id', getVehicleById);
router.post('/operations/vehicles', createVehicle);
router.patch('/operations/vehicles/:id', updateVehicle);

// Phase 2C - Commission Rules
router.get('/commission-rules', getCommissionRules);
router.post('/commission-rules', createCommissionRuleVersion);
router.patch('/commission-rules/:id/status', updateCommissionRuleStatus);
router.get('/commission-rules/:id', getCommissionRuleById);

// Phase 2C - Financials
router.get('/financials/wallet', getFranchiseWallet);
router.get('/financials/ledger', getFranchiseLedgerList);
router.get('/financials/ledger/:id', getFranchiseLedgerDetail);
router.get('/financials/dashboard', getFranchiseFinancialDashboard);

// Phase 2D - KYC File Storage
router.post('/kyc/upload-url', getUploadPresignedUrl);
router.post('/kyc/submit', submitKycDocument);
router.get('/kyc', getKycList);
router.get('/kyc/:id/download-url', getDownloadPresignedUrl);
router.patch('/kyc/:id/status', updateKycStatus);

export default router;
