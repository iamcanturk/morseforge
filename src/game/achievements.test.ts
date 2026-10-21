import { describe, expect, it } from 'vitest'
import {
  ACHIEVEMENTS,
  type AchievementSnapshot,
  RADIO_OPERATOR_CPM,
  SPEED_DEMON_CPM,
  evaluate,
  newlyEarned,
} from './achievements'
import { charsPerMinute } from './session'
import { joinList, numberWord } from '../data/format'
import { LESSON_STAGES } from '../data/lessonStages'
import { ALL_LETTERS } from '../data/morseAlphabet'

const snapshot = (patch: Partial<AchievementSnapshot> = {}): AchievementSnapshot => ({
  elementsSent: 0,
  mastered: 0,
  seen: 0,
  stagesTaught: 0,
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
      stagesTaught: 4,
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

  it('has something to earn in a first sitting, from lesson progress alone', () => {
    // Finishing lesson stage 1 is the first real thing a learner does. Every
    // other badge needs days of answers or a key the lesson may not have.
    expect(newlyEarned(snapshot(), snapshot({ stagesTaught: 1 })).map((a) => a.id)).toEqual([
      'first-ring',
    ])
  })

  it('does not re-report something already held', () => {
    const held = snapshot({ seen: 10 })
    const more = snapshot({ seen: 20 })
    expect(newlyEarned(held, more).map((a) => a.id)).not.toContain('circuit-started')
  })
})

describe('the speed badges (chars/min, not WPM)', () => {
  const byId = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!
  // The stored best is correct answers per minute ÷ 5; this is its inverse.
  const atCpm = (cpm: number) => snapshot({ bestWpm: cpm / 5 })

  it('keeps the ids, so badges already earned persist', () => {
    expect(byId('radio-operator').title).toBe('Radio Operator')
    expect(byId('speed-demon').title).toBe('Speed Demon')
  })

  it('states the unit that is measured, never words per minute', () => {
    for (const id of ['radio-operator', 'speed-demon']) {
      expect(byId(id).description, id).not.toMatch(/words per minute|wpm/i)
      expect(byId(id).description, id).toMatch(/characters a minute/)
    }
    expect(byId('radio-operator').description).toContain(String(RADIO_OPERATOR_CPM))
    expect(byId('speed-demon').description).toContain(String(SPEED_DEMON_CPM))
  })

  it('awards at the stated pace, read the way the result card reads it', () => {
    expect(byId('radio-operator').earned(atCpm(RADIO_OPERATOR_CPM))).toBe(true)
    expect(byId('radio-operator').earned(atCpm(RADIO_OPERATOR_CPM - 1))).toBe(false)
    expect(byId('speed-demon').earned(atCpm(SPEED_DEMON_CPM))).toBe(true)
    expect(byId('speed-demon').earned(atCpm(SPEED_DEMON_CPM - 1))).toBe(false)
    expect(charsPerMinute({ wpm: atCpm(RADIO_OPERATOR_CPM).bestWpm })).toBe(RADIO_OPERATOR_CPM)
  })

  it('keeps the old thresholds (10 and 25 in stored units), so nothing is un-earned', () => {
    expect(byId('radio-operator').earned(snapshot({ bestWpm: 10 }))).toBe(true)
    expect(byId('speed-demon').earned(snapshot({ bestWpm: 25 }))).toBe(true)
  })

  it('shows progress in the same unit', () => {
    const half = evaluate(atCpm(RADIO_OPERATOR_CPM / 2)).find((a) => a.id === 'radio-operator')!
    expect(half.fraction).toBeCloseTo(0.5, 6)
  })
})

describe('honest thresholds and copy', () => {
  const byId = (id: string) => ACHIEVEMENTS.find((a) => a.id === id)!

  it('never awards a speed badge on a best that only rounds up to it', () => {
    // 9.9 is 49.5 a minute, which displays as 50.
    expect(byId('radio-operator').earned(snapshot({ bestWpm: 9.9 }))).toBe(false)
    expect(byId('speed-demon').earned(snapshot({ bestWpm: 24.9 }))).toBe(false)
    expect(byId('radio-operator').progress!(snapshot({ bestWpm: 9.9 }))).toBeLessThan(1)
  })

  it('names the first lesson stage from the data, not from typed letters', () => {
    expect(byId('first-ring').description).toBe(
      `Completed the first lesson stage: ${joinList(LESSON_STAGES[0]!)}.`,
    )
  })

  it('states the counts the rules use', () => {
    expect(byId('signal-master').earned(snapshot({ mastered: ALL_LETTERS.length }))).toBe(true)
    expect(byId('signal-master').description).toContain(numberWord(ALL_LETTERS.length))
    const half = Math.floor(ALL_LETTERS.length / 2)
    expect(byId('half-way').earned(snapshot({ mastered: half - 1 }))).toBe(false)
    expect(byId('half-way').description).toContain(numberWord(half))
  })
})
