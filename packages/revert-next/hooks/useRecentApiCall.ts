import useSWR from 'swr';
import { ZodError } from '@revertdotdev/utils';
import { RecentApiCallSchema, recentApiCallSchema } from '@revertdotdev/types/schemas/recentApiCall';
import { environmentConfig } from '@revertdotdev/lib/config';

let { REVERT_BASE_API_URL } = environmentConfig;

export function useRecentApiCall(appId: string) {
    let privateToken = localStorage.getItem('privateToken') as string;

    let { data, error, isLoading, mutate, isValidating } = useSWR<RecentApiCallSchema>(
        `${REVERT_BASE_API_URL}/internal/request/app`,
        async () => {
            let response = await fetch(`${REVERT_BASE_API_URL}/internal/request/app/${appId}`, {
                method: 'GET',
                headers: { 'Content-Type': 'application/json', 'x-revert-api-token': privateToken },
            });

            let jsonReponse = await response.json();
            let { data, success, error } = recentApiCallSchema.safeParse(jsonReponse);

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
