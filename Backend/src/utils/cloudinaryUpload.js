import crypto from 'node:crypto';
import { Blob } from 'node:buffer';
import { env } from '../config/env.js';
import { ApiError } from './ApiError.js';

const DATA_URL_PATTERN = /^data:([^;]+);base64,(.+)$/;

const parseDataUrl = (dataUrl) => {
  const match = String(dataUrl || '').match(DATA_URL_PATTERN);

  if (!match) {
    throw new ApiError(400, 'A valid base64 image data URL is required');
  }

  const mimeType = match[1];
  const base64 = match[2];
  const extension = mimeType.split('/')[1] || 'jpg';

  return {
    mimeType,
    base64,
    extension,
  };
};

const extensionFromMimeType = (mimeType = 'image/jpeg') => {
  const raw = String(mimeType || '').trim().toLowerCase();
  if (!raw.includes('/')) {
    return 'jpg';
  }

  const [, subtype] = raw.split('/');
  if (!subtype) {
    return 'jpg';
  }

  if (subtype.includes('jpeg')) return 'jpg';
  if (subtype.includes('png')) return 'png';
  if (subtype.includes('webp')) return 'webp';
  return subtype.replace(/[^a-z0-9]/g, '') || 'jpg';
};

const buildSignature = (params, apiSecret) => {
  const payload = Object.entries(params)
    .filter(([, value]) => value !== undefined && value !== null && value !== '')
    .sort(([leftKey], [rightKey]) => leftKey.localeCompare(rightKey))
    .map(([key, value]) => `${key}=${value}`)
    .join('&');

  return crypto.createHash('sha1').update(`${payload}${apiSecret}`).digest('hex');
};

export const uploadBufferToCloudinary = async ({
  buffer,
  mimeType = 'image/jpeg',
  folder = env.cloudinary.folder,
  publicIdPrefix = 'driver-document',
  publicIdSuffix = '',
  format = 'webp',
}) => {
  if (!env.cloudinary.cloudName || !env.cloudinary.apiKey || !env.cloudinary.apiSecret) {
    throw new ApiError(500, 'Cloudinary credentials are not configured');
  }

  if (!Buffer.isBuffer(buffer) || buffer.length === 0) {
    throw new ApiError(400, 'Image buffer is required');
  }

  const extension = extensionFromMimeType(mimeType);
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const publicId = `${publicIdPrefix}-${Date.now()}${publicIdSuffix ? `-${publicIdSuffix}` : ''}`;

  const signature = buildSignature(
    {
      folder,
      format,
      public_id: publicId,
      timestamp,
    },
    env.cloudinary.apiSecret,
  );

  const formData = new FormData();
  formData.append('file', new Blob([buffer], { type: mimeType }), `upload.${extension}`);
  formData.append('api_key', env.cloudinary.apiKey);
  formData.append('timestamp', timestamp);
  formData.append('folder', folder);
  formData.append('public_id', publicId);
  if (format) {
    formData.append('format', format);
  }
  formData.append('signature', signature);

  // A big photo on a slow / flaky link can drop the connection ("fetch failed"). Retry network errors a few times with a
  // timeout, instead of failing the whole upload on the first hiccup. Real answers from Cloudinary (4xx etc.) are not retried.
  const MAX_ATTEMPTS = 3;
  let response;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      response = await fetch(`https://api.cloudinary.com/v1_1/${env.cloudinary.cloudName}/image/upload`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(60000),
      });
      break;
    } catch (networkError) {
      const reason = networkError?.cause?.code || networkError?.cause?.message || networkError?.message;
      console.warn(`[cloudinary] upload attempt ${attempt}/${MAX_ATTEMPTS} failed: ${reason}`);
      if (attempt === MAX_ATTEMPTS) {
        throw new ApiError(502, 'Image upload failed because of a network problem. Please check your internet and try again.');
      }
      await new Promise((resolve) => setTimeout(resolve, 700 * attempt));
    }
  }

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    throw new ApiError(response.status || 502, payload?.error?.message || 'Cloudinary upload failed');
  }

  return {
    secureUrl: payload.secure_url,
    publicId: payload.public_id,
    resourceType: payload.resource_type,
    format: payload.format,
    bytes: payload.bytes,
    width: payload.width,
    height: payload.height,
    originalFilename: payload.original_filename,
    createdAt: payload.created_at,
    raw: payload,
  };
};

export const uploadDataUrlToCloudinary = async ({
  dataUrl,
  folder = env.cloudinary.folder,
  publicIdPrefix = 'driver-document',
  publicIdSuffix = '',
  format = 'webp',
}) => {
  const { mimeType, base64 } = parseDataUrl(dataUrl);
  const buffer = Buffer.from(base64, 'base64');

  return uploadBufferToCloudinary({
    buffer,
    mimeType,
    folder,
    publicIdPrefix,
    publicIdSuffix,
    format,
  });
};
