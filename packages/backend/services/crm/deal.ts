import axios from 'axios';
import { TP_ID } from '@prisma/client';

import { DealService } from '../../generated/typescript/api/resources/crm/resources/deal/service/DealService';
import { InternalServerError } from '../../generated/typescript/api/resources/common';
import { NotFoundError } from '../../generated/typescript/api/resources/common';
import { logInfo, logError } from '../../helpers/logger';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import revertAuthMiddleware from '../../helpers/authMiddleware';
import { isStandardError } from '../../helpers/error';
import { unifyObject, disunifyObject } from '../../helpers/crm/transform';
import { UnifiedDeal } from '../../models/unified';
import { PipedriveDeal, PipedrivePagination } from '../../constants/pipedrive';
import { StandardObjects } from '../../constants/common';
import { getAssociationObjects, isValidAssociationTypeRequestedByUser } from '../../helpers/crm/hubspot';

var objType = StandardObjects.deal;

var dealService = new DealService(
    {
        async getDeal(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var dealId = req.params.id;
                var fields = req.query.fields;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var associations = req.query.associations ? req.query.associations.split(',') : [];

                logInfo(
                    'Revert::GET DEAL',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    dealId,
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var formattedFields = [
                            ...String(fields || '').split(','),
                            'dealname',
                            'amount',
                            'dealstage',
                            'hs_priority',
                            'hs_deal_stage_probability',
                            'closedate',
                            'hs_is_closed_won',
                            'hs_createdate',
                        ];
                        var validAssociations = [...associations].filter((item) =>
                            isValidAssociationTypeRequestedByUser(item),
                        );
                        var invalidAssociations = [...associations].filter(
                            (item) =>
                                item !== 'undefined' && item !== 'null' && !isValidAssociationTypeRequestedByUser(item),
                        );

                        var url =
                            `https://api.hubapi.com/crm/v3/objects/deals/${dealId}?properties=${formattedFields}` +
                            (validAssociations.length > 0 ? `&associations=${validAssociations}` : '');

                        let deal: any = await axios({
                            method: 'get',
                            url: url,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });

                        deal = ([deal.data] as any[])?.[0];
                        var associatedData = await getAssociationObjects(
                            deal?.associations,
                            thirdPartyToken,
                            thirdPartyId,
                            connection,
                            account,
                            invalidAssociations,
                        );
                        deal = await unifyObject<any, UnifiedDeal>({
                            obj: { ...deal, ...deal?.properties, associations: associatedData },
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: deal });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var deals = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Deals/${dealId}${fields ? `?fields=${fields}` : ''}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        let deal = await unifyObject<any, UnifiedDeal>({
                            obj: deals.data.data?.[0],
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: deal });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        var deals = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Opportunity/${dealId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        let deal = await unifyObject<any, UnifiedDeal>({
                            obj: deals.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: deal });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var result = await axios.get<{ data: Partial<PipedriveDeal> } & PipedrivePagination>(
                            `${connection.tp_account_url}/v1/deals/${dealId}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        var deal = result.data;
                        res.send({
                            status: 'ok',
                            result: await unifyObject<any, UnifiedDeal>({
                                obj: deal.data,
                                tpId: thirdPartyId,
                                objType,
                                tenantSchemaMappingId: connection.schema_mapping_id,
                                accountFieldMappingConfig: account.accountFieldMappingConfig,
                            }),
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        let deal: any = await axios({
                            method: 'get',
                            url: `https://api.close.com/api/v1/opportunity/${dealId}/`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        deal = await unifyObject<any, UnifiedDeal>({
                            obj: deal.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: deal });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/opportunities(${dealId})`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                            },
                        });

                        var unifiedDeal = await unifyObject<any, UnifiedDeal>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({ status: 'ok', result: unifiedDeal });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch deal', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async getDeals(req, res) {
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
                    'Revert::GET ALL DEAL',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var formattedFields = [
                            ...String(fields || '').split(','),
                            'dealname',
                            'amount',
                            'dealstage',
                            'hs_priority',
                            'hs_deal_stage_probability',
                            'closedate',
                            'hs_is_closed_won',
                            'hs_createdate',
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
                            `https://api.hubapi.com/crm/v3/objects/deals?properties=${formattedFields}${pagingString}` +
                            (validAssociations.length > 0 ? `&associations=${validAssociations}` : '');

                        let deals: any = await axios({
                            method: 'get',
                            url: url,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = deals.data?.paging?.next?.after || undefined;
                        deals = deals.data.results as any[];
                        deals = await Promise.all(
                            deals?.map(async (l: any) => {
                                var associatedData = await getAssociationObjects(
                                    l?.associations,
                                    thirdPartyToken,
                                    thirdPartyId,
                                    connection,
                                    account,
                                    invalidAssociations,
                                );
                                return await unifyObject<any, UnifiedDeal>({
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
                            results: deals,
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&page_token=${cursor}` : ''
                        }`;
                        let deals: any = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Deals?fields=${fields}${pagingString}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = deals.data?.info?.next_page_token || undefined;
                        var prevCursor = deals.data?.info?.previous_page_token || undefined;
                        deals = deals.data.data;
                        deals = await Promise.all(
                            deals?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedDeal>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: deals });
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
                                ? `SELECT+fields(all)+from+Opportunity+${pagingString}`
                                : `SELECT+${(fields as string)
                                      .split(',')
                                      .join('+,+')}+from+Opportunity+${pagingString}`;
                        let deals: any = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/query/?q=${query}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = pageSize
                            ? String(deals.data?.totalSize + (parseInt(String(cursor)) || 0))
                            : undefined;
                        var prevCursor =
                            cursor && parseInt(String(cursor)) > 0
                                ? String(parseInt(String(cursor)) - deals.data?.totalSize)
                                : undefined;
                        deals = deals.data?.records;
                        deals = await Promise.all(
                            deals?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedDeal>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: deals });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&start=${cursor}` : ''
                        }`;
                        var result = await axios.get<{ data: Partial<PipedriveDeal>[] } & PipedrivePagination>(
                            `${connection.tp_account_url}/v1/deals?${pagingString}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        var nextCursor = String(result.data?.additional_data?.pagination.next_start) || undefined;
                        var prevCursor = undefined;
                        var deals = result.data.data;
                        var unifiedDeals = await Promise.all(
                            deals?.map(
                                async (d) =>
                                    await unifyObject<any, UnifiedDeal>({
                                        obj: d,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: unifiedDeals });
                        break;
                    }
                    case TP_ID.closecrm: {
                        var pagingString = `${pageSize ? `&_limit=${pageSize}` : ''}${
                            cursor ? `&_skip=${cursor}` : ''
                        }`;
                        let deals: any = await axios({
                            method: 'get',
                            url: `https://api.close.com/api/v1/opportunity/${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });
                        var hasMore = deals.data?.has_more;
                        deals = deals.data?.data as any[];
                        deals = await Promise.all(
                            deals?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedDeal>({
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
                            results: deals,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var pagingString = cursor ? encodeURI(cursor).split('?')[1] : '';

                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/opportunities?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                Prefer: pageSize ? `odata.maxpagesize=${pageSize}` : '',
                            },
                        });

                        var unifiedDeals = await Promise.all(
                            result.data.value.map(
                                async (deal: any) =>
                                    await unifyObject<any, UnifiedDeal>({
                                        obj: deal,
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
                            results: unifiedDeals,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognised CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch deals', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async createDeal(req, res) {
            try {
                var dealData = req.body as UnifiedDeal;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var deal = await disunifyObject<UnifiedDeal>({
                    obj: dealData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                console.log('Revert::CREATE DEAL', connection.app?.env?.accountId, tenantId, deal);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var response = await axios({
                            method: 'post',
                            url: `https://api.hubapi.com/crm/v3/objects/deals/`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(deal),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Hubspot deal created',
                            result: { id: response.data?.id, ...deal },
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        await axios({
                            method: 'post',
                            url: `https://www.zohoapis.com/crm/v3/Deals`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(deal),
                        });
                        res.send({ status: 'ok', message: 'Zoho deal created', result: deal });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        var dealCreated = await axios({
                            method: 'post',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Opportunity/`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(deal),
                        });
                        res.send({
                            status: 'ok',
                            message: 'SFDC deal created',
                            result: dealCreated.data,
                        });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var instanceUrl = connection.tp_account_url;
                        var pipedriveDeal = deal as Partial<PipedriveDeal>;
                        var dealCreated = await axios.post<{ data: Partial<PipedriveDeal> }>(
                            `${instanceUrl}/v1/deals`,
                            pipedriveDeal,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        res.send({
                            status: 'ok',
                            message: 'Pipedrive deal created',
                            result: {
                                ...dealCreated.data.data,
                            },
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        if (req.body.stage) {
                            var status = await axios({
                                method: 'get',
                                url: 'https://api.close.com/api/v1/status/opportunity/',
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                    Accept: 'application/json',
                                },
                            });

                            var validStatus = status.data.data.filter(
                                (l: any) => l.label.toLowerCase() === req.body.stage.toLowerCase(),
                            );

                            if (validStatus.length === 0) {
                                throw new Error('Invalid stage value for close crm');
                            }

                            deal['status_id'] = validStatus[0].id;
                        }
                        var response = await axios({
                            method: 'post',
                            url: 'https://api.close.com/api/v1/opportunity/',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: deal,
                        });
                        res.send({
                            status: 'ok',
                            message: 'Closecrm deal created',
                            result: response.data,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var response = await axios({
                            method: 'post',
                            url: `${connection.tp_account_url}/api/data/v9.2/opportunities`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: deal,
                        });

                        res.send({
                            status: 'ok',
                            message: 'MS Dynamics 365 Deal created.',
                            result: response.data,
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognised CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not create deal', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async updateDeal(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var dealData = req.body as UnifiedDeal;
                var dealId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var deal = await disunifyObject<UnifiedDeal>({
                    obj: dealData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                console.log('Revert::UPDATE DEAL', connection.app?.env?.accountId, tenantId, deal, dealId);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        await axios({
                            method: 'patch',
                            url: `https://api.hubapi.com/crm/v3/objects/deals/${dealId}`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(deal),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Hubspot deal updated',
                            result: deal,
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        await axios({
                            method: 'put',
                            url: `https://www.zohoapis.com/crm/v3/Deals/${dealId}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(deal),
                        });
                        res.send({ status: 'ok', message: 'Zoho deal updated', result: deal });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        await axios({
                            method: 'patch',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Opportunity/${dealId}`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(deal),
                        });
                        res.send({ status: 'ok', message: 'SFDC deal updated', result: deal });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var dealUpdated = await axios.put<{ data: Partial<PipedriveDeal> }>(
                            `${connection.tp_account_url}/v1/deals/${dealId}`,
                            deal,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        res.send({
                            status: 'ok',
                            message: 'Pipedrive deal updated',
                            result: {
                                ...dealUpdated.data.data,
                            },
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        if (req.body.stage) {
                            var status = await axios({
                                method: 'get',
                                url: 'https://api.close.com/api/v1/status/opportunity/',
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                    Accept: 'application/json',
                                },
                            });

                            var validStatus = status.data.data.filter(
                                (l: any) => l.label.toLowerCase() === req.body.stage.toLowerCase(),
                            );

                            if (validStatus.length === 0) {
                                throw new Error('Invalid stage value for close crm');
                            }

                            deal['status_id'] = validStatus[0].id;
                        }

                        var response = await axios({
                            method: 'put',
                            url: `https://api.close.com/api/v1/opportunity/${dealId}/`,
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(deal),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Closecrm deal updated',
                            result: response.data,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var response = await axios({
                            method: 'patch',
                            url: `${connection.tp_account_url}/api/data/v9.2/opportunities(${dealId})`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: deal,
                        });

                        res.send({
                            status: 'ok',
                            message: 'MS Dynamics 365 Deal updated.',
                            result: response.data,
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognised CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not update deal', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async searchDeals(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var fields = req.query.fields;
                var searchCriteria: any = req.body.searchCriteria;
                var formattedFields = (fields || '').split('').filter(Boolean);
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;

                var cursor = req.query.cursor;
                var pageSize = parseInt(String(req.query.pageSize));

                logInfo(
                    'Revert::SEARCH DEAL',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    searchCriteria,
                    fields,
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        let deals: any = await axios({
                            method: 'post',
                            url: `https://api.hubapi.com/crm/v3/objects/deals/search`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify({
                                ...searchCriteria,
                                limit: pageSize || 100,
                                after: cursor || 0,
                                properties: [
                                    'hs_deal_status',
                                    'firstname',
                                    'email',
                                    'lastname',
                                    'hs_object_id',
                                    'dealname',
                                    'amount',
                                    'dealstage',
                                    'hs_priority',
                                    'hs_deal_stage_probability',
                                    'closedate',
                                    'hs_is_closed_won',
                                    ...formattedFields,
                                ],
                            }),
                        });
                        var nextCursor = deals.data?.paging?.next?.after || undefined;

                        deals = deals.data.results as any[];
                        deals = await Promise.all(
                            deals?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedDeal>({
                                        obj: { ...l, ...l?.properties },
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: undefined, results: deals });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&page_token=${cursor}` : ''
                        }`;
                        let deals: any = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/deals/search?criteria=${searchCriteria}${pagingString}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });

                        var nextCursor = deals.data?.info?.next_page_token || undefined;
                        var prevCursor = deals.data?.info?.previous_page_token || undefined;
                        deals = deals.data.data;
                        deals = await Promise.all(
                            deals?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedDeal>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: deals });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        let deals: any = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/search?q=${searchCriteria}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        deals = deals?.data?.searchRecords;
                        deals = await Promise.all(
                            deals?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedDeal>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', results: deals });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&start=${cursor}` : ''
                        }`;
                        var instanceUrl = connection.tp_account_url;
                        var result = await axios.get<
                            { data: { items: { item: any; result_score: number }[] } } & PipedrivePagination
                        >(
                            `${instanceUrl}/v1/deals/search?term=${searchCriteria}${
                                formattedFields.length ? `&fields=${formattedFields.join(',')}` : ''
                            }${pagingString}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        var nextCursor = String(result.data?.additional_data?.pagination.next_start) || undefined;
                        var prevCursor = undefined;
                        var deals = result.data.data.items.map((item) => item.item);
                        var unifiedDeals = await Promise.all(
                            deals?.map(
                                async (d: any) =>
                                    await unifyObject<any, UnifiedDeal>({
                                        obj: d,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: unifiedDeals });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        let searchString = fields ? `$select=${fields}` : '';
                        if (searchCriteria) {
                            searchString += fields ? `&$filter=${searchCriteria}` : `$filter=${searchCriteria}`;
                        }
                        var pagingString = cursor ? encodeURI(cursor).split('?')[1] : '';
                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/opportunities?${searchString}${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                Prefer: pageSize ? `odata.maxpagesize=${pageSize}` : '',
                            },
                        });

                        var unifiedDeals = await Promise.all(
                            result.data.value.map(
                                async (contact: any) =>
                                    await unifyObject<any, UnifiedDeal>({
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
                            results: unifiedDeals,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognised CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not search CRM', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { dealService };
