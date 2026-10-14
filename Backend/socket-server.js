import http from 'http';

import { config } from './src/config/env.js';
import { logger } from './src/utils/logger.js';

let socketServer = null;

/**
 * Serves an already-initialized Socket.IO instance on its own port (SOCKET_PORT in .env).
 * The instance stays in the API process so getIO() emits from services keep working.
 * @param {import('socket.io').Server} io
 * @returns {import('http').Server}
 */
export const startSocketServer = (io) => {
    socketServer = http.createServer();
    io.attach(socketServer);

    socketServer.on('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            logger.error(`Socket port ${config.socketPort} is already in use. Change SOCKET_PORT in .env.`);
        } else {
            logger.error(`Socket server error on port ${config.socketPort}: ${err.message}`);
        }
    });

    socketServer.listen(config.socketPort, config.host, () => {
        logger.info(`Socket.IO listening on ${config.host}:${config.socketPort}`);
    });

    return socketServer;
};

export const stopSocketServer = () => {
    if (socketServer) {
        socketServer.close();
        socketServer = null;
    }
};
