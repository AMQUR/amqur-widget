/**
 * Presentation timing. The network request starts immediately; this only decides how long the
 * typing indicator stays up AFTER the answer is already in hand, so replies don't appear
 * robotically instant. Bounded jitter; zero for errors, urgent handoffs, staff messages, and
 * reduced-motion users. Never delays a real confirmation beyond `maxTypingMs` (≤2.8s).
 */
export function presentationDelayMs(params: {
    elapsedMs: number;
    minTypingMs: number;
    maxTypingMs: number;
    urgent: boolean;
    isError: boolean;
    reducedMotion: boolean;
    random?: () => number;
}): number {
    if (params.urgent || params.isError || params.reducedMotion) return 0;
    const min = Math.max(0, Math.min(params.minTypingMs, 2800));
    const max = Math.max(min, Math.min(params.maxTypingMs, 2800));
    const target = min + (max - min) * (params.random ?? Math.random)();
    return Math.max(0, Math.round(target - params.elapsedMs));
}

/** Pause between split segments — short, proportional, capped. */
export function segmentGapMs(nextText: string, reducedMotion: boolean): number {
    if (reducedMotion) return 0;
    return Math.min(1400, 350 + nextText.length * 8);
}

export function prefersReducedMotion(): boolean {
    try {
        return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
    } catch {
        return false;
    }
}
