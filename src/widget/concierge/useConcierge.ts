import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLive, listSavedVehicles, sendChatMessage, syncSavedVehicle } from '../api/chat.api';
import { getConversationId, getWidgetConfig } from '../../connect';
import { prefersReducedMotion, presentationDelayMs, segmentGapMs } from './delivery';
import type { ChatResponse, Journey, Lang, PageContext, UiMessage } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type SendOptions = { action?: string; vin?: string; display?: string };

/**
 * The visible transcript (with its cards) survives a page refresh within the same tab.
 * Keyed by store + signed conversation id; sessionStorage only, so it ends with the tab.
 * The server keeps the real conversation state; this only restores what was on screen.
 */
function transcriptKey(): string | null {
    const id = getConversationId();
    if (!id) return null;
    const cfg = getWidgetConfig();
    return `amqur_transcript_${cfg.tenantSlug}_${cfg.locationSlug}_${id}`;
}
function loadTranscript(): { messages: UiMessage[]; journey: Journey } {
    try {
        const k = transcriptKey();
        const raw = k ? sessionStorage.getItem(k) : null;
        if (!raw) return { messages: [], journey: {} };
        const v = JSON.parse(raw) as { messages?: UiMessage[]; journey?: Journey };
        return { messages: Array.isArray(v.messages) ? v.messages : [], journey: v.journey ?? {} };
    } catch {
        return { messages: [], journey: {} };
    }
}

/**
 * Conversation state for the Concierge Canvas.
 * - Real work starts immediately on send; typing presentation only pads an already-received
 *   answer (bounded, skipped for errors/urgent/reduced motion).
 * - When a person is involved (handoff queued/joined) the widget polls /chat/live for staff
 *   replies and stops showing AI typing.
 * - Saved vehicles sync to the backend for the signed conversation; local list is a cache.
 */
