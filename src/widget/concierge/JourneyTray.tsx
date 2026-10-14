import type { Journey, Lang } from './types';
import { c, money } from './copy';

/** Persistent, compact summary of what the customer is working on. */
export function JourneyTray({ journey, lang }: { journey: Journey; lang: Lang }) {
    const items: Array<{ k: string; label: string; value: string }> = [];
    if (journey.selectedVehicle) items.push({ k: 'v', label: c(lang, 'vehicle'), value: journey.selectedVehicle.label });
    if (journey.payment) items.push({ k: 'p', label: c(lang, 'estimate'), value: `${money(journey.payment.monthly, lang)}/mo` });
    if (journey.trade) items.push({ k: 't', label: c(lang, 'trade'), value: journey.trade.summary });
    if (journey.appointment) items.push({ k: 'a', label: c(lang, 'appointment'), value: `${journey.appointment.label} · ${journey.appointment.status === 'CONFIRMED' ? c(lang, 'confirmed') : c(lang, 'requested')}` });
    if (journey.otdQuote) items.push({ k: 'o', label: c(lang, 'otd'), value: journey.otdQuote.total != null ? money(journey.otdQuote.total, lang) : c(lang, 'otdReq') });
    if (journey.creditApplication) items.push({ k: 'c', label: c(lang, 'credit'), value: journey.creditApplication.state === 'PREVIEW' ? c(lang, 'creditPreview') : c(lang, 'creditOffered') });
    if (journey.service?.need || journey.service?.vehicle)
        items.push({ k: 's', label: c(lang, 'serviceNeed'), value: [journey.service.need, journey.service.vehicle].filter(Boolean).join(' · ') });
    if (journey.parts?.need) items.push({ k: 'pa', label: c(lang, 'partsNeed'), value: journey.parts.need });
    if (journey.handoff) items.push({ k: 'h', label: c(lang, 'team'), value: journey.handoff.state === 'notified' ? c(lang, 'handoffNotified') : journey.handoff.state === 'queued' ? c(lang, 'handoffQueued') : c(lang, 'handoffLogged') });
    if (!items.length) return null;
    return (
        <nav className="amq-tray" aria-label={c(lang, 'journey')}>
            <ul>
                {items.map((i) => (
                    <li key={i.k} title={`${i.label}: ${i.value}`}>
                        <span className="amq-tray__label">{i.label}</span>
                        <span className="amq-tray__value">{i.value}</span>
                    </li>
                ))}
            </ul>
        </nav>
    );
}
