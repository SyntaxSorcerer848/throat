import express from 'express';
import { randomUUID } from 'crypto';
import { logInfo } from '../../../helpers/logger';
import { mapIntegrationIdToIntegrationName } from '../../../constants/common';
import redis from '../../../redis/client';
import { TP_ID } from '@prisma/client';
import prisma from '../../../prisma/client';
import processOAuthResult from '../../../helpers/auth/processOAuthResult';
import quickbooks from './authHandlers/quickbooks';
import xero from './authHandlers/xero';

let authRouter = express.Router();

authRouter.get('/oauth-callback', async (req, res) => {
    logInfo('OAuth callback', req.query);
    let integrationId = req.query.integrationId as TP_ID;
    let revertPublicKey = req.query.x_revert_public_token as string;
    let redirect_url = req.query?.redirect_url;
    let redirectUrl = redirect_url ? (redirect_url as string) : undefined;
    // generate a token for connection auth and save in redis for 5 mins
    let tenantSecretToken = randomUUID();
    await redis.setEx(`tenantSecretToken_${req.query.t_id}`, 5 * 60, tenantSecretToken);

    try {
        let account = await prisma.environments.findFirst({
            where: {
                public_token: String(revertPublicKey),
            },
            include: {
                apps: {
                    select: { id: true, app_client_id: true, app_client_secret: true, is_revert_app: true },
                    where: { tp_id: integrationId },
                },
                accounts: true,
            },
        });

        let clientId = account?.apps[0]?.is_revert_app ? undefined : account?.apps[0]?.app_client_id;
        let clientSecret = account?.apps[0]?.is_revert_app ? undefined : account?.apps[0]?.app_client_secret;
        let svixAppId = account!.id; // breaking change
        let environmentId = account?.id;

        let authProps = {
            account,
            clientId,
            clientSecret,
            code: req.query.code as string,
            integrationId,
            revertPublicKey,
            svixAppId,
            environmentId,
            tenantId: String(req.query.t_id),
            tenantSecretToken,
            response: res,
            request: req,
            redirectUrl,
        };

        if (req.query.code && req.query.t_id && revertPublicKey) {
            switch (integrationId) {
                case TP_ID.quickbooks:
                    return quickbooks.handleOAuth(authProps);
                case TP_ID.xero:
                    return xero.handleOAuth(authProps);

                default:
                    return processOAuthResult({
                        status: false,
                        revertPublicKey,
                        tenantSecretToken,
                        response: res,
                        tenantId: req.query.t_id as string,
                        statusText: 'Not implemented yet',
                        redirectUrl,
                    });
            }
        }

        return processOAuthResult({
            status: false,
            revertPublicKey,
            tenantSecretToken,
            response: res,
            tenantId: req.query.t_id as string,
            statusText: 'noop',
            redirectUrl,
        });
    } catch (error: any) {
        return processOAuthResult({
            status: false,
            error,
            revertPublicKey,
            integrationName: mapIntegrationIdToIntegrationName[integrationId],
            tenantSecretToken,
            response: res,
            tenantId: req.query.t_id as string,
            statusText: 'Error while getting oauth creds',
            redirectUrl,
        });
    }
});

export default authRouter;