export function useConcierge(opts: { lang: Lang; pageContext: PageContext; savedEnabled: boolean }) {
    const restored = useRef(loadTranscript());
    const [messages, setMessages] = useState<UiMessage[]>(restored.current.messages);
    const [typing, setTyping] = useState(false);
    const [busy, setBusy] = useState(false);
    const [journey, setJourney] = useState<Journey>(restored.current.journey);
    const [handoffState, setHandoffState] = useState<string>('AI');
    const [aiPaused, setAiPaused] = useState(false);
    const [language, setLanguage] = useState<Lang>(opts.lang);
    const [savedVins, setSavedVins] = useState<string[]>([]);
    const [lastFailed, setLastFailed] = useState<{ text: string; options?: SendOptions } | null>(null);
    const liveCursor = useRef<string>(new Date().toISOString());
    const reduced = useRef(prefersReducedMotion());
    const pageContextSent = useRef(false);

    const push = useCallback((m: UiMessage) => setMessages((prev) => [...prev, m]), []);

    useEffect(() => {
        try {
            const k = transcriptKey();
            if (k && messages.length)
                sessionStorage.setItem(
                    k,
                    JSON.stringify({ messages: messages.filter((m) => !('isError' in m && m.isError)).slice(-60), journey }),
                );
        } catch {
            /* storage full / blocked — the server still has the conversation */
        }
    }, [messages, journey]);

    const send = useCallback(
        async (text: string, options: SendOptions = {}) => {
            const trimmed = text.trim();
            if ((!trimmed && !options.action) || busy) return;
            setBusy(true);
            setLastFailed(null);
            if (trimmed || options.display) push({ id: uid(), role: 'user', text: options.display ?? trimmed, at: Date.now() });
            if (!aiPaused) setTyping(true);
            const started = performance.now();
            try {
                const cfg = getWidgetConfig();
                const res: ChatResponse = await sendChatMessage({
                    apiBaseUrl: cfg.apiBaseUrl,
                    jwtToken: cfg.jwtToken,
                    message: trimmed,
                    action: options.action,
                    vin: options.vin,
                    conversationId: getConversationId(),
                    language,
                    pageContext: pageContextSent.current ? undefined : opts.pageContext,
                });
                pageContextSent.current = true;
                setHandoffState(res.conversation.handoffState);
                setAiPaused(res.conversation.aiPaused);
                if (res.conversation.language && res.conversation.language !== language) setLanguage(res.conversation.language);
                if (res.type === 'staff_handling') {
                    setTyping(false);
                    return;
                }
                const wait = presentationDelayMs({
                    elapsedMs: performance.now() - started,
                    minTypingMs: res.delivery.minTypingMs,
                    maxTypingMs: res.delivery.maxTypingMs,
                    urgent: res.delivery.urgent,
                    isError: false,
                    reducedMotion: reduced.current,
                });
                if (wait) await sleep(wait);
                const segments = res.segments.length ? res.segments : [res.reply];
                for (let i = 0; i < segments.length; i += 1) {
                    const last = i === segments.length - 1;
                    push({
                        id: uid(),
                        role: 'assistant',
                        author: 'ai',
                        text: segments[i],
                        ...(last
                            ? {
                                  vehicles: res.vehicles,
                                  compare: res.type === 'vehicle_compare',
                                  cards: res.cards,
                                  disclaimer: res.provenance?.disclaimer,
                              }
                            : {}),
                        at: Date.now(),
                    });
                    if (!last) await sleep(segmentGapMs(segments[i + 1], reduced.current));
                }
                setJourney(res.journey ?? {});
            } catch (e) {
                setLastFailed({ text: trimmed, options });
                push({
                    id: uid(),
                    role: 'assistant',
                    author: 'system',
                    isError: true,
                    text:
                        language === 'es'
                            ? 'No pude enviar eso. Nada se guardó — inténtelo de nuevo.'
                            : "I couldn't send that. Nothing was saved — please try again.",
                    at: Date.now(),
                });
                if (typeof console !== 'undefined') console.warn('[AMQUR] chat failed', e instanceof Error ? e.message : e);
            } finally {
                setTyping(false);
                setBusy(false);
            }
        },
        [busy, aiPaused, language, opts.pageContext, push],
    );

    // Poll for staff replies while a person is (or may be) involved.
    useEffect(() => {
        const involved = aiPaused || ['QUEUED', 'REQUESTED', 'ASSIGNED', 'JOINED'].includes(handoffState);
        const id = getConversationId();
        if (!involved || !id) return;
        let stop = false;
        const tick = async () => {
            try {
                const cfg = getWidgetConfig();
                const live = await fetchLive({ apiBaseUrl: cfg.apiBaseUrl, jwtToken: cfg.jwtToken, conversationId: id, after: liveCursor.current });
                if (stop) return;
                setAiPaused(live.aiPaused);
                setHandoffState(live.handoffState);
                for (const m of live.messages) {
                    liveCursor.current = m.at > liveCursor.current ? m.at : liveCursor.current;
                    push({ id: m.id, role: 'assistant', author: m.kind, displayName: m.displayName, text: m.text, at: Date.parse(m.at) });
                }
            } catch {
                /* transient — next tick retries */
            }
        };
        const timer = window.setInterval(tick, 4000);
        void tick();
        return () => {
            stop = true;
            window.clearInterval(timer);
        };
    }, [aiPaused, handoffState, push]);

    // Saved vehicles: hydrate from server once a conversation exists.
    useEffect(() => {
        const id = getConversationId();
        if (!opts.savedEnabled || !id) return;
        void listSavedVehicles(id).then(setSavedVins).catch(() => undefined);
    }, [opts.savedEnabled, journey]);

    const toggleSaved = useCallback(
        async (vin: string) => {
            const id = getConversationId();
            const upper = vin.toUpperCase();
            const willSave = !savedVins.includes(upper);
            setSavedVins((prev) => (willSave ? [...new Set([...prev, upper])] : prev.filter((v) => v !== upper)));
            if (!id) return;
            const ok = await syncSavedVehicle(id, upper, willSave).catch(() => false);
            if (!ok) setSavedVins((prev) => (willSave ? prev.filter((v) => v !== upper) : [...prev, upper]));
        },
        [savedVins],
    );

    const retry = useCallback(() => {
        if (!lastFailed) return;
        setMessages((prev) => prev.filter((m) => !(m.role === 'assistant' && m.isError)));
        void send(lastFailed.text, lastFailed.options);
    }, [lastFailed, send]);

    return { messages, typing, busy, journey, handoffState, aiPaused, language, setLanguage, savedVins, toggleSaved, send, retry, canRetry: !!lastFailed };
}
