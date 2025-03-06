import { TP_ID } from '@prisma/client';

export interface UnifiedMessage {
    text: string;
    channelId: string | undefined;
    additional?: any;
}

export function unifyMessage(message: any) {
    let unifiedMessage: UnifiedMessage = {
        text: message.message.text,
        channelId: message.channel,
        additional: {},
    };

    // Map additional fields
    Object.keys(message).forEach((key) => {
        if (!(key in unifiedMessage)) {
            unifiedMessage['additional'][key] = message[key];
        }
    });

    return unifiedMessage;
}

export function disunifyMessage(message: UnifiedMessage, integrationId: string): any {
    if (integrationId === TP_ID.slack) {
        return toSlackMessage(message);
    } else if (integrationId === TP_ID.discord) {
        return toDiscordMessage(message);
    }
}

function toSlackMessage(message: UnifiedMessage): any {
    let slackMessage: any = {
        channel: message.channelId,
        text: message.text,
    };

    // Map custom fields, if any
    if (message.additional) {
        Object.keys(message.additional).forEach((key) => {
            slackMessage[key] = message.additional?.[key];
        });
    }

    return slackMessage;
}
function toDiscordMessage(message: UnifiedMessage): any {
    let discordMessage: any = {
        content: message.text,
    };

    // Map custom fields, if any
    if (message.additional) {
        Object.keys(message.additional).forEach((key) => {
            discordMessage[key] = message.additional?.[key];
        });
    }

    return discordMessage;
}
