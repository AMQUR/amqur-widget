import { describe, expect, it } from 'vitest';
import { nextFocusIndex } from './focusTrap';

describe('dialog focus order', () => {
  it('moves one control at a time in both directions', () => {
    expect(nextFocusIndex(0, 4, false)).toBe(1);
    expect(nextFocusIndex(2, 4, true)).toBe(1);
  });
  it('wraps at both ends, so focus never leaves the dialog', () => {
    expect(nextFocusIndex(3, 4, false)).toBe(0);
    expect(nextFocusIndex(0, 4, true)).toBe(3);
  });
  it('enters at the first or last control when focus is elsewhere', () => {
    expect(nextFocusIndex(-1, 4, false)).toBe(0);
    expect(nextFocusIndex(-1, 4, true)).toBe(3);
    expect(nextFocusIndex(9, 4, false)).toBe(0);
  });
  it('stays put with a single control and reports none when empty', () => {
    expect(nextFocusIndex(0, 1, false)).toBe(0);
    expect(nextFocusIndex(0, 1, true)).toBe(0);
    expect(nextFocusIndex(-1, 0, false)).toBe(-1);
  });
});
