import { describe, expect, it } from 'vitest'
import { ACHIEVEMENTS, type AchievementSnapshot, evaluate, newlyEarned } from './achievements'

const snapshot = (patch: Partial<AchievementSnapshot> = {}): AchievementSnapshot => ({
  elementsSent: 0,
  mastered: 0,
  seen: 0,
  bestWpm: 0,
  longestStreak: 0,
  sessions: 0,
  totalCorrect: 0,
  messagesSent: 0,
  ...patch,
})

describe('ACHIEVEMENTS', () => {
  it('has a unique id per achievement', () => {
    const ids = ACHIEVEMENTS.map((a) => a.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('awards nothing to a brand-new learner', () => {
    for (const achievement of evaluate(snapshot())) {
      expect(achievement.isEarned, achievement.id).toBe(false)
    }
  })

  it('awards everything to a finished one', () => {
    const complete = snapshot({
      elementsSent: 5000,
      mastered: 26,
      seen: 26,
      bestWpm: 40,
      longestStreak: 30,
      sessions: 100,
      totalCorrect: 5000,
      messagesSent: 10,
    })
    for (const achievement of evaluate(complete)) {
      expect(achievement.isEarned, achievement.id).toBe(true)
    }
  })

  it('is monotonic: nothing is ever un-earned by doing more', () => {
    // An achievement that could be lost would be a bug in a predicate, and the
    // whole point of predicates over a snapshot is that they cannot be.
    const before = snapshot({ mastered: 13, bestWpm: 25, seen: 20, longestStreak: 7 })
    const after = snapshot({ mastered: 26, bestWpm: 40, seen: 26, longestStreak: 30 })

    for (const achievement of ACHIEVEMENTS) {
      if (achievement.earned(before)) {
        expect(achievement.earned(after), `${achievement.id} was lost`).toBe(true)
      }
    }
  })
})

describe('evaluate', () => {
  it('reports an earned achievement as complete regardless of its progress function', () => {
    // "Earned, 87%" is nonsense on a badge.
    const earned = evaluate(snapshot({ bestWpm: 40 })).find((a) => a.id === 'radio-operator')!
    expect(earned.isEarned).toBe(true)
    expect(earned.fraction).toBe(1)
  })

  it('reports partial progress toward the ones that have it', () => {
    const partial = evaluate(snapshot({ mastered: 13 })).find((a) => a.id === 'signal-master')!
    expect(partial.isEarned).toBe(false)
    expect(partial.fraction).toBeCloseTo(0.5, 6)
  })

  it('never reports a fraction outside 0..1', () => {
    for (const achievement of evaluate(snapshot({ mastered: 999, bestWpm: 999, seen: 999 }))) {
      expect(achievement.fraction).toBeGreaterThanOrEqual(0)
      expect(achievement.fraction).toBeLessThanOrEqual(1)
    }
  })

  it('gives zero progress to achievements with no progress function', () => {
    const binary = evaluate(snapshot()).find((a) => a.id === 'first-signal')!
    expect(binary.fraction).toBe(0)
  })
})

describe('newlyEarned', () => {
  it('reports only what crossed the line', () => {
    const before = snapshot({ seen: 4 })
    const after = snapshot({ seen: 5, elementsSent: 1 })
    expect(
      newlyEarned(before, after)
        .map((a) => a.id)
        .sort(),
    ).toEqual(['circuit-started', 'first-signal'])
  })

  it('reports nothing when nothing changed', () => {
    expect(newlyEarned(snapshot({ seen: 5 }), snapshot({ seen: 5 }))).toEqual([])
  })

  it('does not re-report something already held', () => {
    const held = snapshot({ seen: 10 })
    const more = snapshot({ seen: 20 })
    expect(newlyEarned(held, more).map((a) => a.id)).not.toContain('circuit-started')
  })
})
