import { useEffect, useState } from 'react';
import { useRevertConnectProps } from './types';

declare global {
    interface Window {
        Revert: any;
    }
}

// Initialize Revert on the window object if it's available
if (typeof window !== 'undefined') {
    window.Revert = window.Revert || {};
}

declare var __CDN_PATH__: string;

export function useRevertConnectScript() {
    let [loading, setLoading] = useState(true);
    let [error, setError] = useState<Error | null>(null);

    useEffect(() => {
        let src = `${__CDN_PATH__}`;
        let script = document.createElement('script');
        script.src = src;
        script.async = true;

        script.onload = () => {
            setLoading(false);
        };

        script.onerror = () => {
            setError(new Error(`Error loading Revert script: ${src}`));
            setLoading(false);
        };

        document.body.appendChild(script);

        return () => {
            document.body.removeChild(script);
        };
    }, []);

    return { loading, error };
}
export default function useRevertConnect(props: useRevertConnectProps) {
    let { loading, error } = useRevertConnectScript();
    let [integrationsLoaded, setIntegrationsLoaded] = useState(false);

    useEffect(() => {
        if (!loading && typeof window !== 'undefined' && window.Revert && window.Revert.init) {
            window.Revert.init({
                ...props.config,
                onLoad: () => {
                    props.config.onLoad && props.config.onLoad();
                    setIntegrationsLoaded(window.Revert.getIntegrationsLoaded);
                },
            });
        }
    }, [loading, props.config]);

    let open = (integrationId?: string) => {
        if (error) {
            throw new Error(`Error loading Revert script: ${error}`);
        }
        if (typeof window === 'undefined' || !window.Revert) {
            console.error('Revert is not present');
            return;
        }

        if (window.Revert && !window.Revert.getIntegrationsLoaded) {
            console.error('Revert is not loaded');
            return;
        }

        window.Revert.open(integrationId);
    };
    return { open, error, loading: loading || !integrationsLoaded };
}
