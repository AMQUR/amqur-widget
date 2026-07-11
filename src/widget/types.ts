export type AmqurWidgetConfig = {
    apiBaseUrl: string;
    tenantSlug: string;
    locationSlug: string;
    jwtToken?: string;
    /** Optional UI language override: en | es */
    locale?: string;
};

export type WidgetFeatures = {
    chat: boolean;
    inventory: boolean;
    payments: boolean;
    vehicleCompare?: boolean;
    savedVehicles?: boolean;
    serviceAi?: boolean;
    partsAi?: boolean;
    proactiveEngagement?: boolean;
    multilingual?: boolean;
    voiceAi?: boolean;
    leadCapture?: boolean;
    handoff?: boolean;
};

export type WidgetBootstrapResult = {
    tenant: {
        id: string;
        name: string;
        slug: string;
    };

    location: {
        id: string;
        name: string;
        slug: string;
    };

    branding: {
        primaryColor: string;
        accentColor: string;
        logoUrl: string | null;
    };

    features: WidgetFeatures;
    proactive?: {
        enabled: boolean;
        maxPerSession?: number;
        signals?: string[];
    };
    locales?: string[];
};
