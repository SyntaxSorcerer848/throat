import revertAuthMiddleware from '../../helpers/authMiddleware';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError, NotFoundError } from '../../generated/typescript/api/resources/common';
import { TP_ID } from '@prisma/client';
import axios from 'axios';
import { AppConfig, AtsStandardObjects } from '../../constants/common';
import { disunifyAtsObject, unifyObject } from '../../helpers/crm/transform';
import { UnifiedCandidate } from '../../models/unified/candidate';
import { CandidateService } from '../../generated/typescript/api/resources/ats/resources/candidate/service/CandidateService';

var objType = AtsStandardObjects.candidate;

var candidateServiceAts = new CandidateService(
    {
        async getCandidate(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var candidateId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                logInfo(
                    'Revert::GET CANDIDATE',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    candidateId,
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
                            url: `https://harvest.greenhouse.io/v1/candidates/${candidateId}`,
                            headers: headers,
                        });

                        var unifiedCandidate: any = await unifyObject<any, UnifiedCandidate>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedCandidate,
                        });
                        break;
                    }
                    case TP_ID.lever: {
                        var headers = { Authorization: `Bearer ${thirdPartyToken}` };

                        var env =
                            connection?.app?.tp_id === 'lever' && (connection?.app?.app_config as AppConfig)?.env;

                        var url =
                            env === 'Sandbox'
                                ? `https://api.sandbox.lever.co/v1/opportunities/${candidateId}`
                                : `https://api.lever.co/v1/opportunities/${candidateId}`;

                        var result = await axios({
                            method: 'get',
                            url: url,
                            headers: headers,
                        });

                        var unifiedCandidate: any = await unifyObject<any, UnifiedCandidate>({
                            obj: result.data.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedCandidate,
                        });
                        break;
                    }

                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch candidate', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async getCandidates(req, res) {
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
                    'Revert::GET ALL CANDIDATES',
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
                            url: `https://harvest.greenhouse.io/v1/candidates?${pagingString}`,
                            headers: headers,
                        });
                        var unifiedCandidates = await Promise.all(
                            result.data.map(async (candidate: any) => {
                                return await unifyObject<any, UnifiedCandidate>({
                                    obj: candidate,
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
                            results: unifiedCandidates,
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
                                ? `https://api.sandbox.lever.co/v1/opportunities?${pagingString}`
                                : `https://api.lever.co/v1/opportunities?${pagingString}`;

                        var result = await axios({
                            method: 'get',
                            url: url,
                            headers: headers,
                        });
                        var unifiedCandidates = await Promise.all(
                            result.data.data.map(async (candidate: any) => {
                                return await unifyObject<any, UnifiedCandidate>({
                                    obj: candidate,
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
                            results: unifiedCandidates,
                        });

                        break;
                    }

                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch candidates', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async createCandidate(req, res) {
            try {
                var candidateData: any = req.body as unknown as UnifiedCandidate;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                var candidate: any = await disunifyAtsObject<UnifiedCandidate>({
                    obj: candidateData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });

                logInfo('Revert::CREATE CANDIDATE', connection.app?.env?.accountId, tenantId, candidate);

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
                            url: `https://harvest.greenhouse.io/v1/candidates`,
                            headers: {
                                Authorization: 'Basic ' + credentials,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'On-Behalf-Of': `${fields.onBehalfOf}`,
                            },
                            data: JSON.stringify(candidate),
                        });
                        res.send({ status: 'ok', message: 'Greenhouse candidate created', result: result.data });

                        break;
                    }
                    case TP_ID.lever: {
                        if (!fields || (fields && !fields.perform_as)) {
                            throw new NotFoundError({
                                error: 'The query parameter "perform_as" is required and should be included in the "fields" parameter.',
                            });
                        }

                        var env =
                            connection?.app?.tp_id === 'lever' && (connection?.app?.app_config as AppConfig)?.env;

                        var url =
                            env === 'Sandbox'
                                ? `https://api.sandbox.lever.co/v1/opportunities?perform_as=${fields.perform_as}`
                                : `https://api.lever.co/v1/opportunities?perform_as=${fields.perform_as}`;

                        var headers = {
                            Authorization: `Bearer ${thirdPartyToken}`,
                            Accept: 'application/json',
                            'Content-Type': 'multipart/form-data type',
                        };

                        var result = await axios({
                            method: 'post',
                            url: url,

                            headers: headers,
                            data: JSON.stringify(candidate),
                        });

                        res.send({ status: 'ok', message: 'Lever candidate created', result: result.data.data });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not create candidate', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async updateCandidate(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var candidateData = req.body as unknown as UnifiedCandidate;
                var candidateId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                var candidate: any = await disunifyAtsObject<UnifiedCandidate>({
                    obj: candidateData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                logInfo('Revert::UPDATE CANDIDATE', connection.app?.env?.accountId, tenantId, candidateData);

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
                            url: `https://harvest.greenhouse.io/v1/candidates/${candidateId}`,
                            headers: {
                                Authorization: 'Basic ' + credentials,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'On-Behalf-Of': `${fields.onBehalfOf}`,
                            },
                            data: JSON.stringify(candidate),
                        });

                        res.send({
                            status: 'ok',
                            message: 'Greenhouse Candidate updated',
                            result: result.data,
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
                console.error('Could not update candidate', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },

        async deleteCandidate(req, res) {
            try {
                var connection = res.locals.connection;
                var candidateId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                logInfo(
                    'Revert::DELETE CANDIDATE',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    candidateId,
                );

                switch (thirdPartyId) {
                    case TP_ID.greenhouse: {
                        if (!fields || (fields && !fields.onBehalfOf)) {
                            throw new NotFoundError({
                                error: 'The query parameter "onBehalfOf",which is a greenhouseUser Id, is required and should be included in the "fields" parameter.',
                            });
                        }

                        var apiToken = thirdPartyToken;
                        var credentials = Buffer.from(apiToken + ':').toString('base64');

                        await axios({
                            method: 'delete',
                            url: `https://harvest.greenhouse.io/v1/candidates/${candidateId}`,
                            headers: {
                                Authorization: 'Basic ' + credentials,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'On-Behalf-Of': `${fields.onBehalfOf}`,
                            },
                        });

                        res.send({
                            status: 'ok',
                            message: 'Greenhouse Candidate deleted',
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
                console.error('Could not delete candidate', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },

    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { candidateServiceAts };
