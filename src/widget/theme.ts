/**
 * Widget themes.
 *
 * - `neutral`  — AMQUR platform default for any tenant. System font stack, the tenant's own
 *                primary/accent colours.
 * - `showroom` — Dial Auto Group's "Showroom" language (graphite stage, white console, one red
 *                for the primary action, Archivo, square corners). Source of truth for the tokens
 *                is `dial-auto-group-platform/src/app/globals.css`.
 *
 * The theme is chosen by the server (`branding.theme` in widget-config). The init option is only
 * a fallback for hosts whose tenant has no theme configured; it changes styling, never data.
 */
export type WidgetTheme = 'neutral' | 'showroom';

const THEMES: readonly WidgetTheme[] = ['neutral', 'showroom'];

export function resolveTheme(serverTheme?: string | null, initTheme?: string | null): WidgetTheme {
    for (const candidate of [serverTheme, initTheme]) {
        const t = typeof candidate === 'string' ? candidate.trim().toLowerCase() : '';
        if ((THEMES as readonly string[]).includes(t)) return t as WidgetTheme;
    }
    return 'neutral';
}

/** Namespaced so it can never collide with (or restyle) a font the host page already uses. */
export const SHOWROOM_FONT_FAMILY = 'AMQUR Archivo';
const FONT_PATH = 'assets/fonts/archivo-latin-var.woff2';

let fontRequested = false;

/**
 * Registers the self-hosted Archivo variable font for the Showroom theme.
 *
 * `@font-face` rules inside a shadow root are ignored by browsers, so the face has to be
 * registered on the document. The FontFace API is used instead of injecting a `<style>` tag:
 * it adds no CSS to the host page, is governed only by the host's `font-src` directive, and the
 * family name is namespaced so no host element can match it. If the font is blocked or missing
 * the theme falls back to the system stack — text is never invisible (`display: swap`).
 */
export function ensureShowroomFont(assetBase: string | null): void {
    if (fontRequested || !assetBase) return;
    if (typeof document === 'undefined' || typeof FontFace === 'undefined' || !document.fonts) return;
    fontRequested = true;
    try {
        const face = new FontFace(SHOWROOM_FONT_FAMILY, `url("${new URL(FONT_PATH, assetBase).href}") format("woff2")`, {
            weight: '100 900',
            stretch: '62% 125%',
            style: 'normal',
            display: 'swap',
        });
        document.fonts.add(face);
        // Load lazily on first use; a failure only means the fallback stack stays in place.
        face.load().catch(() => undefined);
    } catch {
        /* unsupported descriptor or bad URL — keep the system stack */
    }
}

/** Test seam. */
export function resetShowroomFontForTests(): void {
    fontRequested = false;
}

/** Directory the widget bundle was served from, used to locate its own static assets. */
export function assetBaseFromScript(script: HTMLOrSVGScriptElement | null): string | null {
    const src = script && 'src' in script ? (script as HTMLScriptElement).src : '';
    if (!src) return null;
    try {
        const url = new URL('.', src);
        return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch {
        return null;
    }
}
