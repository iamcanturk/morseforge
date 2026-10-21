/**
 * A practice session (PROJECT.md §12, §14, §34, §39.4).
 *
 * Free practice and the sixty-second challenge are the same loop with different
 * stopping conditions, so the loop lives here once: pick a prompt, take an
 * answer, score it, repeat until time or count runs out. Everything is pure and
 * takes an explicit clock, so the whole thing is testable without a browser.
 */

import { codeLength } from '../data/morseAlphabet'
import { measureWpm } from '../engine/timingEngine'
import type { Skill } from './mastery'
import { createRandom } from './random'
import { type ReviewState, isDue, overdueBy, selectDue } from './spacedRepetition'

/** What the learner is being asked to do. Maps onto the three tracked skills. */
export type SessionMode = 'listening' | 'recognition' | 'sending'

export const SESSION_MODES: Record<SessionMode, { label: string; prompt: string; skill: Skill }> = {
  listening: { label: 'Listen', prompt: 'Hear it, then name it', skill: 'listening' },
  recognition: { label: 'Read', prompt: 'Read the dots and dashes', skill: 'recognition' },
  sending: { label: 'Send', prompt: 'Key the character yourself', skill: 'sending' },
}

export interface SessionConfig {
  mode: SessionMode
  /** The pool to draw prompts from. */
  characters: readonly string[]
  /** Stop after this long. Null means untimed. */
  durationMs: number | null
  /** Stop after this many prompts. Null means unlimited. */
  target: number | null
  /**
   * A seed for a reproducible prompt order (the shared challenge). Absent or
   * null means prompts follow the learner's own review schedule.
   */
  seed?: number | null
}

export interface Attempt {
  character: string
  /** What the learner gave. Empty when they ran out of time. */
  answer: string
  correct: boolean
  /** How long this prompt took, from being shown to being answered. */
  elapsedMs: number
}

/**
 * How much a prompt is worth, by how many elements it takes to send.
 *
 * Q (four elements) is genuinely harder to hear than E (one), and a score that
 * paid the same for both would reward drilling only the easy half.
 *
 * Sums across the prompt, so word practice is weighted by its real length.
 * Reading a single `codeLength` here returned 0 for anything longer than one
 * character, which quietly made a five-letter group worth *less* than an E.
 */
export function difficultyWeight(prompt: string): number {
  const characters = [...prompt].filter((character) => character !== ' ')
  if (characters.length === 0) return 1

  return characters.reduce((sum, character) => {
    const elements = codeLength(character)
    // An unknown character still counts as one, so a weight can never be zero
    // or negative and answering can never subtract points.
    return sum + (elements === 0 ? 1 : 1 + (elements - 1) * 0.25)
  }, 0)
}

export interface SessionSummary {
  attempts: readonly Attempt[]
  correct: number
  total: number
  /** 0..1. Zero attempts reads as 0 rather than as perfect. */
  accuracy: number
  elapsedMs: number
  /**
   * Correct characters per minute, divided by five: the 5-characters-per-word
   * convention. In listening and reading modes this is answering speed, not
   * copy speed, so screens show it as characters per minute (`charsPerMinute`)
   * rather than calling it WPM (DEC-006).
   */
  wpm: number
  score: number
  /** Missed characters, most-missed first. Drives "practise these next". */
  weakest: { character: string; misses: number }[]
}

/**
 * Score a finished session (PROJECT.md §34).
 *
 * Accuracy is applied as a *square*, which is the whole design. §34 says the
 * score must not push people toward speed at the cost of correctness, and a
 * linear accuracy term does exactly that — guessing twice as fast at half the
 * accuracy comes out even. Squaring it means 50% accuracy keeps a quarter of
 * the points, so spraying answers is never the better strategy.
 *
 * Speed still counts, but it is clamped: there is a ceiling on what going
 * faster can buy you, and a floor so a careful beginner is not left at zero.
 */
export const SCORE = {
  perCorrect: 10,
  speedFloor: 0.5,
  speedCeiling: 1.5,
  /** The speed that scores a neutral 1.0 multiplier. */
  referenceWpm: 20,
} as const

