import mongoose from 'mongoose';
import dns from 'node:dns';
import { config } from './env.js';
import { logger } from '../utils/logger.js';

try {
  dns.setDefaultResultOrder('ipv4first');
} catch (_) {}

export const connectDB = async () => {
    try {
        if (process.env.MONGODB_DNS_SERVERS) {
            const dnsServers = String(process.env.MONGODB_DNS_SERVERS)
                .split(',')
                .map((s) => s.trim())
                .filter(Boolean);

            if (dnsServers.length > 0) {
                try {
                    dns.setServers(dnsServers);
                    logger.info(`Using custom DNS servers for MongoDB lookup: ${dnsServers.join(', ')}`);
                } catch (dnsError) {
                    logger.warn(`Failed to set custom DNS servers: ${dnsError.message}`);
                }
            }
        }

        const conn = await mongoose.connect(config.mongodbUri, {
            serverSelectionTimeoutMS: Number(process.env.MONGODB_SERVER_SELECTION_TIMEOUT_MS || 10000),
            connectTimeoutMS: Number(process.env.MONGODB_CONNECT_TIMEOUT_MS || 15000),
            family: 4, // Prefer IPv4 where local resolvers have IPv6/SRV issues.
        });
        logger.info(`MongoDB connected: ${conn.connection.host}`);
    } catch (error) {
        logger.error(`MongoDB connection error: ${error.message}`);
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