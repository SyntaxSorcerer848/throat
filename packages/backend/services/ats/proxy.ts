import revertAuthMiddleware from '../../helpers/authMiddleware';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError, NotFoundError } from '../../generated/typescript/api/resources/common';

import { TP_ID } from '@prisma/client';
import axios from 'axios';
import { ProxyService } from '../../generated/typescript/api/resources/ats/resources/proxy/service/ProxyService';

let proxyServiceAts = new ProxyService(
    {
        async tunnel(req, res) {
            try {
                let connection = res.locals.connection;
                let thirdPartyId = connection.tp_id;
                let thirdPartyToken = connection.tp_access_token;
                let tenantId = connection.t_id;
                let request = req.body;
                let path = request.path;
                let body: any = request.body;
                let method = request.method;
                let queryParams = request.queryParams;

                logInfo(
                    'Revert::POST PROXY FOR ATS APP',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                );

                switch (thirdPartyId) {
                    case TP_ID.greenhouse: {
                        let apiToken = thirdPartyToken;
                        let credentials = Buffer.from(apiToken + ':').toString('base64');
                        let headers = {
                            Authorization: 'Basic ' + credentials,
                        };
                        let result: any = await axios({
                            method: method,
                            url: `https://harvest.greenhouse.io/v1/${path}`,
                            headers: headers,
                            data: body,
                            params: queryParams,
                        });
                        res.send({
                            result: result.data,
                        });
                        break;
                    }
                    case TP_ID.lever: {
                        let token = thirdPartyToken;
                        let headers = {
                            Authorization: 'Bearer ' + token,
                        };
                        let result: any = await axios({
                            method: method,
                            url: `https://api.lever.co/v1/${path}`,
                            headers: headers,
                            data: body,
                            params: queryParams,
                        });
                        res.send({
                            result: result.data,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app!' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not do proxy request', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { proxyServiceAts };
