import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { config } from '../../config/env.js';

export const signAccessToken = (payload) => {
    return jwt.sign(payload, config.jwtAccessSecret, {
        expiresIn: config.jwtAccessExpiresIn
    });
};

export const signRefreshToken = (payload) => {
    // jwtid makes every refresh token unique: two logins of the same person in the same second used to produce the
    // SAME token and the second login failed on the unique token index
    return jwt.sign(payload, config.jwtRefreshSecret, {
        expiresIn: config.jwtRefreshExpiresIn,
        jwtid: crypto.randomUUID()
    });
};

export const verifyAccessToken = (token) => {
    return jwt.verify(token, config.jwtAccessSecret);
};

export const verifyRefreshToken = (token) => {
    return jwt.verify(token, config.jwtRefreshSecret);
};

