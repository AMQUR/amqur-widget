import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import type { FormEvent } from 'react';
import { useWidget } from './WidgetContext';
import { CompareTable } from './CompareTable';
import { loadCompareVins, MAX_COMPARE_VEHICLES, toggleCompareVin, clearCompareVins } from './compareVehicles';
import { useConcierge } from './concierge/useConcierge';
import { collectPageContext } from './concierge/pageContext';
import { VehicleCard, VehicleCarousel } from './concierge/VehicleCard';
import { SendIcon, StopIcon } from './icons';
import { CardView } from './concierge/Cards';
import { JourneyTray } from './concierge/JourneyTray';
import { Storefront } from './concierge/Storefront';
import { ProactiveEngagement } from './ProactiveEngagement';
import { c } from './concierge/copy';
import { CopyButton, Markdown } from './concierge/Markdown';
import type { MarkdownLabels } from './concierge/Markdown';
import { markdownToPlainText } from './concierge/mdParse';
import { nextPinned } from './concierge/scrollPin';
import type { Lang } from './concierge/types';
import { subscribeWidgetCommands, takePendingPrompt } from './commands';

function initialLang(cfgLocale?: string, locales?: string[]): Lang {
    const pick = (cfgLocale ?? '').toLowerCase();
    if (pick.startsWith('es')) return 'es';
    if (pick.startsWith('en')) return 'en';
    const nav = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() ?? '' : '';
    if (nav.startsWith('es') && (locales ?? []).includes('es')) return 'es';
    return 'en';
}

function initialsOf(name?: string | null): string {
    const parts = (name ?? '').split(/\s+/).filter((w) => /^[A-Za-zÀ-ÿ]/.test(w));
    return parts.slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || '•';
}

function autosize(el: HTMLTextAreaElement | null) {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
}

