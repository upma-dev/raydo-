import { sendResponse } from '../../../../utils/response.js';
import * as franchiseService from '../services/taxiFranchiseService.js';

// ─── Super Admin Endpoints ────────────────────────────────────────────────────

export async function createFranchisePartnerController(req, res, next) {
    try {
        const data = await franchiseService.createTaxiFranchisePartner(req.body);
        return sendResponse(res, 201, 'Franchise partner created successfully', data);
    } catch (err) { next(err); }
}

export async function listFranchisePartnersController(req, res, next) {
    try {
        const data = await franchiseService.listTaxiFranchisePartners(req.query);
        return sendResponse(res, 200, 'Franchise partners fetched', data);
    } catch (err) { next(err); }
}

export async function getFranchisePartnerController(req, res, next) {
    try {
        const data = await franchiseService.getTaxiFranchisePartnerById(req.params.id);
        return sendResponse(res, 200, 'Franchise partner fetched', data);
    } catch (err) { next(err); }
}

export async function updateFranchisePartnerController(req, res, next) {
    try {
        const data = await franchiseService.updateTaxiFranchisePartner(req.params.id, req.body);
        return sendResponse(res, 200, 'Franchise partner updated', data);
    } catch (err) { next(err); }
}

export async function deleteFranchisePartnerController(req, res, next) {
    try {
        const data = await franchiseService.deleteTaxiFranchisePartner(req.params.id);
        return sendResponse(res, 200, 'Franchise partner deleted', data);
    } catch (err) { next(err); }
}

export async function adminProcessPayoutController(req, res, next) {
    try {
        const { partnerId, requestId } = req.params;
        const data = await franchiseService.adminProcessFranchisePayout(partnerId, requestId, req.body);
        return sendResponse(res, 200, 'Payout processed', data);
    } catch (err) { next(err); }
}

// ─── Franchise Partner Auth ───────────────────────────────────────────────────

export async function franchiseLoginController(req, res, next) {
    try {
        const data = await franchiseService.loginTaxiFranchisePartner(req.body);
        return sendResponse(res, 200, 'Login successful', data);
    } catch (err) { next(err); }
}

// ─── Franchise Partner — Dashboard ───────────────────────────────────────────

export async function franchiseDashboardController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const data = await franchiseService.franchiseDashboardStats(partnerId);
        return sendResponse(res, 200, 'Dashboard data fetched', data);
    } catch (err) { next(err); }
}

// ─── Franchise Partner — Drivers ──────────────────────────────────────────────

export async function franchiseRegisterDriverController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const data = await franchiseService.franchiseRegisterDriver(partnerId, req.body);
        return sendResponse(res, 201, 'Driver registered in your zone', data);
    } catch (err) { next(err); }
}

export async function franchiseListDriversController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const data = await franchiseService.franchiseListDrivers(partnerId, req.query);
        return sendResponse(res, 200, 'Drivers fetched', data);
    } catch (err) { next(err); }
}

export async function franchiseUpdateDriverStatusController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const { driverId } = req.params;
        const data = await franchiseService.franchiseUpdateDriverStatus(partnerId, driverId, req.body);
        return sendResponse(res, 200, 'Driver status updated', data);
    } catch (err) { next(err); }
}

// ─── Franchise Partner — Zone Settings ───────────────────────────────────────

export async function franchiseGetZoneSettingsController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const data = await franchiseService.franchiseGetZoneSettings(partnerId);
        return sendResponse(res, 200, 'Zone settings fetched', data);
    } catch (err) { next(err); }
}

export async function franchiseUpdateZoneSettingsController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const data = await franchiseService.franchiseUpdateZoneSettings(partnerId, req.body);
        return sendResponse(res, 200, 'Zone settings updated', data);
    } catch (err) { next(err); }
}

// ─── Franchise Partner — Pricing ─────────────────────────────────────────────

export async function franchiseGetZonePricesController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const data = await franchiseService.franchiseGetZonePrices(partnerId);
        return sendResponse(res, 200, 'Zone prices fetched', data);
    } catch (err) { next(err); }
}

export async function franchiseUpdateSetPriceController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const { priceId } = req.params;
        const data = await franchiseService.franchiseUpdateSetPrice(partnerId, priceId, req.body);
        return sendResponse(res, 200, 'Price updated', data);
    } catch (err) { next(err); }
}

// ─── Franchise Partner — Vehicle Types ───────────────────────────────────────

export async function franchiseGetVehicleTypesController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const data = await franchiseService.franchiseGetVehicleTypes(partnerId);
        return sendResponse(res, 200, 'Vehicle types fetched', data);
    } catch (err) { next(err); }
}

// ─── Franchise Partner — Earnings ────────────────────────────────────────────

export async function franchiseGetEarningsController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const data = await franchiseService.franchiseGetEarnings(partnerId, req.query);
        return sendResponse(res, 200, 'Earnings fetched', data);
    } catch (err) { next(err); }
}

// ─── Franchise Partner — Payouts ─────────────────────────────────────────────

export async function franchiseRequestPayoutController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const data = await franchiseService.franchiseRequestPayout(partnerId, req.body);
        return sendResponse(res, 201, 'Payout request submitted', data);
    } catch (err) { next(err); }
}

export async function franchiseUpdateBankDetailsController(req, res, next) {
    try {
        const partnerId = req.franchisePartner._id;
        const data = await franchiseService.franchiseUpdateBankDetails(partnerId, req.body);
        return sendResponse(res, 200, 'Bank details updated', data);
    } catch (err) { next(err); }
}
