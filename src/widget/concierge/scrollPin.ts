/**
 * "Stick to the bottom" rule for the message log.
 *
 * The log follows new content only while the customer is at the bottom. Scrolling up to read
 * releases it — even by a little, so a streaming reply can't yank them back down — and it
 * re-engages once they return to the bottom themselves.
 */
export interface ScrollSample {
    /** Current scrollTop. */
    top: number;
    /** scrollTop at the previous scroll event. */
    lastTop: number;
    /** Distance from the bottom edge: scrollHeight - scrollTop - clientHeight. */
    distance: number;
}

export const RELEASE_PX = 24;
export const REPIN_PX = 48;

export function nextPinned(pinned: boolean, s: ScrollSample): boolean {
    // Moving up and away from the bottom is always the customer (our own scrolling only goes down).
    if (s.top < s.lastTop - 1 && s.distance > RELEASE_PX) return false;
    if (s.distance <= REPIN_PX && s.top >= s.lastTop - 1) return true;
    return pinned;
}
