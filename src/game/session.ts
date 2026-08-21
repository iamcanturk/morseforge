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
}

export interface Attempt {
  character: string
  /** What the learner gave. Empty when they ran out of time. */
  answer: string
  correct: boolean
  /** How long this prompt took, from being shown to being answered. */
  elapsedMs: number
}

/** How much a character is worth, by how many elements it takes. */
export function difficultyWeight(character: string): number {
  // Q (four elements) is genuinely harder to hear than E (one), and a score
  // that paid the same for both would reward drilling only the easy half.
  return 1 + (codeLength(character) - 1) * 0.25
}

export interface SessionSummary {
  attempts: readonly Attempt[]
  correct: number
  total: number
  /** 0..1. Zero attempts reads as 0 rather than as perfect. */
  accuracy: number
  elapsedMs: number
  /** Characters per minute, in the standard 5-characters-per-word convention. */
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
  /** How many recent characters to avoid repeating. */
  avoidLast?: number
  now?: number
  /** 0..1 from a seeded source, so a session can be reproduced. */
  random?: () => number
}

/**
 * Choose the next prompt.
 *
 * Due-first when schedules are supplied, so a short session spends its prompts
 * on what the learner is closest to forgetting. Immediate repeats are avoided
 * because seeing the same character twice in a row tests short-term memory
 * rather than recall — but the avoidance is a preference, not a rule: with two
 * characters in the pool, refusing to repeat would deadlock.
 */
export function pickNext(characters: readonly string[], options: PickOptions = {}): string | null {
  if (characters.length === 0) return null

  const { schedules, recent = [], avoidLast = 2, now = Date.now(), random = Math.random } = options

  const blocked = new Set(recent.slice(-Math.min(avoidLast, characters.length - 1)))
  const eligible = characters.filter((character) => !blocked.has(character))
  const pool = eligible.length > 0 ? eligible : characters

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

    // Nothing due: fall back to whatever comes up soonest.
    const upcoming = selectDue(
      pool.map((character) => ({ character, state: stateFor(character), meta: null })),
      now,
      1,
    )
    if (upcoming.length > 0) return upcoming[0]!.character
  }

  return pool[Math.floor(random() * pool.length)]!
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

/** The sixty-second challenge of PROJECT.md §39.4. */
export const SIXTY_SECOND_CHALLENGE: SessionConfig = {
  mode: 'listening',
  characters: [],
  durationMs: 60_000,
  target: null,
}