export function ChatView() {
    const { bootstrap, config } = useWidget();
    const f = bootstrap.features ?? ({} as typeof bootstrap.features);
    const pageContext = useMemo(() => collectPageContext(config.pageContext), [config.pageContext]);
    // Read again at send time: single-page sites change the listing without reloading the widget.
    const currentPageContext = useCallback(() => collectPageContext(config.pageContext), [config.pageContext]);
    const multilingual = f.multilingual === true || (bootstrap.locales ?? []).includes('es');
    const conv = useConcierge({ lang: initialLang(config.locale, bootstrap.locales), pageContext, currentPageContext, savedEnabled: f.savedVehicles === true });
    const lang = conv.language;
    const [input, setInput] = useState('');
    const [online, setOnline] = useState(typeof navigator !== 'undefined' ? navigator.onLine : true);
    const [compareVins, setCompareVins] = useState<string[]>(() => loadCompareVins(config.tenantSlug, config.locationSlug));
    const logRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLTextAreaElement | null>(null);

    useEffect(() => {
        const on = () => setOnline(true);
        const off = () => setOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);

    // Follow the conversation unless the customer deliberately scrolled up to read history.
    const pinned = useRef(true);
    const lastUserId = useRef<string | null>(null);
    useEffect(() => {
        const el = logRef.current;
        if (!el) return;
        let lastTop = el.scrollTop;
        const onScroll = () => {
            const top = el.scrollTop;
            pinned.current = nextPinned(pinned.current, { top, lastTop, distance: el.scrollHeight - top - el.clientHeight });
            lastTop = top;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);
    useEffect(() => {
        const el = logRef.current;
        if (!el) return;
        const last = conv.messages[conv.messages.length - 1];
        // Sending a message always brings it into view — once, when it is added. (Re-pinning on
        // every render while it was still the newest message undid a scroll-up made before the
        // reply's first token.)
        if (last?.role === 'user' && last.id !== lastUserId.current) {
            lastUserId.current = last.id;
            pinned.current = true;
        }
        if (!pinned.current) return;
        // Glide to a newly arrived message, but track a streaming reply instantly: restarting a
        // smooth scroll on every token stutters and falls behind long answers.
        const streaming = last?.role === 'assistant' && last.streaming === true;
        const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        const behavior: ScrollBehavior = streaming || calm ? 'auto' : 'smooth';
        // after layout (cards/images) settles
        const frame = requestAnimationFrame(() => {
            if (pinned.current) el.scrollTo({ top: el.scrollHeight, behavior });
        });
        return () => cancelAnimationFrame(frame);
    }, [conv.messages, conv.typing]);

    const mdLabels = useMemo<MarkdownLabels>(
        () => ({
            copy: c(lang, 'copyMessage'),
            copyCode: c(lang, 'copyCode'),
            copied: c(lang, 'copied'),
            copyFailed: c(lang, 'copyFailed'),
            code: c(lang, 'codeBlock'),
            table: c(lang, 'tableLabel'),
        }),
        [lang],
    );

    const welcome =
        (typeof bootstrap.branding?.welcomeMessage === 'string' && bootstrap.branding.welcomeMessage.trim()) ||
        (lang === 'es' ? `Bienvenido a ${bootstrap.location.name}. ¿En qué le ayudo?` : `Welcome to ${bootstrap.location.name}. How can I help?`);

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        // Never drop what the customer typed: if a reply is still in flight, keep the text.
        if (!input.trim() || !online || conv.busy) return;
        void conv.send(input);
        setInput('');
        requestAnimationFrame(() => autosize(inputRef.current));
        inputRef.current?.focus();
    };

    // Prompts sent by the host page (AMQUR.send). Sent like typed text; if a reply is still in
    // flight or the browser is offline the text goes into the composer rather than being lost.
    const hostPrompt = useRef<(text: string) => void>(() => undefined);
    useEffect(() => {
        hostPrompt.current = (text: string) => {
            if (conv.busy || !online) {
                setInput(text);
                requestAnimationFrame(() => autosize(inputRef.current));
                return;
            }
            void conv.send(text);
        };
    });
    useEffect(() => {
        const drain = () => {
            const text = takePendingPrompt();
            if (text) hostPrompt.current(text);
        };
        drain();
        return subscribeWidgetCommands((command) => {
            if (command === 'send') drain();
        });
    }, []);

    const toggleCompare = (vin: string) => {
        const cur = loadCompareVins(config.tenantSlug, config.locationSlug);
        if (!cur.includes(vin.toUpperCase()) && cur.length >= MAX_COMPARE_VEHICLES) return;
        setCompareVins(toggleCompareVin(config.tenantSlug, config.locationSlug, vin));
    };

    const showStorefront = conv.messages.length === 0;
    // Only the newest assistant message can still be acted on; older forms are history.
    const lastAssistantId = [...conv.messages].reverse().find((m) => m.role === 'assistant' && !m.isError)?.id;
    const personInvolved = conv.aiPaused || ['ASSIGNED', 'JOINED'].includes(conv.handoffState);
    const canAskForPerson = f.handoff === true && !personInvolved && !['QUEUED', 'REQUESTED'].includes(conv.handoffState);

    return (
        <div className="amq-chat">
            <JourneyTray journey={conv.journey} lang={lang} />
            {personInvolved && (
                <div className="amq-staffbar" role="status">
                    <span className="amq-staffbar__avatar" aria-hidden>
                        {initialsOf(conv.staff?.displayName)}
                    </span>
                    <span className="amq-staffbar__text">
                        <strong>{conv.staff?.displayName ? c(lang, 'staffHere', { name: conv.staff.displayName }) : c(lang, 'staffHereAnon')}</strong>
                        <span>{c(lang, 'aiPausedNote')}</span>
                    </span>
                </div>
            )}
            <div
                ref={logRef}
                className="amq-log"
                role="log"
                aria-live="polite"
                aria-relevant="additions text"
                aria-label={c(lang, 'conversation')}
                aria-busy={conv.busy || undefined}
            >
                {showStorefront && (
                    <Storefront
                        lang={lang}
                        welcome={welcome}
                        pageContext={pageContext}
                        liveInventory={f.inventory === true}
                        departments={{
                            sales: f.inventory === true && bootstrap.branding?.salesEnabled !== false,
                            service: (f.serviceAi === true || f.appointments === true) && bootstrap.branding?.serviceEnabled !== false,
                            parts: f.partsAi === true && bootstrap.branding?.partsEnabled !== false,
                        }}
                        canAskForPerson={canAskForPerson}
                        onPick={(a) => {
                            if (a === 'human') void conv.send('', { action: 'human', display: c(lang, 'talkToPerson') });
                            else if (a === 'vdp' && pageContext.vin && f.inventory === true) void conv.send('', { action: 'vehicle_detail', vin: pageContext.vin, display: c(lang, 'welcomeVdp') });
                            // No connected inventory: an ordinary question; the page's published listing rides along as page context.
                            else if (a === 'vdp') void conv.send(c(lang, 'aboutThisVehicle'));
                            else if (a !== 'vdp') void conv.send('', { action: a, display: c(lang, a) });
                        }}
                    />
                )}
                {conv.messages.map((m) =>
                    m.role === 'user' ? (
                        <div key={m.id} className="amq-msg amq-msg--user">
                            <p>{m.text}</p>
                        </div>
                    ) : (
                        <div
                            // Remount when streaming ends so assistive tech announces the finished text once,
                            // instead of every partial chunk.
                            key={m.streaming ? `${m.id}:live` : m.id}
                            className={`amq-msg amq-msg--${m.author === 'staff' ? 'staff' : m.author === 'system' ? 'system' : 'ai'}${m.isError ? ' amq-msg--error' : ''}`}
                            aria-live={m.streaming ? 'off' : undefined}
                            aria-busy={m.streaming || undefined}
                        >
                            {m.author === 'staff' && (
                                <span className="amq-msg__who">
                                    <span className="amq-msg__avatar" aria-hidden>
                                        {initialsOf(m.displayName)}
                                    </span>
                                    {m.displayName ?? c(lang, 'staff')}
                                </span>
                            )}
                            {m.text &&
                                (m.author === 'system' || m.isError ? (
                                    <p>{m.text}</p>
                                ) : (
                                    <Markdown text={m.text} streaming={m.streaming === true} labels={mdLabels} />
                                ))}
                            {m.stopped && <span className="amq-msg__note">{c(lang, 'stopped')}</span>}
                            {m.text && !m.streaming && !m.isError && m.author !== 'system' && (
                                <CopyButton className="amq-msg__copy" label={mdLabels.copy} labels={mdLabels} getText={() => markdownToPlainText(m.text)} />
                            )}
                            {m.vehicles && m.vehicles.length > 0 && (m.compare ? (
                                <CompareTable vehicles={m.vehicles} lang={lang} />
                            ) : (
                                <VehicleCarousel count={m.vehicles.length} lang={lang}>
                                    {m.vehicles.map((v) => (
                                        <div role="listitem" key={v.vin}>
                                            <VehicleCard
                                                v={v}
                                                lang={lang}
                                                paymentsEnabled={f.payments === true}
                                                savedEnabled={f.savedVehicles === true}
                                                compareEnabled={f.vehicleCompare === true}
                                                saved={conv.savedVins.includes(v.vin.toUpperCase())}
                                                inCompare={compareVins.includes(v.vin.toUpperCase())}
                                                onAsk={(text, o) => void conv.send(text, o)}
                                                onToggleSave={() => void conv.toggleSaved(v.vin)}
                                                onToggleCompare={() => toggleCompare(v.vin)}
                                            />
                                        </div>
                                    ))}
                                </VehicleCarousel>
                            ))}
                            {m.cards?.map((card, i) => (
                                <CardView
                                    key={`${m.id}-${i}`}
                                    card={card}
                                    lang={lang}
                                    apiBaseUrl={config.apiBaseUrl}
                                    actions={{
                                        busy: conv.busy,
                                        interactive: m.id === lastAssistantId && online,
                                        onLead: (lead) => void conv.send('', { action: 'lead_capture', lead, display: c(lang, 'leadSentDisplay') }),
                                        onAppointment: (appointment, display) => void conv.send('', { action: 'appointment_select', appointment, display }),
                                    }}
                                />
                            ))}
                            {/* One disclosure per message: cards and vehicle estimates carry their own. */}
                            {m.disclaimer && m.vehicles?.length && !m.vehicles.some((v) => v.estimatedPayment != null) && !m.cards?.length ? (
                                <p className="amq-disclaimer">{m.disclaimer}</p>
                            ) : null}
                            {m.isError && conv.canRetry && (
                                <button type="button" className="amq-btn" onClick={conv.retry}>
                                    {c(lang, 'retry')}
                                </button>
                            )}
                        </div>
                    ),
                )}
                {conv.typing && (
                    <div className="amq-typing" role="status" aria-label={conv.status ?? c(lang, 'typingAi')}>
                        <span aria-hidden />
                        <span aria-hidden />
                        <span aria-hidden />
                        <span className="amq-typing__label" aria-hidden>{conv.status ?? c(lang, 'typingAi')}</span>
                    </div>
                )}
            </div>

            {compareVins.length >= 2 && f.vehicleCompare === true && (
                <div className="amq-comparebar">
                    <button
                        type="button"
                        className="amq-btn amq-btn--primary"
                        onClick={() => {
                            clearCompareVins(config.tenantSlug, config.locationSlug);
                            setCompareVins([]);
                            void conv.send(`Compare ${compareVins.join(', ')}`, { action: 'compare', display: `${c(lang, 'compare')} (${compareVins.length})` });
                        }}
                    >
                        {c(lang, 'compare')} ({compareVins.length})
                    </button>
                </div>
            )}

            {!online && (
                <div className="amq-offline" role="alert">
                    {c(lang, 'offline')}
                </div>
            )}

            {conv.quickReplies.length > 0 && !conv.busy && (
                <div className="amq-quick" role="group" aria-label={c(lang, 'suggestion')}>
                    {conv.quickReplies.map((q) => (
                        <button
                            key={q}
                            type="button"
                            className="amq-chip amq-chip--quick"
                            disabled={!online}
                            onClick={() => void conv.send(q)}
                        >
                            {q}
                        </button>
                    ))}
                </div>
            )}

            {canAskForPerson && !showStorefront && (
                <div className="amq-utility">
                    <button
                        type="button"
                        className="amq-linkbtn"
                        disabled={conv.busy || !online}
                        onClick={() => void conv.send('', { action: 'human', display: c(lang, 'talkToPerson') })}
                    >
                        {c(lang, 'talkToPerson')}
                    </button>
                </div>
            )}

            <form className="amq-composer" onSubmit={submit}>
                {multilingual && (
                    <button
                        type="button"
                        className="amq-lang"
                        onClick={() => conv.setLanguage(lang === 'es' ? 'en' : 'es')}
                        lang={lang === 'es' ? 'en' : 'es'}
                        // The accessible name starts with the visible text (WCAG 2.5.3 Label in Name),
                        // so speech-input users can say what they see.
                        aria-label={lang === 'es' ? 'EN: switch to English' : 'ES: cambiar a español'}
                    >
                        {lang === 'es' ? 'EN' : 'ES'}
                    </button>
                )}
                <label className="amq-sr" htmlFor="amq-input">
                    {c(lang, 'inputLabel')}
                </label>
                <textarea
                    id="amq-input"
                    ref={inputRef}
                    rows={1}
                    value={input}
                    maxLength={2000}
                    placeholder={c(lang, 'placeholder')}
                    onChange={(e) => {
                        setInput(e.target.value);
                        autosize(e.target);
                    }}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    disabled={!online}
                    enterKeyHint="send"
                />
                {conv.busy && !personInvolved ? (
                    <button type="button" className="amq-send amq-send--stop" onClick={conv.stop} aria-label={c(lang, 'stop')}>
                        <StopIcon />
                    </button>
                ) : (
                    <button type="submit" className="amq-send" disabled={!input.trim() || conv.busy || !online} aria-label={c(lang, 'send')}>
                        <SendIcon />
                    </button>
                )}
            </form>
            <ProactiveEngagement lang={lang} pageContext={pageContext} onAccept={(action) => void conv.send('', action)} hasConversation={conv.messages.length > 0} />
        </div>
    );
}
