import { useCallback, useMemo, useRef, useState } from 'react'
import { generateText, type TextKind } from '../../data/practiceText'
import { gradeCopy, type CopyGrade } from '../../game/copy'
import { summarize, type Attempt, type SessionSummary } from '../../game/session'
import { answer as recordAnswer, createProgressStore } from '../../storage/progress'
import { applySession, createStatsStore } from '../../storage/stats'
import { achievementSnapshot } from '../../storage/snapshot'
import { newlyEarned, type Achievement } from '../../game/achievements'
import { track } from '../../analytics/track'
import { attemptsForLine, isComplete, lineNumber, sessionXp } from './copySession'

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
 * characters. That keeps one lifetime accuracy figure meaning one thing, and
 * it means copy practice and the daily bank identically: `applySession`, which
 * marks the local day once however many sessions land on it.
 *
 * Every write happens in an event handler, never inside a state updater. React
 * may run an updater twice, and an updater that banks a session banks it
 * twice; the old `stop` did exactly that. A ref holds the lines as the source
 * of truth and a second ref makes finishing a once-per-session event.
 */

export type CopyStatus = 'idle' | 'running' | 'reviewing' | 'finished'

export interface CopyConfig {
  kind: TextKind
  /** Characters allowed in generated text. */
  characters: readonly string[]
  /** How many lines before the session ends. */
  lines: number
  /**
   * A fixed list to send instead of generating.
   *
   * The daily challenge hands the same lines to everyone, so it cannot
   * generate per session — but it is otherwise the identical exercise, and
   * running it through a second loop would be two chances to score copying
   * differently.
   */
  prompts?: readonly string[]
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
  /** Over the answered lines only. The daily rescores against the whole day. */
  summary: SessionSummary | null
  /** Achievements this session earned. Empty unless it just crossed one. */
  earned: readonly Achievement[]
  /** Lines copied without a single error. */
  perfectLines: number
  /** True once finished with every line answered; false if it was stopped early. */
  completed: boolean
  start: () => void
  /** Grade an answer and stop on it. Returns the grade so the UI can react. */
  submit: (given: string) => CopyGrade | null
  /** Move past the answer key to the next line, or finish. */
  next: () => void
  /** End now, with the lines answered so far. */
  stop: () => void
  reset: () => void
}

export function useCopySession(config: CopyConfig): UseCopySessionResult {
  const progressStore = useMemo(() => createProgressStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])

  const [status, setStatus] = useState<CopyStatus>('idle')
  const [current, setCurrent] = useState<string | null>(null)
  const [results, setResults] = useState<readonly CopyResult[]>([])
  const [lastGrade, setLastGrade] = useState<CopyGrade | null>(null)
  const [summary, setSummary] = useState<SessionSummary | null>(null)
  const [earned, setEarned] = useState<readonly Achievement[]>([])

  // Taken before the session writes anything: "newly earned" can only be
  // answered by comparing before against after.
  const before = useRef<ReturnType<typeof achievementSnapshot> | null>(null)
  const startedAt = useRef<number>(0)
  const promptedAt = useRef<number>(0)
  const attempts = useRef<Attempt[]>([])
  const collected = useRef<CopyResult[]>([])
  const phase = useRef<CopyStatus>('idle')
  const currentRef = useRef<string | null>(null)

  // The config object can be new on every render; a session must not restart
  // because its parent re-rendered.
  const configRef = useRef(config)
  configRef.current = config

  const move = useCallback((next: CopyStatus) => {
    phase.current = next
    setStatus(next)
  }, [])

  const show = useCallback((line: string | null) => {
    currentRef.current = line
    setCurrent(line)
  }, [])

  const generate = useCallback((index: number) => {
    const { kind, characters, prompts } = configRef.current
    // A fixed list runs out rather than wrapping: eight lines means eight.
    if (prompts) return prompts[index] ?? null

    // Falls back to code groups, which need no vocabulary and so can always be
    // produced — better than ending the session because the chosen kind ran
    // out of material for this alphabet.
    return (
      generateText(kind, { alphabet: characters }) ??
      generateText('groups', { alphabet: characters })
    )
  }, [])

  const finish = useCallback(() => {
    // Once per session, whichever of "last line", END and GIVE UP gets here.
    if (phase.current === 'finished' || phase.current === 'idle') return
    move('finished')

    const elapsed = performance.now() - startedAt.current
    const result = summarize(attempts.current, elapsed)

    // Zero answers bank nothing: applySession returns the record untouched.
    statsStore.update((stats) =>
      applySession(stats, result, sessionXp(attempts.current), Date.now()),
    )
    track('copy_finish', configRef.current.kind)

    const after = achievementSnapshot(progressStore.read(), statsStore.read())
    setEarned(newlyEarned(before.current ?? after, after))

    setResults([...collected.current])
    setSummary(result)
    show(null)
    setLastGrade(null)
  }, [move, show, statsStore, progressStore])

  const start = useCallback(() => {
    attempts.current = []
    collected.current = []
    setEarned([])
    before.current = achievementSnapshot(progressStore.read(), statsStore.read())
    startedAt.current = performance.now()
    promptedAt.current = performance.now()
    setResults([])
    setSummary(null)
    setLastGrade(null)
    show(generate(0))
    move('running')
  }, [generate, move, show, progressStore, statsStore])

  const submit = useCallback(
    (given: string): CopyGrade | null => {
      const line = currentRef.current
      if (phase.current !== 'running' || line === null) return null

      const grade = gradeCopy(line, given)
      const lineAttempts = attemptsForLine(grade, performance.now() - promptedAt.current)

      // Every character in the line was heard, so every one of them is evidence
      // about listening — a hit and a miss both move that character's schedule.
      progressStore.update((progress) => {
        const now = Date.now()
        return lineAttempts.reduce(
          (record, attempt) =>
            recordAnswer(record, attempt.character, 'listening', attempt.correct, now),
          progress,
        )
      })

      attempts.current = [...attempts.current, ...lineAttempts]
      collected.current = [...collected.current, { text: line, grade }]
      setResults(collected.current)
      setLastGrade(grade)
      move('reviewing')
      return grade
    },
    [move, progressStore],
  )

  const next = useCallback(() => {
    if (phase.current !== 'reviewing') return
    const answered = collected.current.length
    const line = answered >= configRef.current.lines ? null : generate(answered)
    if (line === null) {
      finish()
      return
    }
    setLastGrade(null)
    show(line)
    promptedAt.current = performance.now()
    move('running')
  }, [finish, generate, move, show])

  const stop = useCallback(() => finish(), [finish])

  const reset = useCallback(() => {
    move('idle')
    show(null)
    setResults([])
    setLastGrade(null)
    setSummary(null)
    setEarned([])
    attempts.current = []
    collected.current = []
  }, [move, show])

  const perfectLines = results.filter((result) => result.grade.perfect).length

  return {
    status,
    current,
    lineNumber: lineNumber(results.length, status === 'reviewing', config.lines),
    results,
    lastGrade,
    summary,
    earned,
    perfectLines,
    completed: status === 'finished' && isComplete(results.length, config.lines),
    start,
    submit,
    next,
    stop,
    reset,
  }
}
