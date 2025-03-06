import * as Sentry from '@sentry/node';
import winston from 'winston';

let enumerateErrorFormat = winston.format((info) => {
    if (info instanceof Error) {
        Object.assign(info, { message: info.stack });
    }
    return info;
});

let logger = winston.createLogger({
    level: process.env.NODE_ENV === 'development' ? 'debug' : 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        enumerateErrorFormat(),
        process.env.NODE_ENV === 'development' ? winston.format.colorize() : winston.format.uncolorize(),
        winston.format.splat(),
        winston.format.printf(({ timestamp, level, message }) => `[${timestamp}] ${level}: ${message}`)
    ),
    transports: [
        new winston.transports.Console({
            stderrLevels: ['error'],
        }),
    ],
});

let logError = (error: Error) => {
    Sentry.captureException(error);
    logger.error(error);
};

let logInfo = (message: string, ...args: any[]) => {
    if (!args || !args.length) {
        logger.info(message);
        return;
    }
    logger.info(`${message} %o`, args);
};

let logWarn = (message: string, ...args: any[]) => {
    if (!args || !args.length) {
        logger.warn(message);
        return;
    }
    logger.warn(`${message} %o`, args);
};

let logDebug = (message: string, arg: any) => {
    if (!arg) {
        logger.debug(message);
        return;
    }
    if (typeof arg !== 'object') {
        logger.debug(message, arg);
        return;
    }
    logger.debug(`${message} %o`, arg);
};

export { logError, logInfo, logDebug, logWarn };

export default logger;
