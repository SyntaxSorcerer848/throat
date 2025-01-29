import { logError } from '../../helpers/logger';
import { AccountService } from '../../generated/typescript/api/resources/internal/resources/account/service/AccountService';
import SvixService from '../svix';
import {
    InternalServerError,
    NotFoundError,
    SvixAccount,
    UnAuthorizedError,
} from '../../generated/typescript/api/resources/common';
import AuthService from '../auth';
import AppService from '../app';
import prisma from '../../prisma/client';
import redis from '../../redis/client';

let accountService = new AccountService({
    async getAccountDetails(req, res) {
        try {
            let userId = req.body.userId;
            let result = await AuthService.getAccountForUser(userId);
            if (result?.error) {
                throw new NotFoundError({ error: 'Could not get the account for user' });
            } else {
                res.send(result);
            }
        } catch (error: any) {
            logError(error);
            console.error('Could not get account for user', req.body, error);
            throw new InternalServerError({ error: 'Internal server error' });
        }
    },
    async updateAccountCredentials(req, res) {
        try {
            let { clientId, clientSecret, scopes, tpId, isRevertApp, appId, appConfig } = req.body;
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
            let result = await AuthService.setAppCredentialsForUser({
                appId,
                publicToken: account.public_token,
                clientId,
                clientSecret,
                scopes,
                isRevertApp,
                tpId,
                appConfig,
            });
            if (result?.error) {
                throw new NotFoundError({ error: 'Could not get account for user' });
            } else {
                return res.send(result);
            }
        } catch (error: any) {
            logError(error);
            console.error('Could not get account for user', error);
            throw new InternalServerError({ error: 'Internal server error' });
        }
    },
    async createRevertAppForAccount(req, res) {
        try {
            let { userId, tpId, environment } = req.body;
            let result = await AuthService.getAccountForUser(userId);

            if (result?.error) {
                throw new NotFoundError({ error: 'Could not get the account for user' });
            }

            let isCreated = await AppService.createRevertAppForAccount({
                accountId: result.account.id as string,
                tpId,
                environment,
            });

            if (isCreated?.error) {
                throw new InternalServerError({ error: 'Internal Server Error' });
            }

            let finalResult = await AuthService.getAccountForUser(userId);
            res.send({ ...finalResult });
        } catch (error: any) {
            logError(error);
            throw new InternalServerError({ error: 'Internal server error' });
        }
    },

    async createSvixAccount(req, res) {
        try {
            let { accountId, environment } = req.body;
            let svixAccount = await SvixService.createSvixAccount({ accountId, environment });
            if (svixAccount) {
                return res.send({
                    account: svixAccount as SvixAccount,
                    exist: true,
                    environment,
                });
            }

            return res.send({ exist: false, environment });
        } catch (error: any) {
            logError(error);
            throw new InternalServerError({ error: 'Internal server error' });
        }
    },

    async getSvixAccount(req, res) {
        try {
            let { id } = req.params;
            let { environment } = req.query;
            let svixAccount = await SvixService.getSvixAccount({ accountId: id, environment });

            if (!svixAccount) {
                return res.send({ exist: false, environment });
            }

            return res.send({ account: svixAccount, exist: true, environment });
        } catch (error: any) {
            logError(error);
            throw new InternalServerError({ error: 'Internal server error' });
        }
    },
    async createSvixAccountMagicLink(req, res) {
        try {
            let { appId } = req.body;
            let environment = appId.split('_')[2];
            let portalMagicLink = await SvixService.createAppPortalMagicLink(appId);
            if (!portalMagicLink) {
                return res.send({ key: '', environment });
            }

            return res.send({ key: portalMagicLink.url.split('#key=')[1], environment });
        } catch (error: any) {
            logError(error);
            throw new InternalServerError({ error: 'Internal server error' });
        }
    },
    async deleteRevertAppforAccount(req, res) {
        try {
            let { appId } = req.body;
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

            let result = await prisma.apps.delete({
                where: {
                    id: appId,
                },
            });

            let { id } = result;
            res.send({ appId: id, delete: true });
        } catch (error: any) {
            logError(error);
            throw new InternalServerError({ error: 'Something went wrong while deleting app' });
        }
    },

    async setOnboardingCompleted(req, res) {
        try {
            let { userId, environment } = req.body;
            let result = await AuthService.getAccountForUser(userId);

            if (result?.error) {
                throw new NotFoundError({ error: 'Could not get the account for user' });
            }

            await redis.set(`onboarding_completed_${result.account.id}_${environment}`, 'true');
            res.send({ result: true });
        } catch (error: any) {
            logError(error);
            throw new InternalServerError({ error: 'Internal server error' });
        }
    },
});

export { accountService };
