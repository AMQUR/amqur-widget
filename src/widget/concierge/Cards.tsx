import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { Card, Lang } from './types';
import { c, money } from './copy';
import { normalizeApiBaseUrl } from '../../connect';
import { ExternalIcon, LockIcon } from '../icons';

/** Collapsible details — keeps ONE short disclosure visible and the full terms one tap away. */
function Details({ label, children }: { label: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    return (
        <div className="amq-details">
            <button type="button" className="amq-linkbtn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
                {label}
                <span aria-hidden className={`amq-caret${open ? ' amq-caret--open' : ''}`}>
                    ▾
                </span>
            </button>
            {open && (
                <div id={id} className="amq-details__body">
                    {children}
                </div>
            )}
        </div>
    );
}

/** Status cards. Visual language distinguishes REQUEST vs provider-CONFIRMED and never implies approval. */
export function CardView({ card, lang, apiBaseUrl }: { card: Card; lang: Lang; apiBaseUrl: string }) {
    switch (card.kind) {
        case 'appointment': {
            const tone = card.outcome === 'confirmed' ? 'ok' : card.outcome === 'pending' ? 'info' : 'neutral';
            return (
                <section className={`amq-card amq-card--${tone}`} aria-label={c(lang, 'appointment')}>
                    <header>
                        <span className="amq-card__eyebrow">{c(lang, 'appointment')}</span>
                        <span className={`amq-chip amq-chip--${tone}`}>{card.outcome === 'confirmed' ? c(lang, 'confirmed') : card.outcome === 'pending' ? c(lang, 'pending') : c(lang, 'requested')}</span>
                    </header>
                    <div className="amq-card__title">{card.label}</div>
                    {card.outcome !== 'confirmed' && <p className="amq-muted amq-small">{c(lang, 'requestNote')}</p>}
                </section>
            );
        }
        case 'credit_application': {
            const href = /^https:\/\//.test(card.url) ? card.url : `${normalizeApiBaseUrl(apiBaseUrl)}${card.url}`;
            return (
                <section className="amq-card amq-card--credit" aria-label={card.label || c(lang, 'creditTitle')}>
                    <header>
                        <span className="amq-credit__icon" aria-hidden>
                            <LockIcon />
                        </span>
                        <div className="amq-credit__head">
                            <div className="amq-card__title">{card.label || c(lang, 'creditTitle')}</div>
                            {card.providerName && <div className="amq-muted amq-small">{card.providerName}</div>}
                        </div>
                        {card.preview && <span className="amq-chip amq-chip--warn">{c(lang, 'previewBadge')}</span>}
                    </header>
                    <a className="amq-btn amq-btn--primary amq-btn--block amq-btn--lg" href={href} target="_blank" rel="noopener noreferrer">
                        {card.cta || c(lang, 'creditCtaLive')}
                        <ExternalIcon aria-hidden />
                        <span className="amq-sr"> ({c(lang, 'creditNewTab')})</span>
                    </a>
                    <p className="amq-muted amq-small">
                        {card.note || c(lang, 'creditNewTab')} {c(lang, 'creditPrivacy')}
                    </p>
                </section>
            );
        }
        case 'otd_quote': {
            const method = card.paymentMethod === 'CASH' ? c(lang, 'cash') : card.paymentMethod === 'FINANCE' ? c(lang, 'finance') : card.paymentMethod === 'LEASE' ? c(lang, 'lease') : null;
            return (
                <section className="amq-card" aria-label={c(lang, 'otdTitle')}>
                    <header>
                        <span className="amq-card__eyebrow">{c(lang, 'otdTitle')}</span>
                        <span className={`amq-chip amq-chip--${card.status === 'estimate' ? 'info' : 'neutral'}`}>{card.status === 'estimate' ? c(lang, 'otdEstimate') : c(lang, 'otdRequested')}</span>
                    </header>
                    <div className="amq-card__title">{card.vehicleLabel}</div>
                    {method && <span className="amq-chip">{method}</span>}
                    {card.status === 'estimate' && card.total != null ? (
                        <>
                            <ul className="amq-lines">
                                {card.lines.map((l, i) => (
                                    <li key={i}>
                                        <span>{l.label}</span>
                                        <span>{money(l.amount, lang)}</span>
                                    </li>
                                ))}
                                <li className="amq-lines__total">
                                    <span>{c(lang, 'otdTotal')}</span>
                                    <span>{money(card.total, lang)}</span>
                                </li>
                            </ul>
                            <p className="amq-muted amq-small">{c(lang, 'otdNotOffer')}</p>
                            {card.assumptions.length > 0 && (
                                <Details label={c(lang, 'paymentTerms')}>
                                    <ul className="amq-bullets">
                                        {card.assumptions.map((a) => (
                                            <li key={a}>{a}</li>
                                        ))}
                                    </ul>
                                </Details>
                            )}
                        </>
                    ) : (
                        <p className="amq-muted amq-small">{c(lang, 'otdRequestedNote')}</p>
                    )}
                </section>
            );
        }
        case 'payment':
            return (
                <section className="amq-card amq-card--payment" aria-label={c(lang, 'estimateTitle')}>
                    <header>
                        <span className="amq-card__eyebrow">{c(lang, 'estimateTitle')}</span>
                        <span className="amq-chip">{card.aprSource === 'CUSTOMER' ? c(lang, 'yourRate', { apr: card.apr }) : c(lang, 'exampleRate', { apr: card.apr })}</span>
                    </header>
                    <div className="amq-card__big">
                        {money(card.monthly, lang)}
                        <span className="amq-muted">/mo</span>
                    </div>
                    <div className="amq-muted amq-small">{c(lang, 'estimateLine', { term: card.termMonths, down: money(card.downPayment, lang) })}</div>
                    <p className="amq-muted amq-small">
                        {c(lang, 'estimateShort')} {card.includesTaxAndFees ? c(lang, 'inclTaxes') : c(lang, 'exclTaxes')}.
                    </p>
                    <Details label={c(lang, 'paymentTerms')}>
                        <dl className="amq-dl">
                            <dt>{c(lang, 'vehiclePrice')}</dt>
                            <dd>{money(card.price, lang)}</dd>
                            <dt>{c(lang, 'downPayment')}</dt>
                            <dd>{money(card.downPayment, lang)}</dd>
                            <dt>{c(lang, 'term')}</dt>
                            <dd>{card.termMonths} mo</dd>
                            <dt>{c(lang, 'rate')}</dt>
                            <dd>{card.aprSource === 'CUSTOMER' ? c(lang, 'yourRate', { apr: card.apr }) : c(lang, 'exampleRate', { apr: card.apr })}</dd>
                            <dt>{c(lang, 'taxesFees')}</dt>
                            <dd>{card.includesTaxAndFees ? c(lang, 'included') : c(lang, 'excluded')}</dd>
                        </dl>
                        <p className="amq-muted amq-small">{card.disclaimer}</p>
                    </Details>
                </section>
            );
        case 'trade':
            return (
                <section className="amq-card" aria-label={c(lang, 'trade')}>
                    <span className="amq-card__eyebrow">{c(lang, 'trade')}</span>
                    <div className="amq-card__title">{card.summary}</div>
                    <p className="amq-muted amq-small">{c(lang, 'tradeNote')}</p>
                </section>
            );
        case 'parts': {
            const row = (label: string, ok: boolean) => (
                <li>
                    <span>{label}</span>
                    <span className={`amq-chip amq-chip--${ok ? 'ok' : 'neutral'}`}>{ok ? c(lang, 'verified') : c(lang, 'pendingTeam')}</span>
                </li>
            );
            return (
                <section className="amq-card" aria-label={c(lang, 'partsNeed')}>
                    <header>
                        <span className="amq-card__eyebrow">{c(lang, 'partsNeed')}</span>
                        {card.needsVin && <span className="amq-chip amq-chip--warn">{c(lang, 'needsVin')}</span>}
                    </header>
                    <ul className="amq-statuslist">
                        {row(c(lang, 'partsFitment'), card.fitmentVerified)}
                        {row(c(lang, 'partsPrice'), card.priceVerified)}
                        {row(c(lang, 'partsStock'), card.availabilityVerified)}
                    </ul>
                </section>
            );
        }
        case 'handoff':
            return (
                <section className={`amq-card amq-card--${card.state === 'notified' ? 'ok' : 'neutral'}`} role="status" aria-label={c(lang, 'team')}>
                    <span className="amq-card__eyebrow">{c(lang, 'team')}</span>
                    <div className="amq-small">{card.state === 'notified' ? c(lang, 'handoffNotified') : card.state === 'queued' ? c(lang, 'handoffQueued') : c(lang, 'handoffRecorded')}</div>
                </section>
            );
        case 'hours':
            return (
                <section className="amq-card" aria-label="Hours">
                    {card.openNow != null && <span className={`amq-chip amq-chip--${card.openNow ? 'ok' : 'neutral'}`}>{card.openNow ? c(lang, 'openNow') : c(lang, 'closedNow')}</span>}
                    <div className="amq-small">{card.summary}</div>
                </section>
            );
        default:
            return null;
    }
}
