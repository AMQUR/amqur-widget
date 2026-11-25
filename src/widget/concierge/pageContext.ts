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
    if (/\/viewdetails\/|-[0-9a-hj-npr-z]{17}$/.test(p)) return 'vdp';
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

type Listing = { vin?: string; sku?: string; vehicle?: NonNullable<PageContext['vehicle']> };

const TEXT_RE = /^[\p{L}\p{N} .,&'()/+-]{1,60}$/u;
const text = (v: unknown): string | undefined => {
    const raw = v && typeof v === 'object' ? (v as Record<string, unknown>).name : v;
    if (typeof raw !== 'string') return undefined;
    const t = raw.replace(/\s+/g, ' ').trim();
    return TEXT_RE.test(t) ? t : undefined;
};
const int = (v: unknown, lo: number, hi: number): number | undefined => {
    const raw = v && typeof v === 'object' ? (v as Record<string, unknown>).value : v;
    const n = typeof raw === 'string' && /^\d{1,7}$/.test(raw.trim()) ? Number(raw.trim()) : raw;
    return typeof n === 'number' && Number.isInteger(n) && n >= lo && n <= hi ? n : undefined;
};
function condition(o: Record<string, unknown>, path: string): 'new' | 'used' | 'certified' | undefined {
    const c = String(o.itemCondition ?? '').toLowerCase();
    const p = path.toLowerCase();
    if (/\/cpo\/|certified/.test(p)) return 'certified';
    if (/used/.test(c) || /\/used\/|^\/used-/.test(p)) return 'used';
    if (/new/.test(c) || /\/new\/|^\/new-/.test(p)) return 'new';
    return undefined;
}

/**
 * The page's own schema.org Vehicle / Product nodes (also inside @graph). Only short, plain
 * values are kept; prices, descriptions, images and URLs are never read.
 */
function jsonLdListing(doc: Document, path: string): Listing {
    const nodes: Array<Record<string, unknown>> = [];
    const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]')).slice(0, 12);
    for (const s of scripts) {
        try {
            const data = JSON.parse((s.textContent ?? '').slice(0, 120_000)) as unknown;
            const top = Array.isArray(data) ? data : [data];
            for (const it of top) {
                if (!it || typeof it !== 'object') continue;
                const o = it as Record<string, unknown>;
                const graph = Array.isArray(o['@graph']) ? (o['@graph'] as unknown[]) : [o];
                for (const g of graph) if (g && typeof g === 'object') nodes.push(g as Record<string, unknown>);
            }
        } catch {
            /* ignore malformed JSON-LD */
        }
    }
    const typed = nodes.filter((o) => /Vehicle|Car|Product/.test(String(o['@type'] ?? '')));
    const withVin = typed.find((o) => typeof o.vehicleIdentificationNumber === 'string' && VIN_RE.test(o.vehicleIdentificationNumber.toUpperCase()));
    if (!withVin) {
        const sku = typed.map((o) => o.sku).find((v) => typeof v === 'string') as string | undefined;
        return sku ? { sku: sku.slice(0, 20) } : {};
    }
    // The same listing is sometimes split across a Vehicle node and a Product node.
    const pick = <T,>(f: (o: Record<string, unknown>) => T | undefined): T | undefined => {
        for (const o of [withVin, ...typed.filter((x) => x !== withVin)]) {
            const v = f(o);
            if (v !== undefined) return v;
        }
        return undefined;
    };
    const vehicle: NonNullable<PageContext['vehicle']> = {
        year: pick((o) => int(o.vehicleModelDate ?? o.modelDate ?? o.productionDate, 1980, 2100)),
        make: pick((o) => text(o.brand ?? o.manufacturer)),
        model: pick((o) => text(o.model)),
        trim: pick((o) => text(o.vehicleConfiguration)),
        condition: pick((o) => condition(o, path)),
        mileage: pick((o) => int(o.mileageFromOdometer, 0, 1_000_000)),
        color: pick((o) => text(o.color)),
        bodyType: pick((o) => text(o.bodyType)),
        fuelType: pick((o) => text(o.fuelType)),
    };
    for (const k of Object.keys(vehicle) as Array<keyof typeof vehicle>) if (vehicle[k] === undefined) delete vehicle[k];
    const sku = pick((o) => (typeof o.sku === 'string' && /^[A-Za-z0-9-]{1,20}$/.test(o.sku) ? o.sku : undefined));
    return { vin: (withVin.vehicleIdentificationNumber as string).toUpperCase(), sku, vehicle: Object.keys(vehicle).length ? vehicle : undefined };
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
        if (/^\/(?!\/)[A-Za-z0-9/_.~+%-]{0,199}$/.test(path)) ctx.path = path;
        const params = new URLSearchParams(loc.search);
        const utm = (k: string) => params.get(k)?.slice(0, 80) || undefined;
        ctx.utmSource = utm('utm_source');
        ctx.utmMedium = utm('utm_medium');
        ctx.utmCampaign = utm('utm_campaign');
        ctx.referrerClass = utm('gclid') || utm('msclkid') ? 'paid' : referrerClass(w.document.referrer, loc.hostname);
        // A single schema.org Vehicle with a VIN marks a detail page even on unknown URL schemes.
        if (ctx.pageType !== 'inventory_search') {
            const ld = jsonLdListing(w.document, path);
            if (ld.vin) {
                ctx.vin = ld.vin;
                ctx.pageType = 'vdp';
                if (ld.vehicle) ctx.vehicle = ld.vehicle;
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
