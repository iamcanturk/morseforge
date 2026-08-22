import { useCallback, useMemo, useRef, useState } from 'react'
import { generateText, type TextKind } from '../../data/practiceText'
import { gradeCopy, type CopyGrade } from '../../game/copy'
import { summarize, type Attempt, type SessionSummary } from '../../game/session'
import { xpForAnswer } from '../../game/progression'
import { answer as recordAnswer, createProgressStore } from '../../storage/progress'
import { applySession, createStatsStore } from '../../storage/stats'

/**
 * Runs a copy session (PROJECT.md §13).
 *
 * Separate from `useSession` because the loop is genuinely different: one
 * prompt is a whole line, an answer is graded per character with partial
 * credit, and the learner is shown the answer key before the next line rather
 * than being moved straight on.
 *
 * The scoring, XP and stats all go through the same functions single-character
 * practice uses — a line just contributes as many attempts as it had
 * characters. That keeps one lifetime accuracy figure meaning one thing.
 */

export type CopyStatus = 'idle' | 'running' | 'reviewing' | 'finished'

export interface CopyConfig {
  kind: TextKind
  /** Characters allowed in generated text. */
  characters: readonly string[]
  /** How many lines before the session ends. */
  lines: number
}

export interface CopyResult {
  text: string
  grade: CopyGrade
}

export interface UseCopySessionResult {
  status: CopyStatus
  /** The line currently being sent, or null outside a session. */
  current: string | null
  /** 1-based, for "line 3 of 10". */
  lineNumber: number
  results: readonly CopyResult[]
  /** The line just graded, held while the answer key is on screen. */
  lastGrade: CopyGrade | null
  summary: SessionSummary | null
  /** Lines copied without a single error. */
  perfectLines: number
  start: () => void
  /** Grade an answer and stop on it. Returns the grade so the UI can react. */
  submit: (given: string) => CopyGrade | null
  /** Move past the answer key to the next line, or finish. */
  next: () => void
  stop: () => void
  reset: () => void
}

export function useCopySession(config: CopyConfig): UseCopySessionResult {
  const progressStore = useMemo(() => createProgressStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])

  const [status, setStatus] = useState<CopyStatus>('idle')
  const [current, setCurrent] = useState<string | null>(null)
  const [results, setResults] = useState<CopyResult[]>([])
  const [lastGrade, setLastGrade] = useState<CopyGrade | null>(null)
  const [summary, setSummary] = useState<SessionSummary | null>(null)

  const startedAt = useRef<number>(0)
  const promptedAt = useRef<number>(0)
  const attempts = useRef<Attempt[]>([])

  // The config object can be new on every render; a session must not restart
  // because its parent re-rendered.
  const configRef = useRef(config)
  configRef.current = config

  const generate = useCallback(() => {
    // Falls back to code groups, which need no vocabulary and so can always be
    // produced — better than ending the session because the chosen kind ran
    // out of material for this alphabet.
    const { kind, characters } = configRef.current
    return (
      generateText(kind, { alphabet: characters }) ??
      generateText('groups', { alphabet: characters })
    )
  }, [])

  const finish = useCallback(
    (collected: readonly CopyResult[]) => {
      const elapsed = performance.now() - startedAt.current
      const result = summarize(attempts.current, elapsed)

      const xpEarned = attempts.current
        .filter((attempt) => attempt.correct)
        .reduce((sum, attempt) => sum + xpForAnswer(attempt.character), 0)

      statsStore.update((stats) => applySession(stats, result, xpEarned, Date.now()))

      setResults([...collected])
      setSummary(result)
      setStatus('finished')
      setCurrent(null)
      setLastGrade(null)
    },
    [statsStore],
  )

  const start = useCallback(() => {
    attempts.current = []
    startedAt.current = performance.now()
    promptedAt.current = performance.now()
    setResults([])
    setSummary(null)
    setLastGrade(null)
    setCurrent(generate())
    setStatus('running')
  }, [generate])

  const submit = useCallback(
    (given: string): CopyGrade | null => {
      if (status !== 'running' || current === null) return null

      const grade = gradeCopy(current, given)
      const elapsed = performance.now() - promptedAt.current
      const sent = grade.slots.filter((slot) => slot.expected !== null)

      // Every character in the line was heard, so every one of them is evidence
      // about listening — a hit and a miss both move that character's schedule.
      progressStore.update((progress) => {
        const now = Date.now()
        return sent.reduce(
          (record, slot) =>
            recordAnswer(record, slot.expected!, 'listening', slot.mark === 'hit', now),
          progress,
        )
      })

      attempts.current = [
        ...attempts.current,
        ...sent.map((slot) => ({
          character: slot.expected!,
          answer: slot.given ?? '',
          correct: slot.mark === 'hit',
          // Split evenly: a line is heard as a whole, so there is no honest
          // per-character time to report.
          elapsedMs: sent.length === 0 ? elapsed : elapsed / sent.length,
        })),
      ]

      setResults((collected) => [...collected, { text: current, grade }])
      setLastGrade(grade)
      setStatus('reviewing')
      return grade
    },
    [status, current, progressStore],
  )

  const next = useCallback(() => {
    if (status !== 'reviewing') return

    setResults((collected) => {
      if (collected.length >= configRef.current.lines) {
        finish(collected)
        return collected
      }
      setLastGrade(null)
      setCurrent(generate())
      promptedAt.current = performance.now()
      setStatus('running')
      return collected
    })
  }, [status, finish, generate])

  const stop = useCallback(() => {
    setResults((collected) => {
      finish(collected)
      return collected
    })
  }, [finish])

  const reset = useCallback(() => {
    setStatus('idle')
    setCurrent(null)
    setResults([])
    setLastGrade(null)
    setSummary(null)
    attempts.current = []
  }, [])

  const perfectLines = results.filter((result) => result.grade.perfect).length
  const lineNumber = Math.min(results.length + (status === 'reviewing' ? 0 : 1), config.lines)

  return {
    status,
    current,
    lineNumber,
    results,
    lastGrade,
    summary,
    perfectLines,
    start,
    submit,
    next,
    stop,
    reset,
  }
}
