import axios from 'axios';
import { TP_ID } from '@prisma/client';

import { LeadService } from '../../generated/typescript/api/resources/crm/resources/lead/service/LeadService';
import { InternalServerError } from '../../generated/typescript/api/resources/common';
import { NotFoundError } from '../../generated/typescript/api/resources/common';
import { logInfo, logError } from '../../helpers/logger';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import revertAuthMiddleware from '../../helpers/authMiddleware';
import { filterLeadsFromContactsForHubspot } from '../../helpers/filterLeadsFromContacts';
import { isStandardError } from '../../helpers/error';
import { disunifyObject, unifyObject } from '../../helpers/crm/transform';
import { UnifiedLead } from '../../models/unified/lead';
import { PipedrivePagination, PipedriveLead, PipedriveContact, PipedriveCompany } from '../../constants/pipedrive';
import { StandardObjects } from '../../constants/common';

var objType = StandardObjects.lead;

var leadService = new LeadService(
    {
        async getLead(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var leadId = req.params.id;
                var fields = req.query.fields;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                logInfo(
                    'Revert::GET LEAD',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    leadId
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var formattedFields = [
                            ...String(fields || '').split(','),
                            'hs_lead_status',
                            'firstname',
                            'email',
                            'lastname',
                            'hs_object_id',
                            'phone',
                        ];
                        let lead: any = await axios({
                            method: 'get',
                            url: `https://api.hubapi.com/crm/v3/objects/contacts/${leadId}?properties=${formattedFields}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        lead = filterLeadsFromContactsForHubspot([lead.data] as any[])?.[0];
                        res.send({
                            status: 'ok',
                            result: await unifyObject<any, UnifiedLead>({
                                obj: { ...lead, ...lead?.properties },
                                tpId: thirdPartyId,
                                objType,
                                tenantSchemaMappingId: connection.schema_mapping_id,
                                accountFieldMappingConfig: account.accountFieldMappingConfig,
                            }),
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var leads = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Leads/${leadId}?fields=${fields}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        let lead = leads.data.data?.[0];
                        res.send({
                            status: 'ok',
                            result: await unifyObject<any, UnifiedLead>({
                                obj: lead,
                                tpId: thirdPartyId,
                                objType,
                                tenantSchemaMappingId: connection.schema_mapping_id,
                                accountFieldMappingConfig: account.accountFieldMappingConfig,
                            }),
                        });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        var leads = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Lead/${leadId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        let lead = leads.data;
                        res.send({
                            status: 'ok',
                            result: await unifyObject<any, UnifiedLead>({
                                obj: lead,
                                tpId: thirdPartyId,
                                objType,
                                tenantSchemaMappingId: connection.schema_mapping_id,
                                accountFieldMappingConfig: account.accountFieldMappingConfig,
                            }),
                        });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var result = await axios.get<{ data: Partial<PipedriveLead> } & PipedrivePagination>(
                            `${connection.tp_account_url}/v1/leads/${leadId}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            }
                        );
                        var lead = result.data;
                        var populatedLead = await populatePersonOrOrganizationForPipedriveLead({
                            lead: lead.data,
                            account_url: connection.tp_account_url as string,
                            thirdPartyToken,
                        });
                        res.send({
                            status: 'ok',
                            result: await unifyObject<any, UnifiedLead>({
                                obj: populatedLead,
                                tpId: thirdPartyId,
                                objType,
                                tenantSchemaMappingId: connection.schema_mapping_id,
                                accountFieldMappingConfig: account.accountFieldMappingConfig,
                            }),
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        let lead: any = await axios({
                            method: 'get',
                            url: `https://api.close.com/api/v1/lead/${leadId}/`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        lead = await unifyObject<any, UnifiedLead>({
                            obj: lead.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: lead });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/leads(${leadId})`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                            },
                        });

                        var unifiedLead = await unifyObject<any, UnifiedLead>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: unifiedLead });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognised CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch lead', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async getLeads(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var fields = req.query.fields;
                var pageSize = parseInt(String(req.query.pageSize));
                var cursor = req.query.cursor;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                logInfo(
                    'Revert::GET ALL LEADS',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var formattedFields = [
                            ...String(fields || '').split(','),
                            'hs_lead_status',
                            'firstname',
                            'email',
                            'lastname',
                            'hs_object_id',
                            'phone',
                        ];
                        var pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&after=${cursor}` : ''
                        }`;
                        let leads: any = await axios({
                            method: 'get',
                            url: `https://api.hubapi.com/crm/v3/objects/contacts?properties=${formattedFields}&${pagingString}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = leads.data?.paging?.next?.after || null;
                        leads = filterLeadsFromContactsForHubspot(leads.data.results as any[]);
                        leads = await Promise.all(
                            leads?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: { ...l, ...l?.properties },
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );
                        res.send({
                            status: 'ok',
                            next: nextCursor,
                            previous: undefined, // Field not supported by Hubspot.
                            results: leads,
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&page_token=${cursor}` : ''
                        }`;
                        let leads: any = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Leads?fields=${fields}${pagingString}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = leads.data?.info?.next_page_token || null;
                        var prevCursor = leads.data?.info?.previous_page_token || null;
                        leads = leads.data.data;
                        leads = await Promise.all(
                            leads?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: leads });
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
                                ? `SELECT+fields(all)+from+Lead+${pagingString}`
                                : `SELECT+${(fields as string).split(',').join('+,+')}+from+Lead+${pagingString}`;
                        let leads: any = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/query/?q=${query}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = pageSize
                            ? String(leads.data?.totalSize + (parseInt(String(cursor)) || 0))
                            : undefined;
                        var prevCursor =
                            cursor && parseInt(String(cursor)) > 0
                                ? String(parseInt(String(cursor)) - leads.data?.totalSize)
                                : undefined;
                        leads = leads.data?.records;
                        leads = await Promise.all(
                            leads?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: leads });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&start=${cursor}` : ''
                        }`;
                        var result = await axios.get<{ data: Partial<PipedriveLead>[] } & PipedrivePagination>(
                            `${connection.tp_account_url}/v1/leads?${pagingString}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            }
                        );
                        var nextCursor = String(result.data?.additional_data?.pagination.next_start) || undefined;
                        var prevCursor = undefined;
                        var leads = result.data.data;
                        var populatedLeads = await Promise.all(
                            leads.map(async (lead) => {
                                return await populatePersonOrOrganizationForPipedriveLead({
                                    lead,
                                    account_url: connection.tp_account_url as string,
                                    thirdPartyToken,
                                });
                            })
                        );
                        var unifiedLeads = await Promise.all(
                            populatedLeads?.map(
                                async (l) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: unifiedLeads });
                        break;
                    }
                    case TP_ID.closecrm: {
                        var pagingString = `${pageSize ? `&_limit=${pageSize}` : ''}${
                            cursor ? `&_skip=${cursor}` : ''
                        }`;

                        let leads: any = await axios({
                            method: 'get',
                            url: `https://api.close.com/api/v1/lead/?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });
                        var hasMore = leads.data?.has_more;
                        leads = leads.data?.data as any[];
                        leads = await Promise.all(
                            leads?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );

                        let cursorVal = parseInt(String(cursor));
                        if (isNaN(cursorVal)) cursorVal = 0;
                        var nextSkipVal = hasMore ? cursorVal + pageSize : undefined;
                        var prevSkipVal = cursorVal > 0 ? String(Math.max(cursorVal - pageSize, 0)) : undefined;

                        res.send({
                            status: 'ok',
                            next: nextSkipVal ? String(nextSkipVal) : undefined,
                            previous: prevSkipVal,
                            results: leads,
                        });

                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var pagingString = cursor ? encodeURI(cursor).split('?')[1] : '';

                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/leads?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                Prefer: pageSize ? `odata.maxpagesize=${pageSize}` : '',
                            },
                        });

                        var unifiedLeads = await Promise.all(
                            result.data.value.map(
                                async (lead: any) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: lead,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );
                        res.send({
                            status: 'ok',
                            next: result.data['@odata.nextLink'],
                            previous: undefined,
                            results: unifiedLeads,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognised CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch leads', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async createLead(req, res) {
            try {
                var leadData = req.body as UnifiedLead;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var lead = await disunifyObject<UnifiedLead>({
                    obj: leadData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                console.log('Revert::CREATE LEAD', connection.app?.env?.accountId, tenantId, lead);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var response = await axios({
                            method: 'post',
                            url: `https://api.hubapi.com/crm/v3/objects/contacts/`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(lead),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Hubspot lead created',
                            result: { id: response.data?.id, ...lead },
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        await axios({
                            method: 'post',
                            url: `https://www.zohoapis.com/crm/v3/Leads`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(lead),
                        });
                        res.send({ status: 'ok', message: 'Zoho lead created', result: lead });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        var leadCreated = await axios({
                            method: 'post',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Lead/`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(lead),
                        });
                        res.send({
                            status: 'ok',
                            message: 'SFDC lead created',
                            result: leadCreated.data,
                        });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var instanceUrl = connection.tp_account_url;
                        var pipedriveLead = lead as Partial<PipedriveLead>;
                        var leadCreated = await axios.post<{ data: Partial<PipedriveLead> }>(
                            `${instanceUrl}/v1/leads`,
                            pipedriveLead,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            }
                        );
                        res.send({
                            status: 'ok',
                            message: 'Pipedrive lead created',
                            result: {
                                ...leadCreated.data.data,
                            },
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        // checks for name field
                        if ((lead.lastName || lead.firstName) && (!lead.firstName || !lead.lastName)) {
                            throw new Error('Both firstName and lastName fields are required for Close CRM.');
                        }
                        var response = await axios({
                            method: 'post',
                            url: 'https://api.close.com/api/v1/lead/',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: lead,
                        });
                        res.send({
                            status: 'ok',
                            message: 'Closecrm lead created',
                            result: response.data,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var response = await axios({
                            method: 'post',
                            url: `${connection.tp_account_url}/api/data/v9.2/leads`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: lead,
                        });

                        res.send({
                            status: 'ok',
                            message: 'MS Dynamics 365 Lead created.',
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
                console.error('Could not create lead', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async updateLead(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var leadData = req.body as UnifiedLead;
                var leadId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var lead = await disunifyObject<UnifiedLead>({
                    obj: leadData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                console.log('Revert::UPDATE LEAD', connection.app?.env?.accountId, tenantId, lead, leadId);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        await axios({
                            method: 'patch',
                            url: `https://api.hubapi.com/crm/v3/objects/contacts/${leadId}`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(lead),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Hubspot lead updated',
                            result: lead,
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        await axios({
                            method: 'put',
                            url: `https://www.zohoapis.com/crm/v3/Leads/${leadId}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(lead),
                        });
                        res.send({ status: 'ok', message: 'Zoho lead updated', result: lead });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        await axios({
                            method: 'patch',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Lead/${leadId}`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(lead),
                        });
                        res.send({ status: 'ok', message: 'SFDC lead updated', result: lead });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var leadUpdated = await axios.patch<{ data: Partial<PipedriveLead> }>(
                            `${connection.tp_account_url}/v1/leads/${leadId}`,
                            lead,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            }
                        );
                        res.send({
                            status: 'ok',
                            message: 'Pipedrive lead updated',
                            result: {
                                ...leadUpdated.data.data,
                            },
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        // checks for name field
                        // if ((lead.lastName || lead.firstName) && (!lead.firstName || !lead.lastName)) {
                        //     throw new Error('Both firstName and lastName fields are required for Close CRM.');
                        // }

                        var response = await axios({
                            method: 'put',
                            url: `https://api.close.com/api/v1/lead/${leadId}`,
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(lead),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Closecrm lead updated',
                            result: response.data,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var response = await axios({
                            method: 'patch',
                            url: `${connection.tp_account_url}/api/data/v9.2/leads(${leadId})`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: lead,
                        });

                        res.send({
                            status: 'ok',
                            message: 'MS Dynamics 365 Lead updated.',
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
                console.error('Could not update lead', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async searchLeads(req, res) {
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
                logInfo('Revert::SEARCH LEAD', connection.app?.env?.accountId, tenantId, searchCriteria, fields);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        let leads: any = await axios({
                            method: 'post',
                            url: `https://api.hubapi.com/crm/v3/objects/contacts/search`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify({
                                ...searchCriteria,
                                limit: pageSize || 100,
                                after: cursor || 0,
                                properties: [
                                    'hs_lead_status',
                                    'firstname',
                                    'email',
                                    'lastname',
                                    'hs_object_id',
                                    'phone',
                                    ...formattedFields,
                                ],
                            }),
                        });
                        var nextCursor = leads.data?.paging?.next?.after || undefined;

                        leads = filterLeadsFromContactsForHubspot(leads.data.results as any[]);
                        leads = await Promise.all(
                            leads?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: { ...l, ...l?.properties },
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );
                        res.send({
                            status: 'ok',
                            next: nextCursor,
                            previous: undefined,
                            results: leads,
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&page_token=${cursor}` : ''
                        }`;
                        let leads: any = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Leads/search?criteria=${searchCriteria}${pagingString}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = leads.data?.info?.next_page_token || undefined;
                        var prevCursor = leads.data?.info?.previous_page_token || undefined;
                        leads = leads.data.data;
                        leads = await Promise.all(
                            leads?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: leads });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        let leads: any = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/search?q=${searchCriteria}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        leads = leads?.data?.searchRecords;
                        leads = await Promise.all(
                            leads?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );
                        res.send({ status: 'ok', results: leads });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&start=${cursor}` : ''
                        }`;
                        var instanceUrl = connection.tp_account_url;
                        var result = await axios.get<
                            {
                                data: { items: { item: Partial<PipedriveLead> }[]; result_score: number };
                            } & PipedrivePagination
                        >(
                            `${instanceUrl}/v1/leads/search?term=${searchCriteria}${
                                formattedFields.length ? `&fields=${formattedFields.join(',')}` : ''
                            }${pagingString}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            }
                        );

                        var nextCursor = String(result.data?.additional_data?.pagination.next_start) || undefined;
                        var prevCursor = undefined;
                        // this api has person and organization auto populated
                        var leads = result.data.data.items.map((item) => item.item);
                        var unifiedLeads = await Promise.all(
                            leads?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: unifiedLeads });
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
                            url: `${connection.tp_account_url}/api/data/v9.2/leads?${searchString}${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                Prefer: pageSize ? `odata.maxpagesize=${pageSize}` : '',
                            },
                        });

                        var unifiedLeads = await Promise.all(
                            result.data.value.map(
                                async (contact: any) =>
                                    await unifyObject<any, UnifiedLead>({
                                        obj: contact,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    })
                            )
                        );

                        res.send({
                            status: 'ok',
                            next: result.data['@odata.nextLink'],
                            previous: undefined,
                            results: unifiedLeads,
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
    [revertAuthMiddleware(), revertTenantMiddleware()]
);

export { leadService };

var populatePersonOrOrganizationForPipedriveLead = async ({
    lead,
    account_url,
    thirdPartyToken,
}: {
    lead: Partial<PipedriveLead>;
    account_url: string;
    thirdPartyToken: string;
}) => {
    var isPerson = !!lead.person_id;
    var url = isPerson
        ? `${account_url}/v1/persons/${lead.person_id}`
        : `${account_url}/v1/organizations/${lead.organization_id}`;
    var result = await axios.get<{ data: Partial<PipedriveContact | PipedriveCompany> } & PipedrivePagination>(url, {
        headers: {
            Authorization: `Bearer ${thirdPartyToken}`,
        },
    });
    return {
        ...lead,
        ...(isPerson ? { person: result.data.data } : { organization: result.data.data }),
    };
};
