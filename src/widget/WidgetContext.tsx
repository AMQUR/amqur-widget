import React, { createContext, useContext, useMemo } from 'react';
import type { AmqurWidgetConfig, WidgetBootstrapResult } from './types';
import { getWidgetBootstrap, getWidgetConfig } from '../connect';

type WidgetContextValue = {
    config: AmqurWidgetConfig;
    bootstrap: WidgetBootstrapResult;
};

const WidgetContext = createContext<WidgetContextValue | null>(null);

export function WidgetProvider({ children }: { children: React.ReactNode }) {
    const config = getWidgetConfig();
    const bootstrap = getWidgetBootstrap();
    const value = useMemo(() => ({ config, bootstrap }), [config, bootstrap]);

    return (
        <WidgetContext.Provider value={value}>
            {children}
        </WidgetContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components -- hook co-located with provider
export function useWidget() {
    const ctx = useContext(WidgetContext);
    if (!ctx) {
        throw new Error('useWidget must be used inside <WidgetProvider>');
    }
    return ctx;
}
