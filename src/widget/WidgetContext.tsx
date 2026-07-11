import React, { createContext, useContext, useMemo } from 'react';
import type { AmqurWidgetConfig, WidgetBootstrapResult } from './types';
import { getConversationId, getWidgetBootstrap, getWidgetConfig } from '../connect';

type WidgetContextValue = {
    config: AmqurWidgetConfig;
    bootstrap: WidgetBootstrapResult;
    conversationId: string;
};

const WidgetContext = createContext<WidgetContextValue | null>(null);

export function WidgetProvider({ children }: { children: React.ReactNode }) {
    const config = getWidgetConfig();
    const bootstrap = getWidgetBootstrap();
    const conversationId = getConversationId();

    const value = useMemo(
        () => ({
            config,
            bootstrap,
            conversationId,
        }),
        [config, bootstrap, conversationId],
    );

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
