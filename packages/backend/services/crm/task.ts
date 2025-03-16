import axios from 'axios';
import { TP_ID } from '@prisma/client';

import { TaskService } from '../../generated/typescript/api/resources/crm/resources/task/service/TaskService';
import { InternalServerError } from '../../generated/typescript/api/resources/common';
import { NotFoundError } from '../../generated/typescript/api/resources/common';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import revertAuthMiddleware from '../../helpers/authMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { disunifyObject, unifyObject } from '../../helpers/crm/transform';
import { UnifiedTask } from '../../models/unified';
import { PipedrivePagination, PipedriveTask } from '../../constants/pipedrive';
import { StandardObjects } from '../../constants/common';
import { getAssociationObjects, isValidAssociationTypeRequestedByUser } from '../../helpers/crm/hubspot';

var objType = StandardObjects.task;

var taskService = new TaskService(
    {
        async getTask(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var taskId = req.params.id;
                var fields = req.query.fields;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var associations = req.query.associations ? req.query.associations.split(',') : [];

                logInfo(
                    'Revert::GET TASK',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    taskId,
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var formattedFields = [
                            ...String(fields || '').split(','),
                            'hs_task_body',
                            'hs_task_subject',
                            'hs_task_priority',
                            'hs_task_status',
                            'hs_timestamp',
                        ];
                        var validAssociations = [...associations].filter((item) =>
                            isValidAssociationTypeRequestedByUser(item),
                        );
                        var invalidAssociations = [...associations].filter(
                            (item) =>
                                item !== 'undefined' && item !== 'null' && !isValidAssociationTypeRequestedByUser(item),
                        );

                        var url =
                            `https://api.hubapi.com/crm/v3/objects/tasks/${taskId}?properties=${formattedFields}` +
                            (validAssociations.length > 0 ? `&associations=${validAssociations}` : '');

                        let task: any = await axios({
                            method: 'get',
                            url: url,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        task = ([task.data] as any[])?.[0];

                        var associatedData = await getAssociationObjects(
                            task?.associations,
                            thirdPartyToken,
                            thirdPartyId,
                            connection,
                            account,
                            invalidAssociations,
                        );

                        task = await unifyObject<any, UnifiedTask>({
                            obj: { ...task, ...task?.properties, associations: associatedData },
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: task });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var tasks = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Tasks/${taskId}?fields=${fields}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        let task = await unifyObject<any, UnifiedTask>({
                            obj: tasks.data.data?.[0],
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: task });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        var tasks = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Task/${taskId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        let task = await unifyObject<any, UnifiedTask>({
                            obj: tasks.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });
                        res.send({ status: 'ok', result: task });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var result = await axios.get<{ data: Partial<PipedriveTask> } & PipedrivePagination>(
                            `${connection.tp_account_url}/v1/activities/${taskId}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        var task = result.data;
                        res.send({
                            status: 'ok',
                            result: await unifyObject<any, UnifiedTask>({
                                obj: task.data,
                                tpId: thirdPartyId,
                                objType,
                                tenantSchemaMappingId: connection.schema_mapping_id,
                                accountFieldMappingConfig: account.accountFieldMappingConfig,
                            }),
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        let task: any = await axios({
                            method: 'get',
                            url: `https://api.close.com/api/v1/task/${taskId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });
                        task = await unifyObject<any, UnifiedTask>({
                            obj: task.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: task,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/tasks(${taskId})`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                            },
                        });

                        var unifiedTask = await unifyObject<any, UnifiedTask>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({ status: 'ok', result: unifiedTask });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch task', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async getTasks(req, res) {
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
                    'Revert::GET ALL TASK',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                );

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var formattedFields = [
                            ...String(fields || '').split(','),
                            'hs_task_body',
                            'hs_task_subject',
                            'hs_task_priority',
                            'hs_task_status',
                            'hs_timestamp',
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
                            `https://api.hubapi.com/crm/v3/objects/tasks?properties=${formattedFields}${pagingString}` +
                            (validAssociations.length > 0 ? `&associations=${validAssociations}` : '');
                        let tasks: any = await axios({
                            method: 'get',
                            url: url,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = tasks.data?.paging?.next?.after || undefined;
                        tasks = tasks.data.results as any[];
                        tasks = await Promise.all(
                            tasks?.map(async (l: any) => {
                                var associatedData = await getAssociationObjects(
                                    l?.associations,
                                    thirdPartyToken,
                                    thirdPartyId,
                                    connection,
                                    account,
                                    invalidAssociations,
                                );
                                return await unifyObject<any, UnifiedTask>({
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
                            results: tasks,
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&page_token=${cursor}` : ''
                        }`;
                        let tasks: any = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Tasks?fields=${fields}${pagingString}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = tasks.data?.info?.next_page_token || undefined;
                        var prevCursor = tasks.data?.info?.previous_page_token || undefined;
                        tasks = tasks.data.data;
                        tasks = await Promise.all(
                            tasks?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedTask>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: tasks });
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
                                ? `SELECT+fields(all)+from+Task+${pagingString}`
                                : `SELECT+${(fields as string).split(',').join('+,+')}+from+Task+${pagingString}`;
                        let tasks: any = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/query/?q=${query}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = pageSize
                            ? String(tasks.data?.totalSize + (parseInt(String(cursor)) || 0))
                            : undefined;
                        var prevCursor =
                            cursor && parseInt(String(cursor)) > 0
                                ? String(parseInt(String(cursor)) - tasks.data?.totalSize)
                                : undefined;
                        tasks = tasks.data?.records;
                        tasks = await Promise.all(
                            tasks?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedTask>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: tasks });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&start=${cursor}` : ''
                        }`;
                        var result = await axios.get<{ data: Partial<PipedriveTask>[] } & PipedrivePagination>(
                            `${connection.tp_account_url}/v1/activities?type=task${pagingString}`,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        var nextCursor = String(result.data?.additional_data?.pagination.next_start) || undefined;
                        var prevCursor = undefined;
                        var tasks = result.data.data;
                        var unifiedTasks = await Promise.all(
                            tasks?.map(
                                async (d) =>
                                    await unifyObject<any, UnifiedTask>({
                                        obj: d,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: unifiedTasks });
                        break;
                    }
                    case TP_ID.closecrm: {
                        var pagingString = `${pageSize ? `&_limit=${pageSize}` : ''}${
                            cursor ? `&_skip=${cursor}` : ''
                        }`;

                        let tasks: any = await axios({
                            method: 'get',
                            url: `https://api.close.com/api/v1/task/?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });
                        var hasMore = tasks.data?.has_more;
                        tasks = tasks.data?.data as any[];
                        tasks = await Promise.all(
                            tasks?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedTask>({
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
                            results: tasks,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var pagingString = cursor ? encodeURI(cursor).split('?')[1] : '';

                        var result = await axios({
                            method: 'get',
                            url: `${connection.tp_account_url}/api/data/v9.2/tasks?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                Prefer: pageSize ? `odata.maxpagesize=${pageSize}` : '',
                            },
                        });

                        var unifiedTasks = await Promise.all(
                            result.data.value.map(
                                async (task: any) =>
                                    await unifyObject<any, UnifiedTask>({
                                        obj: task,
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
                            results: unifiedTasks,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized CRM' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch tasks', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async createTask(req, res) {
            try {
                var taskData = req.body as UnifiedTask;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var task = await disunifyObject<UnifiedTask>({
                    obj: taskData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                console.log('Revert::CREATE TASK', connection.app?.env?.accountId, tenantId, task);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        var response = await axios({
                            method: 'post',
                            url: `https://api.hubapi.com/crm/v3/objects/tasks/`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(task),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Hubspot task created',
                            result: { id: response.data?.id, ...task },
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        await axios({
                            method: 'post',
                            url: `https://www.zohoapis.com/crm/v3/Tasks`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(task),
                        });
                        res.send({ status: 'ok', message: 'Zoho task created', result: task });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        var taskCreated = await axios({
                            method: 'post',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Task/`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(task),
                        });
                        res.send({
                            status: 'ok',
                            message: 'SFDC task created',
                            result: taskCreated.data,
                        });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var instanceUrl = connection.tp_account_url;
                        var pipedriveTask = task as Partial<PipedriveTask>;
                        var taskCreated = await axios.post<{ data: Partial<PipedriveTask> }>(
                            `${instanceUrl}/v1/activities`,
                            pipedriveTask,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        res.send({
                            status: 'ok',
                            message: 'Pipedrive task created',
                            result: {
                                ...taskCreated.data.data,
                            },
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        var response: any = await axios({
                            method: 'post',
                            url: 'https://api.close.com/api/v1/task/',
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: task,
                        });

                        res.send({
                            status: 'ok',
                            message: 'Closecrm task created',
                            result: response.data,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var response = await axios({
                            method: 'post',
                            url: `${connection.tp_account_url}/api/data/v9.2/tasks`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: task,
                        });

                        res.send({
                            status: 'ok',
                            message: 'MS Dynamics 365 Task created.',
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
                console.error('Could not create task', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async updateTask(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var taskData = req.body as UnifiedTask;
                var taskId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var task = await disunifyObject<UnifiedTask>({
                    obj: taskData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                console.log('Revert::UPDATE TASK', connection.app?.env?.accountId, tenantId, task, taskId);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        await axios({
                            method: 'patch',
                            url: `https://api.hubapi.com/crm/v3/objects/tasks/${taskId}`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(task),
                        });
                        res.send({
                            status: 'ok',
                            message: 'Hubspot task updated',
                            result: task,
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        await axios({
                            method: 'put',
                            url: `https://www.zohoapis.com/crm/v3/Tasks/${taskId}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(task),
                        });
                        res.send({ status: 'ok', message: 'Zoho task updated', result: task });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        await axios({
                            method: 'patch',
                            url: `${instanceUrl}/services/data/v56.0/sobjects/Task/${taskId}`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(task),
                        });
                        res.send({ status: 'ok', message: 'SFDC task updated', result: task });
                        break;
                    }
                    case TP_ID.pipedrive: {
                        var taskUpdated = await axios.put<{ data: Partial<PipedriveTask> }>(
                            `${connection.tp_account_url}/v1/activities/${taskId}`,
                            task,
                            {
                                headers: {
                                    Authorization: `Bearer ${thirdPartyToken}`,
                                },
                            },
                        );
                        res.send({
                            status: 'ok',
                            message: 'Pipedrive task updated',
                            result: {
                                ...taskUpdated.data.data,
                            },
                        });
                        break;
                    }
                    case TP_ID.closecrm: {
                        var response = await axios({
                            method: 'put',
                            url: `https://api.close.com/api/v1/task/${taskId}`,
                            headers: {
                                'Content-Type': 'application/json',
                                Authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify(task),
                        });

                        res.send({
                            status: 'ok',
                            message: 'Closecrm task updated',
                            result: response.data,
                        });
                        break;
                    }
                    case TP_ID.ms_dynamics_365_sales: {
                        var response = await axios({
                            method: 'patch',
                            url: `${connection.tp_account_url}/api/data/v9.2/tasks(${taskId})`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: task,
                        });

                        res.send({
                            status: 'ok',
                            message: 'MS Dynamics 365 Task updated.',
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
                console.error('Could not update task', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async searchTasks(req, res) {
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

                logInfo('Revert::SEARCH TASK', connection.app?.env?.accountId, tenantId, searchCriteria, fields);

                switch (thirdPartyId) {
                    case TP_ID.hubspot: {
                        let tasks: any = await axios({
                            method: 'post',
                            url: `https://api.hubapi.com/crm/v3/objects/tasks/search`,
                            headers: {
                                'content-type': 'application/json',
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                            data: JSON.stringify({
                                ...searchCriteria,
                                limit: pageSize || 100,
                                after: cursor || 0,
                                properties: [
                                    'hs_task_body',
                                    'hs_task_subject',
                                    'hs_task_priority',
                                    'hs_task_status',
                                    'hs_timestamp',
                                    ...formattedFields,
                                ],
                            }),
                        });
                        var nextCursor = tasks.data?.paging?.next?.after || undefined;

                        tasks = tasks.data.results as any[];
                        tasks = await Promise.all(
                            tasks?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedTask>({
                                        obj: { ...l, ...l?.properties },
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
                            results: tasks,
                        });
                        break;
                    }
                    case TP_ID.zohocrm: {
                        var pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            cursor ? `&page_token=${cursor}` : ''
                        }`;
                        let tasks: any = await axios({
                            method: 'get',
                            url: `https://www.zohoapis.com/crm/v3/Tasks/search?criteria=${searchCriteria}${pagingString}`,
                            headers: {
                                authorization: `Zoho-oauthtoken ${thirdPartyToken}`,
                            },
                        });
                        var nextCursor = tasks.data?.info?.next_page_token || undefined;
                        var prevCursor = tasks.data?.info?.previous_page_token || undefined;
                        tasks = tasks.data.data;
                        tasks = await Promise.all(
                            tasks?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedTask>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', next: nextCursor, previous: prevCursor, results: tasks });
                        break;
                    }
                    case TP_ID.sfdc: {
                        var instanceUrl = connection.tp_account_url;
                        let tasks: any = await axios({
                            method: 'get',
                            url: `${instanceUrl}/services/data/v56.0/search?q=${searchCriteria}`,
                            headers: {
                                authorization: `Bearer ${thirdPartyToken}`,
                            },
                        });
                        tasks = tasks?.data?.searchRecords;
                        tasks = await Promise.all(
                            tasks?.map(
                                async (l: any) =>
                                    await unifyObject<any, UnifiedTask>({
                                        obj: l,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        res.send({ status: 'ok', results: tasks });
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
                            url: `${connection.tp_account_url}/api/data/v9.2/tasks?${searchString}${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                'OData-MaxVersion': '4.0',
                                'OData-Version': '4.0',
                                Accept: 'application/json',
                                Prefer: pageSize ? `odata.maxpagesize=${pageSize}` : '',
                            },
                        });

                        var unifiedTasks = await Promise.all(
                            result.data.value.map(
                                async (contact: any) =>
                                    await unifyObject<any, UnifiedTask>({
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
                            results: unifiedTasks,
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
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { taskService };
