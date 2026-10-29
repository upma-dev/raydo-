import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';
import { saveImageBuffer } from '../services/storage.service.js';

// Despite the name (kept so every caller stays unchanged), images are now stored on the server's own disk, not Cloudinary.

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

const parseDataUrl = (dataUrl) => {
  const match = String(dataUrl || '').match(DATA_URL_PATTERN);

  if (!match) {
    throw new ApiError(400, 'A valid base64 image data URL is required');
  }

  return {
    mimeType: match[1],
    base64: match[2],
  };
};

export const uploadBufferToCloudinary = async ({
  buffer,
  mimeType = 'image/jpeg',
  folder = env.cloudinary.folder,
  publicIdPrefix = 'driver-document',
}) => {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ApiError(400, 'Image buffer is required');
  }

  let saved;
  try {
    saved = await saveImageBuffer(buffer, publicIdPrefix || folder, mimeType);
  } catch (error) {
    throw new ApiError(500, `Image could not be saved: ${error?.message || 'storage error'}`);
  }

  return {
    secureUrl: saved.url,
    publicId: saved.publicId,
    resourceType: 'image',
    format: saved.fileName.split('.').pop(),
    bytes: saved.bytes,
    width: null,
    height: null,
    originalFilename: saved.fileName,
    createdAt: new Date().toISOString(),
    raw: { secure_url: saved.url, public_id: saved.publicId },
  };
};

export const uploadDataUrlToCloudinary = async ({
  dataUrl,
  folder = env.cloudinary.folder,
  publicIdPrefix = 'driver-document',
}) => {
  const { mimeType, base64 } = parseDataUrl(dataUrl);

  return uploadBufferToCloudinary({
    buffer: Buffer.from(base64, 'base64'),
    mimeType,
    folder,
    publicIdPrefix,
  });
};
