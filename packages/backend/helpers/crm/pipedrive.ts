// TODO: type this?
export let mapPipedriveObjectCustomFields = ({ object, objectFields }: { object: any; objectFields: any }) => {
    let mappedCustomFields: Record<string, any> = {};
    Object.keys(object).forEach((k) => {
        let a = objectFields.find((p: any) => p.key === k)?.name;
        if (
            a &&
            !Object.keys(object)
                .map((b) => b.toLowerCase())
                .includes(a.toLowerCase())
        ) {
            mappedCustomFields[a] = object?.[k];
        }
    });
    return {
        ...object,
        ...mappedCustomFields,
    };
};

export function handlePipedriveDisunify<T extends Record<string, any>>({
    obj,
    transformedObj,
}: {
    obj: T;
    transformedObj: any;
}) {
    let pipedriveObj = {
        ...transformedObj,
        ...(obj.associations?.contactId && {
            person_id: obj.associations.contactId,
        }),
        ...(obj.associations?.companyId && {
            organization_id: obj.associations.companyId,
        }),
        ...(obj.associations?.leadId && {
            lead_id: obj.associations.leadId,
        }),
        ...(obj.associations?.dealId && {
            deal_id: obj.associations.dealId,
        }),
    };
    // Map custom fields
    if (obj.additional) {
        Object.keys(obj.additional).forEach((key) => {
            if (key !== 'associations') {
                pipedriveObj[key] = obj.additional?.[key];
            }
        });
    }
    return pipedriveObj;
}
