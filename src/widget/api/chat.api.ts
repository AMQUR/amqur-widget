import {
    getWidgetConfig,
    normalizeApiBaseUrl,
    refreshWidgetJwt,
    setConversationId,
    unwrapApiData,
} from '../../connect';
import type { AppointmentSelection, ChatResponse, LeadSubmission, PageContext, StreamEvent } from '../concierge/types';

function shortErr(text: string, max = 400): string {
    const t = text.trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
}

export type ChatRequestInput = {
    apiBaseUrl: string;
    jwtToken?: string;
    message: string;
    action?: string;
    vin?: string;
    conversationId?: string | null;
    language?: string;
    pageContext?: PageContext;
    /** Structured lead-form submission (action: lead_capture). Sent once; never persisted client-side. */
    lead?: LeadSubmission;
    /** Structured appointment choice (action: appointment_select). */
    appointment?: AppointmentSelection;
};

function requestBody(input: ChatRequestInput): string {
    return JSON.stringify({
        message: input.message,
        action: input.action,
        vin: input.vin,
        conversationId: input.conversationId ?? undefined,
        language: input.language,
        pageContext: input.pageContext,
        lead: input.lead,
        appointment: input.appointment,
    });
}

/** Fills every optional field so the UI never has to defend against a partial envelope. */
export function normalizeChatResponse(data: ChatResponse | null | undefined): ChatResponse {
    if (data && typeof data.conversationId === 'string') setConversationId(data.conversationId);
    return {
        ...(data as ChatResponse),
        reply: typeof data?.reply === 'string' ? data.reply : '',
        segments: Array.isArray(data?.segments) ? data.segments : [],
        cards: Array.isArray(data?.cards) ? data.cards : [],
        quickReplies: Array.isArray(data?.quickReplies) ? data.quickReplies : [],
        journey: data?.journey ?? {},
        conversation: data?.conversation ?? { language: 'en', handoffState: 'AI', aiPaused: false, pending: 'none' },
        delivery: data?.delivery ?? { urgent: false, toolCount: 0, minTypingMs: 0, maxTypingMs: 0 },
    };
}

/**
 * Incremental SSE parser. Feed it decoded text chunks; it returns the complete events seen so
 * far and keeps any partial frame for the next chunk. Unknown or malformed frames are skipped —
 * the stream is additive, so an older widget must tolerate newer event types.
 */
export function createSseParser(): (chunk: string) => StreamEvent[] {
    let buffer = '';
    return (chunk: string) => {
        buffer += chunk.replace(/\r\n/g, '\n');
        const out: StreamEvent[] = [];
        let idx: number;
        while ((idx = buffer.indexOf('\n\n')) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const data = frame
                .split('\n')
                .filter((l) => l.startsWith('data:'))
                .map((l) => l.slice(5).replace(/^ /, ''))
                .join('\n');
            if (!data) continue;
            try {
                const parsed: unknown = JSON.parse(data);
                if (parsed && typeof parsed === 'object' && typeof (parsed as { type?: unknown }).type === 'string') out.push(parsed as StreamEvent);
            } catch {
                /* skip malformed frame */
            }
        }
        return out;
    };
}

/** Thrown when the server has no stream endpoint, so the caller can fall back to POST /chat. */
export class StreamUnsupportedError extends Error {
    constructor() {
        super('stream_unsupported');
        this.name = 'StreamUnsupportedError';
    }
}

/**
 * Streaming turn over fetch + SSE. `onEvent` receives every typed event in order; the promise
 * resolves with the final envelope from `turn.completed`. Aborting `signal` stops reading at
 * once (the caller keeps whatever text already arrived).
 */
export async function streamChatMessage(
    input: ChatRequestInput,
    onEvent: (e: StreamEvent) => void,
    signal?: AbortSignal,
    isRetry = false,
): Promise<ChatResponse> {
    const base = normalizeApiBaseUrl(input.apiBaseUrl);
    const res = await fetch(`${base}/chat/stream`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            Accept: 'text/event-stream',
            ...(input.jwtToken ? { Authorization: `Bearer ${input.jwtToken}` } : {}),
        },
        body: requestBody(input),
        signal,
    });

    if (res.status === 401 && !isRetry && input.jwtToken) {
        await refreshWidgetJwt();
        return streamChatMessage({ ...input, jwtToken: getWidgetConfig().jwtToken }, onEvent, signal, true);
    }
    const contentType = res.headers.get('content-type') ?? '';
    if (res.status === 404 || res.status === 405 || (res.ok && !contentType.includes('text/event-stream'))) {
        throw new StreamUnsupportedError();
    }
    if (!res.ok || !res.body) {
        const text = await res.text().catch(() => '');
        throw new Error(shortErr(text || `Chat request failed (HTTP ${res.status})`));
    }

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    const parse = createSseParser();
    let final: ChatResponse | null = null;
    try {
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            for (const event of parse(decoder.decode(value, { stream: true }))) {
                if (event.type === 'turn.started' && typeof event.conversationId === 'string') setConversationId(event.conversationId);
                if (event.type === 'turn.completed') final = normalizeChatResponse(event.response);
                onEvent(event);
                if (event.type === 'turn.error') throw new Error(shortErr(event.message || event.code));
            }
        }
    } finally {
        reader.cancel().catch(() => undefined);
    }
    if (!final) throw new Error('Stream ended before the reply completed');
    return final;
}

