import { config } from '../config/env.js';
import { logger } from '../utils/logger.js';

const errorHandler = (err, req, res, next) => {
    let statusCode = err.statusCode || 500;
    let message = err.message || 'Server Error';
    const requestId = req.requestId || '-';

    if (err.name === 'CastError' || err.name === 'BSONError' || String(err.message || '').includes('hex string')) {
        statusCode = 400;
        message = 'Invalid ID format provided';
    }
    // Mongoose schema validation (min/max/enum...) is a bad request, not a server crash
    if (!err.statusCode && err.name === 'ValidationError' && err.errors) {
        statusCode = 400;
    }

    logger.error(
        `[${requestId}] ${req.method} ${req.originalUrl} ${statusCode} - ${err.name || 'Error'} - ${message}`
    );
    // Never send internal error text (DB / driver messages) to clients in production
    if (statusCode >= 500 && config.nodeEnv === 'production') {
        message = 'Server Error';
    }
    if (config.nodeEnv === 'development' && err.stack) {
        logger.error(`[${requestId}] ${err.stack}`);
    }

    res.status(statusCode).json({
        success: false,
        message: message,
        error: message,
        code: err.code || undefined,
        details: err.details || undefined
    });
};

export default errorHandler;
