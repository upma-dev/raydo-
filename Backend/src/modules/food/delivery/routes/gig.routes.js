import express from 'express';
import { upload } from '../../../../middleware/upload.js';
import { authMiddleware } from '../../../../core/auth/auth.middleware.js';
import { requireRoles } from '../../../../core/roles/role.middleware.js';
import {
  verifySelfieHandler,
  listSelfieLogsHandler,
  reviewSelfieLogHandler
} from '../controllers/gig.controller.js';

const router = express.Router();

const selfieUpload = upload.fields([
  { name: 'selfiePhoto', maxCount: 1 }
]);

// GIG (shift booking) FEATURE IS SWITCHED OFF. Riders go online directly. Every gig endpoint answers 410 Gone.
// The selfie check is NOT part of gigs: it is still needed before a rider goes online, so those routes stay.
const gigDisabled = (_req, res) => res.status(410).json({ success: false, message: 'The gig feature has been discontinued.' });

// --- Delivery Partner Endpoints ---
router.get('/partner/gigs', authMiddleware, requireRoles('DELIVERY_PARTNER'), gigDisabled);
router.post('/partner/gigs/book', authMiddleware, requireRoles('DELIVERY_PARTNER'), gigDisabled);
router.delete('/partner/gigs/cancel/:gigId', authMiddleware, requireRoles('DELIVERY_PARTNER'), gigDisabled);
router.get('/partner/gigs/active', authMiddleware, requireRoles('DELIVERY_PARTNER'), gigDisabled);
router.post('/partner/gigs/verify-selfie', authMiddleware, requireRoles('DELIVERY_PARTNER'), selfieUpload, verifySelfieHandler);

// --- Admin Endpoints ---
router.use('/admin/gigs/selfie-logs', authMiddleware, requireRoles('ADMIN'));
router.get('/admin/gigs/selfie-logs', listSelfieLogsHandler);
router.patch('/admin/gigs/selfie-logs/:logId', reviewSelfieLogHandler);
router.all('/admin/gigs', authMiddleware, requireRoles('ADMIN'), gigDisabled);
router.all('/admin/gigs/*', authMiddleware, requireRoles('ADMIN'), gigDisabled);

export default router;
