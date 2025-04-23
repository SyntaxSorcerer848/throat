import revertAuthMiddleware from '../../helpers/authMiddleware';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError, NotFoundError } from '../../generated/typescript/api/resources/common';
import { TP_ID } from '@prisma/client';
import axios from 'axios';
import { disunifyAccountingObject, unifyObject } from '../../helpers/crm/transform';
import { AccountingStandardObjects, AppConfig } from '../../constants/common';
import { AccountService } from '../../generated/typescript/api/resources/accounting/resources/account/service/AccountService';
import { UnifiedAccount } from '../../models/unified/account';

var objType = AccountingStandardObjects.account;

var accountServiceAccounting = new AccountService(
    {
        async getAccount(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var accountId = req.params.id; //this is id that will be used to get the particular acccount for the below integrations.
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse(req.query.fields as string);
                logInfo(
                    'Revert::GET ACCOUNT',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    accountId,
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
                                `/v3/company/${fields.realmID}/account/${accountId}`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        var unifiedAccount: any = await unifyObject<any, UnifiedAccount>({
                            obj: result.data.Account,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedAccount,
                        });
                        break;
                    }
                    case TP_ID.xero: {
                        var result = await axios({
                            method: 'GET',
                            url: `https://api.xero.com/api.xro/2.0/Accounts/${accountId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                        });

                        var unifiedAccount: any = await unifyObject<any, UnifiedAccount>({
                            obj: result.data.Accounts[0],
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedAccount,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch account', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },

        async getAccounts(req, res) {
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
                    'Revert::GET ALL ACCOUNTS',
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

                        let pagingString = `${cursor ? ` STARTPOSITION +${cursor}+` : ''}${
                            pageSize ? ` MAXRESULTS +${pageSize}` : ''
                        }`;

                        var env =
                            connection?.app?.tp_id === 'quickbooks' && (connection?.app?.app_config as AppConfig)?.env;

                        var result = await axios({
                            method: 'GET',
                            url: `${
                                (env === 'Sandbox'
                                    ? 'https://sandbox-quickbooks.api.intuit.com'
                                    : 'https://quickbooks.api.intuit.com') +
                                `/v3/company/${fields.realmID}/query?query=select * from Account ${pagingString}`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        var unifiedAccounts: any = result.data.QueryResponse.Account
                            ? await Promise.all(
                                  result.data.QueryResponse.Account.map(
                                      async (accountItem: any) =>
                                          await unifyObject<any, UnifiedAccount>({
                                              obj: accountItem,
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
                            results: unifiedAccounts,
                        });
                        break;
                    }
                    case TP_ID.xero: {
                        var pagingString = `${cursor ? `page=${cursor}` : ''}`;

                        var result = await axios({
                            method: 'GET',
                            url: `https://api.xero.com/api.xro/2.0/Accounts?${pagingString}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                        });

                        var unifiedAccounts: any = await Promise.all(
                            result.data.Accounts.map(
                                async (accountItem: any) =>
                                    await unifyObject<any, UnifiedAccount>({
                                        obj: accountItem,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        var hasMoreResults = result.data.Accounts.length === 100;
                        var nextCursor = hasMoreResults ? (cursor ? cursor + 1 : 2) : undefined;
                        res.send({
                            status: 'ok',
                            next: nextCursor ? String(nextCursor) : undefined,
                            results: unifiedAccounts,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch accounts', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },

        async createAccount(req, res) {
            try {
                var accountData: any = req.body as unknown as UnifiedAccount;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                var disunifiedAccountData: any = await disunifyAccountingObject<UnifiedAccount>({
                    obj: accountData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });

                logInfo('Revert::CREATE ACCOUNT', connection.app?.env?.accountId, tenantId, disunifiedAccountData);

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
                                    : 'https://quickbooks.api.intuit.com') + `/v3/company/${fields.realmID}/account`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: JSON.stringify(disunifiedAccountData),
                        });
                        res.send({ status: 'ok', message: 'QuickBooks account created', result: result.data.Account });

                        break;
                    }
                    case TP_ID.xero: {
                        var result: any = await axios({
                            method: 'put',
                            url: `https://api.xero.com/api.xro/2.0/Accounts`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                            data: JSON.stringify(disunifiedAccountData),
                        });
                        res.send({ status: 'ok', message: 'Xero account created', result: result.data.Accounts[0] });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not create account', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async updateAccount(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var accountData = req.body as unknown as UnifiedAccount;
                var accountId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                if (thirdPartyId === TP_ID.quickbooks && accountData && !accountData.id) {
                    throw new Error('The parameter "id" is required in request body.');
                }

                var disunifiedAccountData: any = await disunifyAccountingObject<UnifiedAccount>({
                    obj: accountData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });

                logInfo('Revert::UPDATE ACCOUNT', connection.app?.env?.accountId, tenantId, accountData);

                switch (thirdPartyId) {
                    case TP_ID.quickbooks: {
                        if (!fields || (fields && !fields.realmID)) {
                            throw new NotFoundError({
                                error: 'The query parameter "realmID" is required and should be included in the "fields" parameter.',
                            });
                        }
                        disunifiedAccountData.Id = accountId;

                        var env =
                            connection?.app?.tp_id === 'quickbooks' && (connection?.app?.app_config as AppConfig)?.env;

                        var result: any = await axios({
                            method: 'post',

                            url: `${
                                (env === 'Sandbox'
                                    ? 'https://sandbox-quickbooks.api.intuit.com'
                                    : 'https://quickbooks.api.intuit.com') + `/v3/company/${fields.realmID}/account`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: JSON.stringify(disunifiedAccountData),
                        });

                        res.send({
                            status: 'ok',
                            message: 'QuickBooks Account updated',
                            result: result.data.Account,
                        });

                        break;
                    }
                    case TP_ID.xero: {
                        var result: any = await axios({
                            method: 'post',
                            url: `https://api.xero.com/api.xro/2.0/Accounts/${accountId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                            data: JSON.stringify(disunifiedAccountData),
                        });

                        res.send({
                            status: 'ok',
                            message: 'Xero Account updated',
                            result: result.data.Accounts[0],
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not update account', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async deleteAccount(req, res) {
            try {
                var connection = res.locals.connection;
                var accountId = req.params.id; //this is id that will be used to get the particular acccount for the below integrations.
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;

                logInfo(
                    'Revert::DELETE ACCOUNT',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    accountId,
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
                        await axios({
                            method: 'delete',
                            url: `https://api.xero.com/api.xro/2.0/Accounts/${accountId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });
                        res.send({ status: 'ok', message: 'deleted' });
                        break;
                    }

                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not delete account', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { accountServiceAccounting };
