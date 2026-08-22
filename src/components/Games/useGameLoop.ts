import { useCallback, useEffect, useRef } from 'react'
import { useReducedMotion } from '../../hooks/useReducedMotion'

/**
 * A frame loop that hands out real elapsed time.
 *
 * Two things it does that a bare `requestAnimationFrame` does not:
 *
 * **It clamps the step.** rAF stops in a hidden tab, so returning to one after
 * a minute away delivers a single 60,000ms frame. Passed straight through,
 * that teleports every falling signal past the floor and ends the run while
 * the player was reading something else. Anything longer than a slow frame is
 * treated as a pause rather than as time that happened.
 *
 * **It reads `running` from a ref.** The callback identity changes on every
 * render of a game — it closes over the state — and restarting the loop each
 * time would reset the frame clock, so the first step after every render would
 * be zero and nothing would ever move.
 *
 * **It honours reduced motion.** Both games move something continuously across
 * a large area, which is precisely what that setting exists to stop, and they
 * are the most motion-heavy screens on the site. Under it the game does not
 * stop and does not slow down — it advances in quarter-second steps instead of
 * sixty a second, so the same amount of time passes and the same difficulty
 * applies, but nothing slides. Disabling the games instead would exclude
 * someone rather than accommodate them.
 */

/** How long a step lasts under reduced motion. Four updates a second. */
const REDUCED_STEP_MS = 250

export function useGameLoop(running: boolean, onFrame: (dtMs: number) => void): void {
  const frame = useRef<number | null>(null)
  const last = useRef<number>(0)
  /** Time held back between steps under reduced motion. */
  const pending = useRef<number>(0)

  const callback = useRef(onFrame)
  callback.current = onFrame

  const reducedMotion = useReducedMotion()
  const reduced = useRef(reducedMotion)
  reduced.current = reducedMotion

  /** Longer than this is a pause, not a frame. Three frames at 20fps. */
  const MAX_STEP = 150

  const tick = useCallback((now: number) => {
    const dt = last.current === 0 ? 0 : now - last.current
    last.current = now

    if (dt > 0) {
      const step = Math.min(dt, MAX_STEP)
      if (reduced.current) {
        // Accumulated and released in one lump, so the game advances at the
        // same rate — it just does it in visible increments rather than
        // continuously.
        pending.current += step
        if (pending.current >= REDUCED_STEP_MS) {
          callback.current(pending.current)
          pending.current = 0
        }
      } else {
        callback.current(step)
      }
    }
    frame.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (!running) return

    last.current = 0
    pending.current = 0
    frame.current = requestAnimationFrame(tick)
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      frame.current = null
    }
  }, [running, tick])

  // Coming back from another tab restarts the clock rather than counting the
  // time away as a frame.
  useEffect(() => {
    const onVisible = () => {
      if (!document.hidden) last.current = 0
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])
}
