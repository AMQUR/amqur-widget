import type { AmqurWidgetConfig } from "./widget/types";
import "./embed";

const DEV_INIT_KEY = "__amqurDevBootstrapDone";

function runDevBootstrap(): void {
    if (typeof window === "undefined") return;
    const w = window as unknown as Record<string, unknown>;
    if (w[DEV_INIT_KEY]) return;
    w[DEV_INIT_KEY] = true;

    const amqur = window.AMQUR;
    if (!amqur?.init) {
        console.error("[AMQUR] window.AMQUR.init is missing; ensure embed.tsx is bundled.");
        return;
    }

    const opts: AmqurWidgetConfig = {
        apiBaseUrl:
            import.meta.env.VITE_API_BASE_URL ?? "http://localhost:3000",
        tenantSlug:
            import.meta.env.VITE_TENANT_SLUG ?? "demo-tenant",
        locationSlug:
            import.meta.env.VITE_LOCATION_SLUG ?? "demo-location",
    };

    void amqur.init(opts).catch((err: unknown) => {
        console.error("[AMQUR] Dev bootstrap failed:", err);
    });
}

runDevBootstrap();
