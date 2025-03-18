import config from '../config';
import prisma from '../prisma/client';
import { logError } from '../helpers/logger';
class SvixService {
    // clerk userId
    async deleteAssociatedSvixAccountForUser(userId: string) {
        try {
            let accountInformation = await prisma.users.findUnique({
                where: {
                    id: userId,
                },
                select: {
                    account: {
                        select: {
                            id: true,
                            environments: {
                                select: {
                                    env: true,
                                },
                            },
                        },
                    },
                },
            });

            let accountId = accountInformation?.account.id!;

            // delete all the associated svixAccount
            accountInformation?.account.environments.map(async (e) => {
                let svixId = `${accountId}_${e.env}`;
                try {
                    await config.svix?.application.delete(svixId);
                } catch (error) {
                    // svixAppId wasn't existing
                }
            });
        } catch (error) {
            logError({
                message: `Error while deleting Associated Svix Account For ${userId}`,
                name: 'SvixAccountDelete',
            });
        }
    }

    async createSvixAccount({ accountId, environment }: { accountId: string; environment: string }) {
        try {
            let createdSvixAccount = await config.svix?.application.create({
                name: `${accountId}_${environment}`,
                uid: `${accountId}_${environment}`,
            });
            return createdSvixAccount;
        } catch (error) {
            // probably AppId Already Exist
            return undefined;
        }
    }

    async getSvixAccount({ accountId, environment }: { accountId: string; environment: string }) {
        try {
            let getSvixAccount = await config.svix?.application.get(`${accountId}_${environment}`);
            return getSvixAccount;
        } catch (error) {
            // probably App doesn't exist
            return undefined;
        }
    }

    async createAppPortalMagicLink(appId: string) {
        try {
            let createMagicLink = await config.svix?.authentication.appPortalAccess(appId, {});
            return createMagicLink;
        } catch (error) {
            // probably App doesn't exist
            return undefined;
        }
    }
}

export default new SvixService();
