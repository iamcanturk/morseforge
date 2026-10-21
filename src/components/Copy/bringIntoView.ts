import { resolveMotion } from '../../hooks/useReducedMotion'
import { createSettingsStore } from '../../storage/settings'

/**
 * Show a whole instrument, then put the caret in its field (V-01).
 *
 * Focusing the field alone scrolls just far enough to show the field, which
 * left the line counter, the HUD and the lamp of a just-started run under the
 * sticky header. So the frame is brought in first, top edge below the header
 * (the page's `scroll-padding-top` supplies that offset), and the field is
 * focused without a second scroll.
 *
 * Only when the frame is not already comfortably placed: a run started with
 * its instrument in view does not jump.
 */
export function bringIntoView(frame: Element | null, field: HTMLElement | null): void {
  if (frame && typeof window !== 'undefined') {
    const top = frame.getBoundingClientRect().top
    if (needsScroll(top, window.innerHeight, scrollPaddingTop())) {
      frame.scrollIntoView({ block: 'start', behavior: prefersStill() ? 'auto' : 'smooth' })
    }
  }
  field?.focus({ preventScroll: true })
}

/**
 * Whether a frame whose top edge is at `top` (viewport px) must be scrolled:
 * when that edge is hidden under the sticky chrome, or so low that what is
 * under it starts below the middle of the screen.
 */
export function needsScroll(top: number, viewportHeight: number, padding: number): boolean {
  return top < padding || top > viewportHeight / 2
}

function scrollPaddingTop(): number {
  const value = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop)
  return Number.isFinite(value) ? value : 0
}

function prefersStill(): boolean {
  const system = window.matchMedia('(prefers-reduced-motion: reduce)').matches
  return resolveMotion(createSettingsStore().read().motion, system)
}
