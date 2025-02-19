import revertAuthMiddleware from '../../helpers/authMiddleware';
import revertTenantMiddleware from '../../helpers/tenantIdMiddleware';
import { logInfo, logError } from '../../helpers/logger';
import { isStandardError } from '../../helpers/error';
import { InternalServerError, NotFoundError } from '../../generated/typescript/api/resources/common';
import { TP_ID } from '@prisma/client';
import axios from 'axios';
import { disunifyAccountingObject, unifyObject } from '../../helpers/crm/transform';
import { AccountingStandardObjects, AppConfig } from '../../constants/common';
import { ExpenseService } from '../../generated/typescript/api/resources/accounting/resources/expense/service/ExpenseService';
import { UnifiedExpense } from '../../models/unified/expense';

var objType = AccountingStandardObjects.expense;

var expenseServiceAccounting = new ExpenseService(
    {
        async getExpense(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var expenseId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse(req.query.fields as string);
                logInfo(
                    'Revert::GET EXPENSE',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    expenseId,
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
                                `/v3/company/${fields.realmID}/purchase/${expenseId}`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        var unifiedExpense: any = await unifyObject<any, UnifiedExpense>({
                            obj: result.data.Purchase,
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedExpense,
                        });
                        break;
                    }
                    case TP_ID.xero: {
                        var result = await axios({
                            method: 'GET',
                            url: `https://api.xero.com/api.xro/2.0/Invoices/${expenseId}`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                        });

                        var unifiedExpense: any = await unifyObject<any, UnifiedExpense>({
                            obj: result.data.Invoices[0],
                            tpId: thirdPartyId,
                            objType,
                            tenantSchemaMappingId: connection.schema_mapping_id,
                            accountFieldMappingConfig: account.accountFieldMappingConfig,
                        });

                        res.send({
                            status: 'ok',
                            result: unifiedExpense,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch expense', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async getExpenses(req, res) {
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
                    'Revert::GET ALL EXPENSES',
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
                                `/v3/company/${fields.realmID}/query?query=select * from Purchase ${pagingString}`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                            },
                        });

                        var unifiedExpenses: any = result.data.QueryResponse.Purchase
                            ? await Promise.all(
                                  result.data.QueryResponse.Purchase.map(
                                      async (purchase: any) =>
                                          await unifyObject<any, UnifiedExpense>({
                                              obj: purchase,
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
                            results: unifiedExpenses,
                        });
                        break;
                    }
                    case TP_ID.xero: {
                        var result = await axios({
                            method: 'GET',
                            url: `https://api.xero.com/api.xro/2.0/Invoices`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                        });

                        var unifiedExpenses: any = await Promise.all(
                            result.data.Invoices.map(
                                async (invoice: any) =>
                                    await unifyObject<any, UnifiedExpense>({
                                        obj: invoice,
                                        tpId: thirdPartyId,
                                        objType,
                                        tenantSchemaMappingId: connection.schema_mapping_id,
                                        accountFieldMappingConfig: account.accountFieldMappingConfig,
                                    }),
                            ),
                        );
                        var hasMoreResults = result.data.Invoices.length === 100;
                        var nextCursor = hasMoreResults ? (cursor ? cursor + 1 : 2) : undefined;
                        res.send({
                            status: 'ok',
                            next: nextCursor ? String(nextCursor) : undefined,
                            results: unifiedExpenses,
                        });
                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not fetch expenses', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },

        async createExpense(req, res) {
            try {
                var expenseData: any = req.body as unknown as UnifiedExpense;
                var connection = res.locals.connection;
                var account = res.locals.account;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                var disunifiedExpenseData: any = await disunifyAccountingObject<UnifiedExpense>({
                    obj: expenseData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });

                logInfo('Revert::CREATE EXPENSE', connection.app?.env?.accountId, tenantId, disunifiedExpenseData);

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
                                    : 'https://quickbooks.api.intuit.com') + `/v3/company/${fields.realmID}/purchase`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: JSON.stringify(disunifiedExpenseData),
                        });
                        res.send({ status: 'ok', message: 'QuickBooks Expense created', result: result.data.Purchase });

                        break;
                    }
                    case TP_ID.xero: {
                        var result: any = await axios({
                            method: 'post',
                            url: `https://api.xero.com/api.xro/2.0/Invoices`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                            data: JSON.stringify(disunifiedExpenseData),
                        });
                        res.send({ status: 'ok', message: 'Xero Expense created', result: result.data.Invoices[0] });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not create Expense', error.response);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async updateExpense(req, res) {
            try {
                var connection = res.locals.connection;
                var account = res.locals.account;
                var expenseData = req.body as unknown as UnifiedExpense;
                var expenseId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);

                if (thirdPartyId === TP_ID.quickbooks && expenseData && !expenseData.id) {
                    throw new Error('The parameter "id" is required in request body.');
                }

                var disunifiedExpenseData: any = await disunifyAccountingObject<UnifiedExpense>({
                    obj: expenseData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });

                logInfo('Revert::UPDATE EXPENSE', connection.app?.env?.accountId, tenantId, expenseData);

                switch (thirdPartyId) {
                    case TP_ID.quickbooks: {
                        if (!fields || (fields && !fields.realmID)) {
                            throw new NotFoundError({
                                error: 'The query parameter "realmID" is required and should be included in the "fields" parameter.',
                            });
                        }
                        disunifiedExpenseData.Id = expenseId;

                        var env =
                            connection?.app?.tp_id === 'quickbooks' && (connection?.app?.app_config as AppConfig)?.env;

                        var result: any = await axios({
                            method: 'post',

                            url: `${
                                (env === 'Sandbox'
                                    ? 'https://sandbox-quickbooks.api.intuit.com'
                                    : 'https://quickbooks.api.intuit.com') + `/v3/company/${fields.realmID}/purchase`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: JSON.stringify(disunifiedExpenseData),
                        });

                        res.send({
                            status: 'ok',
                            message: 'QuickBooks Expense updated',
                            result: result.data.Purchase,
                        });

                        break;
                    }
                    case TP_ID.xero: {
                        disunifiedExpenseData.Id = expenseId;

                        var result: any = await axios({
                            method: 'post',
                            url: `https://api.xero.com/api.xro/2.0/Invoices`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                                'Xero-Tenant-Id': connection.tp_customer_id,
                            },
                            data: JSON.stringify(disunifiedExpenseData),
                        });

                        res.send({
                            status: 'ok',
                            message: 'Xero Expense updated',
                            result: result.data.Invoices[0],
                        });

                        break;
                    }
                    default: {
                        throw new NotFoundError({ error: 'Unrecognized app' });
                    }
                }
            } catch (error: any) {
                logError(error);
                console.error('Could not update Expense', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
        async deleteExpense(req, res) {
            try {
                var connection = res.locals.connection;
                var expenseId = req.params.id;
                var thirdPartyId = connection.tp_id;
                var thirdPartyToken = connection.tp_access_token;
                var tenantId = connection.t_id;
                var fields: any = req.query.fields && JSON.parse((req.query as any).fields as string);
                var expenseData: any = req.body as unknown as UnifiedExpense;
                var account = res.locals.account;

                var disunifiedExpenseData: any = await disunifyAccountingObject<UnifiedExpense>({
                    obj: expenseData,
                    tpId: thirdPartyId,
                    objType,
                    tenantSchemaMappingId: connection.schema_mapping_id,
                    accountFieldMappingConfig: account.accountFieldMappingConfig,
                });
                logInfo(
                    'Revert::DELETE EXPENSE',
                    connection.app?.env?.accountId,
                    tenantId,
                    thirdPartyId,
                    thirdPartyToken,
                    expenseId,
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

                        disunifiedExpenseData.Id = expenseId;
                        await axios({
                            method: 'post',

                            url: `${
                                (env === 'Sandbox'
                                    ? 'https://sandbox-quickbooks.api.intuit.com'
                                    : 'https://quickbooks.api.intuit.com') +
                                `/v3/company/${fields.realmID}/purchase?operation=delete`
                            }`,
                            headers: {
                                Authorization: `Bearer ${thirdPartyToken}`,
                                Accept: 'application/json',
                                'Content-Type': 'application/json',
                            },
                            data: JSON.stringify(disunifiedExpenseData),
                        });
                        res.send({ status: 'ok', message: ' Expense deleted' });

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
                console.error('Could not delete expense', error);
                if (isStandardError(error)) {
                    throw error;
                }
                throw new InternalServerError({ error: 'Internal server error' });
            }
        },
    },
    [revertAuthMiddleware(), revertTenantMiddleware()],
);

export { expenseServiceAccounting };
