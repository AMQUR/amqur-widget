/**
 * Host-page commands for a mounted widget: `AMQUR.open()`, `AMQUR.close()`, `AMQUR.send(text)`.
 *
 * The public API in `embed.tsx` only records a request here; the mounted React tree decides what
 * to do with it. A prompt sent while the chat is not on screen yet is held (latest one wins) and
 * picked up when the chat mounts, so `AMQUR.send()` right after `AMQUR.init()` resolves is safe.
 *
 * A prompt is plain text typed on the visitor's behalf — it goes through exactly the same path as
 * the composer, with the same length cap. It is never treated as markup or as an action.
 */
export type WidgetCommand = 'open' | 'close' | 'send';

/** Same cap as the composer's `maxLength`. */
export const MAX_PROMPT_LENGTH = 2000;

type Listener = (command: WidgetCommand) => void;

const listeners = new Set<Listener>();
let pendingPrompt: string | null = null;

/** Trimmed prompt text, or null for anything that is not a non-empty string. */
export function normalizePrompt(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const text = value.trim().slice(0, MAX_PROMPT_LENGTH).trim();
    return text ? text : null;
}

export function subscribeWidgetCommands(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

function emit(command: WidgetCommand): void {
    for (const listener of [...listeners]) {
        try {
            listener(command);
        } catch {
            /* one failing subscriber must not block the others */
        }
    }
}

export function requestOpen(): void {
    emit('open');
}

export function requestClose(): void {
    emit('close');
}

/** Queues a prompt for the chat. Returns false (and queues nothing) for invalid text. */
export function requestSend(value: unknown): boolean {
    const text = normalizePrompt(value);
    if (!text) return false;
    pendingPrompt = text;
    emit('send');
    return true;
}

/** The queued prompt, handed out once. */
export function takePendingPrompt(): string | null {
    const text = pendingPrompt;
    pendingPrompt = null;
    return text;
}

/** Called from destroy(): a prompt queued for one store must never reach the next one. */
export function resetWidgetCommands(): void {
    pendingPrompt = null;
    listeners.clear();
}
