import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import crypto from 'crypto';

// Initialize S3 Client
// These variables should be placed in .env later.
const s3Client = new S3Client({
    region: process.env.AWS_REGION || 'ap-south-1',
    credentials: {
        accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'dummy-key',
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'dummy-secret'
    }
});

const BUCKET_NAME = process.env.AWS_S3_BUCKET_NAME || 'raydo-franchise-kyc-bucket';

/**
 * Generates a presigned URL for uploading a file directly from client to S3
 */
export const generateUploadUrl = async (franchiseId, documentType, fileExtension) => {
    // Add unique hash to prevent overwriting
    const uniqueHash = crypto.randomBytes(8).toString('hex');
    const objectKey = `franchise-kyc/${franchiseId}/${documentType}_${uniqueHash}.${fileExtension}`;

    const command = new PutObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey,
        ContentType: getContentType(fileExtension),
        // Optional: ServerSideEncryption: 'AES256'
    });

    // URL expires in 15 minutes
    const uploadUrl = await getSignedUrl(s3Client, command, { expiresIn: 900 });

    return { uploadUrl, objectKey };
};

/**
 * Generates a presigned URL for securely downloading/viewing a file from S3
 */
export const generateDownloadUrl = async (objectKey) => {
    const command = new GetObjectCommand({
        Bucket: BUCKET_NAME,
        Key: objectKey
    });

    // URL expires in 60 minutes
    const downloadUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });
    return downloadUrl;
};

// Helper for basic content types based on extensions
const getContentType = (extension) => {
    const ext = extension.toLowerCase();
    switch (ext) {
        case 'pdf': return 'application/pdf';
        case 'jpg':
        case 'jpeg': return 'image/jpeg';
        case 'png': return 'image/png';
        default: return 'application/octet-stream';
    }
};
