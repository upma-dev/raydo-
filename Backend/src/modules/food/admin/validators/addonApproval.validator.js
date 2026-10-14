import { z } from 'zod';
import { ValidationError } from '../../../../core/auth/errors.js';

const listSchema = z.object({
    search: z.string().max(80).optional(),
    restaurantId: z.string().optional(),
    zoneId: z.string().optional(),
    approvalStatus: z.enum(['pending', 'approved', 'rejected']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    // Large page sizes are capped, not rejected (the franchise/admin pages ask for 1000)
    limit: z.coerce.number().int().min(1).transform((n) => Math.min(n, 200)).optional()
});

const rejectSchema = z.object({
    reason: z.string().min(1, 'Rejection reason is required').max(500)
});

export const validateAddonAdminListQuery = (query) => {
    const result = listSchema.safeParse(query);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0]?.message || 'Invalid query');
    }
    return result.data;
};

export const validateAddonRejectDto = (body) => {
    const result = rejectSchema.safeParse(body);
    if (!result.success) {
        throw new ValidationError(result.error.errors[0]?.message || 'Invalid rejection data');
    }
    return result.data;
};

