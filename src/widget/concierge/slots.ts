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
