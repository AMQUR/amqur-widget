import type { Card, Lang } from './types';
import { c, money } from './copy';
import { normalizeApiBaseUrl } from '../../connect';

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
                    {card.outcome !== 'confirmed' && <p className="amq-muted">{c(lang, 'requestNote')}</p>}
                </section>
            );
        }
        case 'credit_application': {
            const href = /^https:\/\//.test(card.url) ? card.url : `${normalizeApiBaseUrl(apiBaseUrl)}${card.url}`;
            return (
                <section className="amq-card" aria-label={card.label}>
                    <span className="amq-card__eyebrow">{card.providerName ?? card.label}</span>
                    <a className="amq-btn amq-btn--primary amq-btn--block" href={href} target="_blank" rel="noopener noreferrer">
                        {c(lang, 'creditCta')} ↗
                    </a>
                    <p className="amq-muted amq-small">{c(lang, 'creditNote')}</p>
                </section>
            );
        }
        case 'payment':
            return (
                <section className="amq-card" aria-label={c(lang, 'estimateTitle')}>
                    <span className="amq-card__eyebrow">{c(lang, 'estimateTitle')}</span>
                    <div className="amq-card__big">
                        {money(card.monthly, lang)}
                        <span className="amq-muted">/mo</span>
                    </div>
                    <div className="amq-muted amq-small">
                        {c(lang, 'estimateLine', { term: card.termMonths, down: money(card.downPayment, lang) })} ·{' '}
                        {card.aprSource === 'CUSTOMER' ? c(lang, 'yourRate', { apr: card.apr }) : c(lang, 'exampleRate', { apr: card.apr })} ·{' '}
                        {card.includesTaxAndFees ? c(lang, 'inclTaxes') : c(lang, 'exclTaxes')}
                    </div>
                    <p className="amq-muted amq-small">{card.disclaimer}</p>
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
