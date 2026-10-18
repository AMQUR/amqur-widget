import { useEffect, useMemo, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useWidget } from './WidgetContext';
import { CompareTable } from './CompareTable';
import { loadCompareVins, MAX_COMPARE_VEHICLES, toggleCompareVin, clearCompareVins } from './compareVehicles';
import { useConcierge } from './concierge/useConcierge';
import { collectPageContext } from './concierge/pageContext';
import { VehicleCard, VehicleCarousel } from './concierge/VehicleCard';
import { SendIcon } from './icons';
import { CardView } from './concierge/Cards';
import { JourneyTray } from './concierge/JourneyTray';
import { Storefront } from './concierge/Storefront';
import { ProactiveEngagement } from './ProactiveEngagement';
import { c } from './concierge/copy';
import type { Lang } from './concierge/types';

function initialLang(cfgLocale?: string, locales?: string[]): Lang {
    const pick = (cfgLocale ?? '').toLowerCase();
    if (pick.startsWith('es')) return 'es';
    if (pick.startsWith('en')) return 'en';
    const nav = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() ?? '' : '';
    if (nav.startsWith('es') && (locales ?? []).includes('es')) return 'es';
    return 'en';
}

export function ChatView() {
    const { bootstrap, config } = useWidget();
    const f = bootstrap.features ?? ({} as typeof bootstrap.features);
    const pageContext = useMemo(() => collectPageContext(config.pageContext), [config.pageContext]);
    const multilingual = f.multilingual === true || (bootstrap.locales ?? []).includes('es');
    const conv = useConcierge({ lang: initialLang(config.locale, bootstrap.locales), pageContext, savedEnabled: f.savedVehicles === true });
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
    useEffect(() => {
        const el = logRef.current;
        if (!el) return;
        const onScroll = () => {
            pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, []);
    useEffect(() => {
        const el = logRef.current;
        if (!el) return;
        const last = conv.messages[conv.messages.length - 1];
        if (last?.role === 'user') pinned.current = true;
        if (!pinned.current) return;
        // after layout (cards/images) settles
        requestAnimationFrame(() => el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' }));
    }, [conv.messages, conv.typing]);

    const welcome =
        (typeof bootstrap.branding?.welcomeMessage === 'string' && bootstrap.branding.welcomeMessage.trim()) ||
        (lang === 'es' ? `Bienvenido a ${bootstrap.location.name}. ¿En qué le ayudo?` : `Welcome to ${bootstrap.location.name}. How can I help?`);

    const submit = (e?: FormEvent) => {
        e?.preventDefault();
        // Never drop what the customer typed: if a reply is still in flight, keep the text.
        if (!input.trim() || !online || conv.busy) return;
        void conv.send(input);
        setInput('');
        inputRef.current?.focus();
    };

    const toggleCompare = (vin: string) => {
        const cur = loadCompareVins(config.tenantSlug, config.locationSlug);
        if (!cur.includes(vin.toUpperCase()) && cur.length >= MAX_COMPARE_VEHICLES) return;
        setCompareVins(toggleCompareVin(config.tenantSlug, config.locationSlug, vin));
    };

    const showStorefront = conv.messages.length === 0;

    return (
        <div className="amq-chat">
            <JourneyTray journey={conv.journey} lang={lang} />
            <div ref={logRef} className="amq-log" role="log" aria-live="polite" aria-relevant="additions text" aria-label="Conversation">
                {showStorefront && (
                    <Storefront
                        lang={lang}
                        welcome={welcome}
                        pageContext={pageContext}
                        departments={{
                            sales: f.inventory === true && bootstrap.branding?.salesEnabled !== false,
                            service: (f.serviceAi === true || f.appointments === true) && bootstrap.branding?.serviceEnabled !== false,
                            parts: f.partsAi === true && bootstrap.branding?.partsEnabled !== false,
                        }}
                        onPick={(a) => {
                            if (a === 'vdp' && pageContext.vin) void conv.send('', { action: 'vehicle_detail', vin: pageContext.vin, display: c(lang, 'welcomeVdp') });
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
                        <div key={m.id} className={`amq-msg amq-msg--${m.author === 'staff' ? 'staff' : m.author === 'system' ? 'system' : 'ai'}${m.isError ? ' amq-msg--error' : ''}`}>
                            {m.author === 'staff' && <span className="amq-msg__who">{m.displayName ?? c(lang, 'staff')}</span>}
                            {m.text && <p>{m.text}</p>}
                            {m.vehicles && m.vehicles.length > 0 && (m.compare ? (
                                <CompareTable vehicles={m.vehicles} />
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
                            {m.cards?.map((card, i) => <CardView key={`${m.id}-${i}`} card={card} lang={lang} apiBaseUrl={config.apiBaseUrl} />)}
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
                    <div className="amq-typing" role="status" aria-label={c(lang, 'typingAi')}>
                        <span aria-hidden />
                        <span aria-hidden />
                        <span aria-hidden />
                    </div>
                )}
                {conv.aiPaused && (
                    <div className="amq-presence" role="status">
                        {c(lang, 'staffTyping')}
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

            <form className="amq-composer" onSubmit={submit}>
                {multilingual && (
                    <button
                        type="button"
                        className="amq-lang"
                        onClick={() => conv.setLanguage(lang === 'es' ? 'en' : 'es')}
                        lang={lang === 'es' ? 'en' : 'es'}
                        aria-label={lang === 'es' ? 'Switch to English' : 'Cambiar a español'}
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
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            submit();
                        }
                    }}
                    disabled={!online}
                    enterKeyHint="send"
                />
                <button type="submit" className="amq-send" disabled={!input.trim() || conv.busy || !online} aria-label={c(lang, 'send')}>
                    <SendIcon />
                </button>
            </form>
            <ProactiveEngagement lang={lang} pageContext={pageContext} onAccept={(action) => void conv.send('', action)} hasConversation={conv.messages.length > 0} />
        </div>
    );
}
