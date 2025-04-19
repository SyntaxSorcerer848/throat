import { Request, Response, NextFunction } from 'express';
import redis from '../redis/client';
import { logError } from './logger';
import prisma from '../prisma/client';
import { getDateWithShortMonth } from './timeZoneHelper';
// @FIXME Add logic for error
let endpointLogger = () => async (req: Request, res: Response, next: NextFunction) => {
    try {
        let path = req.path;
        let { 'x-revert-api-token': token, 'x-revert-t-id': tenantId } = req.headers;
        let toAllow =
            path.includes('/crm') ||
            path.includes('/chat') ||
            path.includes('/ticket') ||
            path.includes('/ats') ||
            path.includes('/accounting');

        if (!toAllow) return next();
        let logEntry: any = {
            method: req.method,
            path: path,
            status: undefined,
        };

        if (res.headersSent) logEntry.status = res.statusCode;
        let queueLength = await redis.lPush(`recent_routes_${token}`, JSON.stringify(logEntry));
        if (queueLength && queueLength > 8) await redis.rPop(`recent_routes_${token}`);

        let environment = await prisma.environments.findFirst({
            where: {
                private_token: String(token),
            },
        });

        if (!environment) {
            throw new Error("Account doesn't exist");
        }
        await redis.INCR(`request_count_${environment.id}`);

        // Summary of Api Calls by date for last 7 days + 1 buffer day
        let key = `summary_api_calls_${environment.id}`;
        await redis.hIncrBy(key, getDateWithShortMonth(), 1);
        let isExpiryExist = await redis.ttl(key); // -1 means expiry doesn't exist, -2 means key doesn't exist

        if (isExpiryExist === -1) {
            let isExpirySet = await redis.expire(key, 60 * 60 * 24 * 8);
            if (!isExpirySet) {
                console.error(isExpirySet);
            }
        }

        // Recent Api Calls for Particular App

        let connections = await prisma.connections.findFirst({
            where: {
                t_id: tenantId as string,
            },
        });

        if (connections?.appId) {
            let recentAppCalls = await redis.lPush(
                `recent_routes_app_${connections.appId}`,
                JSON.stringify(logEntry)
            );
            if (recentAppCalls && recentAppCalls > 8) await redis.rPop(`recent_routes_app_${connections.appId}`);
        }

        next();
    } catch (error: any) {
        logError(error);
        console.error('Error in endpointLogger middleware: ', error);
        next(error);
    }
};

export default endpointLogger;
