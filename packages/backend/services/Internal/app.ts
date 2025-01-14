import { AppService } from '../../generated/typescript/api/resources/internal/resources/app/service/AppService';
import prisma from '../../prisma/client';
import redis from '../../redis/client';
import { UnAuthorizedError } from '../../generated/typescript/api/resources/common';

let appService = new AppService({
    async getRecentApiCallsForApp(req, res) {
        let { appId } = req.params;
        let { 'x-revert-api-token': token } = req.headers;
        let account = await prisma.accounts.findFirst({
            where: {
                private_token: token as string,
            },
            select: {
                public_token: true,
            },
        });

        if (!account) {
            throw new UnAuthorizedError({
                error: 'Api token unauthorized',
            });
        }

        let connections = await prisma.connections.findFirst({
            where: {
                appId,
            },
        });

        if (!connections) {
            return res.send({ result: undefined });
        }

        if (connections?.appId) {
            let recentApiCalls = await redis.lRange(`recent_routes_app_${connections.appId}`, 0, -1);
            return res.send({
                result: recentApiCalls.map((call) => {
                    let parsed: { method: string; status: number; path: string } = JSON.parse(call);
                    return parsed;
                }),
            });
        }

        res.send({
            result: [],
        });
    },
});

export { appService };
