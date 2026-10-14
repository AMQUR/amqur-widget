import {
    getWidgetConfig,
    normalizeApiBaseUrl,
    refreshWidgetJwt,
    setConversationId,
    unwrapApiData,
} from '../../connect';
import type { ChatResponse, PageContext } from '../concierge/types';

function shortErr(text: string, max = 400): string {
    const t = text.trim();
    return t.length > max ? `${t.slice(0, max)}…` : t;
}

export async function sendChatMessage(
    input: {
        apiBaseUrl: string;
        jwtToken?: string;
        message: string;
        action?: string;
        vin?: string;
        conversationId?: string | null;
        language?: string;
        pageContext?: PageContext;
    },
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
        body: JSON.stringify({
            message: input.message,
            action: input.action,
            vin: input.vin,
            conversationId: input.conversationId ?? undefined,
            language: input.language,
            pageContext: input.pageContext,
        }),
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

    const data = unwrapApiData<ChatResponse>(json);
    if (data && typeof data.conversationId === 'string') setConversationId(data.conversationId);
    return {
        ...data,
        reply: typeof data?.reply === 'string' ? data.reply : '',
        segments: Array.isArray(data?.segments) ? data.segments : [],
        cards: Array.isArray(data?.cards) ? data.cards : [],
        quickReplies: Array.isArray(data?.quickReplies) ? data.quickReplies : [],
        journey: data?.journey ?? {},
        conversation: data?.conversation ?? { language: 'en', handoffState: 'AI', aiPaused: false, pending: 'none' },
        delivery: data?.delivery ?? { urgent: false, toolCount: 0, minTypingMs: 0, maxTypingMs: 0 },
    };
}

export type LiveMessage = { id: string; kind: 'staff' | 'system'; text: string; displayName: string | null; at: string };

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
export type StoreStatus = { known: boolean; timezone?: string; summary?: string | null; sales?: DeptStatus; service?: DeptStatus; parts?: DeptStatus };
