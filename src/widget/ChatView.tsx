import { useEffect, useRef, useState, useCallback } from 'react';
import type { CSSProperties } from 'react';
import { sendChatMessage } from './api/chat.api';
import { useWidget } from './WidgetContext';
import { CompareTable } from './CompareTable';
import { detectLocale, t, type Locale } from './i18n';
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

function makeId(): string {
    return typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function ChatView() {
    const { bootstrap, config, conversationId } = useWidget();
    const inventoryEnabled = bootstrap.features?.inventory !== false;
    const paymentsEnabled = bootstrap.features?.payments !== false;
    const compareEnabled = bootstrap.features?.vehicleCompare !== false;
    const savedEnabled = bootstrap.features?.savedVehicles !== false;
    const serviceEnabled = bootstrap.features?.serviceAi !== false;
    const partsEnabled = bootstrap.features?.partsAi !== false;
    const multilingual = bootstrap.features?.multilingual !== false;

    const [locale, setLocale] = useState<Locale>(() =>
        detectLocale(config.locale ?? bootstrap.locales?.[0]),
    );
    const [savedVins, setSavedVins] = useState<string[]>(() =>
        loadSavedVins(config.tenantSlug, config.locationSlug),
    );

    const [messages, setMessages] = useState<Message[]>([
        {
            id: 'welcome',
            role: 'assistant',
            text: t(locale, 'welcome', { location: bootstrap.location.name }),
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
    }, [messages, sending]);

    const sendMessage = useCallback(
        async (text?: string, opts?: { action?: string; vin?: string }) => {
            const userText = (text ?? input).trim();
            if (!userText || sending) return;
            if (!isOnline) {
                setMessages((prev) => [
                    ...prev,
                    {
                        id: makeId(),
                        role: 'assistant',
                        text: 'You appear to be offline. Reconnect and try again.',
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
        [input, sending, config, conversationId, isOnline, inventoryEnabled, paymentsEnabled, compareEnabled, locale],
    );

    // Auto-send with a specific text (used by vehicle card buttons)
    const quickSend = useCallback(
        (text: string, opts?: { action?: string; vin?: string }) => {
            setInput('');
            void sendMessage(text, opts);
        },
        [sendMessage],
    );

    return (
        <div
            className="amqur-chat-root"
            style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0 }}
        >
            {/* ── Message thread ── */}
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
                        {/* Text bubble */}
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

                        {/* ── Payment summary card ── */}
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
                                    {/* Quick CTA after payment */}
                                    <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                                        <button
                                            style={btnStyle('primary')}
                                            onClick={() => quickSend(`I want to schedule a test drive for ${msg.payment!.vehicleVin ?? 'this vehicle'}`)}
                                        >
                                            Test drive
                                        </button>
                                        <button
                                            style={btnStyle('secondary')}
                                            onClick={() => quickSend(`Can I speak with someone about this deal?`)}
                                        >
                                            Talk to someone
                                        </button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* ── Vehicle compare table ── */}
                        {inventoryEnabled &&
                            msg.compare &&
                            msg.vehicles &&
                            msg.vehicles.length > 1 && (
                            <div style={{ clear: 'both', marginTop: msg.text ? '10px' : 0 }}>
                                <CompareTable vehicles={msg.vehicles} />
                            </div>
                        )}

                        {/* ── Vehicle carousel ── */}
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
                                        saved={savedVins.includes(v.vin.toUpperCase())}
                                        onToggleSave={() => {
                                            const next = toggleSavedVin(
                                                config.tenantSlug,
                                                config.locationSlug,
                                                v.vin,
                                            );
                                            setSavedVins(next);
                                        }}
                                        labels={{
                                            details: t(locale, 'details'),
                                            payment: t(locale, 'payment'),
                                            hold: t(locale, 'hold'),
                                            save: t(locale, 'save'),
                                            compare: t(locale, 'compare'),
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

                        {/* Clearfix */}
                        {msg.isError && lastFailedUserText && (
                            <div style={{ clear: 'both', marginTop: '8px' }}>
                                <button
                                    type="button"
                                    style={btnStyle('secondary')}
                                    onClick={() => {
                                        const t = lastFailedUserText;
                                        setLastFailedUserText(null);
                                        void sendMessage(t);
                                    }}
                                    disabled={sending || !isOnline}
                                    aria-label="Retry last message"
                                >
                                    Retry
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

                {(serviceEnabled || partsEnabled) && (
                    <div
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 6,
                            marginBottom: 8,
                        }}
                    >
                        {serviceEnabled && (
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                onClick={() =>
                                    quickSend(t(locale, 'serviceHelp'))
                                }
                            >
                                {t(locale, 'serviceHelp')}
                            </button>
                        )}
                        {partsEnabled && (
                            <button
                                type="button"
                                style={btnStyle('secondary')}
                                onClick={() =>
                                    quickSend(t(locale, 'partsHelp'))
                                }
                            >
                                {t(locale, 'partsHelp')}
                            </button>
                        )}
                        <button
                            type="button"
                            style={btnStyle('secondary')}
                            onClick={() =>
                                quickSend(t(locale, 'talkToSomeone'))
                            }
                        >
                            {t(locale, 'talkToSomeone')}
                        </button>
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

                {/* ── Typing indicator ── */}
                {sending && (
                    <div className="amqur-skel" style={{ maxWidth: '200px' }}>
                        <div className="amqur-skelbar" style={{ width: '60%' }} />
                        <div className="amqur-skelbar" style={{ width: '40%' }} />
                    </div>
                )}

                <div ref={bottomRef} />
            </div>

            {/* ── Composer ── */}
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

// ─────────────────────────────
// Vehicle card sub-component
// ─────────────────────────────

function VehicleCard({
    vehicle: v,
    onAction,
    paymentsEnabled = true,
    savedEnabled = false,
    saved = false,
    onToggleSave,
    labels,
}: {
    vehicle: Vehicle;
    onAction: (text: string, opts?: { action?: string; vin?: string }) => void;
    paymentsEnabled?: boolean;
    savedEnabled?: boolean;
    saved?: boolean;
    onToggleSave?: () => void;
    labels: {
        details: string;
        payment: string;
        hold: string;
        save: string;
        compare: string;
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
            {/* Photo */}
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

            {/* Title + status */}
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

            {/* Actions — structured action/vin for backend */}
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
                </div>
            )}
        </div>
    );
}

// ─────────────────────────────
// Shared button style helper
// ─────────────────────────────

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
    // ghost
    return { ...base, background: 'transparent', color: 'var(--amqur-text, #141414)', border: '1px solid rgba(0,0,0,0.12)' };
}
