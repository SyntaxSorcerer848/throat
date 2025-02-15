import axios from 'axios';
import prisma from '../prisma/client';
import logger, { logError } from '../helpers/logger';
import ip from 'ip';
class MetricsService {
    async collectAndPublishMetrics() {
        try {
            let numberOfConnections = await prisma.connections.count();
            let numberOfAccounts = await prisma.accounts.count();
            let numberOfUsers = await prisma.users.count();
            let ipAddress = ip.address();
            let metadata = {
                numberOfConnections,
                numberOfAccounts,
                numberOfUsers,
                ipAddress,
            };
            logger.info('collected metrics', metadata);
            await axios({
                url: 'https://api.revert.dev/internal/telemetry',
                method: 'POST',
                data: JSON.stringify(metadata),
            });
        } catch (error: any) {
            logError(error);
            console.error('Could not publish telemetry data', error);
        }
    }
}

export default new MetricsService();