export async function sendChatMessage(
    input: ChatRequestInput,
    isRetry = false,
): Promise<ChatResponse> {
    const base = normalizeApiBaseUrl(input.apiBaseUrl);

    const res = await fetch(`${base}/chat`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            ...(input.jwtToken
                ? { Authorization: `Bearer ${input.jwtToken}` }
                : {}),
        },
        body: requestBody(input),
    });

    if (res.status === 401 && !isRetry && input.jwtToken) {
        try {
            await refreshWidgetJwt();
            const next = getWidgetConfig();
            return sendChatMessage(
                { ...input, jwtToken: next.jwtToken },
                true,
            );
        } catch {
            const text = await res.text().catch(() => '');
            throw new Error(shortErr(text || 'Chat unauthorized'));
        }
    }

    if (!res.ok) {
        const text = await res.text().catch(() => '');
        let msg = shortErr(text || `Chat request failed (HTTP ${res.status})`);
        try {
            const parsed: unknown = JSON.parse(text);
            const inner = unwrapApiData<{ message?: string }>(parsed);
            if (inner && typeof inner === 'object' && 'message' in inner) {
                const m = (inner as { message?: unknown }).message;
                if (typeof m === 'string' && m) msg = shortErr(m);
            }
        } catch {
            /* keep msg */
        }
        throw new Error(msg);
    }

    let json: unknown;
    try {
        json = await res.json();
    } catch {
        throw new Error('Invalid JSON from chat');
    }

    return normalizeChatResponse(unwrapApiData<ChatResponse>(json));
}

export type LiveMessage = { id: string; kind: 'staff' | 'system'; text: string; displayName: string | null; at: string; role?: string | null };

/** Staff replies / system events for the current conversation (polled while a person is involved). */
export async function fetchLive(input: { apiBaseUrl: string; jwtToken?: string; conversationId: string; after?: string }): Promise<{ aiPaused: boolean; handoffState: string; messages: LiveMessage[] }> {
    const base = normalizeApiBaseUrl(input.apiBaseUrl);
    const qs = new URLSearchParams({ conversationId: input.conversationId, ...(input.after ? { after: input.after } : {}) });
    const res = await fetch(`${base}/chat/live?${qs.toString()}`, {
        headers: input.jwtToken ? { Authorization: `Bearer ${input.jwtToken}` } : {},
    });
    if (res.status === 401) {
        await refreshWidgetJwt();
        return { aiPaused: false, handoffState: 'AI', messages: [] };
    }
    if (!res.ok) throw new Error(`live HTTP ${res.status}`);
    return unwrapApiData(await res.json());
}

async function authed(path: string, init: RequestInit = {}): Promise<Response> {
    const cfg = getWidgetConfig();
    const base = normalizeApiBaseUrl(cfg.apiBaseUrl);
    const go = (tok?: string) =>
        fetch(`${base}${path}`, { ...init, headers: { 'Content-Type': 'application/json', ...(tok ? { Authorization: `Bearer ${tok}` } : {}), ...(init.headers ?? {}) } });
    let res = await go(cfg.jwtToken);
    if (res.status === 401) {
        await refreshWidgetJwt();
        res = await go(getWidgetConfig().jwtToken);
    }
    return res;
}

/** Saved vehicles persisted server-side per conversation (tenant-isolated, deduped by VIN). */
export async function syncSavedVehicle(conversationId: string, vin: string, saved: boolean): Promise<boolean> {
    const res = await authed('/saved-vehicles', {
        method: saved ? 'POST' : 'DELETE',
        body: JSON.stringify({ conversationId, vin }),
    });
    return res.ok;
}

export async function listSavedVehicles(conversationId: string): Promise<string[]> {
    const res = await authed(`/saved-vehicles?conversationId=${encodeURIComponent(conversationId)}`);
    if (!res.ok) return [];
    const rows = unwrapApiData<Array<{ vin: string }>>(await res.json());
    return Array.isArray(rows) ? rows.map((r) => r.vin) : [];
}

export async function fetchStoreStatus(lang: string): Promise<StoreStatus> {
    const cfg = getWidgetConfig();
    const base = normalizeApiBaseUrl(cfg.apiBaseUrl);
    try {
        const res = await fetch(`${base}/public/store-status?tenantSlug=${encodeURIComponent(cfg.tenantSlug)}&locationSlug=${encodeURIComponent(cfg.locationSlug)}&lang=${lang}`);
        if (!res.ok) return { known: false };
        return unwrapApiData<StoreStatus>(await res.json());
    } catch {
        return { known: false };
    }
}

export type DeptStatus = { open: boolean; closesAt: string | null; nextOpen: { date: string; at: string } | null } | null;
export type StoreStatus = { known: boolean; simulated?: boolean; timezone?: string; summary?: string | null; sales?: DeptStatus; service?: DeptStatus; parts?: DeptStatus };

export type Spotlight = { id: string; kind: string; title: string; body: string; linkUrl: string | null; disclaimer: string | null; label: string };

/** Approved, in-window dealership spotlights for this store (public, read-only). */
export async function fetchSpotlights(): Promise<Spotlight[]> {
    const cfg = getWidgetConfig();
    const base = normalizeApiBaseUrl(cfg.apiBaseUrl);
    try {
        const res = await fetch(`${base}/public/spotlights?tenantSlug=${encodeURIComponent(cfg.tenantSlug)}&locationSlug=${encodeURIComponent(cfg.locationSlug)}`);
        if (!res.ok) return [];
        const data = unwrapApiData<Spotlight[]>(await res.json());
        return Array.isArray(data) ? data.slice(0, 3) : [];
    } catch {
        return [];
    }
}
