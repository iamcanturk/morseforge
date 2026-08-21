import { describe, expect, it } from 'vitest'
import {
  type Skill,
  type SkillStats,
  SKILLS,
  emptySkillStats,
  isMastered,
  masteryLevel,
  masteryScore,
  nextLevelRequirement,
  recordAttempt,
  skillAccuracy,
} from './mastery'

/** Build stats by answering `attempts` times with `correct` successes each. */
function stats(spec: Partial<Record<Skill, [correct: number, attempts: number]>>): SkillStats {
  const result = emptySkillStats()
  for (const skill of SKILLS) {
    const entry = spec[skill]
    if (entry) result[skill] = { correct: entry[0], attempts: entry[1] }
  }
  return result
}

/** Every skill answered identically — the "practised evenly" case. */
function even(correct: number, attempts: number): SkillStats {
  return stats({
    recognition: [correct, attempts],
    listening: [correct, attempts],
    sending: [correct, attempts],
  })
}

describe('skillAccuracy', () => {
  it('reads zero attempts as 0, not as perfect', () => {
    expect(skillAccuracy({ attempts: 0, correct: 0 })).toBe(0)
  })

  it('is correct over attempts', () => {
    expect(skillAccuracy({ attempts: 4, correct: 3 })).toBe(0.75)
  })
})

describe('masteryScore', () => {
  it('matches the PROJECT.md §5 worked example: 94/82/76 → 84', () => {
    const score = masteryScore(
      stats({ recognition: [94, 100], sending: [82, 100], listening: [76, 100] }),
    )
    expect(Math.round(score * 100)).toBe(84)
  })

  it('is 0 for an untouched character', () => {
    expect(masteryScore(emptySkillStats())).toBe(0)
  })
})

describe('masteryLevel', () => {
  it('is Unknown before the character is introduced', () => {
    expect(masteryLevel(emptySkillStats(), false)).toBe(0)
  })

  it('is Seen once introduced but not yet answered', () => {
    expect(masteryLevel(emptySkillStats(), true)).toBe(1)
  })

  it('stays at Seen while every answer is wrong', () => {
    expect(masteryLevel(even(0, 4), true)).toBe(1)
  })

  it('reaches Learning on the first correct answer', () => {
    expect(masteryLevel(stats({ recognition: [1, 2] }), true)).toBe(2)
  })

  it('climbs Familiar → Strong → Mastered as evidence accumulates', () => {
    expect(masteryLevel(even(3, 4), true)).toBe(3) // 75%, 4 attempts each
    expect(masteryLevel(even(6, 7), true)).toBe(4) // 86%, 7 each
    expect(masteryLevel(even(10, 10), true)).toBe(5) // 100%, 10 each
  })

  it('refuses Mastered on recognition alone, however good it is', () => {
    // This is the §48 requirement: seeing a character is not knowing it. 200
    // perfect recognitions with no sending or listening must not master it.
    const lopsided = stats({ recognition: [200, 200] })
    expect(masteryLevel(lopsided, true)).toBe(2)
    expect(isMastered(lopsided, true)).toBe(false)
  })

  it('refuses Mastered when one skill lags, even at high overall accuracy', () => {
    const weakSending = stats({
      recognition: [30, 30],
      listening: [30, 30],
      sending: [2, 2],
    })
    expect(masteryLevel(weakSending, true)).toBeLessThan(5)
  })

  it('refuses Mastered on a couple of lucky guesses', () => {
    expect(masteryLevel(even(2, 2), true)).toBeLessThan(5)
  })

  it('drops back down when accuracy falls, since the level is derived not stored', () => {
    const strong = even(10, 10)
    expect(masteryLevel(strong, true)).toBe(5)

    // Twenty more attempts, half of them wrong: 20/30 = 67%.
    const degraded = stats({
      recognition: [10, 20],
      listening: [10, 20],
      sending: [10, 20],
    })
    expect(masteryLevel(degraded, true)).toBeLessThan(3)
  })
})

describe('recordAttempt', () => {
  it('increments attempts always and correct only on success', () => {
    let s = emptySkillStats()
    s = recordAttempt(s, 'sending', true)
    s = recordAttempt(s, 'sending', false)
    expect(s.sending).toEqual({ attempts: 2, correct: 1 })
  })

  it('leaves the other skills untouched', () => {
    const s = recordAttempt(emptySkillStats(), 'sending', true)
    expect(s.recognition).toEqual({ attempts: 0, correct: 0 })
    expect(s.listening).toEqual({ attempts: 0, correct: 0 })
  })

  it('does not mutate its input', () => {
    const before = emptySkillStats()
    recordAttempt(before, 'sending', true)
    expect(before.sending).toEqual({ attempts: 0, correct: 0 })
  })
})

describe('nextLevelRequirement', () => {
  it('returns null once Mastered', () => {
    expect(nextLevelRequirement(even(10, 10), true)).toBeNull()
  })

  it('names the skill that is holding the learner back', () => {
    const requirement = nextLevelRequirement(
      stats({ recognition: [20, 20], listening: [20, 20], sending: [0, 0] }),
      true,
    )
    expect(requirement?.needsAttempts.sending).toBeGreaterThan(0)
    expect(requirement?.needsAttempts.recognition).toBeUndefined()
  })

  it('reports the accuracy shortfall, and 0 when only attempts are missing', () => {
    // Perfect but under-practised: Familiar, held off Strong purely by volume.
    const requirement = nextLevelRequirement(even(4, 4), true)
    expect(requirement?.level).toBe(4)
    expect(requirement?.needsScore).toBe(0)
    expect(requirement?.needsAttempts.sending).toBe(2)

    expect(nextLevelRequirement(even(1, 2), true)?.needsScore).toBeGreaterThan(0)
  })

  it('targets Familiar from Unknown, never a level that cannot be reached next', () => {
    expect(nextLevelRequirement(emptySkillStats(), false)?.level).toBe(3)
  })
})
