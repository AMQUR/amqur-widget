/**
 * Index of the control that should receive focus after Tab / Shift+Tab inside a dialog with
 * `count` focusable controls, when `current` holds focus (-1 = focus is not on any of them).
 * Wraps at both ends so focus can never leave the dialog.
 */
export function nextFocusIndex(current: number, count: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (current < 0 || current >= count) return backwards ? count - 1 : 0;
  return (current + (backwards ? count - 1 : 1)) % count;
}
