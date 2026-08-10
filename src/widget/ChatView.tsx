import { useEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { sendChatMessage } from './api/chat.api';
import { useWidget } from './WidgetContext';
import { CompareTable } from './CompareTable';
import { detectLocale, t, type Locale } from './i18n';
import {
    clearCompareVins,
    loadCompareVins,
    MAX_COMPARE_VEHICLES,
    toggleCompareVin,
} from './compareVehicles';
import { loadSavedVins, toggleSavedVin } from './savedVehicles';
import { ProactiveEngagement } from './ProactiveEngagement';

type PaymentSummary = {
    monthlyPayment: number;
    termMonths: number;
    apr: number;
    downPayment: number;
    vehicleVin?: string;
    price?: number;
};

type Vehicle = {
    vin: string;
    year?: number | null;
    make?: string | null;
    model?: string | null;
    trim?: string | null;
    mileage?: number | null;
    price?: number | null;
    drivetrain?: string | null;
    estimatedPayment?: number | null;
    photos?: string[];
    status?: string | null;
    lastSeenAt?: string | null;
};

type Message = {
    id: string;
    role: 'user' | 'assistant';
    text?: string;
    vehicles?: Vehicle[];
    compare?: boolean;
    payment?: PaymentSummary;
    provenanceDisclaimer?: string;
    isError?: boolean;
};

type SendOpts = {
    action?: string;
    vin?: string;
    /** When set, show this i18n key as assistant reply instead of backend text. */
    confirmationKey?: string;
};

function makeId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function welcomeText(
    locale: Locale,
    locationName: string,
    customWelcome?: string,
): string {
    if (typeof customWelcome === 'string' && customWelcome.trim()) {
        return customWelcome.trim();
    }
    return t(locale, 'welcome', { location: locationName });
}

export function ChatView() {
    const { bootstrap, config, conversationId } = useWidget();
    const inventoryEnabled = bootstrap.features?.inventory === true;
    const paymentsEnabled = bootstrap.features?.payments === true;
    const compareEnabled = bootstrap.features?.vehicleCompare === true;
    const savedEnabled = bootstrap.features?.savedVehicles === true;
    const serviceEnabled = bootstrap.features?.serviceAi === true;
    const partsEnabled = bootstrap.features?.partsAi === true;
    const multilingual = bootstrap.features?.multilingual === true;
    const leadCaptureEnabled = bootstrap.features?.leadCapture === true;
    const handoffEnabled = bootstrap.features?.handoff === true;
    const appointmentsEnabled =
        bootstrap.features?.appointments === true || serviceEnabled;

    const consentLabel =
        (typeof bootstrap.consentText === 'string' && bootstrap.consentText.trim()) ||
        (typeof bootstrap.branding?.disclaimerText === 'string' &&
            bootstrap.branding.disclaimerText.trim()) ||
        '';

    const [locale, setLocale] = useState<Locale>(() =>
        detectLocale(config.locale ?? bootstrap.locales?.[0]),
    );
    const [savedVins, setSavedVins] = useState<string[]>(() =>
        loadSavedVins(config.tenantSlug, config.locationSlug),
    );
    const [compareVins, setCompareVins] = useState<string[]>(() =>
        loadCompareVins(config.tenantSlug, config.locationSlug),
    );
    const [savedDrawerOpen, setSavedDrawerOpen] = useState(false);
    const [compareNotice, setCompareNotice] = useState<string | null>(null);

    const [messages, setMessages] = useState<Message[]>(() => [
        {
            id: 'welcome',
            role: 'assistant',
            text: welcomeText(
                detectLocale(config.locale ?? bootstrap.locales?.[0]),
                bootstrap.location.name,
                bootstrap.branding?.welcomeMessage,
            ),
        },
    ]);

    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [isOnline, setIsOnline] = useState(
        typeof navigator !== 'undefined' ? navigator.onLine : true,
    );
    const [lastFailedUserText, setLastFailedUserText] = useState<string | null>(
        null,
    );

    const [leadFirst, setLeadFirst] = useState('');
    const [leadLast, setLeadLast] = useState('');
    const [leadEmail, setLeadEmail] = useState('');
    const [leadPhone, setLeadPhone] = useState('');
    const [leadConsent, setLeadConsent] = useState(false);
    const [leadError, setLeadError] = useState<string | null>(null);

    const bottomRef = useRef<HTMLDivElement | null>(null);
    const inputRef = useRef<HTMLInputElement | null>(null);

    useEffect(() => {
        const on = () => setIsOnline(true);
        const off = () => setIsOnline(false);
        window.addEventListener('online', on);
        window.addEventListener('offline', off);
        return () => {
            window.removeEventListener('online', on);
            window.removeEventListener('offline', off);
        };
    }, []);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, sending, savedDrawerOpen]);

    const sendMessage = useCallback(
        async (text?: string, opts?: SendOpts) => {
            const userText = (text ?? input).trim();
            if (!userText || sending) return;
            if (!isOnline) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: makeId(),
                        role: 'assistant',
                        text: t(locale, 'offline'),
                        isError: true,
                    },
                ]);
                return;
            }

            setInput('');
            setSending(true);
            setLastFailedUserText(null);

            const userMsg: Message = {
                id: makeId(),
                role: 'user',
                text: userText,
            };
            setMessages((prev) => [...prev, userMsg]);

            try {
                const data = (await sendChatMessage({
                    apiBaseUrl: config.apiBaseUrl,
                    jwtToken: config.jwtToken,
                    message: userText,
                    conversationId,
                    action: opts?.action,
                    vin: opts?.vin,
                })) as {
                    type?: string;
                    reply?: string;
                    vehicles?: Vehicle[];
                    vehicle?: Vehicle;
                    monthlyPayment?: number;
                    termMonths?: number;
                    apr?: number;
                    downPayment?: number;
                    vehicleVin?: string;
                    price?: number;
                    provenance?: { disclaimer?: string };
                };

                if (opts?.confirmationKey) {
                    setMessages((prev) => [
                        ...prev,
                        {
                            id: makeId(),
                            role: 'assistant',
                            text: t(locale, opts.confirmationKey!),
                        },
                    ]);
                    return;
                }

                let assistantMsg: Message;
                const provenanceDisclaimer =
                    typeof data.provenance?.disclaimer === 'string'
                        ? data.provenance.disclaimer
                        : undefined;

                if (
                    data.type === 'vehicle_detail' &&
                    data.vehicle &&
                    inventoryEnabled
                ) {
                    assistantMsg = {
                        id: makeId(),
                        role: 'assistant',
                        text: typeof data.reply === 'string' ? data.reply : undefined,
                        vehicles: [data.vehicle as Vehicle],
                        provenanceDisclaimer,
                    };
                } else if (
                    data.type === 'vehicle_compare' &&
                    inventoryEnabled &&
                    compareEnabled
                ) {
                    assistantMsg = {
                        id: makeId(),
                        role: 'assistant',
                        text: typeof data.reply === 'string' ? data.reply : undefined,
                        vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
                        compare: true,
                        provenanceDisclaimer,
                    };
                } else if (
                    data.type === 'vehicle_carousel' &&
                    inventoryEnabled
                ) {
                    assistantMsg = {
                        id: makeId(),
                        role: 'assistant',
                        text: typeof data.reply === 'string' ? data.reply : undefined,
                        vehicles: Array.isArray(data.vehicles) ? data.vehicles : [],
                        provenanceDisclaimer,
                    };
                } else if (data.type === 'payment_summary' && paymentsEnabled) {
                    assistantMsg = {
                        id: makeId(),
                        role: 'assistant',
                        text: typeof data.reply === 'string' ? data.reply : undefined,
                        payment: {
                            monthlyPayment: Number(data.monthlyPayment ?? 0),
                            termMonths: Number(data.termMonths ?? 0),
                            apr: Number(data.apr ?? 0),
                            downPayment: Number(data.downPayment ?? 0),
                            vehicleVin: data.vehicleVin,
                            price: data.price != null ? Number(data.price) : undefined,
                        },
                        provenanceDisclaimer:
                            provenanceDisclaimer ?? t(locale, 'estimateOnly'),
                    };
                } else {
                    assistantMsg = {
                        id: makeId(),
                        role: 'assistant',
                        text:
                            (typeof data.reply === 'string' && data.reply.trim()) ||
                            "Got it — anything else I can help with?",
                        provenanceDisclaimer,
                    };
                }

                setMessages((prev) => [...prev, assistantMsg]);
            } catch (e) {
                const msg =
                    e instanceof Error ? e.message : 'Something went wrong. Please try again.';
                setLastFailedUserText(userText);

                setMessages((prev) => [
                    ...prev,
                    {
                        id: makeId(),
                        role: 'assistant',
                        text: msg,
                        isError: true,
                    },
                ]);
            } finally {
                setSending(false);
                setTimeout(() => inputRef.current?.focus(), 50);
            }
        },
        [
            input,
            sending,
            config,
            conversationId,
            isOnline,
            inventoryEnabled,
            paymentsEnabled,
            compareEnabled,
            locale,
        ],
    );

    const quickSend = useCallback(
        (text: string, opts?: SendOpts) => {
            setInput('');
            void sendMessage(text, opts);
        },
        [sendMessage],
    );

    const handleToggleCompare = useCallback(
        (vin: string) => {
            const upper = vin.toUpperCase();
            const current = loadCompareVins(config.tenantSlug, config.locationSlug);
            if (!current.includes(upper) && current.length >= MAX_COMPARE_VEHICLES) {
                setCompareNotice(t(locale, 'compareMax'));
                return;
            }
            setCompareNotice(null);
            const next = toggleCompareVin(
                config.tenantSlug,
                config.locationSlug,
                vin,
            );
            setCompareVins(next);
        },
        [config.tenantSlug, config.locationSlug, locale],
    );

    const handleSendCompare = useCallback(() => {
        if (compareVins.length < 2) return;
        const vins = compareVins.join(', ');
        const text = t(locale, 'compareSend', { vins });
        clearCompareVins(config.tenantSlug, config.locationSlug);
        setCompareVins([]);
        quickSend(text, { action: 'vehicle_compare' });
    }, [compareVins, config.tenantSlug, config.locationSlug, locale, quickSend]);

    const handleLeadSubmit = (e: FormEvent) => {
        e.preventDefault();
        setLeadError(null);
        if (!leadFirst.trim() || !leadLast.trim()) {
            setLeadError(t(locale, 'contactRequired'));
            return;
        }
        if (!leadEmail.trim() && !leadPhone.trim()) {
            setLeadError(t(locale, 'contactRequired'));
            return;
        }
        if (consentLabel && !leadConsent) {
            setLeadError(t(locale, 'consentRequired'));
            return;
        }

        const parts = [
            `Lead inquiry — Name: ${leadFirst.trim()} ${leadLast.trim()}`,
            leadEmail.trim() ? `Email: ${leadEmail.trim()}` : null,
            leadPhone.trim() ? `Phone: ${leadPhone.trim()}` : null,
            leadConsent ? 'Consent: accepted' : null,
        ].filter(Boolean);

        const message = parts.join('. ');
        setLeadFirst('');
        setLeadLast('');
        setLeadEmail('');
        setLeadPhone('');
        setLeadConsent(false);
        void sendMessage(message, {
            action: 'lead_capture',
            confirmationKey: 'leadSubmitted',
        });
    };

    const showQuickActions =
        serviceEnabled ||
        partsEnabled ||
        handoffEnabled ||
        appointmentsEnabled ||
        (inventoryEnabled && compareEnabled) ||
        inventoryEnabled ||
        paymentsEnabled ||
        multilingual ||
        savedEnabled;

    return (
        <div
            className="amqur-chat-root"
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
            {savedEnabled && savedDrawerOpen && (
                <SavedVehiclesDrawer
                    locale={locale}
                    vins={savedVins}
                    onClose={() => setSavedDrawerOpen(false)}
                    onAsk={(vin) => {
                        setSavedDrawerOpen(false);
                        quickSend(t(locale, 'askAboutSaved', { vin }), {
                            action: 'vehicle_detail',
                            vin,
                        });
                    }}
                />
            )}

            <div
                role="log"
                aria-live="polite"
                aria-relevant="additions"
                style={{
                    flex: 1,
                    padding: '12px 14px',
                    overflowY: 'auto',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                }}
            >
                {messages.map((msg) => (
                    <div key={msg.id}>
                        {msg.text && (
                            <div
                                style={{
                                    alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
                                    display: 'inline-block',
                                    maxWidth: '85%',
                                    background: msg.role === 'user'
                                        ? 'var(--amqur-primary, #111)'
                                        : msg.isError
                                            ? 'rgba(220,38,38,0.08)'
                                            : 'rgba(255,255,255,0.7)',
                                    color: msg.role === 'user'
                                        ? 'var(--amqur-accent, #fff)'
                                        : msg.isError
                                            ? '#991b1b'
                                            : 'var(--amqur-text, #141414)',
                                    padding: '10px 14px',
                                    borderRadius: '14px',
                                    fontSize: '14.5px',
                                    lineHeight: 1.5,
                                    whiteSpace: 'pre-wrap',
                                    border: msg.role === 'assistant' && !msg.isError
                                        ? '1px solid rgba(0,0,0,0.07)'
                                        : 'none',
                                    float: msg.role === 'user' ? 'right' : 'left',
                                    clear: 'both',
                                }}
                            >
                                {msg.text}
                            </div>
                        )}

                        {paymentsEnabled && msg.payment && (
                            <div style={{ clear: 'both', marginTop: msg.text ? '8px' : 0 }}>
                                <div
                                    style={{
                                        border: '1px solid rgba(0,0,0,0.10)',
                                        borderRadius: '14px',
                                        padding: '14px 16px',
                                        background: 'rgba(255,255,255,0.85)',
                                        maxWidth: '340px',
                                    }}
                                >
                                    <div style={{ fontWeight: 700, fontSize: '13px', marginBottom: '8px', opacity: 0.6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                        Payment estimate
                                    </div>
                                    <div style={{ fontSize: '26px', fontWeight: 800, letterSpacing: '-0.02em' }}>
                                        ${Math.round(msg.payment.monthlyPayment).toLocaleString()}
                                        <span style={{ fontSize: '14px', fontWeight: 500, opacity: 0.6 }}>/mo</span>
                                    </div>
                                    <div style={{ marginTop: '6px', fontSize: '13px', opacity: 0.7 }}>
                                        {msg.payment.termMonths} mo ·{' '}
                                        {msg.payment.apr}% APR ·{' '}
                                        ${(msg.payment.downPayment ?? 0).toLocaleString()} down
                                    </div>
                                    {msg.payment.price != null && (
                                        <div style={{ marginTop: '4px', fontSize: '12px', opacity: 0.55 }}>
                                            Vehicle price ${msg.payment.price.toLocaleString()} · estimate only, taxes &amp; fees vary
                                        </div>
                                    )}
                                    {msg.payment.vehicleVin && (
                                        <div style={{ marginTop: '4px', fontSize: '12px', opacity: 0.45, fontFamily: 'monospace' }}>
                                            VIN {msg.payment.vehicleVin}
                                        </div>
                                    )}
                                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                                        <button
                                            style={btnStyle('primary')}
                                            onClick={() => quickSend(`I want to schedule a test drive for ${msg.payment!.vehicleVin ?? 'this vehicle'}`)}
                                        >
                                            {t(locale, 'testDrive')}
                                        </button>
                                        {handoffEnabled && (
                                            <button
                                                style={btnStyle('secondary')}
                                                onClick={() =>
                                                    quickSend(t(locale, 'talkToSomeone'), {
                                                        action: 'handoff',
                                                        confirmationKey: 'requestSaved',
                                                    })
                                                }
                                            >
                                                {t(locale, 'talkToSomeone')}
                                            </button>
                                        )}
                                    </div>
                                </div>
                            </div>
                        )}

                        {inventoryEnabled &&
                            msg.compare &&
                            msg.vehicles &&
                            msg.vehicles.length > 1 && (
                            <div style={{ clear: 'both', marginTop: msg.text ? '10px' : 0 }}>
                                <CompareTable vehicles={msg.vehicles} />
                            </div>
                        )}

                        {inventoryEnabled &&
                            !msg.compare &&
                            msg.vehicles &&
                            msg.vehicles.length > 0 && (
                            <div style={{ clear: 'both', marginTop: msg.text ? '10px' : 0, display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                {msg.vehicles.map((v) => (
                                    <VehicleCard
                                        key={v.vin}
                                        vehicle={v}
                                        onAction={quickSend}
                                        paymentsEnabled={paymentsEnabled}
                                        savedEnabled={savedEnabled}
                                        compareEnabled={compareEnabled}
                                        saved={savedVins.includes(v.vin.toUpperCase())}
                                        inCompare={compareVins.includes(v.vin.toUpperCase())}
                                        onToggleSave={() => {
                                            const next = toggleSavedVin(
                                                config.tenantSlug,
                                                config.locationSlug,
                                                v.vin,
                                            );
                                            setSavedVins(next);
                                        }}
                                        onToggleCompare={() => handleToggleCompare(v.vin)}
                                        labels={{
                                            details: t(locale, 'details'),
                                            payment: t(locale, 'payment'),
                                            hold: t(locale, 'hold'),
                                            save: t(locale, 'save'),
                                            compare: t(locale, 'compare'),
                                            addToCompare: t(locale, 'addToCompare'),
                                            inCompare: t(locale, 'inCompare'),
                                        }}
                                    />
                                ))}
                            </div>
                        )}

                        {msg.provenanceDisclaimer && (
                            <div
                                style={{
                                    clear: 'both',
                                    fontSize: '11px',
                                    opacity: 0.65,
                                    marginTop: 6,
                                }}
                            >
                                {msg.provenanceDisclaimer}
                            </div>
                        )}

                        {msg.isError && lastFailedUserText && (
                            <div style={{ clear: 'both', marginTop: '8px' }}>
                                <button
                                    type="button"
                                    style={btnStyle('secondary')}
                                    onClick={() => {
                                        const retryText = lastFailedUserText;
                                        setLastFailedUserText(null);
                                        void sendMessage(retryText);
                                    }}
                                    disabled={sending || !isOnline}
                                    aria-label={t(locale, 'retry')}
                                >
                                    {t(locale, 'retry')}
                                </button>
                            </div>
                        )}

                        <div style={{ clear: 'both' }} />
                    </div>
                ))}

                {!isOnline && (
                    <div
                        role="status"
                        style={{
                            fontSize: '13px',
                            padding: '8px 12px',
                            background: 'rgba(180,80,0,0.08)',
                            borderRadius: '8px',
                            marginBottom: '8px',
                        }}
                    >
                        {t(locale, 'offline')}
                    </div>
                )}

                {leadCaptureEnabled && (
                    <LeadCaptureForm
                        locale={locale}
                        consentLabel={consentLabel}
                        firstName={leadFirst}
                        lastName={leadLast}
                        email={leadEmail}
                        phone={leadPhone}
                        consent={leadConsent}
                        error={leadError}
                        disabled={sending || !isOnline}
                        onFirstNameChange={setLeadFirst}
                        onLastNameChange={setLeadLast}
                        onEmailChange={setLeadEmail}
                        onPhoneChange={setLeadPhone}
                        onConsentChange={setLeadConsent}
                        onSubmit={handleLeadSubmit}
                    />
                )}

                {showQuickActions && (
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                            marginBottom: 8,
                        }}
                    >
                        {savedEnabled && (
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                onClick={() => setSavedDrawerOpen((o) => !o)}
                            >
                                {t(locale, 'saved')} ({savedVins.length})
                            </button>
                        )}
                        {serviceEnabled && (
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                onClick={() => quickSend(t(locale, 'serviceHelp'))}
                            >
                                {t(locale, 'serviceHelp')}
                            </button>
                        )}
                        {partsEnabled && (
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                onClick={() => quickSend(t(locale, 'partsHelp'))}
                            >
                                {t(locale, 'partsHelp')}
                            </button>
                        )}
                        {appointmentsEnabled && (
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                onClick={() =>
                                    quickSend(t(locale, 'requestAppointment'), {
                                        action: 'appointment_request',
                                        confirmationKey: 'requestSaved',
                                    })
                                }
                            >
                                {t(locale, 'requestAppointment')}
                            </button>
                        )}
                        {inventoryEnabled && (
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                onClick={() => quickSend(t(locale, 'tradeInterest'))}
                            >
                                {t(locale, 'tradeInterest')}
                            </button>
                        )}
                        {paymentsEnabled && (
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                onClick={() =>
                                    quickSend(t(locale, 'financeHandoff'), {
                                        action: 'finance_handoff',
                                        confirmationKey: 'requestSaved',
                                    })
                                }
                            >
                                {t(locale, 'financeHandoff')}
                            </button>
                        )}
                        {handoffEnabled && (
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                onClick={() =>
                                    quickSend(t(locale, 'talkToSomeone'), {
                                        action: 'handoff',
                                        confirmationKey: 'requestSaved',
                                    })
                                }
                            >
                                {t(locale, 'talkToSomeone')}
                            </button>
                        )}
                        {multilingual && (
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                aria-label={t(locale, 'language')}
                                onClick={() =>
                                    setLocale((l) => (l === 'en' ? 'es' : 'en'))
                                }
                            >
                                {locale === 'en' ? 'ES' : 'EN'}
                            </button>
                        )}
                    </div>
                )}

                {compareEnabled && compareVins.length > 0 && (
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            alignItems: 'center',
                            gap: 8,
                            padding: '8px 10px',
                            background: 'rgba(0,0,0,0.04)',
                            borderRadius: 10,
                            marginBottom: 8,
                        }}
                    >
                        <span style={{ fontSize: 13, fontWeight: 600 }}>
                            {t(locale, 'compareSelected', {
                                count: String(compareVins.length),
                            })}
                        </span>
                        {compareVins.map((vin) => (
                            <button
                                key={vin}
                                type="button"
                                style={btnStyle('ghost')}
                                onClick={() => handleToggleCompare(vin)}
                            >
                                {vin.slice(-6)} ×
                            </button>
                        ))}
                        {compareVins.length >= 2 && (
                            <button
                                type="button"
                                style={btnStyle('primary')}
                                disabled={sending}
                                onClick={handleSendCompare}
                            >
                                {t(locale, 'compare')}
                            </button>
                        )}
                    </div>
                )}

                {compareNotice && (
                    <div role="status" style={{ fontSize: 12, opacity: 0.7 }}>
                        {compareNotice}
                    </div>
                )}

                {sending && (
                    <div className="amqur-skel" style={{ maxWidth: '200px' }}>
                        <div className="amqur-skelbar" style={{ width: '60%' }} />
                        <div className="amqur-skelbar" style={{ width: '40%' }} />
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            <div
                style={{
                    borderTop: '1px solid rgba(0,0,0,0.06)',
                    padding: '10px 12px',
                    display: 'flex',
                    gap: '8px',
                    background: 'rgba(255,255,255,0.6)',
                }}
            >
                <input
                    ref={inputRef}
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey && !sending) {
                            e.preventDefault();
                            void sendMessage();
                        }
                    }}
                    placeholder={t(locale, 'placeholder')}
                    aria-label="Message the dealership assistant"
                    disabled={sending || (typeof navigator !== 'undefined' && !navigator.onLine)}
                    maxLength={2000}
                    style={{
                        flex: 1,
                        padding: '10px 12px',
                        borderRadius: '10px',
                        border: '1px solid rgba(0,0,0,0.10)',
                        outline: 'none',
                        fontSize: '14px',
                        background: 'rgba(255,255,255,0.9)',
                        color: 'var(--amqur-text, #141414)',
                    }}
                />
                <button
                    onClick={() => void sendMessage()}
                    disabled={sending || !input.trim()}
                    style={btnStyle('primary')}
                >
                    {t(locale, 'send')}
                </button>
            </div>
            <ProactiveEngagement locale={locale} />
        </div>
    );
}

