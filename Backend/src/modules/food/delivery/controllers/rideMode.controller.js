import { sendResponse } from '../../../../utils/response.js';
import {
    applyForRideMode,
    getRideDocumentRequirements,
    getRideModeStatus,
    issueRideSession,
    listRideModeVehicleTypes,
    setFoodOrdersEnabled,
    switchRideMode,
} from '../services/hybridRide.service.js';

export const getRideModeStatusController = async (req, res, next) => {
    try {
        const data = await getRideModeStatus(req.user?.userId);
        return sendResponse(res, 200, 'Ride mode status fetched', data);
    } catch (error) {
        next(error);
    }
};

export const listRideModeVehicleTypesController = async (_req, res, next) => {
    try {
        const vehicles = await listRideModeVehicleTypes();
        return sendResponse(res, 200, 'Vehicle types fetched', { vehicles });
    } catch (error) {
        next(error);
    }
};

export const getRideDocumentRequirementsController = async (req, res, next) => {
    try {
        const data = await getRideDocumentRequirements(req.user?.userId);
        return sendResponse(res, 200, 'Ride document requirements fetched', data);
    } catch (error) {
        next(error);
    }
};

// upload.any() gives a list of files; the service reads them by field name (rcPhoto, doc__<field key>)
const filesByField = (files) => {
    if (!Array.isArray(files)) return files || {};
    return files.reduce((acc, file) => {
        (acc[file.fieldname] = acc[file.fieldname] || []).push(file);
        return acc;
    }, {});
};

export const applyForRideModeController = async (req, res, next) => {
    try {
        const data = await applyForRideMode(req.user?.userId, req.body || {}, filesByField(req.files));
        return sendResponse(res, 201, 'Ride & Parcel application submitted', data);
    } catch (error) {
        next(error);
    }
};

export const switchRideModeController = async (req, res, next) => {
    try {
        const data = await switchRideMode(req.user?.userId, req.body || {});
        return sendResponse(res, 200, data.mode === 'taxi' ? 'Switched to Ride & Parcel' : 'Switched to Food delivery', data);
    } catch (error) {
        next(error);
    }
};

export const issueRideSessionController = async (req, res, next) => {
    try {
        const data = await issueRideSession(req.user?.userId);
        return sendResponse(res, 200, 'Ride session issued', data);
    } catch (error) {
        next(error);
    }
};

export const setFoodOrdersController = async (req, res, next) => {
    try {
        const data = await setFoodOrdersEnabled(req.user?.userId, req.body?.enabled);
        return sendResponse(res, 200, data.foodOrdersEnabled ? 'Food orders on' : 'Food orders off', data);
    } catch (error) {
        next(error);
    }
};
