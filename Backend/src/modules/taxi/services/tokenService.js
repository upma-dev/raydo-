import jwt from 'jsonwebtoken';
import { env } from '../../../config/env.js';

// Taxi apps (driver / owner / admin / ride-mode partner) have no refresh-token flow: when this token runs out the person is
// logged out. So it lives long (30 days unless TAXI_JWT_EXPIRES says otherwise) instead of the short food access token (15m).
const TAXI_TOKEN_EXPIRES = process.env.TAXI_JWT_EXPIRES || '30d';

export const signAccessToken = ({ sub, role }) =>
  jwt.sign({ role }, env.jwtSecret, {
    subject: sub,
    expiresIn: TAXI_TOKEN_EXPIRES,
  });

export const verifyAccessToken = (token) => jwt.verify(token, env.jwtSecret);
