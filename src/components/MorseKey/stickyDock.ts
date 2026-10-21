/**
 * Room for the telegraph's sticky tape dock in the page's scroll padding
 * (A11Y-04, A11Y-13, DEC-045, contract C-2).
 *
 * Below `lg` the tape sticks under the header, so the code being keyed stays
 * in view while the page scrolls. The header's height is already in
 * `scroll-padding-top`; the dock's is not, so Shift+Tab back to the key used
 * to scroll it up behind the tape, with only the bottom of its focus ring
 * showing. `--mf-sticky-extra` is the one property a page sets to add a sticky
 * layer of its own to that padding. This keeps it equal to the dock's height
 * plus a small gap while the dock sticks, and removes it the moment it stops
 * sticking (wider screens, short screens, the dock gone).
 *
 * Whether it sticks is read from the computed style rather than repeated
 * here: the media query lives in pkg-c.css, in one place.
 */

/** The custom property `global.css` adds to `scroll-padding-top`. */
export const STICKY_EXTRA = '--mf-sticky-extra'

/** Clear space between the dock's bottom edge and whatever takes focus. */
export const STICKY_GAP_PX = 8

/** The few browser facts this needs, so the rule is testable without a DOM. */
export interface DockEnvironment<E> {
  /** Where the property is written: `document.documentElement`. */
  root: { style: Pick<CSSStyleDeclaration, 'setProperty' | 'removeProperty'> }
  isSticky: (element: E) => boolean
  height: (element: E) => number
  /** Call `onChange` whenever the dock's size or the viewport changes. Returns a stop. */
  watch: (element: E, onChange: () => void) => () => void
}

/** The value to publish for a dock, or null when it is not sticking. */
export function stickyExtra(sticky: boolean, height: number): string | null {
  if (!sticky || !(height > 0)) return null
  return `${Math.ceil(height) + STICKY_GAP_PX}px`
}

/** Keep `--mf-sticky-extra` in step with the dock. Returns a stop that clears it. */
export function publishStickyDock<E>(element: E, env: DockEnvironment<E>): () => void {
  const update = () => {
    const value = stickyExtra(env.isSticky(element), env.height(element))
    if (value === null) env.root.style.removeProperty(STICKY_EXTRA)
    else env.root.style.setProperty(STICKY_EXTRA, value)
  }
  update()
  const stop = env.watch(element, update)
  return () => {
    stop()
    env.root.style.removeProperty(STICKY_EXTRA)
  }
}

/** The real browser: computed style, layout box, a ResizeObserver and the window's resize. */
export function browserDockEnvironment(): DockEnvironment<HTMLElement> {
  return {
    root: document.documentElement,
    isSticky: (element) => getComputedStyle(element).position === 'sticky',
    height: (element) => element.getBoundingClientRect().height,
    watch: (element, onChange) => {
      // The dock resizes when a target line is printed on the tape; the
      // viewport resizing can flip the media query without the dock changing.
      const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(onChange)
      observer?.observe(element)
      window.addEventListener('resize', onChange)
      return () => {
        observer?.disconnect()
        window.removeEventListener('resize', onChange)
      }
    },
  }
}