export function summarize(attempts: readonly Attempt[], elapsedMs: number): SessionSummary {
  const total = attempts.length
  const correct = attempts.filter((attempt) => attempt.correct).length
  const accuracy = total === 0 ? 0 : correct / total
  const wpm = measureWpm(correct, elapsedMs)

  const earned = attempts
    .filter((attempt) => attempt.correct)
    .reduce((sum, attempt) => sum + SCORE.perCorrect * difficultyWeight(attempt.character), 0)

  const speedMultiplier = Math.min(
    Math.max(wpm / SCORE.referenceWpm, SCORE.speedFloor),
    SCORE.speedCeiling,
  )

  const misses = new Map<string, number>()
  for (const attempt of attempts) {
    if (attempt.correct) continue
    misses.set(attempt.character, (misses.get(attempt.character) ?? 0) + 1)
  }

  return {
    attempts,
    correct,
    total,
    accuracy,
    elapsedMs,
    wpm,
    score: Math.round(earned * accuracy * accuracy * speedMultiplier),
    weakest: [...misses.entries()]
      .map(([character, count]) => ({ character, misses: count }))
      .sort((a, b) => b.misses - a.misses || a.character.localeCompare(b.character)),
  }
}

export interface PickOptions {
  /** Review state per character, for due-first ordering. Optional. */
  schedules?: Readonly<Record<string, ReviewState>>
  /** Recently shown characters, newest last. Avoided where possible. */
  recent?: readonly string[]
  /** How many recent characters to avoid repeating (pools larger than `SMALL_POOL`). */
  avoidLast?: number
  now?: number
  /** 0..1 from a seeded source, so a session can be reproduced. */
  random?: () => number
}

/**
 * The largest pool that is drawn at random with a run cap instead of avoiding
 * recent prompts (J-02, DEC-044).
 *
 * Avoiding the last prompt in a pool of two leaves exactly one candidate, so
 * E and T came out as ETETET: after the first prompt every answer was known
 * without listening. A pool of three became a fixed rotation the same way.
 */
export const SMALL_POOL = 3

/** The longest run of one character a small pool may produce (DEC-046: "at most 2"). */
export const MAX_RUN = 2

/** What a pick must not return, given what was shown last. */
function blockedBy(
  characters: readonly string[],
  recent: readonly string[],
  avoidLast: number,
): Set<string> {
  if (characters.length <= SMALL_POOL) {
    const tail = recent.slice(-MAX_RUN)
    const run = tail.length === MAX_RUN && tail.every((character) => character === tail[0])
    return run ? new Set([tail[0]!]) : new Set()
  }
  return new Set(recent.slice(-Math.min(avoidLast, characters.length - 1)))
}

/**
 * Choose the next prompt.
 *
 * Due-first when schedules are supplied, so a short session spends its prompts
 * on what the learner is closest to forgetting. In a pool of four or more,
 * the last few prompts are avoided, because seeing the same character twice
 * in a row tests short-term memory rather than recall. In a pool of three or
 * fewer that avoidance is what made the order predictable, so the pick is
 * random and only a third identical prompt in a row is refused. Either way it
 * is a preference, not a rule: a pool of one still repeats.
 */
export function pickNext(characters: readonly string[], options: PickOptions = {}): string | null {
  if (characters.length === 0) return null

  const { schedules, recent = [], avoidLast = 2, now = Date.now(), random = Math.random } = options

  const blocked = blockedBy(characters, recent, avoidLast)
  const eligible = characters.filter((character) => !blocked.has(character))
  const pool = eligible.length > 0 ? eligible : characters
  const small = characters.length <= SMALL_POOL

  if (schedules) {
    const never: ReviewState = { streak: 0, intervalMs: 0, dueAt: 0, lapses: 0, ease: 2.5 }
    const stateFor = (character: string) => schedules[character] ?? never

    // Genuinely-due characters first. `selectDue` deliberately pads its result
    // with what is due soonest so a practice screen is never empty — useful
    // there, wrong here, because padding lets a character that is not due for
    // an hour be picked ahead of one the learner is about to forget.
    const due = pool.filter((character) => isDue(stateFor(character), now))

    if (due.length > 0) {
      const ordered = [...due].sort(
        (a, b) => overdueBy(stateFor(b), now) - overdueBy(stateFor(a), now),
      )
      // Choose among the few most overdue rather than always the single most:
      // a strict order makes a session feel like a list being read out.
      const top = ordered.slice(0, Math.min(3, ordered.length))
      return top[Math.floor(random() * top.length)]!
    }

    // Nothing due: fall back to whatever comes up soonest. Not in a small
    // pool: "soonest" there is simply the one answered longest ago, which in a
    // pool of two is the other one, every time, and that is ETETET again.
    if (!small) {
      const upcoming = selectDue(
        pool.map((character) => ({ character, state: stateFor(character), meta: null })),
        now,
        1,
      )
      if (upcoming.length > 0) return upcoming[0]!.character
    }
  }

  return pool[Math.floor(random() * pool.length)]!
}

