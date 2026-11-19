import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { CardView } from './Cards';
import { VehicleCard } from './VehicleCard';
import { createSseParser } from '../api/chat.api';
import { redactForStorage } from './redact';
import { isEmail, isPhone, phoneDigits, validateLead } from './leadValidation';
import { clockSkewMs, groupSlots } from './slots';
import { c, formatDay, formatWhen, localDayKey } from './copy';
import { assetBaseFromScript, resolveTheme } from '../theme';
import type { AppointmentCard, AppointmentPickerCard, Card, LeadFormCard, Vehicle } from './types';

const render = (card: Card, actions?: Parameters<typeof CardView>[0]['actions'], lang: 'en' | 'es' = 'en') =>
    renderToStaticMarkup(<CardView card={card} lang={lang} apiBaseUrl="http://localhost:3001" actions={actions} />);

describe('SSE parser', () => {
    it('reassembles events split across arbitrary chunk boundaries', () => {
        const parse = createSseParser();
        const wire =
            'data: {"type":"turn.started","turnId":"t1"}\n\n' +
            'event: text.delta\ndata: {"type":"text.delta","index":0,"text":"Hel"}\n\n' +
            'data: {"type":"text.delta","index":0,"text":"lo"}\n\n';
        const events = [];
        for (let i = 0; i < wire.length; i += 7) events.push(...parse(wire.slice(i, i + 7)));
        expect(events.map((e) => e.type)).toEqual(['turn.started', 'text.delta', 'text.delta']);
        expect(events.filter((e) => e.type === 'text.delta').map((e) => (e.type === 'text.delta' ? e.text : '')).join('')).toBe('Hello');
    });
    it('tolerates CRLF framing, comments, malformed frames and unknown event types', () => {
        const parse = createSseParser();
        const events = parse(': keep-alive\r\n\r\ndata: not json\r\n\r\ndata: {"type":"future.event","x":1}\r\n\r\ndata: {"no":"type"}\r\n\r\n');
        expect(events).toHaveLength(1);
        expect((events[0] as { type: string }).type).toBe('future.event');
    });
    it('holds back an incomplete trailing frame', () => {
        const parse = createSseParser();
        expect(parse('data: {"type":"text.done","index":0}')).toEqual([]);
        expect(parse('\n\n')).toEqual([{ type: 'text.done', index: 0 }]);
    });
});

describe('transcript redaction before browser storage', () => {
    it('masks emails, phone numbers and SSN-shaped numbers', () => {
        const out = redactForStorage('Reach me at pat@example.invalid or (312) 555-0142, ssn 123-45-6789');
        expect(out).not.toMatch(/example\.invalid|555|0142|6789/);
        expect(out).toContain('[email hidden]');
        expect(out).toContain('[number hidden]');
    });
    it('masks a bare 10-digit number and a +1 number', () => {
        expect(redactForStorage('3125550142')).toBe('[number hidden]');
        expect(redactForStorage('call +1 312 555 0142 today')).toBe('call [number hidden] today');
    });
    it('leaves VINs, prices, years and short numbers readable', () => {
        const text = '2026 Grand Cherokee VIN 1C4RJKBG5S8700001 at $48,995, 60 months, stock J1234';
        expect(redactForStorage(text)).toBe(text);
    });
});

describe('lead form validation', () => {
    const base = { firstName: 'Sam', lastName: 'Rivera', email: 'sam@example.invalid', phone: '', channel: 'EMAIL' as const, consents: { EMAIL: true } };
    it('accepts a complete email lead', () => {
        expect(validateLead(base, 'en')).toEqual({});
    });
    it('requires the consent box for the chosen channel — a phone number alone is not permission', () => {
        const errors = validateLead({ ...base, channel: 'TEXT', phone: '312-555-0142', consents: { EMAIL: true } }, 'en');
        expect(errors.consent).toMatch(/text message/i);
    });
    it('requires a phone for call/text and an email for email', () => {
        expect(validateLead({ ...base, channel: 'CALL', consents: { CALL: true } }, 'en').phone).toBeTruthy();
        expect(validateLead({ ...base, email: '', consents: { EMAIL: true } }, 'en').email).toBeTruthy();
    });
    it('validates optional fields only when filled, and localises errors', () => {
        expect(validateLead({ ...base, phone: '12' }, 'en').phone).toBeTruthy();
        expect(validateLead({ ...base, firstName: ' ' }, 'es').firstName).toMatch(/Escriba/);
    });
    it('phone and email helpers', () => {
        expect(isPhone('(312) 555-0142')).toBe(true);
        expect(phoneDigits('+1 (312) 555-0142')).toBe('3125550142');
        expect(isPhone('555-0142')).toBe(false);
        expect(isEmail('a@b.co')).toBe(true);
        expect(isEmail('a@b')).toBe(false);
    });
});

