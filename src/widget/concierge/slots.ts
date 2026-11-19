import type { AppointmentSlot } from './types';
import { localDayKey } from './copy';

/** Slots still on offer, grouped by the store's local calendar day, in time order. */
export function groupSlots(slots: AppointmentSlot[], timeZone: string, now: number = Date.now()): Array<{ day: string; slots: AppointmentSlot[] }> {
    const live = slots
        .filter((s) => Date.parse(s.start) > now && (!s.expiresAt || Date.parse(s.expiresAt) > now))
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start));
    const days = new Map<string, AppointmentSlot[]>();
    for (const s of live) {
        const key = localDayKey(s.start, timeZone);
        days.set(key, [...(days.get(key) ?? []), s]);
    }
    return [...days.entries()].map(([day, list]) => ({ day, slots: list }));
}

/**
 * Milliseconds to add to the device clock to get server time, measured once when the card
 * arrives. Without a server timestamp the device clock is used as is. The server remains the
 * authority on whether a slot can still be booked; this only decides what is worth showing.
 */
export function clockSkewMs(serverNow: string | null | undefined, deviceNow: number = Date.now()): number {
    const t = serverNow ? Date.parse(serverNow) : NaN;
    return Number.isNaN(t) ? 0 : t - deviceNow;
}
