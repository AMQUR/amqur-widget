import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchLive, listSavedVehicles, sendChatMessage, streamChatMessage, StreamUnsupportedError, syncSavedVehicle, type ChatRequestInput } from '../api/chat.api';
import { getConversationId, getWidgetConfig } from '../../connect';
import { prefersReducedMotion, presentationDelayMs, segmentGapMs } from './delivery';
import { redactForStorage } from './redact';
import type { AppointmentSelection, ChatResponse, Journey, Lang, LeadSubmission, PageContext, StreamEvent, UiMessage } from './types';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const uid = () =>
    typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

export type SendOptions = {
    action?: string;
    vin?: string;
    /** What the transcript shows for this turn. Never put contact details here. */
    display?: string;
    lead?: LeadSubmission;
    appointment?: AppointmentSelection;
};

/** Staff member currently handling the conversation, when the server names one. */
export type StaffPresence = { displayName: string | null; role: string | null } | null;

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
export function useConcierge(opts: { lang: Lang; pageContext: PageContext; currentPageContext?: () => PageContext; savedEnabled: boolean }) {
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
    const [quickReplies, setQuickReplies] = useState<string[]>([]);
    const [staff, setStaff] = useState<StaffPresence>(null);
    const [status, setStatus] = useState<string | null>(null);
    const liveCursor = useRef<string>(new Date().toISOString());
    /** null = not yet known; false = this server has no stream endpoint, use POST /chat. */
    const streamSupported = useRef<boolean | null>(null);
    const abortRef = useRef<AbortController | null>(null);
    const reduced = useRef(prefersReducedMotion());
    // Page context is sent with the first message and again whenever the page (path or listing) changes.
    const pageContextSent = useRef<string | null>(null);
    const currentPageContext = opts.currentPageContext;

    const push = useCallback((m: UiMessage) => setMessages((prev) => [...prev, m]), []);

    useEffect(() => {
        try {
            const k = transcriptKey();
            if (k && messages.length)
                sessionStorage.setItem(
                    k,
                    JSON.stringify({
                        // Contact details a customer typed are masked before anything touches browser storage.
                        messages: messages
                            .filter((m) => !('isError' in m && m.isError) && !('streaming' in m && m.streaming))
                            .slice(-60)
                            .map((m) => ({ ...m, text: redactForStorage(m.text) })),
                        journey,
                    }),
                );
        } catch {
            /* storage full / blocked — the server still has the conversation */
        }
    }, [messages, journey]);

    /** Applies a finished turn: authoritative text, cards, journey and conversation state. */
    const applyResponse = useCallback(
        (res: ChatResponse, turnId: string) => {
            setHandoffState(res.conversation.handoffState);
            setAiPaused(res.conversation.aiPaused);
            if (res.conversation.language && res.conversation.language !== language) setLanguage(res.conversation.language);
            const isTurnMessage = (m: UiMessage) => m.id.startsWith(`${turnId}:`);
            if (res.type === 'staff_handling') {
                setMessages((prev) => prev.filter((m) => !isTurnMessage(m)));
                setQuickReplies([]);
                return;
            }
            const segments = res.segments.length ? res.segments : [res.reply];
            const built: UiMessage[] = segments.map((text, i) => ({
                id: `${turnId}:${i}`,
                role: 'assistant',
                author: 'ai',
                text,
                ...(i === segments.length - 1
                    ? { vehicles: res.vehicles, compare: res.type === 'vehicle_compare', cards: res.cards, disclaimer: res.provenance?.disclaimer }
                    : {}),
                at: Date.now(),
            }));
            // The completed envelope is the source of truth; it replaces whatever streamed in.
            setMessages((prev) => [...prev.filter((m) => !isTurnMessage(m)), ...built]);
            setJourney(res.journey ?? {});
            setQuickReplies(Array.isArray(res.quickReplies) ? res.quickReplies.slice(0, 6) : []);
        },
        [language],
    );

    const send = useCallback(
        async (text: string, options: SendOptions = {}) => {
            const trimmed = text.trim();
            if ((!trimmed && !options.action) || busy) return;
            setBusy(true);
            setLastFailed(null);
            setQuickReplies([]);
            setStatus(null);
            // Drop orphaned error bubbles once the customer sends again successfully later.
            setMessages((prev) => prev.filter((m) => !(m.role === 'assistant' && m.isError)));
            if (trimmed || options.display) push({ id: uid(), role: 'user', text: options.display ?? trimmed, at: Date.now() });
            if (!aiPaused) setTyping(true);
            const started = performance.now();
            const turnId = uid();
            const controller = new AbortController();
            abortRef.current = controller;
            const cfg = getWidgetConfig();
const pageNow = currentPageContext?.() ?? opts.pageContext;
            const pageKey = `${pageNow.path ?? ''}|${pageNow.vin ?? ''}|${pageNow.pageType ?? ''}`;
                        const request: ChatRequestInput = {
                apiBaseUrl: cfg.apiBaseUrl,
                jwtToken: cfg.jwtToken,
                message: trimmed,
                action: options.action,
                vin: options.vin,
                conversationId: getConversationId(),
                language,
                pageContext: pageKey === pageContextSent.current ? undefined : pageNow,
                lead: options.lead,
                appointment: options.appointment,
            };
            const onEvent = (e: StreamEvent) => {
                if (e.type === 'status') setStatus(e.label ?? null);
                if (e.type !== 'text.delta' || !e.text) return;
                // Real text is arriving: the typing indicator has done its job.
                setTyping(false);
                const id = `${turnId}:${e.index}`;
                setMessages((prev) => {
                    const at = prev.findIndex((m) => m.id === id);
                    if (at === -1) return [...prev, { id, role: 'assistant', author: 'ai', text: e.text, streaming: true, at: Date.now() }];
                    const next = prev.slice();
                    const cur = next[at]!;
                    next[at] = { ...cur, text: cur.text + e.text } as UiMessage;
                    return next;
                });
            };
            try {
                let res: ChatResponse | null = null;
                if (streamSupported.current !== false) {
                    try {
                        res = await streamChatMessage(request, onEvent, controller.signal);
                        streamSupported.current = true;
                    } catch (err) {
                        if (!(err instanceof StreamUnsupportedError)) throw err;
                        streamSupported.current = false;
                    }
                }
                if (!res) {
                    // Servers without the stream endpoint: one JSON response, lightly paced.
                    res = await sendChatMessage(request);
                    pageContextSent.current = pageKey;
                    if (res.type !== 'staff_handling') {
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
                        for (let i = 0; i < segments.length - 1; i += 1) {
                            push({ id: `${turnId}:${i}`, role: 'assistant', author: 'ai', text: segments[i]!, at: Date.now() });
                            await sleep(segmentGapMs(segments[i + 1]!, reduced.current));
                        }
                    }
                }
                pageContextSent.current = pageKey;
                applyResponse(res, turnId);
            } catch (e) {
                if (controller.signal.aborted) {
                    // The customer pressed Stop. Keep what arrived, clearly marked; no cards, since
                    // an interrupted turn carries no confirmed outcome.
                    setMessages((prev) =>
                        prev.map((m) => (m.id.startsWith(`${turnId}:`) && m.role === 'assistant' ? { ...m, streaming: false, stopped: true } : m)),
                    );
                } else {
                    setMessages((prev) => prev.filter((m) => !m.id.startsWith(`${turnId}:`)));
                    // A structured submission is never auto-resent: the customer re-confirms it.
                    setLastFailed(options.lead || options.appointment ? null : { text: trimmed, options });
                    setQuickReplies([]);
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
                    if (typeof console !== 'undefined') console.warn('[AMQUR] chat failed', e instanceof Error ? e.message.slice(0, 120) : 'error');
                }
            } finally {
                if (abortRef.current === controller) abortRef.current = null;
                setTyping(false);
                setStatus(null);
                setBusy(false);
            }
        },
        [busy, aiPaused, language, opts.pageContext, currentPageContext, push, applyResponse],
    );

    /** Stop the reply in progress. Safe to call at any time. */
    const stop = useCallback(() => abortRef.current?.abort(), []);
    useEffect(() => () => abortRef.current?.abort(), []);

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
                if (!live.aiPaused && live.handoffState === 'AI') setStaff(null);
                for (const m of live.messages) {
                    if (m.kind === 'staff') setStaff({ displayName: m.displayName ?? null, role: m.role ?? null });
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

    return { messages, typing, busy, journey, handoffState, aiPaused, language, setLanguage, savedVins, toggleSaved, send, stop, retry, canRetry: !!lastFailed, quickReplies, staff, status };
}
