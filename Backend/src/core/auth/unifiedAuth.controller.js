import { requestUserOtpController, verifyUserOtpController } from './auth.controller.js';

/**
 * Unified Request OTP: Hits the standard user OTP request.
 * In a real production scenario, this could also trigger a sync with Taxi backend if they are separate.
 */
export const requestUnifiedOtpController = async (req, res, next) => {
    // For now, we reuse the standard user OTP request. `next` MUST be passed on: without it a bad request (empty body,
    // wrong phone) crashed the whole server with "next is not a function".
    return requestUserOtpController(req, res, next);
};

/**
 * Unified Verify OTP: Verifies OTP and ensures tokens are valid for the Super App context.
 */
export const verifyUnifiedOtpController = async (req, res, next) => {
    // Reusing standard verification which returns { accessToken, refreshToken, user }
    return verifyUserOtpController(req, res, next);
};
