import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import type { ContactChannel, Lang, LeadFormCard, LeadSubmission } from './types';
import { c } from './copy';
import { CHANNEL_LABEL, phoneDigits, validateLead, type LeadErrors as Errors } from './leadValidation';

/**
 * Contact capture, shown only once the customer has asked for something that needs a follow-up.
 * - Asks for the minimum: a name and one way to reach them.
 * - Consent is per channel, unticked by default, and uses the server's versioned wording.
 * - Nothing typed here is written to browser storage; it is sent once and then cleared.
 */
export function LeadForm(props: {
    card: LeadFormCard;
    lang: Lang;
    disabled?: boolean;
    onSubmit: (lead: LeadSubmission) => void;
}) {
    const { card, lang } = props;
    const uid = useId();
    const channels = card.channels.length ? card.channels : (['EMAIL'] as ContactChannel[]);
    const [firstName, setFirstName] = useState('');
    const [lastName, setLastName] = useState('');
    const [email, setEmail] = useState('');
    const [phone, setPhone] = useState('');
    const [channel, setChannel] = useState<ContactChannel>(channels[0]!);
    const [consents, setConsents] = useState<Partial<Record<ContactChannel, boolean>>>({});
    const [errors, setErrors] = useState<Errors>({});
    const [sent, setSent] = useState<ContactChannel | null>(null);
    const formRef = useRef<HTMLFormElement | null>(null);

    const title = card.rooftopName ? c(lang, 'leadTitle', { name: card.rooftopName }) : c(lang, 'leadTitleGeneric');

    if (sent) {
        return (
            <section className="amq-card" role="status" aria-label={title}>
                <div className="amq-card__title">{title}</div>
                <p className="amq-muted amq-small">{c(lang, 'leadSentNote', { channel: c(lang, CHANNEL_LABEL[sent]).toLowerCase() })}</p>
            </section>
        );
    }

    const submit = (ev: FormEvent) => {
        ev.preventDefault();
        if (props.disabled) return;
        const found = validateLead({ firstName, lastName, email, phone, channel, consents }, lang);
        setErrors(found);
        const first = (['firstName', 'lastName', 'email', 'phone', 'consent'] as const).find((k) => found[k]);
        if (first) {
            formRef.current?.querySelector<HTMLElement>(`[data-field="${first}"]`)?.focus();
            return;
        }
        const lead: LeadSubmission = {
            formId: card.id,
            firstName: firstName.trim(),
            lastName: lastName.trim(),
            ...(email.trim() ? { email: email.trim() } : {}),
            ...(phone.trim() ? { phone: phoneDigits(phone) } : {}),
            preferredChannel: channel,
            consents: channels.map((ch) => ({ channel: ch, granted: consents[ch] === true, version: card.consent.version })),
        };
        setSent(channel);
        // Clear local copies immediately; the submission lives only in the request.
        setFirstName('');
        setLastName('');
        setEmail('');
        setPhone('');
        props.onSubmit(lead);
    };

    const field = (
        key: 'firstName' | 'lastName' | 'email' | 'phone',
        label: string,
        value: string,
        set: (v: string) => void,
        extra: { type?: string; autoComplete: string; inputMode?: 'email' | 'tel' | 'text'; required: boolean },
    ) => (
        <div className="amq-field">
            <label htmlFor={`${uid}-${key}`}>
                {label}
                {!extra.required && <span className="amq-muted"> ({lang === 'es' ? 'opcional' : 'optional'})</span>}
            </label>
            <input
                id={`${uid}-${key}`}
                data-field={key}
                type={extra.type ?? 'text'}
                inputMode={extra.inputMode}
                autoComplete={extra.autoComplete}
                value={value}
                maxLength={key === 'email' ? 254 : 80}
                required={extra.required}
                aria-required={extra.required}
                aria-invalid={errors[key] ? true : undefined}
                aria-describedby={errors[key] ? `${uid}-${key}-err` : undefined}
                onChange={(e) => set(e.target.value)}
            />
            {errors[key] && (
                <span className="amq-field__err" id={`${uid}-${key}-err`}>
                    {errors[key]}
                </span>
            )}
        </div>
    );

    const hasErrors = Object.keys(errors).length > 0;

    return (
        <form ref={formRef} className="amq-card amq-form" onSubmit={submit} noValidate aria-labelledby={`${uid}-title`}>
            <div className="amq-card__title" id={`${uid}-title`}>
                {title}
            </div>
            {card.vehicleLabel && <p className="amq-muted amq-small">{card.vehicleLabel}</p>}
            {card.reason && <p className="amq-small">{card.reason}</p>}
            {hasErrors && (
                <p className="amq-form__summary" role="alert">
                    {c(lang, 'errFix')}
                </p>
            )}
            <div className="amq-form__row">
                {field('firstName', c(lang, 'firstName'), firstName, setFirstName, { autoComplete: 'given-name', required: true })}
                {field('lastName', c(lang, 'lastName'), lastName, setLastName, { autoComplete: 'family-name', required: true })}
            </div>
            {channels.length > 1 && (
                <fieldset className="amq-fieldset">
                    <legend>{c(lang, 'preferredContact')}</legend>
                    <div className="amq-radios">
                        {channels.map((ch) => (
                            <label key={ch} className="amq-radio">
                                <input type="radio" name={`${uid}-channel`} value={ch} checked={channel === ch} onChange={() => setChannel(ch)} />
                                <span>{c(lang, CHANNEL_LABEL[ch])}</span>
                            </label>
                        ))}
                    </div>
                </fieldset>
            )}
            {field('email', c(lang, 'email'), email, setEmail, { type: 'email', inputMode: 'email', autoComplete: 'email', required: channel === 'EMAIL' })}
            {(channels.includes('CALL') || channels.includes('TEXT')) &&
                field('phone', c(lang, 'phone'), phone, setPhone, { type: 'tel', inputMode: 'tel', autoComplete: 'tel', required: channel !== 'EMAIL' })}
            <fieldset className="amq-fieldset">
                <legend>{c(lang, 'consentHeading')}</legend>
                {channels.map((ch) => {
                    const text = card.consent.text[ch];
                    if (!text) return null;
                    const invalid = ch === channel && !!errors.consent;
                    return (
                        <label key={ch} className="amq-check">
                            <input
                                type="checkbox"
                                data-field={ch === channel ? 'consent' : undefined}
                                checked={consents[ch] === true}
                                aria-invalid={invalid ? true : undefined}
                                aria-describedby={invalid ? `${uid}-consent-err` : undefined}
                                onChange={(e) => setConsents((prev) => ({ ...prev, [ch]: e.target.checked }))}
                            />
                            <span>{text}</span>
                        </label>
                    );
                })}
                {errors.consent && (
                    <span className="amq-field__err" id={`${uid}-consent-err`}>
                        {errors.consent}
                    </span>
                )}
            </fieldset>
            <button type="submit" className="amq-btn amq-btn--primary amq-btn--block amq-btn--lg" disabled={props.disabled}>
                {props.disabled ? c(lang, 'leadSending') : c(lang, 'leadSubmit')}
            </button>
            <p className="amq-muted amq-small">{c(lang, 'leadPrivacy')}</p>
        </form>
    );
}
