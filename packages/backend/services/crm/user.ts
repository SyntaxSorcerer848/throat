import axios from 'axios';
import { TP_ID } from '@prisma/client';

import { UserService } from '../../generated/typescript/api/resources/crm/resources/user/service/UserService';
import { InternalServerError } from '../../generated/typescript/api/resources/common';
import { NotFoundError } from '../../generated/typescript/api/resources/common';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import revertAuthMiddleware from '../../helpers/authMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { disunifyObject, unifyObject } from '../../helpers/crm/transform';
import { UnifiedUser } from '../../models/unified/user';
import { PipedriveUser } from '../../constants/pipedrive';
import { StandardObjects } from '../../constants/common';
import { getAssociationObjects, isValidAssociationTypeRequestedByUser } from '../../helpers/crm/hubspot';

var objType = StandardObjects.user;

var userService = new UserService(
    {
        async getUser(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var userId = req.params.id;
                var fields = req.query.fields;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var associations = req.query.associations ? req.query.associations.split(',') : [];

                logInfo(
                    'Revert::GET USER',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    userId,
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var formattedFields = [
                            ...String(fields || '').split(','),
                            'firstname',
                            'email',
                            'lastname',
                            'hs_object_id',
                            'phone',
                        ];
                        var validAssociations = [...associations].filter((item) =>
                            isValidAssociationTypeRequestedByUser(item),
                        );
                        var invalidAssociations = [...associations].filter(
                            (item) =>
                                item !== 'undefined' && item !== 'null' && !isValidAssociationTypeRequestedByUser(item),
                        );

                        var url =
                            `https://api.hubapi.com/settings/v3/users/${userId}?properties=${formattedFields}` +
                            (validAssociations.length > 0 ? `&associations=${validAssociations}` : '');

                        let user: any = await axios({
                            method: 'get',
                            url: url,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        user = ([user.data] as any[])?.[0];

                        var associatedData = await getAssociationObjects(
                            user?.associations,
                            thirdPartyToken,
                            thirdPartyId,
                            connection,
                            account,
                            invalidAssociations,
                        );

                        user = await unifyObject<any, UnifiedUser>({
                            obj: { ...user, ...user?.properties, associations: associatedData },
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: { ...user, ...user?.properties } });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var users = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/users/${userId}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        let user = await unifyObject<any, UnifiedUser>({
                            obj: users.data.users?.[0],
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: user });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        var users = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/User/${userId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        let user = await unifyObject<any, UnifiedUser>({
                            obj: users.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: user });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var result = await axios.get<{ data: Partial<PipedriveUser> }>(
                            `${connection.tp_account_url}/v1/users/${userId}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        var user = result.data;
                        res.send({
                            status: 'ok',
                            result: await unifyObject<any, UnifiedUser>({
                                obj: user.data,
                                tpId: thirdPartyId,
                                objType,
                                tenantSchemaMappingId: connection.schema_mapping_id,
                                accountFieldMappingConfig: account.accountFieldMappingConfig,
                            }),
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        let user: any = await axios({
                            method: 'get',
                            url: `https://api.close.com/api/v1/user/${userId}/`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        user = await unifyObject<any, UnifiedUser>({
                            obj: user.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: user });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/systemusers(${userId})`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                            },
                        });

                        var unifiedUser = await unifyObject<any, UnifiedUser>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({ status: 'ok', result: unifiedUser });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
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
                var fields = req.query.fields;
                var pageSize = parseInt(String(req.query.pageSize));
                var cursor = req.query.cursor;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var associations = req.query.associations ? req.query.associations.split(',') : [];

                logInfo(
                    'Revert::GET ALL USER',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var formattedFields = [
                            ...String(fields || '').split(','),
                            'firstname',
                            'email',
                            'lastname',
                            'hs_object_id',
                            'phone',
                        ];
                        var pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&after=${cursor}` : ''
                        }`;
                        var validAssociations = [...associations].filter((item) =>
                            isValidAssociationTypeRequestedByUser(item),
                        );
                        var invalidAssociations = [...associations].filter(
                            (item) =>
                                item !== 'undefined' && item !== 'null' && !isValidAssociationTypeRequestedByUser(item),
                        );

                        var url =
                            `https://api.hubapi.com/settings/v3/users?properties=${formattedFields}${pagingString}` +
                            (validAssociations.length > 0 ? `&associations=${validAssociations}` : '');
                        let users: any = await axios({
                            method: 'get',
                            url: url,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = users.data?.paging?.next?.after || undefined;
                        users = users.data.results as any[];
                        users = await Promise.all(
                            users?.map(async (l: any) => {
                                var associatedData = await getAssociationObjects(
                                    l?.associations,
                                    thirdPartyToken,
                                    thirdPartyId,
                                    connection,
                                    account,
                                    invalidAssociations,
                                );

                                return await unifyObject<any, UnifiedUser>({
                                    obj: { ...l, ...l?.properties, associations: associatedData },
                                    tpId: thirdPartyId,
                                    objType,
                                    tenantSchemaMappingId: connection.schema_mapping_id,
                                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                                });
                            }),
                        );
                        res.send({
                            status: 'ok',
                            next: nextCursor,
                            previous: undefined, // Field not supported by Hubspot.
                            results: users,
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&page_token=${cursor}` : ''
                        }`; // FIXME: page_token unsupported.
                        let users: any = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/users?${pagingString}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = users.data?.info?.next_page_token || undefined;
                        var prevCursor = users.data?.info?.previous_page_token || undefined;
                        users = users.data.users;
                        users = await Promise.all(
                            users?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedUser>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: users });
                        break;
                    }
                    case TP_ID.sfdc: {
                        let pagingString = `${pageSize ? `ORDER+BY+Id+DESC+LIMIT+${pageSize}+` : ''}${
                            cursor ? `OFFSET+${cursor}` : ''
                        }`;
                        if (!pageSize && !cursor) {
                            pagingString = 'LIMIT 200';
                        }
                        var instanceUrl = connection.tp_account_url;
                        // TODO: Handle "ALL" for Hubspot & Zoho
                        var query =
                            !fields || fields === 'ALL'
                                ? `SELECT+fields(all)+from+User+${pagingString}`
                                : `SELECT+${(fields as string).split(',').join('+,+')}+from+User+${pagingString}`;
                        let users: any = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/query/?q=${query}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = pageSize
                            ? String(users.data?.totalSize + (parseInt(String(cursor)) || 0))
                            : undefined;
                        var prevCursor =
                            cursor && parseInt(String(cursor)) > 0
                                ? String(parseInt(String(cursor)) - users.data?.totalSize)
                                : undefined;
                        users = users.data?.records;
                        users = await Promise.all(
                            users?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedUser>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: users });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&start=${cursor}` : ''
                        }`;
                        var result = await axios.get<{ data: Partial<PipedriveUser>[] }>(
                            `${connection.tp_account_url}/v1/users?${pagingString}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        var nextCursor = undefined;
                        var prevCursor = undefined;
                        var users = result.data.data;
                        var unifiedUsers = await Promise.all(
                            users?.map(
                                async (l) =>
                                    await unifyObject<any, UnifiedUser>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: unifiedUsers });
                        break;
                    }
                    case TP_ID.closecrm: {
                        var pagingString = `${pageSize ? `&_limit=${pageSize}` : ''}${
                            cursor ? `&_skip=${cursor}` : ''
                        }`;

                        let users: any = await axios({
                            method: 'get',
                            url: `https://api.close.com/api/v1/user/?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });
                        var hasMore = users.data?.has_more;
                        users = users.data?.data as any[];
                        users = await Promise.all(
                            users?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedUser>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );

                        let cursorVal = parseInt(String(cursor));
                        if (isNaN(cursorVal)) cursorVal = 0;
                        var nextSkipVal = hasMore ? cursorVal + pageSize : undefined;
                        var prevSkipVal = cursorVal > 0 ? String(Math.max(cursorVal - pageSize, 0)) : undefined;

                        res.send({
                            status: 'ok',
                            next: nextSkipVal ? String(nextSkipVal) : undefined,
                            previous: prevSkipVal,
                            results: users,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var pagingString = cursor ? encodeURI(cursor).split('?')[1] : '';

                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/systemusers?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                Prefer: pageSize ? `odata.maxpagesize=${pageSize}` : '',
                            },
                        });

                        var unifiedUsers = await Promise.all(
                            result.data.value.map(
                                async (contact: any) =>
                                    await unifyObject<any, UnifiedUser>({
                                        obj: contact,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );

                        res.send({
                            status: 'ok',
                            next: result.data['@odata.nextLink'],
                            previous: undefined,
                            results: unifiedUsers,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
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
        async createUser(req, res) {
            try {
                var userData = req.body as UnifiedUser;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var user = await disunifyObject<UnifiedUser>({
                    obj: userData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                console.log('Revert::CREATE USER', connection.app?.env?.accountId, tenantId, user);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var response = await axios({
                            method: 'post',
                            url: `https://api.hubapi.com/settings/v3/users`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(user),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Hubspot user created',
                            result: { id: response.data?.id, ...user },
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        await axios({
                            method: 'post',
                            url: `https://www.zohoapis.com/crm/v3/users`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(user),
                        });
                        res.send({ status: 'ok', message: 'Zoho user created', result: user });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        var userCreated = await axios({
                            method: 'post',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/User/`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(user),
                        });
                        res.send({
                            status: 'ok',
                            message: 'SFDC user created',
                            result: userCreated.data,
                        });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var instanceUrl = connection.tp_account_url;
                        var pipedriveUser = user as Partial<PipedriveUser>;
                        var userCreated = await axios.post<{ data: Partial<PipedriveUser> }>(
                            `${instanceUrl}/v1/users`,
                            pipedriveUser,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        res.send({
                            status: 'ok',
                            message: 'Pipedrive user created',
                            result: {
                                ...userCreated.data.data,
                            },
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        throw new NotFoundError({ error: 'Method not allowed' });
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var response = await axios({
                            method: 'post',
                            url: `${connection.tp_account_url}/api/data/v9.2/systemusers`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: user,
                        });

                        res.send({
                            status: 'ok',
                            message: 'MS Dynamics 365 Contact created.',
                            result: response.data,
                            // result: user,
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not create user', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { userService };
