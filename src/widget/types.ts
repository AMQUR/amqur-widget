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
    // Public contract: the backend intentionally exposes no internal database
    // ids. Widget sessions key off slugs only.
    tenant: {
        name: string;
        slug: string;
    };

    location: {
        name: string;
        slug: string;
    };

    branding: {
        assistantDisplayName?: string;
        welcomeMessage?: string;
        primaryColor: string;
        accentColor: string;
        logoUrl: string | null;
        logoAlt?: string | null;
        launcherIconUrl?: string | null;
        phone?: string | null;
        websiteUrl?: string | null;
        privacyUrl?: string | null;
        termsUrl?: string | null;
        escalationMessage?: string;
        disclaimerText?: string;
        salesEnabled?: boolean;
        serviceEnabled?: boolean;
        partsEnabled?: boolean;
    };

    features: WidgetFeatures;
    proactive?: {
        enabled: boolean;
        maxPerSession?: number;
        signals?: string[];
    };
    locales?: string[];
    consentText?: string | null;
    configVersion?: number;
};
