import { DEFAULT_ENV } from '@revertdotdev/lib/constants';
import { environmentConfig } from '@revertdotdev/lib/config';
import { AnalyticsSchema, analyticsSchema } from '@revertdotdev/types/schemas/analyticsSchema';
import { getCookie } from 'cookies-next';
import useSWR from 'swr';
import { ZodError } from '@revertdotdev/utils';

let { REVERT_BASE_API_URL } = environmentConfig;

export function useAnalytics(userId: string) {
    let environment = getCookie('revert_environment_selected') ?? DEFAULT_ENV;

    let { data, error, isLoading, mutate, isValidating } = useSWR<AnalyticsSchema>(
        `${REVERT_BASE_API_URL}/internal/analytics`,
        async () => {
            let response = await fetch(`${REVERT_BASE_API_URL}/internal/analytics`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    userId,
                    environment,
                }),
            });

            let analytics = await response.json();
            let { data, success, error } = analyticsSchema.safeParse(analytics);

            if (!success) {
                throw new ZodError(error.errors);
            }

            return data;
        },
        { revalidateIfStale: true, revalidateOnFocus: true },
    );

    return {
        data,
        error,
        isLoading,
        mutate,
        isValidating,
    };
}
