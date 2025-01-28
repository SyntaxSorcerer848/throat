import { cookies } from 'next/headers';
import { DEFAULT_ENV } from './constants';
import { accountResponseSchema, accountSchema } from '@revertdotdev/types/schemas/accountSchema';
import { ZodError } from 'zod';
import { environmentConfig } from './config';

let { REVERT_BASE_API_URL } = environmentConfig;

// Todo: Add Generalised Error Handler
export async function fetchAccountDetails(userId: string) {
    try {
        let response = await fetch(`${REVERT_BASE_API_URL}/internal/account`, {
            method: 'POST',
            body: JSON.stringify({
                userId,
            }),
            headers: {
                'Content-Type': 'application/json',
            },
        });

        let environment = cookies().get('revert_environment_selected')?.value ?? DEFAULT_ENV;
        let jsonResponse = await response.json();
        let { success, data, error } = accountSchema.safeParse(jsonResponse);

        if (!success) {
            throw new ZodError(error.errors);
        }

        let { environments, workspaceName, isOnboardingCompleted } = data.account;

        let {
            private_token: currentPrivateToken,
            public_token: currentPublicToken,
            apps,
        } = environments.filter((e) => e.env.includes(environment))[0];

        let { private_token: prodPrivateToken } = environments.filter((e) => e.env.includes('production'))[0];

        let isDefaultEnvironment = environment.includes(DEFAULT_ENV);

        let parsedResponse = accountResponseSchema.safeParse({
            apps,
            isDefaultEnvironment,
            currentPrivateToken,
            currentPublicToken,
            prodPrivateToken,
            workspaceName,
            isOnboardingCompleted: isOnboardingCompleted[isDefaultEnvironment ? DEFAULT_ENV : 'production'],
        });

        if (!parsedResponse.success) {
            throw new ZodError(parsedResponse.error.errors);
        }

        return parsedResponse.data;
    } catch (err) {
        return {
            name: 'Something went wrong',
            message: err,
        };
    }
}
