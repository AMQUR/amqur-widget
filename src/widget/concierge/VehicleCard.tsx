import { useState } from 'react';
import type { Lang, Vehicle } from './types';
import { c, money } from './copy';

/**
 * Verified-only vehicle card. Shows feed facts, labels payment estimates with their
 * assumptions, discloses stale/in-transit data, and reveals secondary actions progressively.
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
    const photo = v.photos?.[0];
    return (
        <article className="amq-vcard" aria-label={`${title}${v.trim ? ` ${v.trim}` : ''}`}>
            <div className="amq-vcard__media">
                {photo ? <img src={photo} alt={`${title} ${v.trim ?? ''}`.trim()} loading="lazy" decoding="async" /> : <div className="amq-vcard__placeholder">{c(lang, 'noPhoto')}</div>}
                {v.status === 'IN_TRANSIT' && <span className="amq-chip amq-chip--info">{c(lang, 'inTransit')}</span>}
            </div>
            <div className="amq-vcard__body">
                <div className="amq-vcard__title">
                    <strong>{title}</strong>
                    {v.trim && <span className="amq-muted"> {v.trim}</span>}
                </div>
                <div className="amq-vcard__meta amq-muted">
                    {[v.color, v.mileage != null ? `${v.mileage.toLocaleString(lang === 'es' ? 'es-US' : 'en-US')} mi` : null, v.drivetrain, v.stock ? `#${v.stock}` : null]
                        .filter(Boolean)
                        .join(' · ')}
                </div>
                <div className="amq-vcard__price">
                    {v.price != null && <span className="amq-price">{money(v.price, lang)}</span>}
                    {v.msrp != null && v.price != null && v.msrp > v.price && <span className="amq-muted amq-strike">MSRP {money(v.msrp, lang)}</span>}
                </div>
                {props.paymentsEnabled && v.estimatedPayment != null && pa && (
                    <div className="amq-vcard__est">
                        {c(lang, 'estPerMonth', { m: money(v.estimatedPayment, lang) })}
                        <span className="amq-muted">
                            {' '}
                            · {pa.aprSource === 'CUSTOMER' ? c(lang, 'yourRate', { apr: pa.apr }) : c(lang, 'exampleRate', { apr: pa.apr })} · {pa.termMonths} mo ·{' '}
                            {pa.includesTaxAndFees ? c(lang, 'inclTaxes') : c(lang, 'exclTaxes')}
                        </span>
                    </div>
                )}
                {stale && <div className="amq-chip amq-chip--warn">{c(lang, 'stale')}</div>}
                <div className="amq-actions">
                    <button type="button" className="amq-btn amq-btn--primary" onClick={() => props.onAsk('', { action: 'vehicle_detail', vin: v.vin, display: `${c(lang, 'details')}: ${title}` })}>
                        {c(lang, 'details')}
                    </button>
                    {props.paymentsEnabled && (
                        <button type="button" className="amq-btn" onClick={() => props.onAsk('', { action: 'payment_estimate', vin: v.vin, display: `${c(lang, 'payment')}: ${title}` })}>
                            {c(lang, 'payment')}
                        </button>
                    )}
                    <button type="button" className="amq-btn amq-btn--ghost" aria-expanded={more} onClick={() => setMore((m) => !m)}>
                        ⋯<span className="amq-sr">More actions</span>
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
