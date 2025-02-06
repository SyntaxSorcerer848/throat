import config from '../../config';
import { createRedisClient } from '.';

let subscribe = async (channelName: string, callback: any) => {
    let subscriber = createRedisClient(config.REDIS_URL);
    await subscriber.connect();
    await subscriber.subscribe(channelName, callback);
};

let publish = async (channelName: string, data: any) => {
    let publisher = createRedisClient(config.REDIS_URL);
    await publisher.connect();
    await publisher.publish(channelName, JSON.stringify(data));
};

let pubsub = { publish, subscribe };

export default pubsub;

export let PUBSUB_CHANNELS = {
    INTEGRATION_STATUS: 'integrationStatus',
};

export interface IntegrationStatusSseMessage {
    publicToken: string;
    status: 'SUCCESS' | 'FAILED';
    integrationName: string;
    tenantId: string;
    tenantSecretToken?: string;
    redirectUrl?:string
}
