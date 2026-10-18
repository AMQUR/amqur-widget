import { describe, expect, it } from 'vitest';
import { collectPageContext } from './pageContext';
import { presentationDelayMs, segmentGapMs } from './delivery';
import { c, money } from './copy';

function fakeWindow(opts: { path: string; search?: string; referrer?: string; host?: string; jsonld?: unknown[]; canonical?: string; inputs?: Record<string, string> }) {
    const scripts = (opts.jsonld ?? []).map((j) => ({ textContent: JSON.stringify(j) }));
    const doc = {
        referrer: opts.referrer ?? '',
        querySelector: (sel: string) => (sel.startsWith('link[rel="canonical"]') && opts.canonical ? { href: opts.canonical } : null),
        querySelectorAll: (sel: string) => (sel.includes('ld+json') ? scripts : []),
        // If the collector ever touched form inputs this would be the leak surface:
        forms: opts.inputs,
    };
    return { location: { pathname: opts.path, search: opts.search ?? '', hostname: opts.host ?? 'dealer.test' }, document: doc } as unknown as Window;
}

describe('collectPageContext (privacy-safe page awareness)', () => {
    it('detects a VDP and reads the VIN only from public JSON-LD', () => {
        const w = fakeWindow({
            path: '/new/Jeep/2024-Jeep-Wrangler-abc',
            jsonld: [{ '@type': 'Car', vehicleIdentificationNumber: '1c4hjxdg0rw100001', sku: 'JM1' }],
            inputs: { email: 'someone@example.com' },
        });
        const ctx = collectPageContext(undefined, w);
        expect(ctx).toMatchObject({ pageType: 'vdp', vin: '1C4HJXDG0RW100001', stockNumber: 'JM1' });
        expect(JSON.stringify(ctx)).not.toContain('someone@example.com');
    });

    it('classifies service/parts/finance/inventory/home and referrer classes; captures UTM only', () => {
        expect(collectPageContext(undefined, fakeWindow({ path: '/service/schedule-service' })).pageType).toBe('service_scheduler');
        expect(collectPageContext(undefined, fakeWindow({ path: '/parts' })).pageType).toBe('parts');
        expect(collectPageContext(undefined, fakeWindow({ path: '/financing/apply' })).pageType).toBe('finance');
        expect(collectPageContext(undefined, fakeWindow({ path: '/used-inventory' })).pageType).toBe('inventory_search');
        expect(collectPageContext(undefined, fakeWindow({ path: '/' })).pageType).toBe('homepage');
        const ctx = collectPageContext(undefined, fakeWindow({ path: '/', search: '?utm_source=fb&utm_campaign=truck-month&email=x@y.z', referrer: 'https://www.google.com/' }));
        expect(ctx).toMatchObject({ utmSource: 'fb', utmCampaign: 'truck-month', referrerClass: 'search' });
        expect(JSON.stringify(ctx)).not.toContain('x@y.z');
    });

    it('explicit host context wins, invalid VINs are dropped', () => {
        const ctx = collectPageContext({ pageType: 'vdp', vin: 'NOT-A-VIN' }, fakeWindow({ path: '/' }));
        expect(ctx.pageType).toBe('vdp');
        expect(ctx.vin).toBeUndefined();
    });
});

describe('presentation timing', () => {
    it('pads only an already-received answer, bounded to 2.8s', () => {
        const d = presentationDelayMs({ elapsedMs: 300, minTypingMs: 900, maxTypingMs: 1500, urgent: false, isError: false, reducedMotion: false, random: () => 1 });
        expect(d).toBe(1200);
        expect(presentationDelayMs({ elapsedMs: 0, minTypingMs: 9000, maxTypingMs: 9000, urgent: false, isError: false, reducedMotion: false, random: () => 1 })).toBe(2800);
    });
    it('never delays errors, urgent handoffs, reduced-motion, or slow real work', () => {
        const base = { minTypingMs: 900, maxTypingMs: 1500, random: () => 0.5 };
        expect(presentationDelayMs({ ...base, elapsedMs: 0, urgent: true, isError: false, reducedMotion: false })).toBe(0);
        expect(presentationDelayMs({ ...base, elapsedMs: 0, urgent: false, isError: true, reducedMotion: false })).toBe(0);
        expect(presentationDelayMs({ ...base, elapsedMs: 0, urgent: false, isError: false, reducedMotion: true })).toBe(0);
        expect(presentationDelayMs({ ...base, elapsedMs: 4000, urgent: false, isError: false, reducedMotion: false })).toBe(0);
        expect(segmentGapMs('x'.repeat(500), false)).toBe(1400);
        expect(segmentGapMs('hi', true)).toBe(0);
    });
});

describe('copy', () => {
    it('differentiates illustrative vs customer APR and never says approved', () => {
        expect(c('en', 'exampleRate', { apr: 7.9 })).toBe('example 7.9% APR');
        expect(c('en', 'yourRate', { apr: 4.5 })).toBe('your 4.5% APR');
        expect(c('es', 'exampleRate', { apr: 7.9 })).toContain('ejemplo');
        expect(money(41995)).toBe('$41,995');
        for (const lang of ['en', 'es'] as const) {
            for (const k of ['requested', 'pending', 'confirmed', 'creditCta', 'creditNote', 'tradeNote'] as const) {
                expect(c(lang, k).toLowerCase()).not.toMatch(/approved|aprobad/);
            }
        }
    });
});
