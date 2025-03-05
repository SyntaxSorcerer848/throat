import { PrismaClient } from '@prisma/client';
import { xprisma } from './client';

let prisma = new PrismaClient();

async function main() {
    let allConnections = await xprisma.connections.findMany({
        include: {
            app: {
                select: {
                    environmentId: true,
                    tp_id: true,
                    id: true,
                },
            },
        },
    });

    allConnections.forEach(async (connection) => {
        let environmentId = connection.app?.environmentId;
        let newConnectionId = `${environmentId}_${connection.id}`;
        try {
            await prisma.connections.update({
                where: {
                    id: connection.id,
                },
                data: {
                    id: newConnectionId,
                    environmentId: environmentId,
                },
            });
        } catch (error) {
            console.log('error', environmentId, newConnectionId, connection.id, error);
        }
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