function LeadCaptureForm({
    locale,
    consentLabel,
    firstName,
    lastName,
    email,
    phone,
    consent,
    error,
    disabled,
    onFirstNameChange,
    onLastNameChange,
    onEmailChange,
    onPhoneChange,
    onConsentChange,
    onSubmit,
}: {
    locale: Locale;
    consentLabel: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string;
    consent: boolean;
    error: string | null;
    disabled: boolean;
    onFirstNameChange: (v: string) => void;
    onLastNameChange: (v: string) => void;
    onEmailChange: (v: string) => void;
    onPhoneChange: (v: string) => void;
    onConsentChange: (v: boolean) => void;
    onSubmit: (e: FormEvent) => void;
}) {
    const fieldStyle: CSSProperties = {
        flex: 1,
        minWidth: 120,
        padding: '8px 10px',
        borderRadius: 8,
        border: '1px solid rgba(0,0,0,0.10)',
        fontSize: 13,
    };

    return (
        <form
            onSubmit={onSubmit}
            style={{
                border: '1px solid rgba(0,0,0,0.08)',
                borderRadius: 12,
                padding: 12,
                background: 'rgba(255,255,255,0.85)',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                marginBottom: 8,
            }}
        >
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <input
                    type="text"
                    required
                    value={firstName}
                    onChange={(e) => onFirstNameChange(e.target.value)}
                    placeholder={t(locale, 'firstName')}
                    aria-label={t(locale, 'firstName')}
                    disabled={disabled}
                    style={fieldStyle}
                />
                <input
                    type="text"
                    required
                    value={lastName}
                    onChange={(e) => onLastNameChange(e.target.value)}
                    placeholder={t(locale, 'lastName')}
                    aria-label={t(locale, 'lastName')}
                    disabled={disabled}
                    style={fieldStyle}
                />
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <input
                    type="email"
                    value={email}
                    onChange={(e) => onEmailChange(e.target.value)}
                    placeholder={t(locale, 'email')}
                    aria-label={t(locale, 'email')}
                    disabled={disabled}
                    style={fieldStyle}
                />
                <input
                    type="tel"
                    value={phone}
                    onChange={(e) => onPhoneChange(e.target.value)}
                    placeholder={t(locale, 'phone')}
                    aria-label={t(locale, 'phone')}
                    disabled={disabled}
                    style={fieldStyle}
                />
            </div>
            {consentLabel && (
                <label style={{ display: 'flex', gap: 8, fontSize: 12, alignItems: 'flex-start' }}>
                    <input
                        type="checkbox"
                        checked={consent}
                        onChange={(e) => onConsentChange(e.target.checked)}
                        disabled={disabled}
                    />
                    <span>{consentLabel}</span>
                </label>
            )}
            {error && (
                <div role="alert" style={{ fontSize: 12, color: '#991b1b' }}>
                    {error}
                </div>
            )}
            <button type="submit" style={btnStyle('primary')} disabled={disabled}>
                {t(locale, 'submitLead')}
            </button>
        </form>
    );
}

