/**
 * Spaced repetition (PROJECT.md §6).
 *
 * An SM-2 variant, tuned down for a session that lasts minutes rather than a
 * flashcard deck reviewed once a day. §6's worked example — G due now, K in 30
 * minutes, A in 2 days, T in 5, E in 7 — spans both scales, so the intervals
 * start in minutes and grow into days rather than starting at a day.
 *
 * Everything here is pure and takes an explicit `now`, so scheduling is
 * testable without waiting and without mocking the global clock.
 */

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

export interface ReviewState {
  /** Consecutive correct answers. Reset to 0 by a lapse. */
  streak: number
  /** Current spacing in milliseconds. */
  intervalMs: number
  /** Epoch ms when this character is next due. */
  dueAt: number
  /** How many times it has been forgotten after being learned. */
  lapses: number
  /** SM-2 ease factor. Higher means intervals grow faster. */
  ease: number
}

export const EASE_BOUNDS = { min: 1.3, max: 2.8 } as const
export const DEFAULT_EASE = 2.5

/** Cap on spacing. Beyond about two months a character is not being practised. */
export const MAX_INTERVAL_MS = 60 * DAY

/**
 * Spacing for the first two successes.
 *
 * Fixed rather than multiplied, because the ease factor is meaningless before
 * there is any evidence — and because a learner who just met a character needs
 * to see it again inside the same session, not tomorrow.
 */
export const EARLY_INTERVALS_MS = [10 * MINUTE, HOUR] as const

/** Where a character lands after being forgotten: soon, but not immediately. */
export const RELEARN_INTERVAL_MS = 5 * MINUTE

/** A character never studied is due right now. */
export function newReviewState(now: number): ReviewState {
  return { streak: 0, intervalMs: 0, dueAt: now, lapses: 0, ease: DEFAULT_EASE }
}

function clampEase(ease: number): number {
  return Math.min(Math.max(ease, EASE_BOUNDS.min), EASE_BOUNDS.max)
}

/**
 * Advance the schedule after an answer.
 *
 * A wrong answer costs more ease than a right answer earns (−0.2 vs +0.1), so a
 * character the learner keeps missing keeps coming back quickly instead of
 * drifting out on the strength of an earlier streak.
 */
export function review(state: ReviewState, correct: boolean, now: number): ReviewState {
  if (!correct) {
    return {
      streak: 0,
      intervalMs: RELEARN_INTERVAL_MS,
      dueAt: now + RELEARN_INTERVAL_MS,
      // Only count a lapse if the character had actually been learned. Getting
      // it wrong the first time is not forgetting, it is not knowing yet.
      lapses: state.streak > 0 ? state.lapses + 1 : state.lapses,
      ease: clampEase(state.ease - 0.2),
    }
  }

  const streak = state.streak + 1
  const early = EARLY_INTERVALS_MS[streak - 1]
  const intervalMs = Math.min(
    early ?? Math.max(state.intervalMs, HOUR) * state.ease,
    MAX_INTERVAL_MS,
  )

  return {
    streak,
    intervalMs,
    dueAt: now + intervalMs,
    lapses: state.lapses,
    ease: clampEase(state.ease + 0.1),
  }
}

export function isDue(state: ReviewState, now: number): boolean {
  return state.dueAt <= now
}

/** How overdue a character is, in ms. Negative means not yet due. */
export function overdueBy(state: ReviewState, now: number): number {
  return now - state.dueAt
}

export interface DueItem<T> {
  character: string
  state: ReviewState
  meta: T
}

/**
 * Pick what to practise next.
 *
 * Ordering is most-overdue-first, which matters because a session is short: if
 * the user only answers ten prompts, those ten should be the ten they are
 * closest to forgetting.
 *
 * When nothing is due, the queue falls back to whatever is due soonest rather
 * than returning empty — an empty practice screen is a worse outcome than
 * reviewing something slightly early.
 */
export function selectDue<T>(
  items: readonly DueItem<T>[],
  now: number,
  limit: number,
): DueItem<T>[] {
  if (limit <= 0 || items.length === 0) return []

  const due = items
    .filter((item) => isDue(item.state, now))
    .sort((a, b) => overdueBy(b.state, now) - overdueBy(a.state, now))

  if (due.length >= limit) return due.slice(0, limit)

  const upcoming = items
    .filter((item) => !isDue(item.state, now))
    .sort((a, b) => a.state.dueAt - b.state.dueAt)
    .slice(0, limit - due.length)

  return [...due, ...upcoming]
}

/**
 * Human-readable spacing for the settings and stats screens, in the shape
 * PROJECT.md §6 uses ("now", "30 minutes", "7 days").
 */
export function describeDue(state: ReviewState, now: number): string {
  const remaining = state.dueAt - now
  if (remaining <= 0) return 'now'

  if (remaining < HOUR) return `${Math.max(1, Math.round(remaining / MINUTE))} min`
  if (remaining < DAY) return `${Math.round(remaining / HOUR)} h`
  return `${Math.round(remaining / DAY)} d`
}
