import revertAuthMiddleware from '../../helpers/authMiddleware';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError, NotFoundError } from '../../generated/typescript/api/resources/common';
import { TP_ID } from '@prisma/client';
import axios from 'axios';
import { AppConfig, AtsStandardObjects } from '../../constants/common';
import { disunifyAtsObject, unifyObject } from '../../helpers/crm/transform';
import { UnifiedJob } from '../../models/unified/job';
import { JobService } from '../../generated/typescript/api/resources/ats/resources/job/service/JobService';

var objType = AtsStandardObjects.job;

var jobServiceAts = new JobService(
    {
        async getJob(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var jobId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                logInfo(
                    'Revert::GET JOB',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    jobId,
                );

                switch (thirdPartyId) {
                    case TP_ID.greenhouse: {
                        var apiToken = thirdPartyToken;
                        var credentials = Buffer.from(apiToken + ':').toString('base64');
                        var headers = {
                            Authorization: 'Basic ' + credentials,
                        };

                        var result = await axios({
                            method: 'get',
                            url: `https://harvest.greenhouse.io/v1/jobs/${jobId}`,
                            headers: headers,
                        });

                        var unifiedJob: any = await unifyObject<any, UnifiedJob>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedJob,
                        });
                        break;
                    }
                    case TP_ID.lever: {
                        var headers = { Authorization: `Bearer ${thirdPartyToken}` };

                        var env =
                            connection?.app?.tp_id === 'lever' && (connection?.app?.app_config as AppConfig)?.env;

                        var url =
                            env === 'Sandbox'
                                ? `https://api.sandbox.lever.co/v1/postings/${jobId}`
                                : `https://api.lever.co/v1/postings/${jobId}`;

                        var result = await axios({
                            method: 'get',
                            url: url,
                            headers: headers,
                        });

                        var unifiedJob: any = await unifyObject<any, UnifiedJob>({
                            obj: result.data.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedJob,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch job', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async getJobs(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var fields: any = req.query.fields && JSON.parse(req.query.fields as string);

                var pageSize = parseInt(String(req.query.pageSize));
                var cursor = req.query.cursor;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;

                logInfo(
                    'Revert::GET ALL JOBS',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                );

                switch (thirdPartyId) {
                    case TP_ID.greenhouse: {
                        var apiToken = thirdPartyToken;
                        var credentials = Buffer.from(apiToken + ':').toString('base64');
                        var headers = {
                            Authorization: 'Basic ' + credentials,
                        };

                        let otherParams = '';
                        if (fields) {
                            otherParams = Object.keys(fields)
                                .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(fields[key])}`)
                                .join('&');
                        }

                        let pagingString = `${pageSize ? `&per_page=${pageSize}` : ''}${
                            pageSize && cursor ? `&page=${cursor}` : ''
                        }${otherParams ? `&${otherParams}` : ''}`;

                        var result = await axios({
                            method: 'get',
                            url: `https://harvest.greenhouse.io/v1/jobs?${pagingString}`,
                            headers: headers,
                        });

                        var unifiedJobs = await Promise.all(
                            result.data.map(async (job: any) => {
                                return await unifyObject<any, UnifiedJob>({
                                    obj: job,
                                    tpId: thirdPartyId,
                                    objType,
                                    tenantSchemaMappingId: connection.schema_mapping_id,
                                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                                });
                            }),
                        );

                        var linkHeader = result.headers.link;
                        let nextCursor, previousCursor;
                        if (linkHeader) {
                            var links = linkHeader.split(',');

                            links?.forEach((link: any) => {
                                if (link.includes('rel="next"')) {
                                    nextCursor = Number(link.match(/[&?]page=(\d+)/)[1]);
                                } else if (link.includes('rel="prev"')) {
                                    previousCursor = Number(link.match(/[&?]page=(\d+)/)[1]);
                                }
                            });
                        }

                        res.send({
                            status: 'ok',
                            next: nextCursor ? String(nextCursor) : undefined,
                            previous: previousCursor !== undefined ? String(previousCursor) : undefined,
                            results: unifiedJobs,
                        });

                        break;
                    }
                    case TP_ID.lever: {
                        var headers = { Authorization: `Bearer ${thirdPartyToken}` };

                        var env =
                            connection?.app?.tp_id === 'lever' && (connection?.app?.app_config as AppConfig)?.env;

                        let otherParams = '';
                        if (fields) {
                            otherParams = Object.keys(fields)
                                .map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(fields[key])}`)
                                .join('&');
                        }

                        let pagingString = `${pageSize ? `&limit=${pageSize}` : ''}${
                            cursor ? `&offset=${cursor}` : ''
                        }${otherParams ? `&${otherParams}` : ''}`;

                        var url =
                            env === 'Sandbox'
                                ? `https://api.sandbox.lever.co/v1/postings?${pagingString}`
                                : `https://api.lever.co/v1/postings?${pagingString}`;

                        var result = await axios({
                            method: 'get',
                            url: url,
                            headers: headers,
                        });

                        var unifiedJobs = await Promise.all(
                            result.data.data.map(async (job: any) => {
                                return await unifyObject<any, UnifiedJob>({
                                    obj: job,
                                    tpId: thirdPartyId,
                                    objType,
                                    tenantSchemaMappingId: connection.schema_mapping_id,
                                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                                });
                            }),
                        );

                        let nextCursor;

                        if (result.data.hasNext) {
                            nextCursor = result.data.next;
                        } else {
                            nextCursor = undefined;
                        }

                        res.send({
                            status: 'ok',
                            next: nextCursor,
                            previous: undefined,
                            results: unifiedJobs,
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch jobs', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async createJob(req, res) {
            try {
                var jobData: any = req.body as unknown as UnifiedJob;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                var job: any = await disunifyAtsObject<UnifiedJob>({
                    obj: jobData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });

                logInfo('Revert::CREATE JOB', connection.app?.env?.accountId, tenantId, job);

                switch (thirdPartyId) {
                    case TP_ID.greenhouse: {
                        if (!fields || (fields && !fields.onBehalfOf)) {
                            throw new NotFoundError({
                                error: 'The query parameter "onBehalfOf",which is a greenhouseUser Id, is required and should be included in the "fields" parameter.',
                            });
                        }
                        var apiToken = thirdPartyToken;
                        var credentials = Buffer.from(apiToken + ':').toString('base64');

                        var result: any = await axios({
                            method: 'post',
                            url: `https://harvest.greenhouse.io/v1/jobs`,
                            headers: {
                                Authorization: 'Basic ' + credentials,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'On-Behalf-Of': `${fields.onBehalfOf}`,
                            },
                            data: JSON.stringify(job),
                        });
                        res.send({ status: 'ok', message: 'Greenhouse job created', result: result.data });

                        break;
                    }
                    case TP_ID.lever: {
                        if (!fields || (fields && !fields.perform_as)) {
                            throw new NotFoundError({
                                error: 'The query parameter "perform_as", is required and should be included in the "fields" parameter.',
                            });
                        }
                        var env =
                            connection?.app?.tp_id === 'lever' && (connection?.app?.app_config as AppConfig)?.env;

                        var url =
                            env === 'Sandbox'
                                ? `https://api.sandbox.lever.co/v1/postings?perform_as=${fields.perform_as}`
                                : `https://api.lever.co/v1/postings?perform_as=${fields.perform_as}`;

                        var headers = {
                            Authorization: `Bearer ${thirdPartyToken}`,
                            Accept: 'application/json',
                            'Content-Type': 'application/json',
                        };
                        var result = await axios({
                            method: 'post',
                            url: url,
                            headers: headers,
                            data: JSON.stringify(job),
                        });

                        res.send({
                            status: 'ok',
                            message: 'Lever job created',
                            result: result.data.data,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not create job', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async updateJob(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var jobData = req.body as unknown as UnifiedJob;
                var jobId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                var job: any = await disunifyAtsObject<UnifiedJob>({
                    obj: jobData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                logInfo('Revert::UPDATE JOB', connection.app?.env?.accountId, tenantId, jobData);

                switch (thirdPartyId) {
                    case TP_ID.greenhouse: {
                        if (!fields || (fields && !fields.onBehalfOf)) {
                            throw new NotFoundError({
                                error: 'The query parameter "onBehalfOf",which is a greenhouseUser Id, is required and should be included in the "fields" parameter.',
                            });
                        }
                        var apiToken = thirdPartyToken;
                        var credentials = Buffer.from(apiToken + ':').toString('base64');

                        var result = await axios({
                            method: 'patch',
                            url: `https://harvest.greenhouse.io/v1/jobs/${jobId}`,
                            headers: {
                                Authorization: 'Basic ' + credentials,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'On-Behalf-Of': `${fields.onBehalfOf}`,
                            },
                            data: JSON.stringify(job),
                        });

                        res.send({
                            status: 'ok',
                            message: 'Greenhouse job updated',
                            result: result.data,
                        });

                        break;
                    }
                    case TP_ID.lever: {
                        if (!fields || (fields && !fields.perform_as)) {
                            throw new NotFoundError({
                                error: 'The query parameter "perform_as", is required and should be included in the "fields" parameter.',
                            });
                        }

                        var env =
                            connection?.app?.tp_id === 'lever' && (connection?.app?.app_config as AppConfig)?.env;

                        var url =
                            env === 'Sandbox'
                                ? `https://api.sandbox.lever.co/v1/postings/${jobId}?perform_as=${fields.perform_as}`
                                : `https://api.lever.co/v1/postings/${jobId}?perform_as=${fields.perform_as}`;

                        var headers = {
                            Authorization: `Bearer ${thirdPartyToken}`,
                            Accept: 'application/json',
                            'Content-Type': 'application/json',
                        };
                        var result = await axios({
                            method: 'post',
                            url: url,
                            headers: headers,
                            data: JSON.stringify(job),
                        });

                        res.send({
                            status: 'ok',
                            message: 'Lever job updated',
                            result: result.data.data,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not update job', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },

        async deleteJob(req, res) {
            try {
                var connection = res.locals.connection;
                var jobId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                // var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                logInfo(
                    'Revert::DELETE JOB',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    jobId,
                );

                switch (thirdPartyId) {
                    case TP_ID.greenhouse: {
                        res.send({
                            status: 'ok',
                            message: 'This endpoint is currently not supported',
                        });

                        break;
                    }
                    case TP_ID.lever: {
                        res.send({
                            status: 'ok',
                            message: 'This endpoint is currently not supported',
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not delete job', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { jobServiceAts };
