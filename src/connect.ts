import type {
    AmqurWidgetConfig,
    WidgetBootstrapResult,
} from "./widget/types";

let widgetConfig: AmqurWidgetConfig | null = null;
let widgetBootstrap: WidgetBootstrapResult | null = null;
let conversationId: string | null = null;

const SLUG_PATTERN = /^[a-zA-Z0-9_-]+$/;

function safeSlugPart(s: string): string {
    const t = s.trim().replace(/[^a-zA-Z0-9_-]/g, "_");
    return t.slice(0, 64) || "default";
}

function conversationStorageKey(tenantSlug: string, locationSlug: string): string {
    return `amqur_conversation_v1_${safeSlugPart(tenantSlug)}_${safeSlugPart(locationSlug)}`;
}

/** Ensures requests hit a single `/api` prefix (Nest global prefix). Avoids `/api/api`. */
export function normalizeApiBaseUrl(input: string): string {
    let u = input.trim().replace(/\/+$/, "");
    u = u.replace(/\/api\/api(?=\/|$)/gi, "/api");
    if (!/\/api$/i.test(u)) {
        u += "/api";
    }
    return u;
}

function sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function getOrCreateConversationId(tenantSlug: string, locationSlug: string): string {
    const key = conversationStorageKey(tenantSlug, locationSlug);
    try {
        const existing = localStorage.getItem(key);
        if (existing) return existing;
        const id = crypto.randomUUID();
        localStorage.setItem(key, id);
        return id;
    } catch {
        return crypto.randomUUID();
    }
}

/** Unwraps Nest `ResponseInterceptor` payloads `{ success, data }`; tolerates raw bodies. */
export function unwrapApiData<T>(json: unknown): T {
    if (json == null || typeof json !== "object") {
        return json as T;
    }
    const o = json as Record<string, unknown>;
    if ("data" in o && o.data !== undefined) {
        return o.data as T;
    }
    return json as T;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return v != null && typeof v === "object";
}

function validateBootstrapPayload(raw: unknown): WidgetBootstrapResult {
    if (!isRecord(raw)) {
        throw new Error("Invalid widget-config: expected an object");
    }
    const tenant = raw.tenant;
    const location = raw.location;
    const branding = raw.branding;
    const features = raw.features;
    if (!isRecord(tenant) || typeof tenant.id !== "string") {
        throw new Error("Invalid widget-config: missing tenant");
    }
    if (!isRecord(location) || typeof location.id !== "string") {
        throw new Error("Invalid widget-config: missing location");
    }
    if (!isRecord(branding) || !isRecord(features)) {
        throw new Error("Invalid widget-config: missing branding or features");
    }
    return raw as WidgetBootstrapResult;
}

/** Call before any network request. */
export function assertValidInitConfig(config: AmqurWidgetConfig): void {
    const base = typeof config.apiBaseUrl === "string" ? config.apiBaseUrl.trim() : "";
    if (!base) {
        throw new Error(
            "Invalid tenant or location configuration: apiBaseUrl is required",
        );
    }
    try {
        const withProto = /^https?:\/\//i.test(base) ? base : `https://${base}`;
        new URL(withProto);
    } catch {
        throw new Error(
            "Invalid tenant or location configuration: apiBaseUrl is not a valid URL",
        );
    }

    const tenantSlug =
        typeof config.tenantSlug === "string" ? config.tenantSlug.trim() : "";
    const locationSlug =
        typeof config.locationSlug === "string" ? config.locationSlug.trim() : "";

    if (!tenantSlug || !locationSlug) {
        throw new Error(
            "Invalid tenant or location configuration: tenantSlug and locationSlug are required",
        );
    }
    if (!SLUG_PATTERN.test(tenantSlug) || !SLUG_PATTERN.test(locationSlug)) {
        throw new Error(
            "Invalid tenant or location configuration: tenantSlug and locationSlug must be non-empty slugs (letters, numbers, hyphens, underscores)",
        );
    }
}

async function fetchWidgetToken(
    apiBaseUrl: string,
    tenantSlug: string,
    locationSlug: string,
): Promise<string> {
    let lastErr: unknown;
    for (let attempt = 0; attempt < 2; attempt++) {
        try {
            const tokenRes = await fetch(`${apiBaseUrl}/public/widget-token`, {
                method: "POST",
                credentials: "include",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    tenantSlug,
                    locationSlug,
                }),
            });

            if (!tokenRes.ok) {
                const t = await tokenRes.text().catch(() => "");
                lastErr = new Error(t || `widget-token HTTP ${tokenRes.status}`);
                if (attempt === 0) await sleep(400);
                continue;
            }

            const tokenJson: unknown = await tokenRes.json();
            const tokenPayload = unwrapApiData<{ token?: string }>(tokenJson);
            const widgetJwt = tokenPayload?.token;
            if (!widgetJwt) {
                lastErr = new Error("Widget token missing from response");
                if (attempt === 0) await sleep(400);
                continue;
            }
            return widgetJwt;
        } catch (e) {
            lastErr = e;
            if (attempt === 0) await sleep(400);
        }
    }
    throw lastErr instanceof Error
        ? lastErr
        : new Error("Failed to mint widget JWT");
}