function SavedVehiclesDrawer({
    locale,
    vins,
    onClose,
    onAsk,
}: {
    locale: Locale;
    vins: string[];
    onClose: () => void;
    onAsk: (vin: string) => void;
}) {
    return (
        <div
            style={{
                borderBottom: '1px solid rgba(0,0,0,0.06)',
                padding: '10px 14px',
                background: 'rgba(255,255,255,0.92)',
            }}
        >
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <strong style={{ fontSize: 14 }}>{t(locale, 'savedVehicles')}</strong>
                <button type="button" style={btnStyle('ghost')} onClick={onClose}>
                    {t(locale, 'dismiss')}
                </button>
            </div>
            {vins.length === 0 ? (
                <p style={{ margin: 0, fontSize: 13, opacity: 0.7 }}>
                    {t(locale, 'noSavedVehicles')}
                </p>
            ) : (
                <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {vins.map((vin) => (
                        <li key={vin} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                            <span style={{ fontFamily: 'monospace', fontSize: 12 }}>{vin}</span>
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                onClick={() => onAsk(vin)}
                            >
                                {t(locale, 'details')}
                            </button>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}

function VehicleCard({
    vehicle: v,
    onAction,
    paymentsEnabled = true,
    savedEnabled = false,
    compareEnabled = false,
    saved = false,
    inCompare = false,
    onToggleSave,
    onToggleCompare,
    labels,
}: {
    vehicle: Vehicle;
    onAction: (text: string, opts?: SendOpts) => void;
    paymentsEnabled?: boolean;
    savedEnabled?: boolean;
    compareEnabled?: boolean;
    saved?: boolean;
    inCompare?: boolean;
    onToggleSave?: () => void;
    onToggleCompare?: () => void;
    labels: {
        details: string;
        payment: string;
        hold: string;
        save: string;
        compare: string;
        addToCompare: string;
        inCompare: string;
    };
}) {
    const title = [v.year, v.make, v.model].filter(Boolean).join(' ');
    const isHeld = v.status === 'HOLD';

    return (
        <div
            style={{
                border: '1px solid rgba(0,0,0,0.09)',
                borderRadius: '14px',
                padding: '12px',
                background: 'rgba(255,255,255,0.85)',
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
            }}
        >
            {v.photos && v.photos[0] && (
                <img
                    src={v.photos[0]}
                    alt={title}
                    loading="lazy"
                    style={{
                        width: '100%',
                        height: '160px',
                        objectFit: 'cover',
                        borderRadius: '10px',
                    }}
                />
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                <strong style={{ fontSize: '15px', lineHeight: 1.3 }}>{title}</strong>
                {isHeld && (
                    <span style={{
                        fontSize: '11px',
                        background: 'rgba(234,88,12,0.12)',
                        color: '#9a3412',
                        padding: '2px 7px',
                        borderRadius: '20px',
                        whiteSpace: 'nowrap',
                        fontWeight: 600,
                    }}>
                        On hold
                    </span>
                )}
            </div>

            {v.trim && (
                <div style={{ fontSize: '13px', opacity: 0.65 }}>{v.trim}</div>
            )}
            {v.mileage != null && (
                <div style={{ fontSize: '13px', opacity: 0.65 }}>
                    {v.mileage.toLocaleString()} miles
                </div>
            )}

            <div style={{ display: 'flex', gap: '12px', alignItems: 'baseline' }}>
                {v.price != null && (
                    <span style={{ fontWeight: 700, fontSize: '16px' }}>
                        ${v.price.toLocaleString()}
                    </span>
                )}
                {v.estimatedPayment != null && (
                    <span style={{ fontSize: '13px', opacity: 0.6 }}>
                        Est. ${Math.round(v.estimatedPayment).toLocaleString()}/mo
                    </span>
                )}
            </div>

            {!isHeld && (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <button
                        type="button"
                        style={btnStyle('primary')}
                        onClick={() =>
                            onAction(`Tell me more about ${v.vin}`, {
                                action: 'vehicle_detail',
                                vin: v.vin,
                            })
                        }
                    >
                        {labels.details}
                    </button>
                    {paymentsEnabled && (
                        <button
                            type="button"
                            style={btnStyle('secondary')}
                            onClick={() =>
                                onAction(`Payment estimate for ${v.vin}`, {
                                    action: 'payment_estimate',
                                    vin: v.vin,
                                })
                            }
                        >
                            {labels.payment}
                        </button>
                    )}
                    <button
                        type="button"
                        style={btnStyle('ghost')}
                        onClick={() =>
                            onAction(`Hold ${v.vin}`, {
                                action: 'hold_vehicle',
                                vin: v.vin,
                            })
                        }
                    >
                        {labels.hold}
                    </button>
                    {savedEnabled && (
                        <button
                            type="button"
                            style={btnStyle('ghost')}
                            aria-pressed={saved}
                            onClick={() => onToggleSave?.()}
                        >
                            {saved ? `✓ ${labels.save}` : labels.save}
                        </button>
                    )}
                    {compareEnabled && (
                        <button
                            type="button"
                            style={btnStyle('ghost')}
                            aria-pressed={inCompare}
                            onClick={() => onToggleCompare?.()}
                        >
                            {inCompare ? labels.inCompare : labels.addToCompare}
                        </button>
                    )}
                </div>
            )}
        </div>
    );
}

function btnStyle(variant: 'primary' | 'secondary' | 'ghost'): CSSProperties {
    const base: CSSProperties = {
        padding: '8px 14px',
        borderRadius: '9px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        border: 'none',
        transition: 'opacity 120ms ease',
        lineHeight: 1,
    };
    if (variant === 'primary') {
        return { ...base, background: 'var(--amqur-primary, #111)', color: 'var(--amqur-accent, #fff)' };
    }
    if (variant === 'secondary') {
        return { ...base, background: 'rgba(0,0,0,0.06)', color: 'var(--amqur-text, #141414)' };
    }
    return { ...base, background: 'transparent', color: 'var(--amqur-text, #141414)', border: '1px solid rgba(0,0,0,0.12)' };
}
