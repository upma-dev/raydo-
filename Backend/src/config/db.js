import mongoose from 'mongoose';
import dns from 'node:dns';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

try {
    const dnsServers = process.env.MONGODB_DNS_SERVERS
        ? String(process.env.MONGODB_DNS_SERVERS).split(',').map((s) => s.trim()).filter(Boolean)
        : ['8.8.8.8', '1.1.1.1', '8.8.4.4'];
    if (dnsServers.length > 0) {
        dns.setServers(dnsServers);
    }
} catch (_) { }

// Set up Mongoose connection event listeners once
mongoose.connection.on('disconnected', () => {
    logger.warn('MongoDB connection lost. Mongoose will attempt to reconnect...');
});

mongoose.connection.on('reconnected', () => {
    logger.info('MongoDB reconnected successfully');
});

mongoose.connection.on('error', (err) => {
    logger.error(`MongoDB connection error event: ${err?.message || err}`);
});

export const connectDB = async () => {
    try {
        const dnsServers = process.env.MONGODB_DNS_SERVERS
            ? String(process.env.MONGODB_DNS_SERVERS).split(',').map((s) => s.trim()).filter(Boolean)
            : ['8.8.8.8', '1.1.1.1', '8.8.4.4'];

        if (dnsServers.length > 0) {
            try {
                dns.setServers(dnsServers);
                logger.info(`Using DNS servers for MongoDB lookup: ${dnsServers.join(', ')}`);
            } catch (dnsError) {
                logger.warn(`Failed to set DNS servers: ${dnsError.message}`);
            }
        }

        const conn = await mongoose.connect(config.mongodbUri, {
            serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
            connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 15000)
        });
        logger.info(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        logger.error(`MongoDB connection error: ${error.message}`);
        // If initial connection failed, retry once after 2 seconds
        setTimeout(async () => {
            if (mongoose.connection.readyState === 0) {
                logger.info('Retrying MongoDB connection...');
                try {
                    await mongoose.connect(config.mongodbUri, {
                        serverSelectionTimeoutMS: 10000,
                        connectTimeoutMS: 15000
                    });
                    logger.info('MongoDB connected on retry!');
                } catch (retryErr) {
                    logger.error(`MongoDB retry failed: ${retryErr.message}`);
                }
            }
        }, 2000);
    }
};

/**
 * Close MongoDB connection (e.g. graceful shutdown).
 * @returns {Promise<void>}
 */
export const disconnectDB = async () => {
    await mongoose.connection.close();
    logger.info('MongoDB connection closed');
};

export const connectDatabase = connectDB;