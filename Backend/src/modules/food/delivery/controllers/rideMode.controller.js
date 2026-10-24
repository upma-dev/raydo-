import { sendResponse } from '../../../../utils/response.js';
import {
    applyForRideMode,
    getRideModeStatus,
    issueRideSession,
    listRideModeVehicleTypes,
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

export const applyForRideModeController = async (req, res, next) => {
    try {
        const data = await applyForRideMode(req.user?.userId, req.body || {}, req.files || {});
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
