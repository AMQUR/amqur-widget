import type { PageContext } from './types';

/**
 * Privacy-safe page awareness. Reads ONLY:
 *  - explicit host-provided context passed to AMQUR.init({ pageContext })
 *  - public, allowlisted metadata: canonical URL path, schema.org Vehicle/Car JSON-LD
 *    (vehicleIdentificationNumber / sku), and UTM params / referrer CLASS
 * It never reads form fields, inputs, cookies, storage of other systems, or hidden data.
 */
const VIN_RE = /^[A-HJ-NPR-Z0-9]{17}$/;

function classifyPath(path: string): PageContext['pageType'] {
    const p = path.toLowerCase();
    if (p === '/' || p === '') return 'homepage';
    if (/(\/vehicle-details|\/vdp|\/inventory\/[^/]*[0-9a-hj-npr-z]{17}|\/(new|used)\/[^/]+\/[^/]+\/.+)/.test(p)) return 'vdp';
    if (/schedule-service|service-appointment|book-service/.test(p)) return 'service_scheduler';
    if (/\/service/.test(p)) return 'service';
    if (/\/parts/.test(p)) return 'parts';
    if (/financ|credit-app|apply/.test(p)) return 'finance';
    if (/special|offer|incentive/.test(p)) return 'specials';
    if (/(\/new-inventory|\/used-inventory|\/inventory|\/search|\/new-vehicles|\/used-vehicles)/.test(p)) return 'inventory_search';
    if (/contact|hours|directions/.test(p)) return 'contact';
    return 'other';
}

function referrerClass(ref: string, host: string): PageContext['referrerClass'] {
    if (!ref) return 'direct';
    try {
        const u = new URL(ref);
        if (u.hostname === host) return 'internal';
        if (/google\.|bing\.|duckduckgo\.|yahoo\./.test(u.hostname)) return 'search';
        if (/facebook\.|instagram\.|tiktok\.|t\.co|twitter\.|x\.com|linkedin\./.test(u.hostname)) return 'social';
        if (/mail\./.test(u.hostname)) return 'email';
        return 'referral';
    } catch {
        return 'unknown';
    }
}

function jsonLdVin(doc: Document): { vin?: string; sku?: string } {
    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).slice(0, 10);
    for (const s of scripts) {
        try {
            const raw = (s.textContent ?? '').slice(0, 50_000);
            const data = JSON.parse(raw) as unknown;
            const items = Array.isArray(data) ? data : [data];
            for (const it of items) {
                if (!it || typeof it !== 'object') continue;
                const o = it as Record<string, unknown>;
                const type = String(o['@type'] ?? '');
                if (!/Vehicle|Car|Product/.test(type)) continue;
                const vin = typeof o.vehicleIdentificationNumber === 'string' ? o.vehicleIdentificationNumber.toUpperCase() : undefined;
                const sku = typeof o.sku === 'string' ? o.sku.slice(0, 20) : undefined;
                if (vin && VIN_RE.test(vin)) return { vin, sku };
                if (sku) return { sku };
            }
        } catch {
            /* ignore malformed JSON-LD */
        }
    }
    return {};
}

export function collectPageContext(explicit?: Partial<PageContext>, w: Window = window): PageContext {
    const ctx: PageContext = {};
    try {
        const loc = w.location;
        const canonical = (w.document.querySelector('link[rel="canonical"]') as HTMLLinkElement | null)?.href;
        let path = loc.pathname;
        if (canonical) {
            try {
                path = new URL(canonical).pathname;
            } catch {
                /* keep pathname */
            }
        }
        ctx.pageType = classifyPath(path);
        const params = new URLSearchParams(loc.search);
        const utm = (k: string) => params.get(k)?.slice(0, 80) || undefined;
        ctx.utmSource = utm('utm_source');
        ctx.utmMedium = utm('utm_medium');
        ctx.utmCampaign = utm('utm_campaign');
        ctx.referrerClass = utm('gclid') || utm('msclkid') ? 'paid' : referrerClass(w.document.referrer, loc.hostname);
        // A single schema.org Vehicle with a VIN marks a detail page even on unknown URL schemes.
        if (ctx.pageType !== 'inventory_search') {
            const ld = jsonLdVin(w.document);
            if (ld.vin) {
                ctx.vin = ld.vin;
                ctx.pageType = 'vdp';
            }
            if (ld.sku && ctx.pageType === 'vdp') ctx.stockNumber = ld.sku;
        }
    } catch {
        /* non-browser / sandboxed */
    }
    const merged: PageContext = { ...ctx, ...Object.fromEntries(Object.entries(explicit ?? {}).filter(([, v]) => v !== undefined && v !== '')) };
    if (merged.vin && !VIN_RE.test(merged.vin.toUpperCase())) delete merged.vin;
    if (merged.vin) merged.vin = merged.vin.toUpperCase();
    return merged;
}
