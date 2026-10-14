import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import type { Lang, Vehicle } from './types';
import { c, money } from './copy';
import { ChevronIcon, VehicleSilhouette } from '../icons';

/** Feed photo with a skeleton while loading; any failure falls back to the neutral placeholder. */
function VehiclePhoto({ src, alt, lang }: { src?: string; alt: string; lang: Lang }) {
    const [state, setState] = useState<'loading' | 'ok' | 'error'>(src ? 'loading' : 'error');
    if (!src || state === 'error')
        return (
            <div className="amq-vcard__placeholder">
                <VehicleSilhouette className="amq-vcard__silhouette" />
                <span>{c(lang, 'noPhoto')}</span>
            </div>
        );
    return (
        <>
            {state === 'loading' && <div className="amq-skeleton" aria-hidden />}
            <img
                src={src}
                alt={alt}
                loading="lazy"
                decoding="async"
                onLoad={() => setState('ok')}
                onError={() => setState('error')}
                style={state === 'loading' ? { opacity: 0 } : undefined}
            />
        </>
    );
}

/**
 * Verified-only vehicle card. Shows feed facts, labels payment estimates with their
 * assumptions, discloses stale/in-transit/simulated data, and reveals secondary actions
 * progressively.
 */
export function VehicleCard(props: {
    v: Vehicle;
    lang: Lang;
    paymentsEnabled: boolean;
    savedEnabled: boolean;
    compareEnabled: boolean;
    saved: boolean;
    inCompare: boolean;
    onAsk: (text: string, opts: { action?: string; vin?: string; display?: string }) => void;
    onToggleSave: () => void;
    onToggleCompare: () => void;
}) {
    const { v, lang } = props;
    const [more, setMore] = useState(false);
    const title = [v.year, v.make, v.model].filter(Boolean).join(' ');
    const stale = v.freshnessState === 'STALE' || v.freshnessState === 'UNAVAILABLE';
    const pa = v.paymentAssumptions;
    const condition = v.condition ? v.condition.charAt(0).toUpperCase() + v.condition.slice(1).toLowerCase() : null;
    const meta = [
        condition,
        v.mileage != null ? `${v.mileage.toLocaleString(lang === 'es' ? 'es-US' : 'en-US')} mi` : null,
        v.drivetrain,
        v.color,
    ].filter(Boolean);
    return (
        <article className="amq-vcard" aria-label={`${title}${v.trim ? ` ${v.trim}` : ''}${v.simulated ? ` — ${c(lang, 'simulatedNote')}` : ''}`}>
            <div className="amq-vcard__media">
                <VehiclePhoto src={v.photos?.[0]} alt={`${title} ${v.trim ?? ''}`.trim()} lang={lang} />
                <div className="amq-vcard__badges">
                    {v.simulated && <span className="amq-chip amq-chip--demo">{c(lang, 'simulated')}</span>}
                    {v.status === 'IN_TRANSIT' && <span className="amq-chip amq-chip--info">{c(lang, 'inTransit')}</span>}
                </div>
            </div>
            <div className="amq-vcard__body">
                <div className="amq-vcard__title">
                    <strong>{title}</strong>
                    {v.trim && <span className="amq-vcard__trim">{v.trim}</span>}
                </div>
                {meta.length > 0 && <div className="amq-vcard__meta amq-muted">{meta.join(' · ')}</div>}
                <div className="amq-vcard__price">
                    {v.price != null && <span className="amq-price">{money(v.price, lang)}</span>}
                    {v.msrp != null && v.price != null && v.msrp > v.price && <span className="amq-muted amq-strike">MSRP {money(v.msrp, lang)}</span>}
                </div>
                {props.paymentsEnabled && v.estimatedPayment != null && pa && (
                    <div className="amq-vcard__est">
                        <span className="amq-vcard__estnum">{c(lang, 'estPerMonth', { m: money(v.estimatedPayment, lang) })}</span>
                        <span className="amq-muted">
                            {pa.aprSource === 'CUSTOMER' ? c(lang, 'yourRate', { apr: pa.apr }) : c(lang, 'exampleRate', { apr: pa.apr })} · {pa.termMonths} mo ·{' '}
                            {money(pa.downPayment, lang)} down · {pa.includesTaxAndFees ? c(lang, 'inclTaxes') : c(lang, 'exclTaxes')}
                        </span>
                    </div>
                )}
                <div className="amq-vcard__foot amq-muted">
                    {v.stock && <span>Stock #{v.stock}</span>}
                    {stale && <span className="amq-chip amq-chip--warn">{c(lang, 'stale')}</span>}
                </div>
                <div className="amq-actions">
                    <button type="button" className="amq-btn amq-btn--primary" onClick={() => props.onAsk('', { action: 'vehicle_detail', vin: v.vin, display: `${c(lang, 'details')}: ${title}` })}>
                        {c(lang, 'details')}
                    </button>
                    {props.paymentsEnabled && (
                        <button type="button" className="amq-btn" onClick={() => props.onAsk('', { action: 'payment_estimate', vin: v.vin, display: `${c(lang, 'payment')}: ${title}` })}>
                            {c(lang, 'payment')}
                        </button>
                    )}
                    <button type="button" className="amq-btn amq-btn--ghost amq-btn--icon" aria-expanded={more} aria-label="More actions" onClick={() => setMore((m) => !m)}>
                        <span aria-hidden>⋯</span>
                    </button>
                </div>
                {more && (
                    <div className="amq-actions amq-actions--secondary">
                        <button type="button" className="amq-btn amq-btn--ghost" onClick={() => props.onAsk('', { action: 'test_drive', vin: v.vin, display: `${c(lang, 'testDrive')}: ${title}` })}>
                            {c(lang, 'testDrive')}
                        </button>
                        {props.savedEnabled && (
                            <button type="button" className="amq-btn amq-btn--ghost" aria-pressed={props.saved} onClick={props.onToggleSave}>
                                {props.saved ? `✓ ${c(lang, 'saved')}` : c(lang, 'save')}
                            </button>
                        )}
                        {props.compareEnabled && (
                            <button type="button" className="amq-btn amq-btn--ghost" aria-pressed={props.inCompare} onClick={props.onToggleCompare}>
                                {props.inCompare ? c(lang, 'inCompare') : c(lang, 'compare')}
                            </button>
                        )}
                    </div>
                )}
            </div>
        </article>
    );
}

/** Horizontal, snap-scrolling carousel with keyboard + button navigation. */
export function VehicleCarousel({ count, lang, children }: { count: number; lang: Lang; children: ReactNode }) {
    const ref = useRef<HTMLDivElement | null>(null);
    const [idx, setIdx] = useState(0);
    useEffect(() => {
        const el = ref.current;
        if (!el) return;
        const onScroll = () => {
            const item = el.firstElementChild as HTMLElement | null;
            const w = item ? item.getBoundingClientRect().width + 10 : el.clientWidth;
            setIdx(Math.min(count - 1, Math.round(el.scrollLeft / Math.max(1, w))));
        };
        el.addEventListener('scroll', onScroll, { passive: true });
        return () => el.removeEventListener('scroll', onScroll);
    }, [count]);
    const go = (d: number) => {
        const el = ref.current;
        if (!el) return;
        const item = el.children[Math.max(0, Math.min(count - 1, idx + d))] as HTMLElement | undefined;
        item?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'nearest', inline: 'start' });
    };
    if (count <= 1)
        return (
            <div className="amq-cards amq-cards--single" role="list">
                {children}
            </div>
        );
    return (
        <div className="amq-carousel" role="region" aria-roledescription="carousel" aria-label={`${count} vehicles`}>
            <div
                ref={ref}
                className="amq-cards"
                role="list"
                tabIndex={0}
                onKeyDown={(e) => {
                    if (e.key === 'ArrowRight') {
                        e.preventDefault();
                        go(1);
                    } else if (e.key === 'ArrowLeft') {
                        e.preventDefault();
                        go(-1);
                    }
                }}
            >
                {children}
            </div>
            <div className="amq-carousel__nav">
                <button type="button" className="amq-navbtn" aria-label={c(lang, 'prev')} disabled={idx <= 0} onClick={() => go(-1)}>
                    <ChevronIcon dir="left" />
                </button>
                <span className="amq-carousel__count" aria-live="polite">
                    {c(lang, 'ofN', { i: idx + 1, n: count })}
                </span>
                <button type="button" className="amq-navbtn" aria-label={c(lang, 'next')} disabled={idx >= count - 1} onClick={() => go(1)}>
                    <ChevronIcon dir="right" />
                </button>
            </div>
        </div>
    );
}