describe('lead form card', () => {
    const card: LeadFormCard = {
        kind: 'lead_form',
        id: 'lf1',
        purpose: 'test_drive',
        rooftopName: 'Jeep of Chicago',
        vehicleLabel: '2026 Jeep Grand Cherokee Limited',
        channels: ['EMAIL', 'TEXT'],
        consent: { version: 'v-test-1', text: { EMAIL: 'Email me about this request.', TEXT: 'Text me about this request. Msg & data rates may apply. Reply STOP to opt out.' } },
    };
    it('renders labelled fields, unticked consent using the server wording, and no sensitive fields', () => {
        const html = render(card, { onLead: () => undefined, interactive: true });
        expect(html).toContain('How should Jeep of Chicago reach you?');
        expect(html).toContain('autoComplete="given-name"');
        expect(html).toContain('Reply STOP to opt out.');
        expect(html).not.toMatch(/type="checkbox"[^>]*checked/); // consent is never pre-ticked
        expect(html.match(/type="checkbox"/g)).toHaveLength(2);
        expect(html).not.toMatch(/ssn|social security number|date of birth|income/i);
        expect(html).toMatch(/Do not include Social Security/);
    });
    it('is not offered again from history or without a handler', () => {
        expect(render(card)).toBe('');
        expect(render(card, { onLead: () => undefined, interactive: false })).toBe('');
    });
});

describe('appointment outcome: a request must never read as a booking', () => {
    const base: AppointmentCard = {
        kind: 'appointment',
        id: 'a1',
        type: 'TEST_DRIVE',
        status: 'REQUESTED',
        outcome: 'requested',
        date: null,
        time: null,
        label: 'Sat, Nov 21 · afternoon',
        verified: false,
        rooftopName: 'Jeep of Chicago',
    };
    it('requested', () => {
        const html = render(base);
        expect(html).toContain('Request sent — not booked yet');
        expect(html).not.toContain('Appointment confirmed');
        expect(html).not.toContain('Confirmation');
    });
    it('confirmed only with a verified provider reference', () => {
        const confirmed: AppointmentCard = {
            ...base,
            status: 'CONFIRMED',
            outcome: 'confirmed',
            verified: true,
            providerRef: 'SBX-7F3K2',
            providerName: 'Sandbox scheduler',
            startsAt: '2026-11-21T20:30:00Z',
            timezone: 'America/Chicago',
            sandbox: true,
        };
        const html = render(confirmed);
        expect(html).toContain('Appointment confirmed');
        expect(html).toContain('SBX-7F3K2');
        expect(html).toContain('2:30');
        expect(html).toContain('Demo scheduler');
    });
    it('a "confirmed" outcome without a provider reference or verification is downgraded', () => {
        expect(render({ ...base, outcome: 'confirmed', verified: true, providerRef: null })).toContain('Request sent — not booked yet');
        expect(render({ ...base, outcome: 'confirmed', verified: false, providerRef: 'X' })).not.toContain('Appointment confirmed');
    });
    it('Spanish keeps the same distinction', () => {
        expect(render(base, undefined, 'es')).toContain('aún no reservada');
    });
});

describe('appointment picker', () => {
    const picker: AppointmentPickerCard = {
        kind: 'appointment_picker',
        id: 'p1',
        department: 'service',
        purpose: 'Brake inspection',
        rooftopName: 'Dial Nissan of Chicago',
        timezone: 'America/Chicago',
        mode: 'external_link',
        externalUrl: 'https://scheduler.example.invalid/book?accessToken=abc',
    };
    it('external link says nothing is booked here and opens safely', () => {
        const html = render(picker);
        expect(html).toContain('Nothing is booked from this chat.');
        expect(html).toContain('rel="noopener noreferrer"');
        expect(html).toContain('target="_blank"');
    });
    it('refuses a non-https scheduler URL', () => {
        expect(render({ ...picker, externalUrl: 'javascript:alert(1)' })).not.toContain('href=');
        expect(render({ ...picker, externalUrl: 'http://insecure.example.invalid' })).not.toContain('href=');
    });
    it('request-only mode states that staff confirm; provider mode states when it becomes a booking', () => {
        const actions = { onAppointment: () => undefined, interactive: true };
        expect(render({ ...picker, mode: 'request_only', days: ['2026-11-20'] }, actions)).toContain('It is not booked until the team confirms');
        expect(render({ ...picker, mode: 'provider_slots', slots: [], sandbox: true }, actions)).toContain('booked only after the scheduler confirms');
        expect(render({ ...picker, mode: 'provider_slots', slots: [], sandbox: true }, actions)).toContain('Demo scheduler');
    });
    it('groups live slots by the store-local day and drops past or expired ones', () => {
        const now = Date.parse('2026-11-20T12:00:00Z');
        const groups = groupSlots(
            [
                { id: 'late', start: '2026-11-21T04:30:00Z' }, // 10:30pm Nov 20 in Chicago
                { id: 'next', start: '2026-11-21T15:00:00Z' },
                { id: 'past', start: '2026-11-20T11:00:00Z' },
                { id: 'expired', start: '2026-11-22T15:00:00Z', expiresAt: '2026-11-20T11:59:00Z' },
            ],
            'America/Chicago',
            now,
        );
        expect(groups).toEqual([
            { day: '2026-11-20', slots: [{ id: 'late', start: '2026-11-21T04:30:00Z' }] },
            { day: '2026-11-21', slots: [{ id: 'next', start: '2026-11-21T15:00:00Z' }] },
        ]);
    });
});

