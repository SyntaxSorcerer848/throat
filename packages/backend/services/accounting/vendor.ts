import revertAuthMiddleware from '../../helpers/authMiddleware';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError, NotFoundError } from '../../generated/typescript/api/resources/common';
import { TP_ID } from '@prisma/client';
import axios from 'axios';
import { disunifyAccountingObject, unifyObject } from '../../helpers/crm/transform';
import { AccountingStandardObjects, AppConfig } from '../../constants/common';
import { UnifiedVendor } from '../../models/unified/vendor';
import { VendorService } from '../../generated/typescript/api/resources/accounting/resources/vendor/service/VendorService';

var objType = AccountingStandardObjects.vendor;

var vendorServiceAccounting = new VendorService(
    {
        async getVendor(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var vendorId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse(req.query.fields as string);
                logInfo(
                    'Revert::GET VENDOR',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    vendorId,
                );

                switch (thirdPartyId) {
                    case TP_ID.quickbooks: {
                        if (!fields || (fields && !fields.realmID)) {
                            throw new NotFoundError({
                                error: 'The query parameter "realmID" is required and should be included in the "fields" parameter.',
                            });
                        }
                        var env =
                            connection?.app?.tp_id === 'quickbooks' && (connection?.app?.app_config as AppConfig)?.env;

                        var result = await axios({
                            method: 'GET',

                            url: `${
                                (env === 'Sandbox'
                                    ? 'https://sandbox-quickbooks.api.intuit.com'
                                    : 'https://quickbooks.api.intuit.com') +
                                `/v3/company/${fields.realmID}/vendor/${vendorId}`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        var unifiedVendor: any = await unifyObject<any, UnifiedVendor>({
                            obj: result.data.Vendor,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedVendor,
                        });
                        break;
                    }
                    case TP_ID.xero: {
                        var result = await axios({
                            method: 'GET',
                            url: `https://api.xero.com/api.xro/2.0/contacts/${vendorId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                        });

                        var unifiedVendor: any = await unifyObject<any, UnifiedVendor>({
                            obj: result.data.Contacts[0],
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedVendor,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch vendor', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async getVendors(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var fields: any = req.query.fields ? JSON.parse(req.query.fields as string) : undefined;
                var pageSize = parseInt(String(req.query.pageSize));
                var cursor = req.query.cursor;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;

                logInfo(
                    'Revert::GET ALL VENDORS',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                );
                switch (thirdPartyId) {
                    case TP_ID.quickbooks: {
                        if (!fields || (fields && !fields.realmID)) {
                            throw new NotFoundError({
                                error: 'The query parameter "realmID" is required and should be included in the "fields" parameter.',
                            });
                        }
                        var env =
                            connection?.app?.tp_id === 'quickbooks' && (connection?.app?.app_config as AppConfig)?.env;

                        let pagingString = `${cursor ? ` STARTPOSITION +${cursor}+` : ''}${
                            pageSize ? ` MAXRESULTS +${pageSize}` : ''
                        }`;

                        var result = await axios({
                            method: 'GET',

                            url: `${
                                (env === 'Sandbox'
                                    ? 'https://sandbox-quickbooks.api.intuit.com'
                                    : 'https://quickbooks.api.intuit.com') +
                                `/v3/company/${fields.realmID}/query?query=select * from Vendor ${pagingString}`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        var unifiedVendors: any = result.data.QueryResponse.Vendor
                            ? await Promise.all(
                                  result.data.QueryResponse.Vendor.map(
                                      async (vendor: any) =>
                                          await unifyObject<any, UnifiedVendor>({
                                              obj: vendor,
                                              tpId: thirdPartyId,
                                              objType,
                                              tenantSchemaMappingId: connection.schema_mapping_id,
                                              accountFieldMappingConfig: account.accountFieldMappingConfig,
                                          }),
                                  ),
                              )
                            : {};
                        var nextCursor =
                            pageSize && result.data.QueryResponse?.maxResults
                                ? String(pageSize + (parseInt(String(cursor)) || 0))
                                : undefined;
                        res.send({
                            status: 'ok',
                            next: nextCursor,
                            results: unifiedVendors,
                        });
                        break;
                    }
                    case TP_ID.xero: {
                        var pagingString = `${cursor ? `page=${cursor}` : ''}`;

                        var result = await axios({
                            method: 'GET',
                            url: `https://api.xero.com/api.xro/2.0/contacts?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                        });

                        var unifiedVendors: any = await Promise.all(
                            result.data.Contacts.map(
                                async (contact: any) =>
                                    await unifyObject<any, UnifiedVendor>({
                                        obj: contact,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        var hasMoreResults = result.data.Contacts.length === 100;
                        var nextCursor = hasMoreResults ? (cursor ? cursor + 1 : 2) : undefined;

                        res.send({
                            status: 'ok',
                            next: nextCursor ? String(nextCursor) : undefined,
                            results: unifiedVendors,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch vendors', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },

        async createVendor(req, res) {
            try {
                var vendorData: any = req.body as unknown as UnifiedVendor;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                var disunifiedVendorData: any = await disunifyAccountingObject<UnifiedVendor>({
                    obj: vendorData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });

                logInfo('Revert::CREATE VENDOR', connection.app?.env?.accountId, tenantId, disunifiedVendorData);

                switch (thirdPartyId) {
                    case TP_ID.quickbooks: {
                        if (!fields || (fields && !fields.realmID)) {
                            throw new NotFoundError({
                                error: 'The query parameter "realmID" is required and should be included in the "fields" parameter.',
                            });
                        }

                        var env =
                            connection?.app?.tp_id === 'quickbooks' && (connection?.app?.app_config as AppConfig)?.env;

                        var result: any = await axios({
                            method: 'post',
                            url: `${
                                (env === 'Sandbox'
                                    ? 'https://sandbox-quickbooks.api.intuit.com'
                                    : 'https://quickbooks.api.intuit.com') + `/v3/company/${fields.realmID}/vendor`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: JSON.stringify(disunifiedVendorData),
                        });
                        res.send({ status: 'ok', message: 'QuickBooks Vendor created', result: result.data.Vendor });

                        break;
                    }
                    case TP_ID.xero: {
                        var result: any = await axios({
                            method: 'post',
                            url: `https://api.xero.com/api.xro/2.0/contacts`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                            data: JSON.stringify(disunifiedVendorData),
                        });
                        res.send({ status: 'ok', message: 'Xero Vendor created', result: result.data.Contacts[0] });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not create Vendor', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async updateVendor(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var vendorData = req.body as unknown as UnifiedVendor;
                var vendorId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                if (thirdPartyId === TP_ID.quickbooks && vendorData && !vendorData.id) {
                    throw new Error('The parameter "id" is required in request body.');
                }

                var disunifiedVendorData: any = await disunifyAccountingObject<UnifiedVendor>({
                    obj: vendorData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });

                logInfo('Revert::UPDATE VENDOR', connection.app?.env?.accountId, tenantId, vendorData);

                switch (thirdPartyId) {
                    case TP_ID.quickbooks: {
                        if (!fields || (fields && !fields.realmID)) {
                            throw new NotFoundError({
                                error: 'The query parameter "realmID" is required and should be included in the "fields" parameter.',
                            });
                        }
                        disunifiedVendorData.Id = vendorId;

                        var env =
                            connection?.app?.tp_id === 'quickbooks' && (connection?.app?.app_config as AppConfig)?.env;

                        var result: any = await axios({
                            method: 'post',

                            url: `${
                                (env === 'Sandbox'
                                    ? 'https://sandbox-quickbooks.api.intuit.com'
                                    : 'https://quickbooks.api.intuit.com') + `/v3/company/${fields.realmID}/vendor`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: JSON.stringify(disunifiedVendorData),
                        });

                        res.send({
                            status: 'ok',
                            message: 'QuickBooks Vendor updated',
                            result: result.data.Vendor,
                        });

                        break;
                    }
                    case TP_ID.xero: {
                        var result: any = await axios({
                            method: 'post',
                            url: `https://api.xero.com/api.xro/2.0/contacts/${vendorId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                            data: JSON.stringify(disunifiedVendorData),
                        });
                        res.send({ status: 'ok', message: 'Xero Vendor updated', result: result.data.Contacts[0] });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not update Vendor', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async deleteVendor(req, res) {
            try {
                var connection = res.locals.connection;
                var vendorId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;

                logInfo(
                    'Revert::DELETE VENDOR',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    vendorId,
                );

                switch (thirdPartyId) {
                    case TP_ID.quickbooks: {
                        res.send({
                            status: 'ok',
                            message: 'This endpoint is currently not supported',
                        });
                        break;
                    }
                    case TP_ID.xero: {
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
                console.error('Could not delete vendor', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { vendorServiceAccounting };
