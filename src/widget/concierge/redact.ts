/**
 * Masks contact and identity details before any transcript text is written to browser storage.
 * The live conversation keeps the original text in memory; the server holds the real record.
 * Deliberately conservative: it would rather mask a harmless number than persist a phone.
 */
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const SSN = /\b\d{3}[- ]?\d{2}[- ]?\d{4}\b/g;
/**
 * 7+ digits allowing the usual separators. VINs are untouched: they are never all digits.
 * Written without lookbehind so the bundle still parses on older Safari.
 */
const PHONE = /(^|[^A-Za-z0-9])(\+?\d[\d\s().-]{5,}\d)(?![A-Za-z0-9])/g;

export function redactForStorage(text: string): string {
    if (!text) return text;
    return text
        .replace(EMAIL, '[email hidden]')
        .replace(SSN, '[number hidden]')
        .replace(PHONE, (m: string, lead: string, body: string) => (body.replace(/\D/g, '').length >= 7 ? `${lead}[number hidden]` : m));
}
