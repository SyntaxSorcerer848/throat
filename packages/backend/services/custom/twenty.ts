import { Connection } from '../../generated/typescript/api/resources/common/index.js';
import config from '../../config';
var { initSDK } = require('@opensdks/runtime');
var { veniceSdkDef } = require('@opensdks/sdk-venice');

var syncTwentyConnection = async (connection: Connection, connectionAPIKey: string) => {
    var connectionId = connection.t_id;
    var openIntApiKey = config.OPEN_INT_API_KEY;
    var openIntBaseApiUrl = config.OPEN_INT_BASE_API_URL;
    if (!config.OPEN_INT_API_KEY || !connectionAPIKey) {
        console.log('Credentials absent to make this sync happen for: ', connection.t_id, ' returning early');
        return;
    }
    var venice = initSDK(
        {
            ...veniceSdkDef,
            oasMeta: {
                ...veniceSdkDef.oasMeta,
                servers: [{ url: `${openIntBaseApiUrl}/api/v0` }],
            },
        },
        {
            headers: {
                'x-apikey': openIntApiKey,
            },
        }
    );

    var twentyAccessToken = connectionAPIKey;

    var connectorConfig = await venice.GET('/core/connector_config');

    var getConnectorConfig = (cName: string, connectorConfig: any) =>
        connectorConfig?.data?.filter((c: any) => c.connectorName === cName)[0];

    var twenty = getConnectorConfig('twenty', connectorConfig);
    var revert = getConnectorConfig('revert', connectorConfig);

    let revertResource = await venice.GET('/core/resource', {
        params: {
            query: {
                connectorConfigId: revert.id,
                endUserId: connectionId,
            },
        },
    });

    let twentyResource = await venice.GET('/core/resource', {
        params: {
            query: {
                connectorConfigId: twenty.id,
                endUserId: connectionId,
            },
        },
    });

    let twentyResourceId = twentyResource?.data[0]?.id;
    let revertResourceId = revertResource?.data[0]?.id;

    twentyResource.data = twentyResource?.data[0];
    revertResource.data = revertResource?.data[0];

    // Create a twenty resource for this connection
    if (!twentyResourceId) {
        twentyResourceId = await venice.POST('/core/resource', {
            body: {
                connectorName: twenty.connectorName,
                displayName: null,
                endUserId: connectionId,
                connectorConfigId: twenty.id,
                integrationId: null,
                settings: { access_token: twentyAccessToken },
            },
        });

        console.log('Created twenty resourceId', twentyResourceId.data);

        twentyResource = await venice.GET(`/core/resource/${twentyResourceId.data}`);

        console.log('Created twenty resource', twentyResource);
    }

    //  Create a revert resource for this connection in this environment of Twenty if not created in Twenty’s organisation,
    if (!revertResourceId) {
        revertResourceId = await venice.POST('/core/resource', {
            body: {
                connectorName: revert.connectorName,
                displayName: null,
                endUserId: connectionId,
                connectorConfigId: revert.id,
                integrationId: null,
                settings: { tenant_id: connectionId },
            },
        });
        console.log('Created revert resourceId', revertResourceId.data);
        revertResource = await venice.GET(`/core/resource/${revertResourceId.data}`);

        console.log('Created revert resource', revertResource);
    }

    console.log('REVERT RESOURCE', revertResourceId);

    console.log('TWENTY RESOURCE', twentyResourceId);

    // Create a pipeline between them if not created,
    // Trigger this created pipeline
    var syncPipeline = await venice.GET('/core/pipeline', {
        params: {
            query: {
                resourceIds: [twentyResource?.data, revertResource?.data],
            },
        },
    });

    if (!syncPipeline?.data[0]) {
        var createdPipeline = await venice.POST('/core/pipeline', {
            body: {
                id: `pipe_${connectionId}`,
                sourceId: revertResource?.data.id,
                destinationId: twentyResource?.data.id,
                streams: { contact: {}, company: {}, deal: {} },
            },
        });
        syncPipeline.data = [createdPipeline.data];
        console.log('Created pipeline', syncPipeline?.data);
    }

    console.log('PIPELINE', syncPipeline?.data[0]);

    await venice
        .POST(`/core/pipeline/${syncPipeline?.data[0]?.id}/_sync`, {
            params: {
                path: { id: syncPipeline?.data[0]?.id },
            },
            body: {
                async: false,
            },
        })
        .catch(() => console.log('TRIGGERED'));
};

export { syncTwentyConnection };
