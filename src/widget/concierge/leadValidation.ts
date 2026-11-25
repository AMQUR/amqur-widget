import type { ContactChannel, Lang } from './types';
import { c, type CopyKey } from './copy';

export const CHANNEL_LABEL: Record<ContactChannel, CopyKey> = { EMAIL: 'channelEmail', CALL: 'channelCall', TEXT: 'channelText' };

export type LeadErrors = Partial<Record<'firstName' | 'lastName' | 'email' | 'phone' | 'consent', string>>;

export const isEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v.trim()) && v.trim().length <= 254;
/** US numbers: exactly 10 digits, or 11 starting with 1. */
export const phoneDigits = (v: string) => {
    const d = v.replace(/\D/g, '');
    return d.length === 11 && d.startsWith('1') ? d.slice(1) : d;
};
export const isPhone = (v: string) => phoneDigits(v).length === 10;

/** Pure validation so the rules are testable without a DOM. */
export function validateLead(
    v: { firstName: string; lastName: string; email: string; phone: string; channel: ContactChannel; consents: Partial<Record<ContactChannel, boolean>> },
    lang: Lang,
): LeadErrors {
    const e: LeadErrors = {};
    if (!v.firstName.trim()) e.firstName = c(lang, 'errRequired', { field: c(lang, 'firstName').toLowerCase() });
    if (!v.lastName.trim()) e.lastName = c(lang, 'errRequired', { field: c(lang, 'lastName').toLowerCase() });
    if (v.channel === 'EMAIL' ? !isEmail(v.email) : v.email.trim() !== '' && !isEmail(v.email)) e.email = c(lang, 'errEmail');
    if (v.channel !== 'EMAIL' ? !isPhone(v.phone) : v.phone.trim() !== '' && !isPhone(v.phone)) e.phone = c(lang, 'errPhone');
    // Being asked to use a channel is not the same as agreeing to it: the box must be ticked.
    if (!v.consents[v.channel]) e.consent = c(lang, 'errConsent', { channel: c(lang, CHANNEL_LABEL[v.channel]).toLowerCase() });
    return e;
}
