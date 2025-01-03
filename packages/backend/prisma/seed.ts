import { randomUUID } from 'crypto';
import { ENV, PrismaClient, TP_ID, fieldMappings } from '@prisma/client';
import {
    AtsStandardObjects,
    ChatStandardObjects,
    StandardObjects,
    TicketStandardObjects,
    rootSchemaMappingId,
    AccountingStandardObjects,
} from '../constants/common';
import { allFields, atsFields, chatFields, ticketingFields, accountingFields } from './fields';
var prisma = new PrismaClient();

async function main() {
    var localAccount = await prisma.accounts.upsert({
        where: { id: 'localAccount' },
        update: {},
        create: {
            id: 'localAccount',
            private_token: 'localPrivateToken',
            public_token: 'localPublicToken',
            tenant_count: 0,
            environments: {
                createMany: {
                    data: [
                        {
                            id: 'localEnv',
                            env: ENV.development,
                            private_token: 'localPrivateToken',
                            public_token: 'localPublicToken',
                        },
                    ],
                },
            },
        },
    });
    await Promise.all(
        Object.keys(TP_ID).map(async (tp) => {
            var localRevertApp = await prisma.apps.upsert({
                where: {
                    id: `${tp}_${localAccount.id}`,
                },
                update: {},
                create: {
                    id: `${tp}_${localAccount.id}`,
                    tp_id: tp as TP_ID,
                    scope: [],
                    owner_account_public_token: localAccount.public_token,
                    is_revert_app: true,
                    environmentId: 'localEnv',
                },
            });
            console.log({ localAccount, localRevertApp });
        }),
    );

    let allSchemas: any = Object.keys(allFields).map((obj) => {
        return {
            id: randomUUID(),
            fields: allFields[obj as keyof typeof allFields].map((n) => n.target_field_name),
            object: obj as StandardObjects,
        };
    });

    var chatSchemas = Object.keys(chatFields).map((obj) => {
        return {
            id: randomUUID(),
            fields: chatFields[obj as keyof typeof chatFields].map((n) => n.target_field_name),
            object: obj as ChatStandardObjects,
        };
    });

    var ticketSchemas = Object.keys(ticketingFields).map((obj) => {
        return {
            id: randomUUID(),
            fields: ticketingFields[obj as keyof typeof ticketingFields].map((n) => n.target_field_name),
            object: obj as TicketStandardObjects,
        };
    });

    var atsSchemas = Object.keys(atsFields).map((obj) => {
        return {
            id: randomUUID(),
            fields: atsFields[obj as keyof typeof atsFields].map((n) => n.target_field_name),
            object: obj as AtsStandardObjects,
        };
    });
    var accountingSchemas = Object.keys(accountingFields).map((obj) => {
        return {
            id: randomUUID(),
            fields: accountingFields[obj as keyof typeof accountingFields].map((n) => n.target_field_name),
            object: obj as AccountingStandardObjects,
        };
    });

    var mergedSchema = [...allSchemas, ...chatSchemas, ...ticketSchemas, ...atsSchemas, ...accountingSchemas];

    await prisma.schema_mapping.deleteMany({
        where: {
            id: rootSchemaMappingId,
        },
    });

    await prisma.schema_mapping.upsert({
        where: {
            id: rootSchemaMappingId,
        },
        update: {
            object_schemas: {
                createMany: {
                    data: mergedSchema,
                },
            },
            object_schema_ids: mergedSchema.map((s) => s.id),
        },
        create: {
            id: rootSchemaMappingId,
            object_schemas: {
                createMany: {
                    data: mergedSchema,
                },
            },
            object_schema_ids: mergedSchema.map((s) => s.id),
        },
    });

    var fieldMappingForAll: fieldMappings[] = [];
    Object.values(StandardObjects).forEach((obj) => {
        Object.values(TP_ID).forEach(async (tpId) => {
            if (
                !(
                    tpId === 'hubspot' ||
                    tpId === 'zohocrm' ||
                    tpId === 'sfdc' ||
                    tpId === 'pipedrive' ||
                    tpId === 'closecrm' ||
                    tpId === 'ms_dynamics_365_sales'
                )
            )
                return;
            var objSchema = allSchemas.find((s: any) => s.object === obj);
            var fieldMappings = objSchema?.fields.map((field: any) => ({
                id: randomUUID(),
                source_tp_id: tpId,
                schema_id: objSchema.id,
                source_field_name: allFields[obj as 'note' | 'contact'].find((a) => a.target_field_name === field)
                    ?.source_field_name[tpId]!,
                target_field_name: field,
                is_standard_field: true,
            }));
            if (fieldMappings) {
                fieldMappingForAll.push(...fieldMappings);
            }
        });
    });

    Object.values(ChatStandardObjects).forEach((obj) => {
        Object.values(TP_ID).forEach(async (tpId) => {
            if (!(tpId === 'slack' || tpId === 'discord')) return;
            var objSchema = chatSchemas.find((s: any) => s.object === obj);
            var fieldMappings = objSchema?.fields.map((field: any) => ({
                id: randomUUID(),
                source_tp_id: tpId,
                schema_id: objSchema.id,
                source_field_name: chatFields[obj].find((a) => a.target_field_name === field)?.source_field_name[tpId]!,
                target_field_name: field,
                is_standard_field: true,
            }));
            if (fieldMappings) {
                fieldMappingForAll.push(...fieldMappings);
            }
        });
    });

    Object.values(TicketStandardObjects).forEach((obj) => {
        Object.values(TP_ID).forEach(async (tpId) => {
            if (
                !(
                    tpId === 'linear' ||
                    tpId === 'clickup' ||
                    tpId === 'jira' ||
                    tpId === 'trello' ||
                    tpId === 'bitbucket' ||
                    tpId === 'github'
                )
            )
                return;
            var objSchema = ticketSchemas.find((s: any) => s.object === obj);
            var fieldMappings = objSchema?.fields.map((field: any) => {
                var sourceFields: any = (ticketingFields[obj] as { target_field_name: string }[]).find(
                    (a) => a.target_field_name === field,
                );
                return {
                    id: randomUUID(),
                    source_tp_id: tpId,
                    schema_id: objSchema.id,
                    source_field_name: sourceFields?.source_field_name[tpId]!,
                    target_field_name: field,
                    is_standard_field: true,
                };
            });
            if (fieldMappings) {
                fieldMappingForAll.push(...fieldMappings);
            }
        });
    });

    Object.values(AtsStandardObjects).forEach((obj) => {
        Object.values(TP_ID).forEach(async (tpId) => {
            if (!(tpId === 'greenhouse' || tpId === 'lever')) return;
            var objSchema = atsSchemas.find((s: any) => s.object === obj);
            var fieldMappings = objSchema?.fields.map((field: any) => {
                var sourceFields: any = (atsFields[obj] as { target_field_name: string }[]).find(
                    (a) => a.target_field_name === field,
                );
                return {
                    id: randomUUID(),
                    source_tp_id: tpId,
                    schema_id: objSchema.id,
                    source_field_name: sourceFields?.source_field_name[tpId]!,
                    target_field_name: field,
                    is_standard_field: true,
                };
            });
            if (fieldMappings) {
                fieldMappingForAll.push(...fieldMappings);
            }
        });
    });
    Object.values(AccountingStandardObjects).forEach((obj) => {
        Object.values(TP_ID).forEach(async (tpId) => {
            if (!(tpId === 'quickbooks' || tpId === 'xero')) return;
            var objSchema = accountingSchemas.find((s: any) => s.object === obj);
            var fieldMappings = objSchema?.fields.map((field: any) => {
                var sourceFields: any = (accountingFields[obj] as { target_field_name: string }[]).find(
                    (a) => a.target_field_name === field,
                );
                return {
                    id: randomUUID(),
                    source_tp_id: tpId,
                    schema_id: objSchema.id,
                    source_field_name: sourceFields?.source_field_name[tpId]!,
                    target_field_name: field,
                    is_standard_field: true,
                };
            });
            if (fieldMappings) {
                fieldMappingForAll.push(...fieldMappings);
            }
        });
    });

    await prisma.fieldMappings.createMany({
        data: fieldMappingForAll,
    });
}
main()
    .then(async () => {
        await prisma.$disconnect();
    })
    .catch(async (e) => {
        console.error(e);
        await prisma.$disconnect();
        process.exit(1);
    });
