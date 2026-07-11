import {
    getWidgetConfig,
    normalizeApiBaseUrl,
    refreshWidgetJwt,
    unwrapApiData,
} from '../../connect';

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
        conversationId?: string;
    },
    isRetry = false,
): Promise<Record<string, unknown>> {
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
            conversationId: input.conversationId,
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

    return unwrapApiData<Record<string, unknown>>(json);
}
