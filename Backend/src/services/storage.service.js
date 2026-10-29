import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { config } from '../config/env.js';

/**
 * Image storage on the server's own disk (the VPS). Every upload path in the app goes through here.
 * Files are written to UPLOAD_PATH and served by Express (and/or nginx) under /uploads/<file>.
 */

export const UPLOAD_URL_PREFIX = '/uploads';
// publicId marker for files kept on this disk, so delete code can tell them apart from old Cloudinary images
export const STORED_ID_PREFIX = 'vps:';

export const getUploadRoot = () => {
    const configured = String(config.uploadPath || 'uploads/').trim();
    return path.isAbsolute(configured) ? path.normalize(configured) : path.resolve(process.cwd(), configured);
};

const EXTENSION_BY_MIME = {
    'image/jpeg': 'jpg',
    'image/jpg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/gif': 'gif',
    'image/svg+xml': 'svg',
    'image/avif': 'avif',
    'image/x-icon': 'ico',
    'image/vnd.microsoft.icon': 'ico',
};

// What the bytes really are wins over what the client claimed
const extensionFor = (buffer, mimeType) => {
    if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'jpg';
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
    if (buffer.length >= 12 && buffer.toString('ascii', 0, 4) === 'RIFF' && buffer.toString('ascii', 8, 12) === 'WEBP') return 'webp';
    if (buffer.length >= 4 && buffer.toString('ascii', 0, 3) === 'GIF') return 'gif';
    if (buffer.length >= 4 && buffer[0] === 0x00 && buffer[1] === 0x00 && buffer[2] === 0x01 && buffer[3] === 0x00) return 'ico';
    return EXTENSION_BY_MIME[String(mimeType || '').toLowerCase()] || 'jpg';
};

const prefixFor = (folder) => {
    const last = String(folder || '').replace(/\\/g, '/').split('/').filter(Boolean).pop() || 'img';
    return last.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 24) || 'img';
};

export const publicUrlFor = (fileName) => `${config.uploadPublicUrl}${UPLOAD_URL_PREFIX}/${fileName}`;

export const isStoredUrl = (value) => {
    const url = String(value || '');
    return url.startsWith(`${UPLOAD_URL_PREFIX}/`) || (Boolean(config.uploadPublicUrl) && url.startsWith(`${config.uploadPublicUrl}${UPLOAD_URL_PREFIX}/`));
};

/** Saves an image buffer on this server and returns { url, publicId, fileName, bytes }. */
export const saveImageBuffer = async (buffer, folder = 'uploads', mimeType = '') => {
    if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
        throw new Error('File buffer is required');
    }

    const root = getUploadRoot();
    await fs.mkdir(root, { recursive: true });

    const fileName = `${prefixFor(folder)}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}.${extensionFor(buffer, mimeType)}`;
    await fs.writeFile(path.join(root, fileName), buffer, { mode: 0o644 });

    return {
        url: publicUrlFor(fileName),
        publicId: `${STORED_ID_PREFIX}${fileName}`,
        fileName,
        bytes: buffer.length,
    };
};

/** Removes a file saved by saveImageBuffer. Returns false for anything else (e.g. an old Cloudinary publicId). */
export const deleteStoredImage = async (publicId) => {
    const id = String(publicId || '');
    if (!id.startsWith(STORED_ID_PREFIX)) return false;
    const fileName = path.basename(id.slice(STORED_ID_PREFIX.length));
    if (!fileName) return false;
    try {
        await fs.unlink(path.join(getUploadRoot(), fileName));
        return true;
    } catch {
        return false;
    }
};
