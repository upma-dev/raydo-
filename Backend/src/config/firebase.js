import admin from 'firebase-admin';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

let db = null;
let messaging = null;
let cachedServiceAccount = null;

const sanitizeString = (value) => String(value ?? '').trim();

const getServiceAccountFromEnv = () => {
    if (cachedServiceAccount) return cachedServiceAccount;

    const pathValue = sanitizeString(config.firebaseServiceAccountPath);
    if (pathValue) {
        const filePath = resolve(process.cwd(), pathValue);
        if (existsSync(filePath)) {
            try {
                cachedServiceAccount = JSON.parse(readFileSync(filePath, 'utf8'));
            } catch (err) {
                logger.error(`Error reading or parsing firebase service account file at ${filePath}:`, err.message);
            }
        }
    }

    if (!cachedServiceAccount) {
        const rawJson = sanitizeString(config.firebaseServiceAccount);
        if (rawJson) {
            try {
                cachedServiceAccount = JSON.parse(rawJson);
            } catch (err) {
                logger.error('Error parsing FIREBASE_SERVICE_ACCOUNT JSON:', err.message);
            }
        }
    }

    if (cachedServiceAccount && typeof cachedServiceAccount.private_key === 'string') {
        let key = cachedServiceAccount.private_key.trim();
        if ((key.startsWith('"') && key.endsWith('"')) || (key.startsWith("'") && key.endsWith("'"))) {
            key = key.slice(1, -1);
        }
        key = key.replace(/\\n/g, '\n');
        cachedServiceAccount.private_key = key;
    }
    return cachedServiceAccount;
};

/**
 * Initializes Firebase Admin SDK with Service Account.
 * Supports both FCM and Realtime Database.
 */
export const initializeFirebaseRealtime = () => {
    try {
        if (admin.apps.length > 0) {
            db = admin.database();
            messaging = admin.messaging();
            return { db, messaging };
        }

        const serviceAccount = getServiceAccountFromEnv();
        const databaseURL = config.firebaseDatabaseUrl;

        if (!serviceAccount || !serviceAccount.private_key || !serviceAccount.client_email) {
            logger.warn('⚠️ Firebase service account not fully configured. Firebase features may not work.');
            return null;
        }

        try {
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount),
                databaseURL: databaseURL || undefined
            });
        } catch (certErr) {
            logger.warn(`⚠️ Firebase credential certification error: ${certErr.message}. Firebase features disabled.`);
            return null;
        }

        db = admin.database();
        messaging = admin.messaging();

        logger.info('✅ Firebase Realtime Database Initialized Successfully');
        return { db, messaging };
    } catch (error) {
        logger.error(`❌ Firebase Initialization Error: ${error.message}`);
        return null;
    }
};

/**
 * Returns the initialized Firebase Realtime Database instance.
 * @returns {admin.database.Database}
 * @throws Error if not initialized
 */
export const getFirebaseDB = () => {
    if (!db) {
        throw new Error('⚠️ Firebase Realtime Database not initialized. Call initializeFirebaseRealtime() first.');
    }
    return db;
};

/**
 * Returns the initialized Firebase Messaging instance.
 * @returns {admin.messaging.Messaging}
 * @throws Error if not initialized
 */
export const getFirebaseMessaging = () => {
    if (!messaging) {
        throw new Error('⚠️ Firebase Messaging not initialized. Call initializeFirebaseRealtime() first.');
    }
    return messaging;
};

export const getFirebaseDatabase = getFirebaseDB;
export const firebaseServerTimestamp = admin.database.ServerValue.TIMESTAMP;

export default admin;
