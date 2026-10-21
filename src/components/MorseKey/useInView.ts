import { useEffect, useState, type RefObject } from 'react'

/**
 * Whether an element is on screen, for scoping the Space key to an instrument
 * (DEC-028).
 *
 * A screen that keys from a `window` listener takes Space from the whole page,
 * so a visitor reading the prose or the FAQ below the instrument could not
 * page down: the tone sounded and a character printed on a tape they could
 * not see. With this, Space keys only while the instrument is in view, and
 * scrolls the page everywhere else.
 */

/** How much of the element must be visible before Space keys it. */
export const IN_VIEW_THRESHOLD = 0.25

type ObserverConstructor = new (
  callback: IntersectionObserverCallback,
  options?: IntersectionObserverInit,
) => Pick<IntersectionObserver, 'observe' | 'disconnect'>

/** The part of an observer entry the rule reads. */
export type ViewEntry = Pick<IntersectionObserverEntry, 'isIntersecting' | 'intersectionRatio'>

/**
 * The rule, kept pure: visible, and by at least the threshold. A hair of
 * slack, because the browser reports the crossing at a ratio that can round
 * to just under it.
 */
export function isInView(entry: ViewEntry, threshold: number = IN_VIEW_THRESHOLD): boolean {
  return entry.isIntersecting && entry.intersectionRatio >= threshold - 0.005
}

/**
 * Watch an element and report each change of "in view". Returns a stop
 * function.
 *
 * Without `IntersectionObserver` it reports true once and stops: a key that
 * always works is better than one that never does.
 */
export function watchInView(
  element: Element,
  onChange: (inView: boolean) => void,
  {
    threshold = IN_VIEW_THRESHOLD,
    Observer = globalThis.IntersectionObserver as ObserverConstructor | undefined,
  }: { threshold?: number; Observer?: ObserverConstructor } = {},
): () => void {
  if (typeof Observer !== 'function') {
    onChange(true)
    return () => {}
  }
  const observer = new Observer(
    (entries) => {
      const entry = entries.at(-1)
      if (entry) onChange(isInView(entry, threshold))
    },
    { threshold: [0, threshold] },
  )
  observer.observe(element)
  return () => observer.disconnect()
}

/**
 * React handle on `watchInView`. Starts true, so the key works from the first
 * frame on a page that opens on the instrument; the observer corrects it
 * within a frame of mounting.
 */
export function useInView(
  ref: RefObject<Element | null>,
  { threshold = IN_VIEW_THRESHOLD, enabled = true }: { threshold?: number; enabled?: boolean } = {},
): boolean {
  const [inView, setInView] = useState(true)
  useEffect(() => {
    const element = ref.current
    if (!enabled || !element) return
    return watchInView(element, setInView, { threshold })
  }, [ref, threshold, enabled])
  return inView
}
