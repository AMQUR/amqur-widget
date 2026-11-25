/**
 * Widget presentation.
 *
 * - `floating` — the default for dealer websites: a launcher in the corner that opens a dialog.
 * - `inline`   — the chat fills an element the host page provides. It is always open, has no
 *                launcher or close button, does not lock page scroll and is not a modal dialog.
 *                Meant for pages whose whole purpose is the assistant (the private preview page).
 *
 * `inline` needs a container. Without one the widget stays `floating`, so a bad option can never
 * leave a page with no assistant at all.
 */
export type WidgetDisplay = 'floating' | 'inline';

export function resolveDisplay(requested: unknown, container: unknown): WidgetDisplay {
    const mode = typeof requested === 'string' ? requested.trim().toLowerCase() : '';
    return mode === 'inline' && container ? 'inline' : 'floating';
}

/** The element named by the `container` init option (an element or a CSS selector), or null. */
export function resolveContainer(container: unknown): HTMLElement | null {
    if (typeof document === 'undefined' || !container) return null;
    if (typeof container === 'string') {
        try {
            const el = document.querySelector(container);
            return el instanceof HTMLElement ? el : null;
        } catch {
            return null;
        }
    }
    return container instanceof HTMLElement && container.isConnected ? container : null;
}
