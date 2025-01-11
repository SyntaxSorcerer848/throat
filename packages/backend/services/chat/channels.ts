import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { ChannelsService } from '../../generated/typescript/api/resources/chat/resources/channels/service/ChannelsService';
import { logError, logInfo } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError } from '../../generated/typescript/api/resources/common';
import { TP_ID } from '@prisma/client';
import axios from 'axios';
import { UnifiedChannel } from '../../models/unified/channel';
import revertAuthMiddleware from '../../helpers/authMiddleware';
import { unifyObject } from '../../helpers/crm/transform';
import { ChatStandardObjects } from '../../constants/common';

var objType = ChatStandardObjects.channel;

var channelsService = new ChannelsService(
    {
        async getChannels(req, res) {
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
                    'Revert::GET ALL CHANNELS',
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

                        var url = `https://slack.com/api/conversations.list?${pagingString}`;

                        let channels: any = await axios({
                            method: 'get',
                            url: url,
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });

                        var nextCursor = channels.data?.response_metadata?.next_cursor || undefined;
                        channels = channels.data.channels;
                        channels = await Promise.all(
                            channels?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedChannel>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );

                        res.send({ status: 'ok', next: nextCursor, results: channels });
                        break;
                    }
                    case TP_ID.discord: {
                        var url = `https://discord.com/api/guilds/${customerId}/channels`;
                        let channels: any = await axios.get(url, {
                            headers: { Authorization: `Bot ${botToken}` },
                        });
                        channels = await Promise.all(
                            channels.data?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedChannel>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );

                        res.send({ status: 'ok', next: undefined, results: channels });
                        break;
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch channels', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()]
);

export { channelsService };
