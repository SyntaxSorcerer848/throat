import React from 'react';
import axiosInstance from '../axios';
import * as Sentry from '@sentry/react';

let useApi = () => {
    let [data, setData] = React.useState<any>();
    let [loading, setLoading] = React.useState(false);
    let [status, setStatus] = React.useState<number>();

    let fetch = async ({
        url,
        method,
        payload,
        params,
    }: {
        url: string;
        method: 'POST' | 'GET' | 'PUT' | 'PATCH' | 'DELETE';
        payload?: any;
        params?: any;
    }) => {
        setLoading(true);
        try {
            let result = await axiosInstance({ url, method, data: payload, params });

            setData(result.data);
            setStatus(result.status);
        } catch (err: any) {
            Sentry.captureException(err);
            setData(err?.response?.data);
            setStatus(err?.response?.status || 500);
        } finally {
            setLoading(false);
        }
    };

    return { data, loading, status, fetch };
};

export { useApi };