/** Re-fetches JWT after expiry or 401; updates runtime config. */
export async function refreshWidgetJwt(): Promise<void> {
    const cfg = getWidgetConfig();
    const base = normalizeApiBaseUrl(cfg.apiBaseUrl);
    const token = await fetchWidgetToken(base, cfg.tenantSlug, cfg.locationSlug);
    cfg.jwtToken = token;
}

function clearConnectionState(): void {
    widgetConfig = null;
    widgetBootstrap = null;
    conversationId = null;
}

/** Clears in-memory JWT/bootstrap state (call from destroy()). */
export function resetWidgetRuntime(): void {
    clearConnectionState();
}

const DEBUG =
  typeof window !== "undefined" &&
  (window as Window & { __AMQUR_DEBUG__?: boolean }).__AMQUR_DEBUG__ === true;

function log(...args: unknown[]): void {
    if (DEBUG) console.log("[AMQUR]", ...args);
}

export async function initConnection(config: AmqurWidgetConfig) {
    assertValidInitConfig(config);

    log("Starting widget bootstrap…");

    const apiBaseUrl = normalizeApiBaseUrl(config.apiBaseUrl);

    const tenantSlug = config.tenantSlug.trim();
    const locationSlug = config.locationSlug.trim();

    try {
        widgetConfig = {
            ...config,
            tenantSlug,
            locationSlug,
            apiBaseUrl,
        };

        const configUrl = `${apiBaseUrl}/public/widget-config?tenantSlug=${encodeURIComponent(tenantSlug)}&locationSlug=${encodeURIComponent(locationSlug)}`;

        let configRes: Response;
        try {
            configRes = await fetch(configUrl);
        } catch (err) {
            console.error(
                `[AMQUR] widget-config network error (tenantSlug=${tenantSlug}, locationSlug=${locationSlug}, apiBaseUrl=${apiBaseUrl}):`,
                err,
            );
            throw new Error(
                `Cannot reach API (tenant=${tenantSlug}, location=${locationSlug}, base=${apiBaseUrl}). Check the server URL and CORS.`,
            );
        }

        if (!configRes.ok) {
            const text = await configRes.text().catch(() => "");
            console.error(
                `[AMQUR] widget-config HTTP ${configRes.status} (tenantSlug=${tenantSlug}, locationSlug=${locationSlug}):`,
                text || "(empty body)",
            );
            throw new Error(
                `widget-config failed for tenant "${tenantSlug}" / location "${locationSlug}": ${text || `HTTP ${configRes.status}`}`,
            );
        }

        let configJson: unknown;
        try {
            configJson = await configRes.json();
        } catch {
            throw new Error(
                `Invalid JSON from widget-config (tenant=${tenantSlug}, location=${locationSlug})`,
            );
        }

        const unwrapped = unwrapApiData<unknown>(configJson);
        const bootstrapData = validateBootstrapPayload(unwrapped);

        widgetBootstrap = {
            tenant: bootstrapData.tenant,
            location: bootstrapData.location,
            branding: bootstrapData.branding,
            features: bootstrapData.features,
        };

        log("widget-config loaded for:", widgetBootstrap.location.name);

        const widgetJwt = await fetchWidgetToken(
            apiBaseUrl,
            tenantSlug,
            locationSlug,
        );

        widgetConfig.jwtToken = widgetJwt;

        log("JWT ready");

        conversationId = getOrCreateConversationId(tenantSlug, locationSlug);

        log("Session ready");
    } catch (e) {
        clearConnectionState();
        throw e;
    }
}

export function getWidgetConfig(): AmqurWidgetConfig {
    if (!widgetConfig) throw new Error("Widget not initialized");
    return widgetConfig;
}

export function getWidgetBootstrap(): WidgetBootstrapResult {
    if (!widgetBootstrap) throw new Error("Widget not initialized");
    return widgetBootstrap;
}

export function getConversationId(): string {
    if (!conversationId) throw new Error("Conversation not initialized");
    return conversationId;
}
