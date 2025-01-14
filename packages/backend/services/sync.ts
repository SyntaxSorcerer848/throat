import config from '../config';
import { Connection, NotImplementedError } from '../generated/typescript/api/resources/common';
import { SyncService } from '../generated/typescript/api/resources/sync/service/SyncService';
import revertAuthMiddleware from '../helpers/authMiddleware';
import revertTenantMiddleware from '../helpers/tenantIdMiddleware';
import { syncTwentyConnection } from './custom/twenty';

let syncService = new SyncService(
    {
        async triggerSync(req, res) {
            let account = res.locals.account;
            if (account.id === config.TWENTY_ACCOUNT_ID) {
                let { 'x-connection-api-key': twentyAPIKey } = req.headers;
                let connection = res.locals.connection as Connection;
                await syncTwentyConnection(connection, twentyAPIKey as string);
                res.send({
                    status: 'ok',
                });
            } else
                throw new NotImplementedError({
                    error: 'Syncing is not yet available for your account, sorry! Contact us on discord or email to get access!',
                });
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()]
);

export { syncService };
