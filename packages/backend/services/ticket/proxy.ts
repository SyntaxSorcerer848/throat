import revertAuthMiddleware from '../../helpers/authMiddleware';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError, NotFoundError } from '../../generated/typescript/api/resources/common';
import { ProxyService } from '../../generated/typescript/api/resources/ticket/resources/proxy/service/ProxyService';
import { TP_ID } from '@prisma/client';
import axios from 'axios';
import { LinearClient } from '@linear/sdk';

let proxyServiceTicket = new ProxyService(
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
                    'Revert::POST PROXY FOR TICKETING APP',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                );

                switch (thirdPartyId) {
                    case TP_ID.linear: {
                        let linear = new LinearClient({
                            accessToken: thirdPartyToken,
                        });

                        let linearGraphqlClient = await linear.client;
                        let result: any = await linearGraphqlClient.request(String(body.query), body.input);

                        res.send({
                            result: result,
                        });
                        break;
                    }
                    case TP_ID.clickup: {
                        let result = await axios({
                            method: method,
                            url: `https://api.clickup.com/api/v2/${path}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'Content-Type': 'application/json',
                            },
                            data: JSON.stringify(body),
                            params: queryParams,
                        });

                        res.send({
                            result: result.data,
                        });
                        break;
                    }
                    case TP_ID.jira: {
                        let result = await axios({
                            method: method,
                            url: `${connection.tp_account_url}/${path}`,
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(body),
                            params: queryParams,
                        });

                        res.send({
                            result: result.data,
                        });
                        break;
                    }
                    case TP_ID.trello: {
                        let result: any = await axios({
                            method: method,
                            url: `https://api.trello.com/1/${path}?key=${connection.app_client_id}&token=${thirdPartyToken}`,
                            headers: {
                                Accept: 'application/json',
                            },
                            data: body,
                            params: queryParams,
                        });
                        res.send({
                            result: result.data,
                        });
                        break;
                    }
                    case TP_ID.bitbucket: {
                        let result: any = await axios({
                            method: method,
                            url: `https://api.bitbucket.org/2.0/${path}`,
                            headers: {
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: body,
                            params: queryParams,
                        });
                        res.send({
                            result: result.data,
                        });
                        break;
                    }
                    case TP_ID.github: {
                        let result: any = await axios({
                            method: method,
                            url: `https://api.github.com/${path}`,
                            headers: {
                                Accept: 'application/vnd.github.v3+json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                                // Add any other required headers here
                            },
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

export { proxyServiceTicket };