/** Where a session's prompts come from. */
export interface PromptSource {
  /** The next prompt, or null for an empty pool. */
  next: () => string | null
}

/** How many recent prompts a source remembers, for `pickNext`'s repeat avoidance. */
const RECENT = 4

/**
 * A reproducible prompt sequence: the same pool and seed give the same
 * prompts in the same order, on any device.
 *
 * This is what makes a shared challenge the same challenge. It deliberately
 * takes no review schedules and no answers: a schedule is personal, so two
 * people would be asked different things, and a sequence that reacted to
 * answers would diverge at the first miss. What each person *answers* still
 * feeds their own progress; only the questions are fixed.
 */
export function seededPrompts(characters: readonly string[], seed: number): PromptSource {
  const pool = [...characters]
  const random = createRandom(seed)
  const recent: string[] = []
  return {
    next() {
      const prompt = pickNext(pool, { recent, random })
      if (prompt !== null) {
        recent.push(prompt)
        if (recent.length > RECENT) recent.shift()
      }
      return prompt
    },
  }
}

/** The first `count` prompts of a seeded sequence. For tests and previews. */
export function promptSequence(
  characters: readonly string[],
  seed: number,
  count: number,
): string[] {
  const source = seededPrompts(characters, seed)
  const out: string[] = []
  for (let i = 0; i < count; i++) {
    const prompt = source.next()
    if (prompt === null) break
    out.push(prompt)
  }
  return out
}

/**
 * Correct answers per minute, the honest unit for a typed answer. The summary's
 * `wpm` is this divided by five, and only means words per minute when the
 * characters were really sent at that rate.
 */
export function charsPerMinute(summary: Pick<SessionSummary, 'wpm'>): number {
  return Math.round(summary.wpm * 5)
}

/** Whether a session should stop. */
export function isFinished(
  config: SessionConfig,
  attempts: readonly Attempt[],
  elapsedMs: number,
): boolean {
  if (config.durationMs !== null && elapsedMs >= config.durationMs) return true
  if (config.target !== null && attempts.length >= config.target) return true
  return false
}

/** Time left, or null when untimed. Never negative. */
export function remainingMs(config: SessionConfig, elapsedMs: number): number | null {
  if (config.durationMs === null) return null
  return Math.max(0, config.durationMs - elapsedMs)
}

/**
 * The pause between an answer and the next listening prompt (A-06, DEC-045).
 *
 * The answer's feedback ("T, correct", "You said Q. It was E, dot") is read
 * out by a screen reader the moment it appears, and the next tone used to
 * start 6 to 9 ms later, under the speech. A blind learner could not hear the
 * very prompt they were graded on. Only listening waits: a read or send
 * prompt makes no sound for the speech to cover. The first prompt of a run
 * does not wait either; nothing is being announced yet.
 */
export const NEXT_PROMPT_DELAY_MS = 700

/**
 * A session's clock, which can be held while the screen waits on purpose.
 *
 * The pause above is the screen's doing, not the learner's, so it must not
 * cost a timed run seconds, count as slow answering, or lower the speed in
 * the score. While held, the clock reads what it read when the hold began;
 * on release, the held time is credited back.
 */
export interface SessionClock {
  /** The run's start, on the caller's monotonic timeline (performance.now()). */
  startedAt: number
  /** Time already credited back from finished holds. */
  creditedMs: number
  /** When the current hold began, or null while the clock runs. */
  heldAt: number | null
}

export function startClock(now: number): SessionClock {
  return { startedAt: now, creditedMs: 0, heldAt: null }
}

/** The learner's time so far: wall time since the start, minus every hold. Never negative. */
export function clockElapsed(clock: SessionClock, now: number): number {
  const end = clock.heldAt ?? now
  return Math.max(0, end - clock.startedAt - clock.creditedMs)
}

/** Stop the clock. Holding a held clock changes nothing, so a hold cannot be counted twice. */
export function holdClock(clock: SessionClock, now: number): SessionClock {
  return clock.heldAt === null ? { ...clock, heldAt: now } : clock
}

/** Restart a held clock, crediting the hold back. A running clock is returned unchanged. */
export function releaseClock(clock: SessionClock, now: number): SessionClock {
  if (clock.heldAt === null) return clock
  return { ...clock, creditedMs: clock.creditedMs + Math.max(0, now - clock.heldAt), heldAt: null }
}

/** The sixty-second challenge of PROJECT.md §39.4. */
export const SIXTY_SECOND_CHALLENGE: SessionConfig = {
  mode: 'listening',
  characters: [],
  durationMs: 60_000,
  target: null,
}
