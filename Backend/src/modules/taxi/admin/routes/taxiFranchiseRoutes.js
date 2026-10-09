import { Router } from 'express';
import { authenticate } from '../../middlewares/authMiddleware.js';
import { ApiError } from '../../../../utils/ApiError.js';
import { verifyAccessToken } from '../../services/tokenService.js';
import { TaxiFranchisePartner } from '../models/TaxiFranchisePartner.js';
import {
    // Super Admin
    createFranchisePartnerController,
    listFranchisePartnersController,
    getFranchisePartnerController,
    updateFranchisePartnerController,
    deleteFranchisePartnerController,
    adminProcessPayoutController,
    // Franchise Partner Auth
    franchiseLoginController,
    // Franchise Partner Self-service
    franchiseDashboardController,
    franchiseRegisterDriverController,
    franchiseListDriversController,
    franchiseUpdateDriverStatusController,
    franchiseGetZoneSettingsController,
    franchiseUpdateZoneSettingsController,
    franchiseGetZonePricesController,
    franchiseUpdateSetPriceController,
    franchiseGetVehicleTypesController,
    franchiseGetEarningsController,
    franchiseRequestPayoutController,
    franchiseUpdateBankDetailsController,
} from '../controllers/taxiFranchiseController.js';

export const taxiFranchiseRouter = Router();

// ─── Franchise Partner Auth (public) ─────────────────────────────────────────
taxiFranchiseRouter.post('/taxi-franchise/auth/login', franchiseLoginController);

// ─── Super Admin: manage franchise partners ───────────────────────────────────
taxiFranchiseRouter.use('/admin/taxi-franchise', authenticate(['admin']));
taxiFranchiseRouter.get('/admin/taxi-franchise', listFranchisePartnersController);
taxiFranchiseRouter.post('/admin/taxi-franchise', createFranchisePartnerController);
taxiFranchiseRouter.get('/admin/taxi-franchise/:id', getFranchisePartnerController);
taxiFranchiseRouter.patch('/admin/taxi-franchise/:id', updateFranchisePartnerController);
taxiFranchiseRouter.delete('/admin/taxi-franchise/:id', deleteFranchisePartnerController);
taxiFranchiseRouter.patch(
    '/admin/taxi-franchise/:partnerId/payout/:requestId',
    adminProcessPayoutController
);

// ─── Franchise Partner middleware ─────────────────────────────────────────────
const authenticateFranchisePartner = async (req, _res, next) => {
    try {
        const authorization = req.headers.authorization || '';
        const [, token] = authorization.split(' ');
        if (!token) throw new ApiError(401, 'Authorization token is required');

        const payload = verifyAccessToken(token);
        if (payload.role !== 'taxi_franchise') {
            throw new ApiError(403, 'This endpoint is for taxi franchise partners only');
        }

        const partner = await TaxiFranchisePartner.findById(payload.id || payload.sub).lean();
        if (!partner) throw new ApiError(401, 'Franchise partner account not found');
        if (!partner.isActive || partner.status !== 'active') {
            throw new ApiError(403, 'Your franchise account is not active');
        }

        req.franchisePartner = partner;
        next();
    } catch (err) {
        if (err?.name === 'TokenExpiredError') {
            return next(new ApiError(401, 'Authorization token has expired'));
        }
        if (err?.name === 'JsonWebTokenError') {
            return next(new ApiError(401, 'Authorization token is invalid'));
        }
        next(err);
    }
};

// ─── Franchise Partner: Self-service routes ───────────────────────────────────
taxiFranchiseRouter.use('/taxi-franchise', authenticateFranchisePartner);

taxiFranchiseRouter.get('/taxi-franchise/dashboard', franchiseDashboardController);

// Drivers (zone-restricted)
taxiFranchiseRouter.get('/taxi-franchise/drivers', franchiseListDriversController);
taxiFranchiseRouter.post('/taxi-franchise/drivers', franchiseRegisterDriverController);
taxiFranchiseRouter.patch('/taxi-franchise/drivers/:driverId/status', franchiseUpdateDriverStatusController);

// Zone settings
taxiFranchiseRouter.get('/taxi-franchise/zone-settings', franchiseGetZoneSettingsController);
taxiFranchiseRouter.patch('/taxi-franchise/zone-settings', franchiseUpdateZoneSettingsController);

// Pricing
taxiFranchiseRouter.get('/taxi-franchise/prices', franchiseGetZonePricesController);
taxiFranchiseRouter.patch('/taxi-franchise/prices/:priceId', franchiseUpdateSetPriceController);

// Vehicle types
taxiFranchiseRouter.get('/taxi-franchise/vehicle-types', franchiseGetVehicleTypesController);

// Earnings
taxiFranchiseRouter.get('/taxi-franchise/earnings', franchiseGetEarningsController);

// Payouts
taxiFranchiseRouter.post('/taxi-franchise/payout/request', franchiseRequestPayoutController);
taxiFranchiseRouter.put('/taxi-franchise/bank-details', franchiseUpdateBankDetailsController);
