import revertAuthMiddleware from '../../helpers/authMiddleware';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError, NotFoundError } from '../../generated/typescript/api/resources/common';
import { TP_ID } from '@prisma/client';
import { UserService } from '../../generated/typescript/api/resources/ticket/resources/user/service/UserService';
import axios from 'axios';
import { UnifiedTicketUser } from '../../models/unified/ticketUsers';
import { unifyObject } from '../../helpers/crm/transform';
import { TicketStandardObjects } from '../../constants/common';
import { LinearClient } from '@linear/sdk';

var objType = TicketStandardObjects.ticketUser;

var userServiceTicket = new UserService(
    {
        async getUser(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var userId = req.params.id;
                // var fields = req.query.fields;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                logInfo(
                    'Revert::GET USER',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    userId,
                );

                switch (thirdPartyId) {
                    case TP_ID.linear: {
                        var linear = new LinearClient({
                            accessToken: thirdPartyToken,
                        });
                        var user = await linear.user(userId);

                        var unifiedUser = await unifyObject<any, UnifiedTicketUser>({
                            obj: user,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedUser,
                        });
                        break;
                    }
                    case TP_ID.clickup: {
                        res.send({
                            status: 'ok',
                            result: 'This endpoint is currently not supported',
                        });
                        break;
                    }
                    case TP_ID.jira: {
                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/rest/api/2/user?accountId=${userId}`,
                            headers: {
                                Accept: 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });

                        var unifiedUser = await unifyObject<any, UnifiedTicketUser>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedUser,
                        });

                        break;
                    }
                    case TP_ID.trello: {
                        var member: any = await axios({
                            method: 'get',
                            url: `https://api.trello.com/1/members/${userId}?key=${connection.app_client_id}&token=${thirdPartyToken}`,
                            headers: {
                                Accept: 'application/json',
                            },
                        });

                        var unifiedUser = await unifyObject<any, UnifiedTicketUser>({
                            obj: member.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({
                            status: 'ok',
                            result: unifiedUser,
                        });
                        break;
                    }
                    case TP_ID.bitbucket: {
                        var result = await axios({
                            method: 'GET',
                            url: `https://api.bitbucket.org/2.0/users/${userId}`,
                            headers: {
                                Accept: 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });

                        var unifiedUser = await unifyObject<any, UnifiedTicketUser>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedUser,
                        });

                        break;
                    }
                    case TP_ID.github: {
                        var result = await axios({
                            method: 'GET',
                            url: `https://api.github.com/users/${userId}`, //userId has to be username in case of GitHub
                            headers: {
                                Accept: 'application/vnd.github+json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });

                        var unifiedUser = await unifyObject<any, UnifiedTicketUser>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedUser,
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch user', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async getUsers(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var fields: any = req.query.fields ? JSON.parse(req.query.fields as string) : undefined;
                var pageSize = parseInt(String(req.query.pageSize));
                var cursor = req.query.cursor;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;

                if (
                    ((thirdPartyId !== TP_ID.jira && !fields) ||
                        (thirdPartyId !== TP_ID.bitbucket && !fields) ||
                        (thirdPartyId !== TP_ID.github && !fields)) &&
                    fields &&
                    !fields.listId
                ) {
                    throw new NotFoundError({
                        error: 'The query parameter "listId" is required and should be included in the "fields" parameter.',
                    });
                }

                logInfo(
                    'Revert::GET ALL USERS',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                );
                switch (thirdPartyId) {
                    case TP_ID.linear: {
                        var linear = new LinearClient({
                            accessToken: thirdPartyToken,
                        });

                        /*
                            In GraphQL, either 'first' & 'after' or 'last' & 'before' can exist but not both simultaneously.
                            To determine the appropriate pagination direction, an additional flag parameter is required.
                        */
                        var variables = {
                            first: pageSize ? pageSize : null,
                            after: cursor ? cursor : null,
                            last: null,
                            Before: null,
                        };

                        let result: any = await linear.users(variables);
                        var linearGraphqlClient = await linear.client;
                        let membersId: any = await linearGraphqlClient.rawRequest(
                            `query Team($teamId: String!) {
                            team(id: $teamId) {
                              members {
                                nodes {
                                  id
                                }
                              }
                            }
                          }`,
                            {
                                teamId: fields.listId,
                            },
                        );

                        membersId = membersId.data.team.members.nodes;
                        var users = result.nodes.filter((user: any) =>
                            membersId.some((item: any) => item.id === user.id),
                        );

                        var unifiedUsers = await Promise.all(
                            users.map(
                                async (user: any) =>
                                    await unifyObject<any, UnifiedTicketUser>({
                                        obj: user,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );

                        var pageInfo = result.pageInfo;
                        let next_cursor = undefined;
                        if (pageInfo.hasNextPage && pageInfo.endCursor) {
                            next_cursor = pageInfo.endCursor;
                        }

                        let previous_cursor = undefined;
                        if (pageInfo.hasPreviousPage && pageInfo.startCursor) {
                            previous_cursor = pageInfo.startCursor;
                        }

                        res.send({
                            status: 'ok',
                            next: next_cursor,
                            previous: previous_cursor,
                            results: unifiedUsers,
                        });

                        break;
                    }
                    case TP_ID.clickup: {
                        var pagingString = `${cursor ? `page=${cursor}` : ''}`;
                        var result: any = await axios({
                            method: 'get',
                            url: `https://api.clickup.com/api/v2/list/${fields.listId}/member?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'Content-Type': 'application/json',
                            },
                        });
                        var unnifiedMembers: any = await Promise.all(
                            result.data.members.map(
                                async (user: any) =>
                                    await unifyObject<any, UnifiedTicketUser>({
                                        obj: user,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        var pageNumber = !result.data?.last_page
                            ? cursor
                                ? (parseInt(String(cursor)) + 1).toString()
                                : '1'
                            : undefined;
                        res.send({
                            status: 'ok',
                            next: pageNumber,
                            previous: undefined,
                            results: unnifiedMembers,
                        });
                        break;
                    }
                    case TP_ID.jira: {
                        let pagingString = `${pageSize ? `&maxResults=${pageSize}` : ''}${
                            pageSize && cursor ? `&startAt=${cursor}` : ''
                        }`;
                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/rest/api/2/users/search?${pagingString}`,
                            headers: {
                                Accept: 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });

                        var unifiedUsers = await Promise.all(
                            result.data.map(async (user: any) => {
                                return await unifyObject<any, UnifiedTicketUser>({
                                    obj: user,
                                    tpId: thirdPartyId,
                                    objType,
                                    tenantSchemaMappingId: connection.schema_mapping_id,
                                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                                });
                            }),
                        );

                        var nextCursor = pageSize ? Number(cursor ? cursor : 0) + Number(pageSize) : undefined;
                        var previousCursor =
                            pageSize && cursor && Number(cursor) >= pageSize
                                ? Number(cursor) - Number(pageSize)
                                : undefined;

                        res.send({
                            status: 'ok',
                            next: nextCursor ? String(nextCursor) : undefined,
                            previous: previousCursor !== undefined ? String(previousCursor) : undefined,
                            results: unifiedUsers,
                        });

                        break;
                    }
                    case TP_ID.trello: {
                        let pagingString = `${pageSize ? `&limit=${pageSize}` : ''}`;

                        if (cursor) {
                            pagingString = pagingString + `&before=${cursor}`;
                        }

                        var result: any = await axios({
                            method: 'get',
                            url: `https://api.trello.com/1/boards/${fields.listId}/members?key=${connection.app_client_id}&token=${thirdPartyToken}&${pagingString}`,
                            headers: {
                                Accept: 'application/json',
                            },
                        });
                        var nextCursor = pageSize ? `${result.data[result.data.length - 1].id}` : undefined;
                        var unifiedUsers = await Promise.all(
                            result.data.map(
                                async (user: any) =>
                                    await unifyObject<any, UnifiedTicketUser>({
                                        obj: user,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );

                        res.send({
                            status: 'ok',
                            next: nextCursor,
                            previous: undefined,
                            results: unifiedUsers,
                        });
                        break;
                    }
                    case TP_ID.bitbucket: {
                        res.send({
                            status: 'ok',
                            results: 'This endpoint is currently not supported',
                        });
                        break;
                    }
                    case TP_ID.github: {
                        let pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&since=${cursor}` : ''
                        }`;
                        var result = await axios({
                            method: 'GET',
                            url: `https://api.github.com/users?${pagingString}`,
                            headers: {
                                Accept: 'application/vnd.github+json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });

                        var unifiedUsers = await Promise.all(
                            result.data.map(async (user: any) => {
                                return await unifyObject<any, UnifiedTicketUser>({
                                    obj: user,
                                    tpId: thirdPartyId,
                                    objType,
                                    tenantSchemaMappingId: connection.schema_mapping_id,
                                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                                });
                            }),
                        );

                        var nextCursor = pageSize ? Number(cursor ? cursor : 0) + Number(pageSize) : undefined;
                        var previousCursor =
                            pageSize && cursor && Number(cursor) >= pageSize
                                ? Number(cursor) - Number(pageSize)
                                : undefined;

                        res.send({
                            status: 'ok',
                            next: nextCursor ? String(nextCursor) : undefined,
                            previous: previousCursor !== undefined ? String(previousCursor) : undefined,
                            results: unifiedUsers,
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch users', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { userServiceTicket };
