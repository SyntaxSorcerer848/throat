import axios from 'axios';
import { TP_ID } from '@prisma/client';

import { EventService } from '../../generated/typescript/api/resources/crm/resources/event/service/EventService';
import { InternalServerError } from '../../generated/typescript/api/resources/common';
import { NotFoundError } from '../../generated/typescript/api/resources/common';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import revertAuthMiddleware from '../../helpers/authMiddleware';
import { isStandardError } from '../../helpers/error';
import { disunifyObject, unifyObject } from '../../helpers/crm/transform';
import { UnifiedEvent } from '../../models/unified';
import { PipedriveEvent, PipedrivePagination } from '../../constants/pipedrive';
import { StandardObjects } from '../../constants/common';
import { getAssociationObjects, isValidAssociationTypeRequestedByUser } from '../../helpers/crm/hubspot';

var objType = StandardObjects.event;

var eventService = new EventService(
    {
        async getEvent(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var eventId = req.params.id;
                var fields = req.query.fields;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var associations = req.query.associations ? req.query.associations.split(',') : [];

                logInfo(
                    'Revert::GET EVENT',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    eventId,
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var formattedFields = [
                            ...String(fields || '').split(','),
                            'hs_meeting_title',
                            'hs_meeting_body',
                            'hs_meeting_start_time',
                            'hs_meeting_end_time',
                            'hs_meeting_location',
                            'hs_activity_type',
                            'hs_object_id',
                        ];
                        var validAssociations = [...associations].filter((item) =>
                            isValidAssociationTypeRequestedByUser(item),
                        );
                        var invalidAssociations = [...associations].filter(
                            (item) =>
                                item !== 'undefined' && item !== 'null' && !isValidAssociationTypeRequestedByUser(item),
                        );

                        var url =
                            `https://api.hubapi.com/crm/v3/objects/meetings/${eventId}?properties=${formattedFields}` +
                            (validAssociations.length > 0 ? `&associations=${validAssociations}` : '');

                        let event: any = await axios({
                            method: 'get',
                            url: url,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        event = ([event.data] as any[])?.[0];
                        var associatedData = await getAssociationObjects(
                            event?.associations,
                            thirdPartyToken,
                            thirdPartyId,
                            connection,
                            account,
                            invalidAssociations,
                        );
                        event = await unifyObject<any, UnifiedEvent>({
                            obj: { ...event, ...event?.properties, associations: associatedData },
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: event });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var events = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Events/${eventId}?fields=${fields}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        let event = await unifyObject<any, UnifiedEvent>({
                            obj: events.data.data?.[0],
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: event });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        var events = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Event/${eventId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        let event = await unifyObject<any, UnifiedEvent>({
                            obj: events.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: event });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var result = await axios.get<{ data: Partial<PipedriveEvent> } & PipedrivePagination>(
                            `${connection.tp_account_url}/v1/activities/${eventId}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        var event = result.data;
                        res.send({
                            status: 'ok',
                            result: await unifyObject<any, UnifiedEvent>({
                                obj: event.data,
                                tpId: thirdPartyId,
                                objType,
                                tenantSchemaMappingId: connection.schema_mapping_id,
                                accountFieldMappingConfig: account.accountFieldMappingConfig,
                            }),
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        let meeting: any = await axios({
                            method: 'get',
                            url: `https://api.close.com/api/v1/activity/meeting/${eventId}/`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        meeting = await unifyObject<any, UnifiedEvent>({
                            obj: meeting.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: meeting });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/appointments(${eventId})`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                            },
                        });

                        var unifiedEvent = await unifyObject<any, UnifiedEvent>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: unifiedEvent });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch event', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async getEvents(req, res) {
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
                    'Revert::GET ALL EVENT',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var formattedFields = [
                            ...String(fields || '').split(','),
                            'hs_meeting_title',
                            'hs_meeting_body',
                            'hs_meeting_start_time',
                            'hs_meeting_end_time',
                            'hs_meeting_location',
                            'hs_activity_type',
                            'hs_object_id',
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
                            `https://api.hubapi.com/crm/v3/objects/meetings?properties=${formattedFields}${pagingString}` +
                            (validAssociations.length > 0 ? `&associations=${validAssociations}` : '');

                        let events: any = await axios({
                            method: 'get',
                            url: url,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = events.data?.paging?.next?.after || undefined;
                        events = events.data.results as any[];
                        events = await Promise.all(
                            events?.map(async (l: any) => {
                                var associatedData = await getAssociationObjects(
                                    l?.associations,
                                    thirdPartyToken,
                                    thirdPartyId,
                                    connection,
                                    account,
                                    invalidAssociations,
                                );

                                return await unifyObject<any, UnifiedEvent>({
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
                            results: events,
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&page_token=${cursor}` : ''
                        }`;
                        let events: any = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Events?fields=${fields}${pagingString}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = events.data?.info?.next_page_token || undefined;
                        var prevCursor = events.data?.info?.previous_page_token || undefined;
                        events = events.data.data;
                        events = await Promise.all(
                            events?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedEvent>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: events });
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
                                ? `SELECT+fields(all)+from+Event+${pagingString}`
                                : `SELECT+${(fields as string).split(',').join('+,+')}+from+Event+${pagingString}`;
                        let events: any = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/query/?q=${query}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = pageSize
                            ? String(events.data?.totalSize + (parseInt(String(cursor)) || 0))
                            : undefined;
                        var prevCursor =
                            cursor && parseInt(String(cursor)) > 0
                                ? String(parseInt(String(cursor)) - events.data?.totalSize)
                                : undefined;
                        events = events.data?.records;
                        events = await Promise.all(
                            events?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedEvent>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: events });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&start=${cursor}` : ''
                        }`;
                        var result = await axios.get<{ data: Partial<PipedriveEvent>[] } & PipedrivePagination>(
                            `${connection.tp_account_url}/v1/activities?type=meeting${pagingString}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        var nextCursor = String(result.data?.additional_data?.pagination.next_start) || undefined;
                        var prevCursor = undefined;
                        var events = result.data.data;
                        var unifiedEvents = await Promise.all(
                            events?.map(
                                async (d) =>
                                    await unifyObject<any, UnifiedEvent>({
                                        obj: d,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: unifiedEvents });
                        break;
                    }
                    case TP_ID.closecrm: {
                        var pagingString = `${pageSize ? `&_limit=${pageSize}` : ''}${
                            cursor ? `&_skip=${cursor}` : ''
                        }`;

                        let meetings: any = await axios({
                            method: 'get',
                            url: `https://api.close.com/api/v1/activity/meeting/?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });
                        var hasMore = meetings.data?.has_more;
                        meetings = meetings.data?.data as any[];
                        meetings = await Promise.all(
                            meetings?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedEvent>({
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
                            results: meetings,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var pagingString = cursor ? encodeURI(cursor).split('?')[1] : '';

                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/appointments?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                Prefer: pageSize ? `odata.maxpagesize=${pageSize}` : '',
                            },
                        });

                        var unifiedEvents = await Promise.all(
                            result.data.value.map(
                                async (event: any) =>
                                    await unifyObject<any, UnifiedEvent>({
                                        obj: event,
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
                            results: unifiedEvents,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch events', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async createEvent(req, res) {
            try {
                var eventData = req.body as UnifiedEvent;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var event = await disunifyObject<UnifiedEvent>({
                    obj: eventData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                console.log('Revert::CREATE EVENT', connection.app?.env?.accountId, tenantId, event);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var response = await axios({
                            method: 'post',
                            url: `https://api.hubapi.com/crm/v3/objects/meetings/`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(event),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Hubspot event created',
                            result: { id: response.data?.id, ...event },
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var eventCreated: any = await axios({
                            method: 'post',
                            url: `https://www.zohoapis.com/crm/v3/Events`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(event),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Zoho event created',
                            result: { ...event, details: eventCreated.data.data[0].details },
                        });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        var eventCreated = await axios({
                            method: 'post',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Event/`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(event),
                        });
                        res.send({ status: 'ok', message: 'SFDC event created', result: eventCreated.data });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var instanceUrl = connection.tp_account_url;
                        var pipedriveEvent = event as Partial<PipedriveEvent>;
                        var eventCreated = await axios.post<{ data: Partial<PipedriveEvent> }>(
                            `${instanceUrl}/v1/activities`,
                            pipedriveEvent,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        res.send({
                            status: 'ok',
                            message: 'Pipedrive event created',
                            result: {
                                ...eventCreated.data.data,
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
                            url: `${connection.tp_account_url}/api/data/v9.2/appointments`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: event,
                        });

                        res.send({
                            status: 'ok',
                            message: 'MS Dynamics 365 Event created.',
                            result: response.data,
                            // result: event,
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not create event', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async updateEvent(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var eventData = req.body as UnifiedEvent;
                var eventId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var event = await disunifyObject<UnifiedEvent>({
                    obj: eventData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                console.log('Revert::UPDATE EVENT', connection.app?.env?.accountId, tenantId, event, eventId);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        await axios({
                            method: 'patch',
                            url: `https://api.hubapi.com/crm/v3/objects/meetings/${eventId}`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(event),
                        });
                        res.send({ status: 'ok', message: 'Hubspot event updated', result: event });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        await axios({
                            method: 'put',
                            url: `https://www.zohoapis.com/crm/v3/Events/${eventId}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(event),
                        });
                        res.send({ status: 'ok', message: 'Zoho event updated', result: event });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        await axios({
                            method: 'patch',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Event/${eventId}`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(event),
                        });
                        res.send({ status: 'ok', message: 'SFDC event updated', result: event });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var eventUpdated = await axios.put<{ data: Partial<PipedriveEvent> }>(
                            `${connection.tp_account_url}/v1/activities/${eventId}`,
                            event,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        res.send({
                            status: 'ok',
                            message: 'Pipedrive event updated',
                            result: {
                                ...eventUpdated.data.data,
                            },
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        throw new NotFoundError({ error: 'Method not allowed' });
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var response = await axios({
                            method: 'patch',
                            url: `${connection.tp_account_url}/api/data/v9.2/appointments(${eventId})`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: event,
                        });

                        res.send({
                            status: 'ok',
                            message: 'MS Dynamics 365 Event updated.',
                            result: response.data,
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not update event', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async searchEvents(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var fields = req.query.fields;
                var searchCriteria: any = req.body.searchCriteria;
                var formattedFields = String(fields || '').split(',');
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var cursor = req.query.cursor;
                var pageSize = parseInt(String(req.query.pageSize));

                logInfo('Revert::SEARCH EVENT', connection.app?.env?.accountId, tenantId, searchCriteria, fields);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        let events: any = await axios({
                            method: 'post',
                            url: `https://api.hubapi.com/crm/v3/objects/meetings/search`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify({
                                ...searchCriteria,
                                limit: pageSize || 100,
                                after: cursor || 0,
                                properties: [
                                    'hs_meeting_title',
                                    'hs_meeting_body',
                                    'hs_meeting_start_time',
                                    'hs_meeting_end_time',
                                    'hs_meeting_location',
                                    'hs_activity_type',
                                    'hs_object_id',
                                    ...formattedFields,
                                ],
                            }),
                        });
                        var nextCursor = events.data?.paging?.next?.after || undefined;

                        events = events.data.results as any[];
                        events = await Promise.all(
                            events?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedEvent>({
                                        obj: { ...l, ...l?.properties },
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: undefined, results: events });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&page_token=${cursor}` : ''
                        }`;
                        let events: any = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Events/search?criteria=${searchCriteria}${pagingString}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = events.data?.info?.next_page_token || undefined;
                        var prevCursor = events.data?.info?.previous_page_token || undefined;
                        events = events.data.data;
                        events = await Promise.all(
                            events?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedEvent>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: events });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        let events: any = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/search?q=${searchCriteria}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        events = events?.data?.searchRecords;
                        events = await Promise.all(
                            events?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedEvent>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', results: events });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        throw new NotFoundError({ error: 'Method not allowed' });
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        let searchString = fields ? `$select=${fields}` : '';
                        if (searchCriteria) {
                            searchString += fields ? `&$filter=${searchCriteria}` : `$filter=${searchCriteria}`;
                        }
                        var pagingString = cursor ? encodeURI(cursor).split('?')[1] : '';
                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/appointments?${searchString}${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                Prefer: pageSize ? `odata.maxpagesize=${pageSize}` : '',
                            },
                        });

                        var unifiedEvents = await Promise.all(
                            result.data.value.map(
                                async (contact: any) =>
                                    await unifyObject<any, UnifiedEvent>({
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
                            results: unifiedEvents,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
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
        async deleteEvent(req, res) {
            try {
                var connection = res.locals.connection;
                var eventId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                logInfo(
                    'Revert::DELETE EVENT',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    eventId,
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        await axios({
                            method: 'delete',
                            url: `https://api.hubapi.com/crm/v3/objects/meetings/${eventId}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        res.send({ status: 'ok', message: 'deleted' });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        await axios({
                            method: 'delete',
                            url: `https://www.zohoapis.com/crm/v3/Events/${eventId}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        res.send({ status: 'ok', message: 'deleted' });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        await axios({
                            method: 'delete',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Event/${eventId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        res.send({ status: 'ok', message: 'deleted' });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        await axios.delete<{ data: Partial<PipedriveEvent> } & PipedrivePagination>(
                            `${connection.tp_account_url}/v1/activities/${eventId}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        res.send({ status: 'ok', message: 'deleted' });
                        break;
                    }
                    case TP_ID.closecrm: {
                        await axios({
                            method: 'delete',
                            url: `https://api.close.com/api/v1/activity/meeting/${eventId}/`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        res.send({ status: 'ok', message: 'deleted' });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        await axios({
                            method: 'delete',
                            url: `${connection.tp_account_url}/api/data/v9.2/appointments(${eventId})`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                            },
                        });
                        res.send({ status: 'ok', message: 'deleted' });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not delete event', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { eventService };
