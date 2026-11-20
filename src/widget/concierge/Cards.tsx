import { useId, useState } from 'react';
import type { ReactNode } from 'react';
import type { AppointmentSelection, Card, Lang, LeadSubmission } from './types';
import { c, money } from './copy';
import { LeadForm } from './LeadForm';
import { AppointmentPicker, AppointmentReceipt } from './AppointmentPicker';
import { normalizeApiBaseUrl } from '../../connect';
import { CaretIcon, ExternalIcon, LockIcon } from '../icons';

/** Collapsible details — keeps ONE short disclosure visible and the full terms one tap away. */
function Details({ label, children }: { label: string; children: ReactNode }) {
    const [open, setOpen] = useState(false);
    const id = useId();
    return (
        <div className="amq-details">
            <button type="button" className="amq-linkbtn" aria-expanded={open} aria-controls={id} onClick={() => setOpen((o) => !o)}>
                {label}
                <span aria-hidden className={`amq-caret${open ? ' amq-caret--open' : ''}`}>
                    <CaretIcon />
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
export type CardActions = {
    /** True while a turn is in flight: interactive cards stop accepting input. */
    busy?: boolean;
    /** Only the newest interactive card accepts input; older ones are a record of what was asked. */
    interactive?: boolean;
    onLead?: (lead: LeadSubmission) => void;
    onAppointment?: (selection: AppointmentSelection, display: string) => void;
};

export function CardView({ card, lang, apiBaseUrl, actions }: { card: Card; lang: Lang; apiBaseUrl: string; actions?: CardActions }) {
    switch (card.kind) {
        case 'appointment':
            return <AppointmentReceipt card={card} lang={lang} />;
        case 'lead_form':
            // Without a handler (restored transcript, older message) the form is not offered again.
            if (!actions?.onLead || actions.interactive === false) return null;
            return <LeadForm card={card} lang={lang} disabled={actions.busy} onSubmit={actions.onLead} />;
        case 'appointment_picker':
            if (card.mode !== 'external_link' && (!actions?.onAppointment || actions.interactive === false)) return null;
            return <AppointmentPicker card={card} lang={lang} disabled={actions?.busy} onSelect={actions?.onAppointment ?? (() => undefined)} />;
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
                <section className="amq-card amq-card--payment" aria-label={c(lang, 'financeEstimate')}>
                    <header>
                        <span className="amq-card__eyebrow">{c(lang, 'financeEstimate')}</span>
                        <span className="amq-chip">{card.aprSource === 'CUSTOMER' ? c(lang, 'yourRate', { apr: card.apr }) : c(lang, 'exampleRate', { apr: card.apr })}</span>
                    </header>
                    {card.vehicleLabel && <div className="amq-card__title">{card.vehicleLabel}</div>}
                    <p className="amq-muted amq-small">VIN {card.vin}</p>
                    <div className="amq-card__big">
                        {money(card.monthly, lang)}
                        <span className="amq-muted">{c(lang, 'perMonth')}</span>
                    </div>
                    <div className="amq-muted amq-small">{c(lang, 'estimateLine', { term: card.termMonths, down: money(card.downPayment, lang) })}</div>
                    <p className="amq-muted amq-small">
                        {c(lang, 'estimateShort')} {card.includesTaxAndFees ? c(lang, 'inclTaxes') : c(lang, 'exclTaxes')}.
                    </p>
                    <p className="amq-muted amq-small">{c(lang, 'notALease')}</p>
                    <Details label={c(lang, 'paymentTerms')}>
                        <dl className="amq-dl">
                            <dt>{c(lang, 'vehiclePrice')}</dt>
                            <dd>{money(card.price, lang)}</dd>
                            <dt>{c(lang, 'downPayment')}</dt>
                            <dd>{money(card.downPayment, lang)}</dd>
                            <dt>{c(lang, 'term')}</dt>
                            <dd>
                                {card.termMonths} {c(lang, 'months')}
                            </dd>
                            <dt>{c(lang, 'rate')}</dt>
                            <dd>{card.aprSource === 'CUSTOMER' ? c(lang, 'yourRate', { apr: card.apr }) : c(lang, 'exampleRate', { apr: card.apr })}</dd>
                            <dt>{c(lang, 'taxesFees')}</dt>
                            <dd>{card.includesTaxAndFees ? c(lang, 'included') : c(lang, 'excluded')}</dd>
                        </dl>
                        <p className="amq-muted amq-small">{card.disclaimer}</p>
                    </Details>
                </section>
            );
        case 'trade': {
            const v = card.value;
            const label = v
                ? v.kind === 'FINAL_OFFER'
                    ? c(lang, 'tradeOffer')
                    : v.kind === 'DEALER_APPRAISAL'
                      ? c(lang, 'tradeAppraisal')
                      : c(lang, 'tradeEstimate')
                : null;
            const amount = v ? (v.amount != null ? money(v.amount, lang) : v.low != null && v.high != null ? `${money(v.low, lang)}–${money(v.high, lang)}` : null) : null;
            return (
                <section className={`amq-card${v?.kind === 'FINAL_OFFER' ? ' amq-card--ok' : ''}`} aria-label={c(lang, 'trade')}>
                    <header>
                        <span className="amq-card__eyebrow">{c(lang, 'trade')}</span>
                        {label && <span className={`amq-chip amq-chip--${v?.kind === 'FINAL_OFFER' ? 'ok' : 'info'}`}>{label}</span>}
                    </header>
                    <div className="amq-card__title">{card.summary}</div>
                    {amount && <div className="amq-card__big">{amount}</div>}
                    {v?.expiresAt && <p className="amq-muted amq-small">{c(lang, 'validThrough', { d: new Date(v.expiresAt).toLocaleDateString(lang === 'es' ? 'es-US' : 'en-US', { month: 'short', day: 'numeric' }) })}</p>}
                    <p className="amq-muted amq-small">{v ? (v.kind === 'FINAL_OFFER' ? c(lang, 'tradeOfferNote') : c(lang, 'tradeEstimateNote')) : c(lang, 'tradeNote')}</p>
                </section>
            );
        }
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
                <section className="amq-card" aria-label={c(lang, 'hours')}>
                    {card.openNow != null && <span className={`amq-chip amq-chip--${card.openNow ? 'ok' : 'neutral'}`}>{card.openNow ? c(lang, 'openNow') : c(lang, 'closedNow')}</span>}
                    <div className="amq-small">{card.summary}</div>
                </section>
            );
        case 'finance_request':
            return (
                <section className="amq-card" role="status" aria-label={c(lang, 'financeRequestTitle')}>
                    <header>
                        <span className="amq-card__eyebrow">{c(lang, 'financeRequestTitle')}</span>
                        <span className="amq-chip amq-chip--neutral">{c(lang, 'requested')}</span>
                    </header>
                    <p className="amq-muted amq-small">{c(lang, 'financeRequestNote')}</p>
                </section>
            );
        default:
            return null;
    }
}
