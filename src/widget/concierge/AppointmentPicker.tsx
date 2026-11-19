import { useEffect, useId, useMemo, useRef, useState } from 'react';
import type { AppointmentCard, AppointmentPickerCard, AppointmentSelection, AppointmentWindow, Lang } from './types';
import { c, formatDay, formatWhen } from './copy';
import { groupSlots } from './slots';
import { CloseIcon, ExternalIcon } from '../icons';

const WINDOWS: AppointmentWindow[] = ['morning', 'afternoon', 'evening'];

const safeHttps = (url?: string | null) => (typeof url === 'string' && /^https:\/\//i.test(url) ? url : null);

/**
 * Appointment picker. The wording and the action differ by what the store can really do:
 * real availability books a slot; without scheduler access it sends a request; with only an
 * outside scheduling page it links there and says plainly that nothing is booked here.
 */
export function AppointmentPicker(props: {
    card: AppointmentPickerCard;
    lang: Lang;
    disabled?: boolean;
    onSelect: (selection: AppointmentSelection, display: string) => void;
}) {
    const { card, lang } = props;
    const uid = useId();
    const [open, setOpen] = useState(false);
    const [slotId, setSlotId] = useState<string | null>(null);
    const [day, setDay] = useState<string | null>(null);
    const [windowOfDay, setWindowOfDay] = useState<AppointmentWindow | null>(null);
    const openerRef = useRef<HTMLButtonElement | null>(null);
    const sheetRef = useRef<HTMLDivElement | null>(null);

    const groups = useMemo(() => (card.mode === 'provider_slots' ? groupSlots(card.slots ?? [], card.timezone) : []), [card.mode, card.slots, card.timezone]);
    const [activeDay, setActiveDay] = useState<string | null>(null);
    const shownDay = activeDay ?? groups[0]?.day ?? null;
    const shownSlots = groups.find((g) => g.day === shownDay)?.slots ?? [];
    const external = safeHttps(card.externalUrl);

    useEffect(() => {
        if (open) sheetRef.current?.focus();
    }, [open]);

    const close = () => {
        setOpen(false);
        requestAnimationFrame(() => openerRef.current?.focus());
    };

    const heading = (
        <>
            <div className="amq-card__title" id={`${uid}-title`}>
                {card.purpose || c(lang, 'pickTitle')}
            </div>
            <p className="amq-muted amq-small">
                {c(lang, 'pickAt', { name: card.rooftopName })}
                {card.vehicleLabel ? ` · ${card.vehicleLabel}` : ''}
            </p>
        </>
    );

    if (card.mode === 'external_link') {
        return (
            <section className="amq-card" aria-labelledby={`${uid}-title`}>
                {heading}
                {external ? (
                    <a className="amq-btn amq-btn--primary amq-btn--block amq-btn--lg" href={external} target="_blank" rel="noopener noreferrer">
                        {c(lang, 'pickExternal')}
                        <ExternalIcon aria-hidden />
                    </a>
                ) : null}
                <p className="amq-muted amq-small">{c(lang, 'pickExternalNote')}</p>
            </section>
        );
    }

    const canSubmit = card.mode === 'provider_slots' ? !!slotId : !!day && !!windowOfDay;
    const submit = () => {
        if (!canSubmit || props.disabled) return;
        if (card.mode === 'provider_slots') {
            const slot = (card.slots ?? []).find((s) => s.id === slotId);
            if (!slot) return;
            props.onSelect({ pickerId: card.id, slotId: slot.id }, c(lang, 'apptSelectDisplay', { t: formatWhen(slot.start, card.timezone, lang) }));
        } else {
            props.onSelect(
                { pickerId: card.id, requestedDate: day!, requestedWindow: windowOfDay! },
                c(lang, 'apptRequestDisplay', { d: formatDay(day!, lang), w: c(lang, windowOfDay!).toLowerCase() }),
            );
        }
        // Close the sheet only. The card is replaced by the server's answer (a receipt, or a
        // fresh picker if the time was lost); it never claims an outcome on its own.
        setOpen(false);
    };

    return (
        <section className="amq-card" aria-labelledby={`${uid}-title`}>
            <header>
                <div>{heading}</div>
                {card.sandbox && <span className="amq-chip amq-chip--demo">{c(lang, 'pickSandbox')}</span>}
            </header>
            <button
                ref={openerRef}
                type="button"
                className="amq-btn amq-btn--primary amq-btn--block amq-btn--lg"
                aria-haspopup="dialog"
                aria-expanded={open}
                onClick={() => setOpen(true)}
            >
                {c(lang, 'pickOpen')}
            </button>
            <p className="amq-muted amq-small">{card.mode === 'provider_slots' ? c(lang, 'pickProviderNote') : c(lang, 'pickRequestNote')}</p>

            {open && (
                <div
                    ref={sheetRef}
                    className="amq-sheet"
                    role="dialog"
                    aria-modal="false"
                    aria-labelledby={`${uid}-sheet`}
                    tabIndex={-1}
                    onKeyDown={(e) => {
                        if (e.key === 'Escape') {
                            // Close the picker only — not the whole assistant.
                            e.stopPropagation();
                            e.nativeEvent.stopImmediatePropagation();
                            close();
                        }
                    }}
                >
                    <div className="amq-sheet__head">
                        <div>
                            <div className="amq-card__title" id={`${uid}-sheet`}>
                                {c(lang, 'pickTitle')}
                            </div>
                            <p className="amq-muted amq-small">
                                {card.rooftopName} · {c(lang, 'pickTimesIn', { tz: card.timezone.replace(/_/g, ' ') })}
                            </p>
                        </div>
                        <button type="button" className="amqur-iconbtn amq-sheet__close" aria-label={c(lang, 'pickClose')} onClick={close}>
                            <CloseIcon />
                        </button>
                    </div>

                    {card.mode === 'provider_slots' ? (
                        groups.length === 0 ? (
                            <p className="amq-small">{c(lang, 'pickNoSlots')}</p>
                        ) : (
                            <>
                                <div className="amq-slotgroup" role="group" aria-label={c(lang, 'pickDay')}>
                                    {groups.map((g) => (
                                        <button
                                            key={g.day}
                                            type="button"
                                            className="amq-slot"
                                            aria-pressed={g.day === shownDay}
                                            onClick={() => {
                                                setActiveDay(g.day);
                                                setSlotId(null);
                                            }}
                                        >
                                            {formatDay(g.day, lang)}
                                        </button>
                                    ))}
                                </div>
                                <div className="amq-slotgroup amq-slotgroup--times" role="group" aria-label={c(lang, 'pickTime')}>
                                    {shownSlots.map((s) => (
                                        <button key={s.id} type="button" className="amq-slot" aria-pressed={s.id === slotId} onClick={() => setSlotId(s.id)}>
                                            {formatWhen(s.start, card.timezone, lang, 'time')}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )
                    ) : (
                        <>
                            <div className="amq-slotgroup" role="group" aria-label={c(lang, 'pickDay')}>
                                {(card.days ?? []).map((d) => (
                                    <button key={d} type="button" className="amq-slot" aria-pressed={d === day} onClick={() => setDay(d)}>
                                        {formatDay(d, lang)}
                                    </button>
                                ))}
                            </div>
                            <div className="amq-slotgroup amq-slotgroup--times" role="group" aria-label={c(lang, 'pickWindow')}>
                                {WINDOWS.map((w) => (
                                    <button key={w} type="button" className="amq-slot" aria-pressed={w === windowOfDay} onClick={() => setWindowOfDay(w)}>
                                        {c(lang, w)}
                                    </button>
                                ))}
                            </div>
                        </>
                    )}

                    <p className="amq-muted amq-small">{card.mode === 'provider_slots' ? c(lang, 'pickProviderNote') : c(lang, 'pickRequestNote')}</p>
                    <button type="button" className="amq-btn amq-btn--primary amq-btn--block amq-btn--lg" disabled={!canSubmit || props.disabled} onClick={submit}>
                        {card.mode === 'provider_slots' ? c(lang, 'pickBook') : c(lang, 'pickRequest')}
                    </button>
                </div>
            )}
        </section>
    );
}

/**
 * Appointment outcome. A confirmation is shown only when the server marks the appointment
 * provider-confirmed AND supplies the provider's reference; anything else reads as a request.
 */
export function AppointmentReceipt({ card, lang }: { card: AppointmentCard; lang: Lang }) {
    const confirmed = card.outcome === 'confirmed' && card.verified && !!card.providerRef;
    const title = confirmed ? c(lang, 'apptConfirmedTitle') : card.outcome === 'pending' ? c(lang, 'apptPendingTitle') : c(lang, 'apptRequestedTitle');
    const when = card.startsAt && card.timezone ? formatWhen(card.startsAt, card.timezone, lang) : card.label;
    return (
        <section className={`amq-card amq-receipt ${confirmed ? 'amq-receipt--confirmed amq-card--confirmed' : 'amq-receipt--requested'}`} role="status" aria-label={title}>
            <header>
                <span className="amq-card__title">{title}</span>
                <span className={`amq-chip amq-chip--${confirmed ? 'ok' : 'neutral'}`}>
                    {confirmed ? c(lang, 'confirmed') : card.outcome === 'pending' ? c(lang, 'pending') : c(lang, 'requested')}
                </span>
            </header>
            <dl className="amq-dl amq-dl--receipt">
                <dt>{c(lang, 'when')}</dt>
                <dd>{when}</dd>
                {card.rooftopName && (
                    <>
                        <dt>{c(lang, 'location')}</dt>
                        <dd>{card.rooftopName}</dd>
                    </>
                )}
                {card.department && (
                    <>
                        <dt>{c(lang, 'department')}</dt>
                        <dd>{card.department}</dd>
                    </>
                )}
                {confirmed && (
                    <>
                        <dt>{c(lang, 'confirmationNo')}</dt>
                        <dd className="amq-mono">{card.providerRef}</dd>
                    </>
                )}
            </dl>
            {confirmed ? (
                <p className="amq-muted amq-small">
                    {card.sandbox ? c(lang, 'sandboxReceipt') : card.providerName ? c(lang, 'confirmedBy', { name: card.providerName }) : null}
                </p>
            ) : (
                <p className="amq-muted amq-small">{c(lang, 'requestNote')}</p>
            )}
        </section>
    );
}
