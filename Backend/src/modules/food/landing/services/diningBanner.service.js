import { FoodDiningBanner } from '../models/diningBanner.model.js';
import { saveImageBuffer } from '../../../../services/storage.service.js';
import { destroyImage } from '../../../../services/cloudinary.service.js';

export const listDiningBanners = async () => {
    return FoodDiningBanner.find().sort({ sortOrder: 1, createdAt: -1 }).lean();
};

export const createDiningBannersFromFiles = async (files, meta = {}) => {
    if (!files || !files.length) {
        return [];
    }

    const results = [];

    for (const file of files) {
        try {
            const saved = await saveImageBuffer(file.buffer, 'food/dining-banners', file.mimetype);
            const imageUrl = saved.url;
            const publicId = saved.publicId;

            const banner = await FoodDiningBanner.create({
                imageUrl,
                publicId,
                title: meta.title || '',
                ctaText: meta.ctaText || '',
                ctaLink: meta.ctaLink || '',
                diningType: meta.diningType || 'all',
                sortOrder: meta.sortOrder ?? 0,
                isActive: true,
            });

            results.push({ success: true, banner: banner.toObject() });
        } catch (error) {
            results.push({ success: false, error: error.message });
        }
    }

    return results;
};

export const deleteDiningBanner = async (id) => {
    const doc = await FoodDiningBanner.findById(id);
    if (!doc) {
        return { deleted: false };
    }

    if (doc.publicId) {
        try {
            await destroyImage(doc.publicId);
        } catch {
            // ignore cloudinary deletion errors
        }
    }

    await doc.deleteOne();
    return { deleted: true };
};

export const updateDiningBannerOrder = async (id, sortOrder) => {
    const updated = await FoodDiningBanner.findByIdAndUpdate(
        id,
        { sortOrder },
        { new: true }
    ).lean();
    return updated;
};

export const toggleDiningBannerStatus = async (id, isActive) => {
    const updated = await FoodDiningBanner.findByIdAndUpdate(
        id,
        { isActive },
        { new: true }
    ).lean();
    return updated;
};

