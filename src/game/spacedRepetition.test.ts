import { describe, expect, it } from 'vitest'
import {
  type DueItem,
  type ReviewState,
  EARLY_INTERVALS_MS,
  EASE_BOUNDS,
  MAX_INTERVAL_MS,
  RELEARN_INTERVAL_MS,
  describeDue,
  isDue,
  newReviewState,
  newReviewState as fresh,
  overdueBy,
  review,
  selectDue,
} from './spacedRepetition'

const T0 = 1_700_000_000_000
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

/** Answer correctly `times` in a row, starting from a fresh state. */
function succeed(times: number, from: ReviewState = fresh(T0), now = T0): ReviewState {
  let state = from
  for (let i = 0; i < times; i++) state = review(state, true, now)
  return state
}

describe('newReviewState', () => {
  it('makes a never-studied character due immediately', () => {
    const state = newReviewState(T0)
    expect(state.dueAt).toBe(T0)
    expect(isDue(state, T0)).toBe(true)
  })
})

describe('review — correct answers', () => {
  it('uses fixed early intervals so a new character returns within the session', () => {
    expect(succeed(1).intervalMs).toBe(EARLY_INTERVALS_MS[0])
    expect(succeed(2).intervalMs).toBe(EARLY_INTERVALS_MS[1])
    expect(succeed(1).intervalMs).toBeLessThan(HOUR)
  })

  it('multiplies by ease once past the early intervals', () => {
    const third = succeed(3)
    expect(third.intervalMs).toBeGreaterThan(EARLY_INTERVALS_MS[1])
    expect(third.streak).toBe(3)
  })

  it('grows monotonically with a streak', () => {
    let state = fresh(T0)
    let previous = 0
    for (let i = 0; i < 8; i++) {
      state = review(state, true, T0)
      expect(state.intervalMs).toBeGreaterThan(previous)
      previous = state.intervalMs
    }
  })

  it('reaches multi-day spacing, matching the §6 example', () => {
    // §6 shows E at 7 days after sustained success.
    expect(succeed(6).intervalMs).toBeGreaterThan(DAY)
  })

  it('caps spacing so a character never drifts out of practice entirely', () => {
    expect(succeed(40).intervalMs).toBe(MAX_INTERVAL_MS)
  })

  it('raises ease, but never past the ceiling', () => {
    expect(succeed(1).ease).toBeGreaterThan(fresh(T0).ease)
    expect(succeed(30).ease).toBe(EASE_BOUNDS.max)
  })

  it('schedules relative to the answer time, not to the previous due date', () => {
    const late = T0 + 10 * DAY
    expect(review(fresh(T0), true, late).dueAt).toBe(late + EARLY_INTERVALS_MS[0])
  })
})

describe('review — wrong answers', () => {
  it('brings the character back within minutes, matching §6 ("K → 30 min")', () => {
    const lapsed = review(succeed(5), false, T0)
    expect(lapsed.intervalMs).toBe(RELEARN_INTERVAL_MS)
    expect(lapsed.dueAt).toBe(T0 + RELEARN_INTERVAL_MS)
  })

  it('resets the streak', () => {
    expect(review(succeed(5), false, T0).streak).toBe(0)
  })

  it('counts a lapse only for a character that had been learned', () => {
    // Getting it wrong the first time is not forgetting, it is not knowing yet.
    expect(review(fresh(T0), false, T0).lapses).toBe(0)
    expect(review(succeed(1), false, T0).lapses).toBe(1)
  })

  it('lowers ease, but never below the floor', () => {
    let state = fresh(T0)
    for (let i = 0; i < 20; i++) state = review(state, false, T0)
    expect(state.ease).toBe(EASE_BOUNDS.min)
  })

  it('costs more ease than a correct answer earns', () => {
    // A character the learner keeps missing must keep coming back quickly
    // rather than drifting out on the strength of an earlier streak.
    const base = fresh(T0)
    const gained = review(base, true, T0).ease - base.ease
    const lost = base.ease - review(base, false, T0).ease
    expect(lost).toBeGreaterThan(gained)
  })
})

describe('isDue / overdueBy', () => {
  it('is due exactly at the due time', () => {
    const state = succeed(1)
    expect(isDue(state, state.dueAt - 1)).toBe(false)
    expect(isDue(state, state.dueAt)).toBe(true)
  })

  it('reports how overdue, negative when not yet due', () => {
    const state = succeed(1)
    expect(overdueBy(state, state.dueAt + 5000)).toBe(5000)
    expect(overdueBy(state, state.dueAt - 5000)).toBe(-5000)
  })
})

describe('selectDue', () => {
  const item = (character: string, dueAt: number): DueItem<null> => ({
    character,
    state: { ...fresh(T0), dueAt },
    meta: null,
  })

  it('returns the most overdue first', () => {
    const picked = selectDue(
      [item('A', T0 - MINUTE), item('B', T0 - HOUR), item('C', T0 - 10 * MINUTE)],
      T0,
      3,
    )
    expect(picked.map((p) => p.character)).toEqual(['B', 'C', 'A'])
  })

  it('honours the limit', () => {
    const picked = selectDue([item('A', T0 - HOUR), item('B', T0 - MINUTE)], T0, 1)
    expect(picked.map((p) => p.character)).toEqual(['A'])
  })

  it('falls back to what is due soonest rather than returning an empty session', () => {
    // An empty practice screen is worse than reviewing something slightly early.
    const picked = selectDue([item('A', T0 + 2 * HOUR), item('B', T0 + HOUR)], T0, 2)
    expect(picked.map((p) => p.character)).toEqual(['B', 'A'])
  })

  it('puts due items ahead of upcoming ones when filling a session', () => {
    const picked = selectDue([item('FUTURE', T0 + HOUR), item('DUE', T0 - HOUR)], T0, 2)
    expect(picked.map((p) => p.character)).toEqual(['DUE', 'FUTURE'])
  })

  it('handles empty input and a zero limit', () => {
    expect(selectDue([], T0, 5)).toEqual([])
    expect(selectDue([item('A', T0)], T0, 0)).toEqual([])
  })
})

describe('describeDue', () => {
  it('uses the vocabulary of PROJECT.md §6', () => {
    expect(describeDue({ ...fresh(T0), dueAt: T0 }, T0)).toBe('now')
    expect(describeDue({ ...fresh(T0), dueAt: T0 - HOUR }, T0)).toBe('now')
    expect(describeDue({ ...fresh(T0), dueAt: T0 + 30 * MINUTE }, T0)).toBe('30 min')
    expect(describeDue({ ...fresh(T0), dueAt: T0 + 5 * HOUR }, T0)).toBe('5 h')
    expect(describeDue({ ...fresh(T0), dueAt: T0 + 7 * DAY }, T0)).toBe('7 d')
  })

  it('never rounds a pending review down to "0 min"', () => {
    expect(describeDue({ ...fresh(T0), dueAt: T0 + 1000 }, T0)).toBe('1 min')
  })
})
