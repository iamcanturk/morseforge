import { describe, expect, it } from 'vitest'
import {
  type Attempt,
  type SessionConfig,
  SCORE,
  difficultyWeight,
  isFinished,
  pickNext,
  remainingMs,
  summarize,
} from './session'
import { newReviewState, review } from './spacedRepetition'

const T0 = 1_700_000_000_000

const attempt = (character: string, correct: boolean, elapsedMs = 1000): Attempt => ({
  character,
  answer: correct ? character : '?',
  correct,
  elapsedMs,
})

/** `n` attempts, `hits` of them correct. */
const run = (n: number, hits: number, character = 'E'): Attempt[] =>
  Array.from({ length: n }, (_, i) => attempt(character, i < hits))

describe('difficultyWeight', () => {
  it('pays more for longer characters', () => {
    expect(difficultyWeight('Q')).toBeGreaterThan(difficultyWeight('E'))
  })

  it('is 1 for a single-element character', () => {
    expect(difficultyWeight('E')).toBe(1)
    expect(difficultyWeight('T')).toBe(1)
  })

  it('never goes to zero or below for an unknown character', () => {
    // codeLength returns 0 for anything unmapped; a negative weight would
    // subtract points for answering.
    expect(difficultyWeight('🚀')).toBeGreaterThan(0)
  })
})

describe('summarize', () => {
  it('reads an empty session as 0 accuracy, not as perfect', () => {
    const summary = summarize([], 60_000)
    expect(summary).toMatchObject({ total: 0, correct: 0, accuracy: 0, score: 0, wpm: 0 })
  })

  it('counts correct answers and accuracy', () => {
    const summary = summarize(run(10, 7), 60_000)
    expect(summary.correct).toBe(7)
    expect(summary.total).toBe(10)
    expect(summary.accuracy).toBeCloseTo(0.7, 6)
  })

  it('punishes guessing: twice the speed at half the accuracy scores worse', () => {
    // This is the §34 requirement made concrete. A linear accuracy term would
    // make these two equal, and the fast guesser would then be the optimal
    // player — exactly what §34 says the score must not reward.
    const careful = summarize(run(20, 20), 60_000)
    const guesser = summarize(run(40, 20), 60_000)

    expect(guesser.correct).toBe(careful.correct)
    expect(guesser.score).toBeLessThan(careful.score)
  })

  it('still rewards speed at equal accuracy', () => {
    // 100 correct in 90s is ~13 WPM, in 60s is 20 — both inside the range where
    // the multiplier is not clamped.
    const slow = summarize(run(100, 100), 90_000)
    const fast = summarize(run(100, 100), 60_000)
    expect(fast.score).toBeGreaterThan(slow.score)
  })

  it('stops differentiating below the floor, so a slow learner is not punished twice', () => {
    // Under 10 WPM everyone gets the same multiplier. Accuracy is what a
    // learner at this speed should be optimising, and it already dominates.
    const verySlow = summarize(run(20, 20), 600_000)
    const slightlyFaster = summarize(run(20, 20), 300_000)
    expect(slightlyFaster.score).toBe(verySlow.score)
  })

  it('caps what speed alone can buy', () => {
    // Both of these are past the ceiling, so they must score identically.
    const fast = summarize(run(100, 100), 20_000)
    const absurd = summarize(run(100, 100), 200)
    expect(absurd.score).toBe(fast.score)
  })

  it('does not let a careful beginner score zero for being slow', () => {
    const summary = summarize(run(10, 10), 600_000)
    expect(summary.score).toBeGreaterThan(0)
  })

  it('scores a perfect run at the reference speed near the plain point total', () => {
    // 100 characters in 60s is exactly 20 WPM, the neutral multiplier.
    const summary = summarize(run(100, 100), 60_000)
    expect(summary.wpm).toBeCloseTo(SCORE.referenceWpm, 6)
    expect(summary.score).toBe(100 * SCORE.perCorrect)
  })

  it('ranks missed characters by how often they were missed', () => {
    const summary = summarize(
      [attempt('Q', false), attempt('Q', false), attempt('Z', false), attempt('E', true)],
      30_000,
    )
    expect(summary.weakest).toEqual([
      { character: 'Q', misses: 2 },
      { character: 'Z', misses: 1 },
    ])
  })

  it('lists nothing as weak after a clean run', () => {
    expect(summarize(run(5, 5), 10_000).weakest).toEqual([])
  })
})

describe('pickNext', () => {
  const always = (value: number) => () => value

  it('returns null for an empty pool', () => {
    expect(pickNext([])).toBeNull()
  })

  it('returns the only character available', () => {
    expect(pickNext(['E'])).toBe('E')
  })

  it('avoids repeating what was just shown', () => {
    const picked = pickNext(['E', 'T', 'A'], { recent: ['E'], random: always(0) })
    expect(picked).not.toBe('E')
  })

  it('repeats rather than deadlocking when the pool is too small to avoid it', () => {
    // With two characters and an avoid-last of two, refusing to repeat would
    // leave nothing to pick and the session would stall.
    const picked = pickNext(['E', 'T'], { recent: ['T', 'E'], avoidLast: 2 })
    expect(['E', 'T']).toContain(picked)
  })

  it('prefers what is due when schedules are supplied', () => {
    // T has been answered correctly and is scheduled well into the future; E
    // has never been seen and is due now.
    const schedules = {
      E: newReviewState(T0),
      T: review(review(newReviewState(T0), true, T0), true, T0),
    }
    const picks = new Set(
      Array.from({ length: 20 }, () => pickNext(['E', 'T'], { schedules, now: T0 })),
    )
    expect(picks).toEqual(new Set(['E']))
  })

  it('only ever returns a character from the pool', () => {
    const pool = ['E', 'T', 'A', 'N']
    for (let i = 0; i < 50; i++) {
      expect(pool).toContain(pickNext(pool))
    }
  })
})

describe('isFinished / remainingMs', () => {
  const timed: SessionConfig = {
    mode: 'listening',
    characters: ['E'],
    durationMs: 60_000,
    target: null,
  }
  const counted: SessionConfig = {
    mode: 'listening',
    characters: ['E'],
    durationMs: null,
    target: 5,
  }
  const open: SessionConfig = {
    mode: 'listening',
    characters: ['E'],
    durationMs: null,
    target: null,
  }

  it('ends a timed session exactly at the limit', () => {
    expect(isFinished(timed, [], 59_999)).toBe(false)
    expect(isFinished(timed, [], 60_000)).toBe(true)
  })

  it('ends a counted session on the last answer', () => {
    expect(isFinished(counted, run(4, 4), 0)).toBe(false)
    expect(isFinished(counted, run(5, 5), 0)).toBe(true)
  })

  it('never ends an open session on its own', () => {
    expect(isFinished(open, run(500, 500), 10_000_000)).toBe(false)
  })

  it('reports time left, never negative', () => {
    expect(remainingMs(timed, 0)).toBe(60_000)
    expect(remainingMs(timed, 59_000)).toBe(1000)
    expect(remainingMs(timed, 90_000)).toBe(0)
    expect(remainingMs(open, 1000)).toBeNull()
  })
})
