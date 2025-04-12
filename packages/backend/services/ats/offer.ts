import revertAuthMiddleware from '../../helpers/authMiddleware';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError, NotFoundError } from '../../generated/typescript/api/resources/common';
import { TP_ID } from '@prisma/client';
import axios from 'axios';
import { AppConfig, AtsStandardObjects } from '../../constants/common';
import { disunifyAtsObject, unifyObject } from '../../helpers/crm/transform';
import { UnifiedOffer } from '../../models/unified/offer';
import { OfferService } from '../../generated/typescript/api/resources/ats/resources/offer/service/OfferService';

var objType = AtsStandardObjects.offer;

var offerServiceAts = new OfferService(
    {
        async getOffer(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var offerId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                logInfo(
                    'Revert::GET OFFER',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    offerId,
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
                            url: `https://harvest.greenhouse.io/v1/offers/${offerId}`,
                            headers: headers,
                        });
                        var unifiedOffer: any = await unifyObject<any, UnifiedOffer>({
                            obj: result.data,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedOffer,
                        });
                        break;
                    }
                    case TP_ID.lever: {
                        res.send({
                            status: 'ok',
                            result: 'This endpoint is currently not supported.',
                        });
                        break;
                    }

                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch offer', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async getOffers(req, res) {
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
                    'Revert::GET ALL OFFERS',
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
                            url: `https://harvest.greenhouse.io/v1/offers?${pagingString}`,
                            headers: headers,
                        });
                        var unifiedOffers = await Promise.all(
                            result.data.map(async (job: any) => {
                                return await unifyObject<any, UnifiedOffer>({
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
                            results: unifiedOffers,
                        });
                        break;
                    }
                    case TP_ID.lever: {
                        if (!fields || (fields && !fields.opportunityId)) {
                            throw new NotFoundError({
                                error: 'The query parameter "opportunityId" is required and should be included in the "fields" parameter.',
                            });
                        }
                        var env =
                            connection?.app?.tp_id === 'lever' && (connection?.app?.app_config as AppConfig)?.env;

                        var headers = { Authorization: `Bearer ${thirdPartyToken}` };

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
                                ? `https://api.sandbox.lever.co/v1/opportunities/${fields.opportunityId}/offers?${pagingString}`
                                : `https://api.lever.co/v1/opportunities/${fields.opportunityId}/offers?${pagingString}`;

                        var result = await axios({
                            method: 'get',
                            url: url,
                            headers: headers,
                        });
                        var unifiedOffers = await Promise.all(
                            result.data.data.map(async (job: any) => {
                                return await unifyObject<any, UnifiedOffer>({
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
                            results: unifiedOffers,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch offers', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async createOffer(req, res) {
            try {
                var offerData: any = req.body as unknown as UnifiedOffer;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                //  var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                // var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                var offer: any = await disunifyAtsObject<UnifiedOffer>({
                    obj: offerData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });

                logInfo('Revert::CREATE OFFER', connection.app?.env?.accountId, tenantId, offer);

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
                console.error('Could not create offer', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async updateOffer(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var offerData = req.body as unknown as UnifiedOffer;
                //var offerId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                var offer: any = await disunifyAtsObject<UnifiedOffer>({
                    obj: offerData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                logInfo('Revert::UPDATE OFFER', connection.app?.env?.accountId, tenantId, offerData);

                switch (thirdPartyId) {
                    case TP_ID.greenhouse: {
                        if (!fields || (fields && !fields.applicationId && !fields.onBehalfOf)) {
                            throw new NotFoundError({
                                error: 'The query parameters "applicationId","onBehalfOf" are required and should be included in the "fields" parameter.',
                            });
                        }

                        var apiToken = thirdPartyToken;
                        var credentials = Buffer.from(apiToken + ':').toString('base64');

                        var result = await axios({
                            method: 'patch',
                            url: `https://harvest.greenhouse.io/v1/applications/${fields.applicationId}/offers/current_offer`,
                            headers: {
                                Authorization: 'Basic ' + credentials,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'On-Behalf-Of': `${fields.onBehalfOf}`,
                            },
                            data: JSON.stringify(offer),
                        });

                        res.send({
                            status: 'ok',
                            message: 'Greenhouse Offer updated',
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
                console.error('Could not update offer', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },

        async deleteOffer(req, res) {
            try {
                var connection = res.locals.connection;
                var offerId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                // var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                logInfo(
                    'Revert::DELETE OFFER',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    offerId,
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
                console.error('Could not delete offer', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { offerServiceAts };
