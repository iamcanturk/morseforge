import { useCallback, useEffect, useRef } from 'react'

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
 */
export function useGameLoop(running: boolean, onFrame: (dtMs: number) => void): void {
  const frame = useRef<number | null>(null)
  const last = useRef<number>(0)

  const callback = useRef(onFrame)
  callback.current = onFrame

  /** Longer than this is a pause, not a frame. Three frames at 20fps. */
  const MAX_STEP = 150

  const tick = useCallback((now: number) => {
    const dt = last.current === 0 ? 0 : now - last.current
    last.current = now
    if (dt > 0) callback.current(Math.min(dt, MAX_STEP))
    frame.current = requestAnimationFrame(tick)
  }, [])

  useEffect(() => {
    if (!running) return

    last.current = 0
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
