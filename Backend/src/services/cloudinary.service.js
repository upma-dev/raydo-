import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env.js';

cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret
});

export const uploadImageBuffer = async (buffer, folder = 'uploads') => {
    if (!buffer) {
        throw new Error('File buffer is required');
    }

    if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
        // Fallback if Cloudinary is not configured in env
        return `data:image/jpeg;base64,${buffer.toString('base64')}`;
    }

    return new Promise((resolve) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image' },
            (error, result) => {
                if (error || !result?.secure_url) {
                    console.warn('[Cloudinary Service] Upload stream failed, using base64 fallback:', error?.message || error);
                    return resolve(`data:image/jpeg;base64,${buffer.toString('base64')}`);
                }
                return resolve(result.secure_url);
            }
        );

        stream.end(buffer);
    });
};

export const uploadImageBufferDetailed = async (buffer, folder = 'uploads', mimetype = 'image/png') => {
    if (!buffer) {
        throw new Error('File buffer is required');
    }

    if (!config.cloudinaryCloudName || !config.cloudinaryApiKey || !config.cloudinaryApiSecret) {
        const mime = mimetype || 'image/png';
        return {
            secure_url: `data:${mime};base64,${buffer.toString('base64')}`,
            public_id: ''
        };
    }

    const uploadPromise = new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(
            { folder, resource_type: 'image' },
            (error, result) => {
                if (error || !result?.secure_url) {
                    return reject(error || new Error('Upload stream returned invalid result'));
                }
                return resolve(result);
            }
        );

        stream.end(buffer);
    });

    const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Cloudinary upload timed out after 10s')), 10000);
    });

    try {
        return await Promise.race([uploadPromise, timeoutPromise]);
    } catch (err) {
        console.warn('[Cloudinary Service] Detailed upload stream failed/timed out, using base64 fallback:', err?.message || err);
        const mime = mimetype || 'image/png';
        return {
            secure_url: `data:${mime};base64,${buffer.toString('base64')}`,
            public_id: ''
        };
    }
};

