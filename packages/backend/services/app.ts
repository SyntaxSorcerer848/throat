import { TP_ID } from '@prisma/client';
import prisma from '../prisma/client';

class AppService {
    async createRevertAppForAccount({
        accountId,
        tpId,
        environment,
    }: {
        accountId: string;
        tpId: TP_ID;
        environment: string;
    }): Promise<any> {
        let id = `${tpId}_${accountId}_${environment}`;
        let environmentId = `${accountId}_${environment}`;
        try {
            let createdApp = await prisma.apps.create({
                data: {
                    id,
                    tp_id: tpId,
                    scope: [],
                    is_revert_app: true,
                    environmentId,
                },
            });
            return createdApp;
        } catch (error: any) {
            return { error: 'Something went wrong while creating app' };
        }
    }
}

export default new AppService();
