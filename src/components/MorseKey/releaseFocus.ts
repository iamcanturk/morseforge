/**
 * A finger tap leaves focus on the button it tapped, and Space would then
 * press that button instead of keying. Hand focus back to the page — but
 * only for pointer clicks (`detail > 0`), so a keyboard user's place in the
 * tab order is never taken from them.
 *
 * Structural rather than tied to React's event type, so an SVG pad, a button
 * and a test double all fit. No styles are imported here, so any screen can
 * use it without pulling in the sending desk's CSS.
 */
export function releaseFocus(event: { detail: number; currentTarget: { blur: () => void } }): void {
  if (event.detail > 0) event.currentTarget.blur()
}
