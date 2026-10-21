import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  type Attempt,
  type SessionClock,
  type SessionConfig,
  type SessionSummary,
  clockElapsed,
  holdClock,
  isFinished,
  pickNext,
  releaseClock,
  remainingMs,
  seededPrompts,
  startClock,
  summarize,
  type PromptSource,
} from '../../game/session'
import { SESSION_MODES } from '../../game/session'
import { answer as recordAnswer, createProgressStore, getCharacter } from '../../storage/progress'
import { applySession, createStatsStore } from '../../storage/stats'
import { achievementSnapshot } from '../../storage/snapshot'
import { newlyEarned, type Achievement } from '../../game/achievements'
import { xpForAnswer } from '../../game/progression'
import { track } from '../../analytics/track'
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
  /**
   * Counts prompts. A small pool can ask the same character twice in a row
   * (J-02), and then `current` does not change, so anything that must happen
   * once per prompt (sending it, resetting the key) keys on this instead.
   */
  promptId: number
  attempts: readonly Attempt[]
  /** Milliseconds left, or null when untimed. */
  remaining: number | null
  summary: SessionSummary | null
  /** Achievements this session earned. Empty unless it just crossed one. */
  earned: readonly Achievement[]
  start: () => void
  /** Grade an answer and move on. Returns whether it was right. */
  submit: (given: string) => boolean
  stop: () => void
  reset: () => void
  /**
   * Stop the clock while the screen waits before the next prompt
   * (NEXT_PROMPT_DELAY_MS). A timed run neither loses the wait nor ends
   * during it, and the summary's time excludes it.
   */
  holdClock: () => void
  /** Restart the clock as the prompt begins, crediting the hold back. */
  releaseClock: () => void
}

export function useSession(config: SessionConfig): UseSessionResult {
  const progressStore = useMemo(() => createProgressStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])

  const [status, setStatus] = useState<SessionStatus>('idle')
  const [current, setCurrent] = useState<string | null>(null)
  const [promptId, setPromptId] = useState(0)
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [remaining, setRemaining] = useState<number | null>(config.durationMs)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [earned, setEarned] = useState<readonly Achievement[]>([])

  // Taken before the session writes anything, because "newly earned" can only
  // be answered by comparing the two — once the session is banked, an
  // achievement earned two months ago looks identical to one earned just now.
  const before = useRef<ReturnType<typeof achievementSnapshot> | null>(null)
  /** The run's clock (`game/session.ts`), null before the first start. */
  const clock = useRef<SessionClock | null>(null)
  const promptedAt = useRef<number>(0)
  const recent = useRef<string[]>([])
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)
  /** The seeded sequence, when the config has a seed (the shared challenge). */
  const source = useRef<PromptSource | null>(null)
  /**
   * The answers so far, outside React state. `finish` used to run inside a
   * `setAttempts` updater, and React may run an updater twice (it does in
   * development), which banked a session twice. Side effects now read this.
   */
  const attemptsRef = useRef<Attempt[]>([])
  /** Set once a run has been banked, so a late answer or tick cannot bank it again. */
  const finished = useRef(false)

  // The config can be a fresh object every render; the session must not restart
  // because the parent re-rendered.
  const configRef = useRef(config)
  configRef.current = config

  const stopTimer = useCallback(() => {
    if (timer.current !== null) clearInterval(timer.current)
    timer.current = null
  }, [])

  /** The learner's time so far, without the screen's own waits. */
  const elapsedNow = useCallback(
    () => (clock.current === null ? 0 : clockElapsed(clock.current, performance.now())),
    [],
  )

  const finish = useCallback(
    (finalAttempts: readonly Attempt[]) => {
      stopTimer()
      if (finished.current) return
      finished.current = true
      const result = summarize(finalAttempts, elapsedNow())

      // XP is earned per correct answer, weighted by difficulty, so a session
      // of E and T does not pay the same as one that included Q and Z.
      const xpEarned = finalAttempts
        .filter((attempt) => attempt.correct)
        .reduce((sum, attempt) => sum + xpForAnswer(attempt.character), 0)

      statsStore.update((stats) => applySession(stats, result, xpEarned, Date.now()))
      // Reported from the hook rather than the screen: the challenge and free
      // practice share it, and a session can end on the clock without anyone
      // pressing anything.
      track('practice_finish', SESSION_MODES[configRef.current.mode].skill)

      const after = achievementSnapshot(progressStore.read(), statsStore.read())
      setEarned(newlyEarned(before.current ?? after, after))

      setSummary(result)
      setStatus('finished')
      setCurrent(null)
    },
    [stopTimer, elapsedNow, statsStore, progressStore],
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
    const next = source.current
      ? source.current.next()
      : pickNext(configRef.current.characters, {
          schedules: schedules(),
          recent: recent.current,
        })
    setCurrent(next)
    setPromptId((id) => id + 1)
    promptedAt.current = performance.now()
  }, [schedules])

  const start = useCallback(() => {
    const { seed, characters } = configRef.current
    source.current = seed === undefined || seed === null ? null : seededPrompts(characters, seed)
    attemptsRef.current = []
    finished.current = false
    setAttempts([])
    setSummary(null)
    setEarned([])
    before.current = achievementSnapshot(progressStore.read(), statsStore.read())
    recent.current = []
    clock.current = startClock(performance.now())
    setStatus('running')
    setRemaining(configRef.current.durationMs)
    advance()

    // A timed session has to end on the clock even if the user stops answering,
    // so the deadline cannot be checked only when an answer arrives.
    if (configRef.current.durationMs !== null) {
      stopTimer()
      timer.current = setInterval(() => {
        const elapsed = elapsedNow()
        setRemaining(remainingMs(configRef.current, elapsed))
        if (elapsed >= (configRef.current.durationMs ?? Infinity)) finish(attemptsRef.current)
      }, 100)
    }
  }, [advance, finish, stopTimer, elapsedNow, progressStore, statsStore])

  const submit = useCallback(
    (given: string): boolean => {
      if (status !== 'running' || current === null || finished.current) return false

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

      const next = [...attemptsRef.current, attempt]
      attemptsRef.current = next
      setAttempts(next)
      if (isFinished(configRef.current, next, elapsedNow())) finish(next)
      else advance()

      return correct
    },
    [status, current, progressStore, advance, finish, elapsedNow],
  )

  const stop = useCallback(() => finish(attemptsRef.current), [finish])

  const reset = useCallback(() => {
    stopTimer()
    setStatus('idle')
    setCurrent(null)
    setAttempts([])
    attemptsRef.current = []
    finished.current = false
    source.current = null
    setSummary(null)
    setEarned([])
    setRemaining(configRef.current.durationMs)
    clock.current = null
    recent.current = []
  }, [stopTimer])

  const hold = useCallback(() => {
    if (clock.current === null || finished.current) return
    clock.current = holdClock(clock.current, performance.now())
  }, [])

  const release = useCallback(() => {
    if (clock.current === null || clock.current.heldAt === null) return
    const now = performance.now()
    clock.current = releaseClock(clock.current, now)
    // The prompt reaches the learner now, so the time it took to answer
    // starts now, not when the previous answer went in.
    promptedAt.current = now
  }, [])

  useEffect(() => stopTimer, [stopTimer])

  return {
    status,
    current,
    promptId,
    attempts,
    remaining,
    summary,
    earned,
    start,
    submit,
    stop,
    reset,
    holdClock: hold,
    releaseClock: release,
  }
}