describe('device clock correction', () => {
    it('uses the server timestamp so a wrong device clock cannot hide live slots', () => {
        const serverNow = '2026-10-13T15:00:00Z';
        const deviceNow = Date.parse('2026-11-18T20:00:00Z'); // device is five weeks ahead
        const skew = clockSkewMs(serverNow, deviceNow);
        const slots = [{ id: 'a', start: '2026-10-14T15:00:00Z', expiresAt: '2026-10-13T15:15:00Z' }];
        expect(groupSlots(slots, 'America/Chicago', deviceNow)).toEqual([]);
        expect(groupSlots(slots, 'America/Chicago', deviceNow + skew)).toHaveLength(1);
    });
    it('falls back to the device clock without a usable server timestamp', () => {
        expect(clockSkewMs(null, 1000)).toBe(0);
        expect(clockSkewMs('not a date', 1000)).toBe(0);
    });
});

describe('store-timezone formatting', () => {
    it('renders in the store zone, not the device zone', () => {
        expect(formatWhen('2026-11-21T15:00:00Z', 'America/Chicago', 'en', 'time')).toMatch(/9:00/);
        expect(localDayKey('2026-11-21T04:30:00Z', 'America/Chicago')).toBe('2026-11-20');
    });
    it('formats a calendar day without shifting it', () => {
        expect(formatDay('2026-11-20', 'en')).toMatch(/Nov 20/);
        expect(formatDay('2026-11-20', 'es')).toMatch(/20/);
    });
});

describe('vehicle card provenance', () => {
    const v: Vehicle = {
        vin: '1C4RJKBG5S8700001',
        stock: 'J1001',
        year: 2026,
        make: 'Jeep',
        model: 'Grand Cherokee',
        trim: 'Limited',
        price: 48995,
        photos: ['https://img.example.invalid/1.jpg', 'https://img.example.invalid/2.jpg'],
        vdpUrl: 'https://www.jeepofchicago.com/inventory/abc',
        rooftopName: 'Jeep of Chicago',
        priceIncludesDealerFees: false,
        lastSeenAt: '2026-11-18T12:00:00Z',
        freshnessState: 'FRESH',
    };
    const html = (veh: Vehicle) =>
        renderToStaticMarkup(
            <VehicleCard v={veh} lang="en" paymentsEnabled savedEnabled={false} compareEnabled={false} saved={false} inCompare={false} onAsk={() => undefined} onToggleSave={() => undefined} onToggleCompare={() => undefined} />,
        );
    it('shows the owning rooftop, fee treatment, listing date, VIN tail, a gallery and a safe VDP link', () => {
        const out = html(v);
        expect(out).toContain('At Jeep of Chicago');
        expect(out).toContain('Taxes and fees are extra.');
        expect(out).toContain('Listing checked');
        expect(out).toContain('VIN S8700001');
        expect(out).toContain('Photo 1 of 2');
        expect(out).toContain('href="https://www.jeepofchicago.com/inventory/abc"');
        expect(out).toContain('rel="noopener noreferrer"');
    });
    it('never links a non-https VDP and never claims fee inclusion it was not told', () => {
        const out = html({ ...v, vdpUrl: 'javascript:alert(1)', priceIncludesDealerFees: null });
        expect(out).not.toContain('javascript:');
        expect(out).not.toMatch(/includes dealer-required fees|fees are extra/i);
    });
});

describe('theme', () => {
    it('server theme wins, init is a fallback, unknown falls back to neutral', () => {
        expect(resolveTheme('showroom', 'neutral')).toBe('showroom');
        expect(resolveTheme(null, 'Showroom')).toBe('showroom');
        expect(resolveTheme('glass', undefined)).toBe('neutral');
    });
    it('derives the asset base from the bundle script, http(s) only', () => {
        expect(assetBaseFromScript({ src: 'https://widget.example.invalid/v1/assistant-widget.iife.js' } as HTMLScriptElement)).toBe('https://widget.example.invalid/v1/');
        expect(assetBaseFromScript({ src: 'data:text/javascript,1' } as HTMLScriptElement)).toBeNull();
        expect(assetBaseFromScript(null)).toBeNull();
    });
});

describe('copy parity', () => {
    it('new sales-desk strings exist in Spanish and differ from English', () => {
        for (const key of ['talkToPerson', 'pickRequestNote', 'apptRequestedTitle', 'leadPrivacy', 'feesExtra'] as const) {
            expect(c('es', key)).not.toBe(c('en', key));
        }
    });
});
