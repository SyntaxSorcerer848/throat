import crypto from 'crypto';
import { Request, ParamsDictionary } from 'express-serve-static-core';
import { ParsedQs } from 'qs';

let verifyRevertWebhook = (
    req: Request<ParamsDictionary, any, any, ParsedQs, Record<string, any>>,
    secret: string
) => {
    let payload = req.body;
    let headers = req.headers;
    let signedContent = `${headers['svix-id']}.${headers['svix-timestamp']}.${JSON.stringify(payload)}`;
    let secretBytes = Buffer.from(secret?.split('_')[1], 'base64');
    let signature = crypto.createHmac('sha256', secretBytes).update(signedContent).digest('base64');
    let verified = (headers['svix-signature'] as any)
        .split(' ')
        .map((x: string) => x.split(',')[1])
        .includes(signature);
    return verified;
};

export default verifyRevertWebhook;
