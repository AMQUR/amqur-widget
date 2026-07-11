/// <reference types="vite/client" />

interface ImportMetaEnv {
    readonly VITE_API_BASE_URL?: string;
    readonly VITE_TENANT_SLUG?: string;
    readonly VITE_LOCATION_SLUG?: string;
}

interface ImportMeta {
    readonly env: ImportMetaEnv;
}
