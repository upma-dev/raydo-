import { FranchiseKyc } from './franchiseKyc.model.js';
import { Franchise } from './franchise.model.js';
import { generateUploadUrl, generateDownloadUrl } from '../../utils/s3.service.js';
import { ApiError } from '../../utils/ApiError.js';
import mongoose from 'mongoose';

const ALLOWED_EXTENSIONS = ['pdf', 'jpg', 'jpeg', 'png'];

export const getUploadPresignedUrl = async (req, res, next) => {
    try {
        const franchiseId = req.franchiseId || req.body.franchiseId;
        const { documentType, fileExtension } = req.body;

        if (!franchiseId) {
            throw new ApiError(400, 'Franchise ID is required');
        }

        if (req.franchiseId && req.franchiseId.toString() !== franchiseId.toString()) {
            throw new ApiError(403, 'Unauthorized');
        }

        if (!documentType || !fileExtension) {
            throw new ApiError(400, 'Document Type and File Extension are required');
        }

        if (!ALLOWED_EXTENSIONS.includes(fileExtension.toLowerCase())) {
            throw new ApiError(400, `Invalid file extension. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`);
        }

        const result = await generateUploadUrl(franchiseId, documentType, fileExtension);

        res.json({ success: true, data: result });
    } catch (err) {
        next(err);
    }
};

export const submitKycDocument = async (req, res, next) => {
    try {
        const franchiseId = req.franchiseId || req.body.franchiseId;
        const { documentType, objectKey, metadata } = req.body;

        if (!franchiseId || !documentType || !objectKey) {
            throw new ApiError(400, 'Missing required fields');
        }

        if (req.franchiseId && req.franchiseId.toString() !== franchiseId.toString()) {
            throw new ApiError(403, 'Unauthorized');
        }

        // Verify franchise exists
        const franchise = await Franchise.findById(franchiseId);
        if (!franchise) {
            throw new ApiError(404, 'Franchise not found');
        }

        // Upsert logic: if a pending/rejected record exists, overwrite or create new version
        const existingDoc = await FranchiseKyc.findOne({
            franchiseId,
            documentType
        });

        if (existingDoc && existingDoc.status === 'VERIFIED') {
            throw new ApiError(400, 'Document already verified. Cannot overwrite.');
        }

        let doc;
        if (existingDoc) {
            existingDoc.fileUrl = objectKey;
            existingDoc.status = 'PENDING'; // reset status
            existingDoc.rejectionReason = undefined;
            if (metadata) existingDoc.metadata = metadata;
            doc = await existingDoc.save();
        } else {
            doc = new FranchiseKyc({
                franchiseId,
                documentType,
                fileUrl: objectKey,
                status: 'PENDING',
                metadata
            });
            await doc.save();
        }

        res.json({ success: true, data: doc });
    } catch (err) {
        next(err);
    }
};

export const getKycList = async (req, res, next) => {
    try {
        const franchiseId = req.franchiseId || req.query.franchiseId;
        const filter = {};

        if (franchiseId) {
            if (req.franchiseId && req.franchiseId.toString() !== franchiseId.toString()) {
                throw new ApiError(403, 'Unauthorized');
            }
            filter.franchiseId = franchiseId;
        }

        if (req.query.status) {
            filter.status = req.query.status;
        }

        const docs = await FranchiseKyc.find(filter)
            .populate('franchiseId', 'name email status')
            .populate('verifiedBy', 'name email')
            .sort({ updatedAt: -1 })
            .lean();

        res.json({ success: true, data: docs });
    } catch (err) {
        next(err);
    }
};

export const getDownloadPresignedUrl = async (req, res, next) => {
    try {
        const doc = await FranchiseKyc.findById(req.params.id);
        
        if (!doc) {
            throw new ApiError(404, 'Document not found');
        }

        if (req.franchiseId && doc.franchiseId.toString() !== req.franchiseId.toString()) {
            throw new ApiError(403, 'Unauthorized access to document');
        }

        const downloadUrl = await generateDownloadUrl(doc.fileUrl);

        res.json({ success: true, data: { downloadUrl } });
    } catch (err) {
        next(err);
    }
};

export const updateKycStatus = async (req, res, next) => {
    try {
        // Only Super Admin can verify/reject
        if (req.franchiseId) {
            throw new ApiError(403, 'Franchise cannot verify their own KYC');
        }

        const { status, rejectionReason } = req.body;
        
        if (!['VERIFIED', 'REJECTED', 'UNDER_REVIEW'].includes(status)) {
            throw new ApiError(400, 'Invalid status update');
        }

        if (status === 'REJECTED' && !rejectionReason) {
            throw new ApiError(400, 'Rejection reason is required');
        }

        const doc = await FranchiseKyc.findById(req.params.id);
        if (!doc) throw new ApiError(404, 'Document not found');

        doc.status = status;
        if (status === 'REJECTED') {
            doc.rejectionReason = rejectionReason;
        } else if (status === 'VERIFIED') {
            doc.verifiedBy = req.user?._id;
            doc.verifiedAt = new Date();
            doc.rejectionReason = undefined;
        }

        await doc.save();

        res.json({ success: true, data: doc });
    } catch (err) {
        next(err);
    }
};
