import { useEffect, useRef, useState } from 'react'

/**
 * Drives a looping, silent demo from a real Morse timeline.
 *
 * Three things this has to get right, none of them optional:
 *
 * 1. **Never play audio.** Browsers block autoplaying sound, and a page that
 *    started beeping on load would deserve to be closed. The demos are visual;
 *    the real thing is one click away.
 * 2. **Respect `prefers-reduced-motion`.** A looping animation is exactly what
 *    that setting exists to stop. Reduced motion gets the finished state as a
 *    still frame rather than nothing, so the feature is still communicated.
 * 3. **Only run while on screen.** Demo loops running behind the fold would
 *    burn battery animating something nobody is looking at.
 */

export interface AutoLoopOptions {
  /** Length of one pass, in milliseconds. */
  durationMs: number
  /** Silence between passes, so a repeat reads as a repeat. */
  pauseMs?: number
}

export interface AutoLoopState {
  /** Milliseconds into the current pass. Held at the end under reduced motion. */
  elapsed: number
  reducedMotion: boolean
}

export function useAutoLoop(
  ref: React.RefObject<Element | null>,
  { durationMs, pauseMs = 900 }: AutoLoopOptions,
): AutoLoopState {
  const [elapsed, setElapsed] = useState(0)
  const [reducedMotion, setReducedMotion] = useState(false)
  const [visible, setVisible] = useState(false)
  const frame = useRef<number | null>(null)

  // Read on mount rather than during render: these are prerendered in Node,
  // where matchMedia does not exist, and differing markup would tear hydration.
  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const apply = () => setReducedMotion(query.matches)
    apply()
    query.addEventListener('change', apply)
    return () => query.removeEventListener('change', apply)
  }, [])

  useEffect(() => {
    const element = ref.current
    if (!element) return

    // No IntersectionObserver means an old browser; run the loop rather than
    // silently leaving a dead panel on the page.
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true)
      return
    }

    const observer = new IntersectionObserver(
      ([entry]) => setVisible(entry?.isIntersecting ?? false),
      { threshold: 0.2 },
    )
    observer.observe(element)
    return () => observer.disconnect()
  }, [ref])

  useEffect(() => {
    if (reducedMotion) {
      // Hold the finished state, so the demo still shows what the feature does.
      setElapsed(durationMs)
      return
    }
    if (!visible) return

    const cycle = durationMs + pauseMs
    const startedAt = performance.now()

    const tick = () => {
      // Modulo against the wall clock rather than accumulating, so a tab that
      // was backgrounded resumes in the right place instead of drifting.
      setElapsed((performance.now() - startedAt) % cycle)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)

    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [visible, reducedMotion, durationMs, pauseMs])

  return { elapsed, reducedMotion }
}
