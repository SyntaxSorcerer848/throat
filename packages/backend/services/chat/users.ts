import { TP_ID } from '@prisma/client';
import { UsersService } from '../../generated/typescript/api/resources/chat/resources/users/service/UsersService';
import { InternalServerError } from '../../generated/typescript/api/resources/common';
import { isStandardError } from '../../helpers/error';
import { logError, logInfo } from '../../helpers/logger';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import axios from 'axios';
import { UnifiedChatUser } from '../../models/unified/chatUsers';
import revertAuthMiddleware from '../../helpers/authMiddleware';
import { unifyObject } from '../../helpers/crm/transform';
import { ChatStandardObjects } from '../../constants/common';

var objType = ChatStandardObjects.chatUser;

var usersService = new UsersService(
    {
        async getUsers(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var pageSize = parseInt(String(req.query.pageSize));
                var cursor = req.query.cursor;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var customerId = connection.tp_customer_id;
                var botToken = connection.app_config?.bot_token;
                logInfo(
                    'Revert::GET ALL USERS',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken
                );

                switch (thirdPartyId) {
                    case TP_ID.slack: {
                        var pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&cursor=${cursor}` : ''
                        }`;

                        var url = `https://slack.com/api/users.list?${pagingString}`;

                        let users: any = await axios({
                            method: 'get',
                            url: url,
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = users.data?.response_metadata?.next_cursor || undefined;
                        users = users.data.members;
                        users = await Promise.all(
                            users?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedChatUser>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );

                        res.send({ status: 'ok', next: nextCursor, results: users });

                        break;
                    }
                    case TP_ID.discord: {
                        var url = `https://discord.com/api/guilds/${customerId}/members`;
                        let members: any = await axios.get(url, {
                            headers: { Authorization: `Bot ${botToken}` },
                        });

                        members = await Promise.all(
                            members.data?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedChatUser>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );

                        res.send({ status: 'ok', next: undefined, results: members });
                        break;
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
    [revertAuthMiddleware(), revertTenantMiddleware()]
);

export { usersService };
