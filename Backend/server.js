import http from 'http';
import crypto from 'crypto';
import { exec } from 'child_process';

import app from './src/app.js';
import { config } from './src/config/env.js';
import { validateConfig } from './src/config/validateEnv.js';
import { connectDB, disconnectDB } from './src/config/db.js';
import { connectRedis, closeRedis } from './src/config/redis.js';
import { initSocket } from './src/config/socket.js';
import { initializeQueues, closeBullMQConnection } from './src/queues/index.js';
import { expireExpiredOffers } from './src/modules/food/admin/services/admin.service.js';
import { syncExpiredFssaiNotifications } from './src/modules/food/restaurant/services/fssaiExpiry.service.js';
import { checkAndSendGigReminders } from './src/modules/food/delivery/services/gigReminder.service.js';
import { processNoShows } from './src/modules/food/delivery/services/gig.service.js';

import { logger } from './src/utils/logger.js';
import { initializeFirebaseRealtime } from './src/config/firebase.js';

const SHUTDOWN_TIMEOUT_MS = 10000;
let server = null;
let expireOffersInterval = null;
let fssaiExpiryInterval = null;
let gigReminderInterval = null;
let scheduledOrdersInterval = null;
let autoCancelInterval = null;
let taxiSettlementInterval = null;

const gracefulShutdown = async (signal) => {
    logger.info(`${signal} received, starting graceful shutdown`);
    if (!server) {
        process.exit(0);
        return;
    }
    server.close(async () => {
        try {
            await disconnectDB();
            await closeRedis();
            await closeBullMQConnection();
            if (expireOffersInterval) clearInterval(expireOffersInterval);
            if (fssaiExpiryInterval) clearInterval(fssaiExpiryInterval);
            if (gigReminderInterval) clearInterval(gigReminderInterval);
            if (scheduledOrdersInterval) clearInterval(scheduledOrdersInterval);
            if (autoCancelInterval) clearInterval(autoCancelInterval);
            if (taxiSettlementInterval) clearInterval(taxiSettlementInterval);
            logger.info('Graceful shutdown complete');
            process.exit(0);
        } catch (err) {
            logger.error(`Shutdown error: ${err.message}`);
            process.exit(1);
        }
    });
    setTimeout(() => {
        logger.error('Shutdown timeout, forcing exit');
        process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
};

const startServer = async () => {
    try {
        validateConfig();
        initializeFirebaseRealtime();

        // 1. Connect to Database (MongoDB)
        await connectDB();

        // Every franchise login must only reach the modules its franchise bought (repairs older accounts, idempotent)
        try {
            // The franchise ledger's unique index is what stops any credit from being paid twice: make sure it exists
            const { default: FranchiseLedger } = await import('./src/modules/food/admin/models/franchiseLedger.model.js');
            await FranchiseLedger.init();
            const { backfillFranchiseAccess } = await import('./src/modules/food/admin/services/franchise.service.js');
            const fixed = await backfillFranchiseAccess();
            if (fixed > 0) logger.info(`Franchise access repaired for ${fixed} login(s)`);
        } catch (err) {
            logger.error(`Franchise access backfill failed: ${err.message}`);
        }

        // Food and Taxi share one Razorpay account (uses .env keys, else the keys saved in Admin > Payment Gateways)
        try {
            const { startRazorpayCredentialSync } = await import('./src/modules/food/orders/helpers/razorpay.helper.js');
            startRazorpayCredentialSync();
        } catch (err) {
            logger.error(`Razorpay credential sync failed to start: ${err.message}`);
        }

        // 2. Create HTTP server from Express app
        const httpServer = http.createServer(app);

        // 3. Initialize Socket.IO with the HTTP server (Redis adapter when Redis enabled)
        await initSocket(httpServer);

        if (config.redisEnabled) {
            await connectRedis();
        }

        // 5a. Watchdog: Recover stuck orders from previous run
        try {
            const { recoverStuckOrders } = await import('./src/modules/food/orders/services/order.service.js');
            await recoverStuckOrders();
            const { syncUnassignedRestaurantZones } = await import('./src/modules/food/restaurant/services/restaurant.service.js');
            await syncUnassignedRestaurantZones();
        } catch (err) {
            logger.error(`Watchdog startup error: ${err.message}`);
        }

        // 5. Conditionally initialize BullMQ queues.
        // BullMQ requires Redis; skip queue bootstrap when Redis is disabled.
        if (config.bullmqEnabled && config.redisEnabled) {
            try {
                initializeQueues();
            } catch (err) {
                logger.error(`BullMQ initialization error (server continues): ${err.message}`);
            }
        } else if (config.bullmqEnabled && !config.redisEnabled) {
            logger.warn('BullMQ is enabled but Redis is disabled. Queue initialization skipped.');
        }

        app.post('/api/deploy', (req, res) => {
            const signature = req.headers['x-hub-signature-256'];
            const secret = 'mysecret123';

            const hash = 'sha256=' + crypto
                .createHmac('sha256', secret)
                .update(JSON.stringify(req.body))
                .digest('hex');

            if (signature !== hash) {
                return res.status(403).send('Unauthorized');
            }

            exec('cd ~ && ./deploy.sh', (err, stdout, stderr) => {
                if (err) {
                    console.error(err);
                    return res.send('Deploy failed');
                }

                console.log(stdout);
                res.send('Deploy success');
            });
        });

        // 6. Start the HTTP server

        server = httpServer.listen(config.port, config.host, () => {
            logger.info(`Server running in ${config.nodeEnv} mode on ${config.host}:${config.port}`);
            console.log(`🌐 [URL] http://localhost:${config.port}`);
        });

        const runExpire = async () => {
            try {
                await expireExpiredOffers();
            } catch (err) {
                logger.error(`Expire offers error: ${err.message}`);
            }
        };
        runExpire();
        expireOffersInterval = setInterval(runExpire, 5 * 60 * 1000);

        const runFssaiExpirySync = async () => {
            try {
                await syncExpiredFssaiNotifications();
            } catch (err) {
                logger.error(`FSSAI expiry sync error: ${err.message}`);
            }
        };
        runFssaiExpirySync();
        fssaiExpiryInterval = setInterval(runFssaiExpirySync, 60 * 60 * 1000);

        const runGigReminderCheck = async () => {
            try {
                await checkAndSendGigReminders();
                await processNoShows();
            } catch (err) {
                logger.error(`Gig reminder check error: ${err.message}`);
            }
        };
        runGigReminderCheck();
        gigReminderInterval = setInterval(runGigReminderCheck, 60 * 1000);

        const runScheduledOrdersCheck = async () => {
            try {
                const { processScheduledFoodOrders } = await import('./src/modules/food/orders/services/order.service.js');
                await processScheduledFoodOrders();
            } catch (err) {
                logger.error(`Scheduled food orders check error: ${err.message}`);
            }
        };
        runScheduledOrdersCheck();
        scheduledOrdersInterval = setInterval(runScheduledOrdersCheck, 60 * 1000);

        // Orders the restaurant did not accept within the admin-set time are cancelled and refunded automatically
        const runAutoCancelCheck = async () => {
            try {
                const { autoCancelUnacceptedOrders } = await import('./src/modules/food/orders/services/order-cancel.service.js');
                await autoCancelUnacceptedOrders();
            } catch (err) {
                logger.error(`Auto-cancel check error: ${err.message}`);
            }
        };
        autoCancelInterval = setInterval(runAutoCancelCheck, 60 * 1000);

        // Taxi: credit drivers for completed ONLINE rides whose payment has been confirmed since (safety net)
        const runTaxiSettlement = async () => {
            try {
                const { settlePaidOnlineRides } = await import('./src/modules/taxi/driver/services/walletService.js');
                await settlePaidOnlineRides();
                const { creditFranchiseForBusBookings } = await import('./src/modules/food/admin/services/franchiseTaxi.service.js');
                await creditFranchiseForBusBookings();
            } catch (err) {
                logger.error(`Taxi settlement check error: ${err.message}`);
            }
        };
        taxiSettlementInterval = setInterval(runTaxiSettlement, 60 * 1000);

        process.on('SIGINT', () => gracefulShutdown('SIGINT'));
        process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));

        // Handle server errors (like EADDRINUSE)
        server.on('error', (err) => {
            if (err.code === 'EADDRINUSE') {
                logger.error(`Port ${config.port} is already in use. Please kill the process or use a different port.`);
            } else {
                logger.error(`Server Error: ${err.message}`);
            }
            process.exit(1);
        });

        // Handle unhandled promise rejections
        process.on('unhandledRejection', (err) => {
            logger.error(`Unhandled Rejection: ${err?.message || err}`);
            if (config.nodeEnv === 'production') {
                if (server) server.close(() => process.exit(1));
                else process.exit(1);
            }
        });

        process.on('uncaughtException', (err) => {
            logger.error(`Uncaught Exception: ${err?.message || err}`);
            if (config.nodeEnv === 'production') {
                process.exit(1);
            }
        });

    } catch (error) {
        logger.error(`Error starting server: ${error.message}`);
        process.exit(1);
    }
};

startServer();

