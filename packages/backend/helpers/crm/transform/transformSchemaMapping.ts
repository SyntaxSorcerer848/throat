import { get, merge } from 'lodash';
import { Prisma, PrismaClient, TP_ID, accountFieldMappingConfig } from '@prisma/client';
import {
    ChatStandardObjects,
    StandardObjects,
    TicketStandardObjects,
    AccountingStandardObjects,
    AtsStandardObjects,
    rootSchemaMappingId,
} from '../../../constants/common';
import { logDebug } from '../../logger';

var prisma = new PrismaClient();

export var transformFieldMappingToModel = async ({
    obj,
    tpId,
    objType,
    tenantSchemaMappingId,
    accountFieldMappingConfig,
}: {
    obj: any;
    tpId: TP_ID;
    objType:
        | StandardObjects
        | ChatStandardObjects
        | TicketStandardObjects
        | AtsStandardObjects
        | AccountingStandardObjects;

    tenantSchemaMappingId?: string;
    accountFieldMappingConfig?: accountFieldMappingConfig;
}) => {
    logDebug('transformFieldMappingToModel obj:', obj);
    var connectionSchema = await prisma.schemas.findFirst({
        where: {
            AND: [
                { object: objType },
                { schema_mapping_id: !!tenantSchemaMappingId ? tenantSchemaMappingId : undefined },
            ],
        },
        include: { fieldMappings: { where: { source_tp_id: tpId } } },
    });
    var rootSchema = await prisma.schemas.findFirst({
        where: {
            AND: [
                {
                    object: objType,
                },
                { schema_mapping_id: rootSchemaMappingId },
            ],
        },

        include: { fieldMappings: { where: { source_tp_id: tpId } } },
    });
    let transformedObj: Record<string, any> = {};
    (connectionSchema?.fields || rootSchema?.fields)?.forEach((field) => {
        var fieldMapping =
            connectionSchema?.fieldMappings?.find(
                (r) =>
                    r?.target_field_name === field &&
                    (!accountFieldMappingConfig?.id ||
                        (r?.is_standard_field
                            ? ((accountFieldMappingConfig?.mappable_by_connection_field_list as Prisma.JsonArray) || [])
                                  .filter((a: any) => a.objectName === objType)
                                  .map((a: any) => a.fieldName)
                                  .includes(field)
                            : accountFieldMappingConfig?.allow_connection_override_custom_fields)),
            ) || rootSchema?.fieldMappings?.find((r) => r?.target_field_name === field);

        var transformedKey = fieldMapping?.source_field_name;
        if (transformedKey) {
            if (fieldMapping.is_standard_field) {
                transformedObj = assignValueToObject(transformedObj, field, get(obj, transformedKey));
            } else {
                // map custom fields under "additional"
                transformedObj['additional'] = {
                    ...transformedObj.additional,
                    [field]: get(obj, transformedKey),
                };
            }
        }
    });
    logDebug('transformFieldMappingToModel transformedObj:', transformedObj);
    return transformedObj;
};

export var transformModelToFieldMapping = async ({
    unifiedObj,
    tpId,
    objType,
    tenantSchemaMappingId,
    accountFieldMappingConfig,
}: {
    unifiedObj: any;
    tpId: TP_ID;
    objType:
        | StandardObjects
        | ChatStandardObjects
        | TicketStandardObjects
        | AtsStandardObjects
        | AccountingStandardObjects;
    tenantSchemaMappingId?: string;
    accountFieldMappingConfig?: accountFieldMappingConfig;
}) => {
    logDebug('transformModelToFieldMapping unifiedObj:', unifiedObj);
    var connectionSchema = await prisma.schemas.findFirst({
        where: { object: objType, schema_mapping_id: !!tenantSchemaMappingId ? tenantSchemaMappingId : undefined },
        include: { fieldMappings: { where: { source_tp_id: tpId } } },
    });

    var rootSchema = await prisma.schemas.findFirst({
        where: { object: objType, schema_mapping_id: rootSchemaMappingId },
        include: { fieldMappings: { where: { source_tp_id: tpId } } },
    });

    let crmObj: Record<string, string> = {};
    Object.keys(unifiedObj).forEach((key) => {
        var tenantFieldMapping = connectionSchema?.fieldMappings?.find(
            (r) =>
                r?.target_field_name === key &&
                (!accountFieldMappingConfig?.id ||
                    (r.is_standard_field
                        ? ((accountFieldMappingConfig?.mappable_by_connection_field_list as Prisma.JsonArray) || [])
                              .filter((a: any) => a.objectName === objType)
                              .map((a: any) => a.fieldName)
                              .includes(key)
                        : accountFieldMappingConfig?.allow_connection_override_custom_fields)),
        );
        var rootFieldMapping = rootSchema?.fieldMappings?.filter((r) => r?.target_field_name === key);
        var crmKey = tenantFieldMapping?.source_field_name;
        if (crmKey) {
            crmObj = assignValueToObject(crmObj, crmKey, get(unifiedObj, key));
        }
        rootFieldMapping?.forEach((mapping) => {
            if (mapping.source_field_name) {
                crmObj = assignValueToObject(crmObj, mapping.source_field_name, get(unifiedObj, key));
            }
        });
    });
    logDebug('transformModelToFieldMapping crmObj:', crmObj);
    return crmObj;
};

export var assignValueToObject = (obj: Record<string, any>, key: string, value: any) => {
    if (key.includes('.')) {
        var keys = key.split('.');
        let result;
        for (let i = keys.length - 1; i >= 0; i--) {
            if (i === keys.length - 1) {
                result = value;
            }
            result = {
                [keys[i]]: result,
            };
        }
        return merge(obj, result);
    }
    return {
        ...obj,
        [key]: value,
    };
};
