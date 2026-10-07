import { verifyAccessToken } from './token.util.js';
import { sendError } from '../../utils/response.js';
import { FoodUser } from '../users/user.model.js';
import mongoose from 'mongoose';

export const requireAdmin = (req, res, next) => {
    if (req.user?.role !== 'ADMIN') {
        return sendError(res, 403, 'Admin access required');
    }
    next();
};

export const authMiddleware = (req, res, next) => {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.substring(7) : null;

    if (!token) {
        return sendError(res, 401, 'Authentication token missing');
    }

    try {
        const decoded = verifyAccessToken(token);
        const userId = decoded.userId || decoded.id || decoded._id || decoded.sub || decoded.partnerId || '';
        const rawRole = decoded.role || decoded.userType || decoded.type || (decoded.partnerId || decoded.vehicleNumber || decoded.driverId ? 'DELIVERY_PARTNER' : 'USER');
        const role = String(rawRole).toUpperCase();

        req.user = {
            ...decoded,
            userId,
            id: userId,
            role
        };

        if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
            return sendError(res, 401, 'Invalid user token');
        }

        if (role === 'USER') {
            // Enforce active status in real-time - deactivated users are logged out on next request.
            FoodUser.findById(userId).select('isActive').lean().then((doc) => {
                if (res.headersSent) return;
                if (!doc || doc.isActive === false) {
                    return sendError(res, 401, doc ? 'User account is deactivated' : 'User account not found');
                }
                next();
            }).catch(() => {
                if (!res.headersSent) {
                    sendError(res, 401, 'Invalid user token');
                }
            });
            return;
        }

        if (role === 'ADMIN' || role === 'SUPERADMIN' || role === 'SUPER_ADMIN' || role === 'SUBADMIN' || role === 'FRANCHISE_STAFF') {
            const FoodAdmin = mongoose.model('FoodAdmin');
            FoodAdmin.findById(userId).lean().then((doc) => {
                if (res.headersSent) return;
                if (!doc || doc.isActive === false || doc.active === false) {
                    return sendError(res, 401, doc ? 'Admin account is deactivated' : 'Admin account not found');
                }
                req.user.adminLevel = doc.adminLevel;
                req.user.module = doc.module;
                req.user.permissions = doc.permissions || [];
                req.user.franchiseId = doc.franchiseId ? doc.franchiseId.toString() : null;
                req.user.role = doc.role || role; // Use precise role from DB if available
                next();
            }).catch(() => {
                if (!res.headersSent) {
                    sendError(res, 401, 'Invalid admin token');
                }
            });
            return;
        }

        return next();
    } catch (error) {
        return sendError(res, 401, 'Invalid or expired token');
    }
};
