import prisma from '../../prisma/client';
import { TelemetryService } from '../../generated/typescript/api/resources/internal/resources/telemetry/service/TelemetryService';
import config from '../../config';
import logger from '../../helpers/logger';

let telemetryService = new TelemetryService({
    async createTelemetryEntry(req, res) {
        let telemetryData = req.body;
        logger.info('telemetry data received: ', telemetryData);
        if (config.DISABLE_REVERT_TELEMETRY) {
            logger.info('Telemetry has been disabled, not recording any stats');
            return;
        }
        await prisma.telemetry.create({
            data: {
                metadata: JSON.stringify(telemetryData),
            },
        });
        res.send({ status: 'ok' });
    },
});

export { telemetryService };
