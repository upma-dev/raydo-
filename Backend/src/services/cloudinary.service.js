import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config/env.js';
import { saveImageBuffer, deleteStoredImage, STORED_ID_PREFIX } from './storage.service.js';

// Cloudinary is only kept so images uploaded there earlier can still be deleted. All new images are stored on the
// server disk (see storage.service.js); the function names below stay so every existing caller moves over unchanged.
cloudinary.config({
    cloud_name: config.cloudinaryCloudName,
    api_key: config.cloudinaryApiKey,
    api_secret: config.cloudinaryApiSecret
});

/** Saves the image on this server and returns its public URL. */
export const uploadImageBuffer = async (buffer, folder = 'uploads') => {
    const saved = await saveImageBuffer(buffer, folder);
    return saved.url;
};

/** Deletes an image by its publicId: a file on this server, or (for older records) the Cloudinary copy. */
export const destroyImage = async (publicId) => {
    const id = String(publicId || '');
    if (!id) return;
    if (id.startsWith(STORED_ID_PREFIX)) {
        await deleteStoredImage(id);
        return;
    }
    await cloudinary.uploader.destroy(id);
};

/** Same as uploadImageBuffer, in the { secure_url, public_id } shape the admin settings code expects. */
export const uploadImageBufferDetailed = async (buffer, folder = 'uploads', mimetype = 'image/png') => {
    const saved = await saveImageBuffer(buffer, folder, mimetype);
    return { secure_url: saved.url, public_id: saved.publicId };
};
