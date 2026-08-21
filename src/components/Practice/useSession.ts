import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Attempt,
  type SessionConfig,
  type SessionSummary,
  isFinished,
  pickNext,
  remainingMs,
  summarize,
} from '../../game/session'
import { SESSION_MODES } from '../../game/session'
import { answer as recordAnswer, createProgressStore, getCharacter } from '../../storage/progress'
import type { ReviewState } from '../../game/spacedRepetition'

/**
 * Runs a practice session in React (PROJECT.md §12, §14, §39.4).
 *
 * The rules live in `game/session.ts` and are tested there; this only holds the
 * state and the clock. Free practice and the sixty-second challenge use the
 * same hook with a different config.
 */

export type SessionStatus = 'idle' | 'running' | 'finished'

export interface UseSessionResult {
  status: SessionStatus
  /** The character being asked about, or null between prompts. */
  current: string | null
  attempts: readonly Attempt[]
  /** Milliseconds left, or null when untimed. */
  remaining: number | null
  summary: SessionSummary | null
  start: () => void
  /** Grade an answer and move on. Returns whether it was right. */
  submit: (given: string) => boolean
  stop: () => void
  reset: () => void
}

export function useSession(config: SessionConfig): UseSessionResult {
  const progressStore = useMemo(() => createProgressStore(), [])

  const [status, setStatus] = useState<SessionStatus>('idle')
  const [current, setCurrent] = useState<string | null>(null)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [remaining, setRemaining] = useState<number | null>(config.durationMs)
  const [summary, setSummary] = useState<SessionSummary | null>(null)

  const startedAt = useRef<number | null>(null)
  const promptedAt = useRef<number>(0)
  const recent = useRef<string[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  // The config can be a fresh object every render; the session must not restart
  // because the parent re-rendered.
  const configRef = useRef(config)
  configRef.current = config

  const stopTimer = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current)
    timer.current = null
  }, [])

  const finish = useCallback(
    (finalAttempts: readonly Attempt[]) => {
      stopTimer()
      const elapsed = startedAt.current === null ? 0 : performance.now() - startedAt.current
      setSummary(summarize(finalAttempts, elapsed))
      setStatus('finished')
      setCurrent(null)
    },
    [stopTimer],
  )

  /** Schedules per character, so prompts go to whatever is closest to forgotten. */
  const schedules = useCallback((): Record<string, ReviewState> => {
    const progress = progressStore.read()
    const now = Date.now()
    return Object.fromEntries(
      configRef.current.characters.map((character) => [
        character,
        getCharacter(progress, character, now).schedule,
      ]),
    )
  }, [progressStore])

  const advance = useCallback(() => {
    const next = pickNext(configRef.current.characters, {
      schedules: schedules(),
      recent: recent.current,
    })
    setCurrent(next)
    promptedAt.current = performance.now()
  }, [schedules])

  const start = useCallback(() => {
    setAttempts([])
    setSummary(null)
    recent.current = []
    startedAt.current = performance.now()
    setStatus('running')
    setRemaining(configRef.current.durationMs)
    advance()

    // A timed session has to end on the clock even if the user stops answering,
    // so the deadline cannot be checked only when an answer arrives.
    if (configRef.current.durationMs !== null) {
      stopTimer()
      timer.current = setInterval(() => {
        const elapsed = performance.now() - (startedAt.current ?? 0)
        setRemaining(remainingMs(configRef.current, elapsed))
        if (elapsed >= (configRef.current.durationMs ?? Infinity)) {
          setAttempts((collected) => {
            finish(collected)
            return collected
          })
        }
      }, 100)
    }
  }, [advance, finish, stopTimer])

  const submit = useCallback(
    (given: string): boolean => {
      if (status !== 'running' || current === null) return false

      const cleaned = given.trim().toUpperCase()
      const correct = cleaned === current
      const attempt: Attempt = {
        character: current,
        answer: cleaned,
        correct,
        elapsedMs: performance.now() - promptedAt.current,
      }

      // Recorded against the tracked skill for this mode, so a session feeds
      // mastery and the review schedule rather than being a throwaway score.
      progressStore.update((progress) =>
        recordAnswer(
          progress,
          attempt.character,
          SESSION_MODES[configRef.current.mode].skill,
          correct,
          Date.now(),
        ),
      )

      recent.current = [...recent.current, current].slice(-4)

      setAttempts((collected) => {
        const next = [...collected, attempt]
        const elapsed = performance.now() - (startedAt.current ?? 0)
        if (isFinished(configRef.current, next, elapsed)) finish(next)
        else advance()
        return next
      })

      return correct
    },
    [status, current, progressStore, advance, finish],
  )

  const stop = useCallback(() => {
    setAttempts((collected) => {
      finish(collected)
      return collected
    })
  }, [finish])

  const reset = useCallback(() => {
    stopTimer()
    setStatus('idle')
    setCurrent(null)
    setAttempts([])
    setSummary(null)
    setRemaining(configRef.current.durationMs)
    startedAt.current = null
    recent.current = []
  }, [stopTimer])

  useEffect(() => stopTimer, [stopTimer])

  return { status, current, attempts, remaining, summary, start, submit, stop, reset }
}
