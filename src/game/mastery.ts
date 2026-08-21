/**
 * Character mastery (PROJECT.md §5, §48).
 *
 * A character is tracked across three independent skills, because they are
 * genuinely different abilities and improve at different rates:
 *
 *   recognition — see ".-", say "A"
 *   listening   — hear the tones, say "A"
 *   sending     — be told "A", key it correctly
 *
 * §48 is the reason they are separate rather than one accuracy number: it is
 * easy to recognise a printed ".-" and still be unable to hear it at speed or
 * key it. Mastery therefore requires evidence in *all three*, not a strong
 * showing in the easiest one.
 */

export const SKILLS = ['recognition', 'listening', 'sending'] as const
export type Skill = (typeof SKILLS)[number]

export interface SkillStat {
  attempts: number
  correct: number
}

export type SkillStats = Record<Skill, SkillStat>

/** PROJECT.md §5. */
export const MASTERY_LEVELS = {
  0: 'Unknown',
  1: 'Seen',
  2: 'Learning',
  3: 'Familiar',
  4: 'Strong',
  5: 'Mastered',
} as const

export type MasteryLevel = 0 | 1 | 2 | 3 | 4 | 5

export function emptySkillStats(): SkillStats {
  return {
    recognition: { attempts: 0, correct: 0 },
    listening: { attempts: 0, correct: 0 },
    sending: { attempts: 0, correct: 0 },
  }
}

/** Raw accuracy for one skill, 0..1. Zero attempts reads as 0, not as perfect. */
export function skillAccuracy(stat: SkillStat): number {
  return stat.attempts === 0 ? 0 : stat.correct / stat.attempts
}

/**
 * Overall mastery percentage, 0..1 — the mean of the three skill accuracies.
 *
 * Matches the §5 worked example: 94/82/76 averages to 84.
 */
export function masteryScore(stats: SkillStats): number {
  return SKILLS.reduce((sum, skill) => sum + skillAccuracy(stats[skill]), 0) / SKILLS.length
}

/**
 * Requirements per level.
 *
 * `minAttemptsPerSkill` is what stops a character reaching Mastered on a couple
 * of lucky guesses, and — more importantly — what stops it reaching Mastered
 * through recognition alone. Every skill has to clear the bar independently.
 */
export const LEVEL_REQUIREMENTS: Record<
  3 | 4 | 5,
  { minAttemptsPerSkill: number; minScore: number }
> = {
  3: { minAttemptsPerSkill: 3, minScore: 0.7 },
  4: { minAttemptsPerSkill: 6, minScore: 0.85 },
  5: { minAttemptsPerSkill: 10, minScore: 0.9 },
}

/**
 * Work out the level from the evidence.
 *
 * Derived on read rather than stored, so changing the thresholds re-grades
 * existing progress instead of leaving users stranded at a level the current
 * rules would never award.
 */
export function masteryLevel(stats: SkillStats, seen: boolean): MasteryLevel {
  const totalAttempts = SKILLS.reduce((sum, skill) => sum + stats[skill].attempts, 0)
  const totalCorrect = SKILLS.reduce((sum, skill) => sum + stats[skill].correct, 0)

  if (totalAttempts === 0) return seen ? 1 : 0
  if (totalCorrect === 0) return 1

  const score = masteryScore(stats)
  const weakestSkill = Math.min(...SKILLS.map((skill) => stats[skill].attempts))

  for (const level of [5, 4, 3] as const) {
    const { minAttemptsPerSkill, minScore } = LEVEL_REQUIREMENTS[level]
    if (weakestSkill >= minAttemptsPerSkill && score >= minScore) return level
  }

  return 2
}

export function isMastered(stats: SkillStats, seen: boolean): boolean {
  return masteryLevel(stats, seen) === 5
}

/** Record one attempt, returning new stats. Pure — the caller persists. */
export function recordAttempt(stats: SkillStats, skill: Skill, correct: boolean): SkillStats {
  const previous = stats[skill]
  return {
    ...stats,
    [skill]: {
      attempts: previous.attempts + 1,
      correct: previous.correct + (correct ? 1 : 0),
    },
  }
}

/**
 * What the learner still has to do to reach the next level, for the progress UI.
 * Returns null once Mastered.
 *
 * Showing "you need 4 more sending attempts" is far more actionable than a bare
 * percentage, and it is the only way the user discovers that sending is the
 * skill holding them back.
 */
export function nextLevelRequirement(
  stats: SkillStats,
  seen: boolean,
): {
  level: MasteryLevel
  needsAttempts: Partial<Record<Skill, number>>
  needsScore: number
} | null {
  const current = masteryLevel(stats, seen)
  if (current === 5) return null

  const target = (Math.max(current, 2) + 1) as 3 | 4 | 5
  const { minAttemptsPerSkill, minScore } = LEVEL_REQUIREMENTS[target]

  const needsAttempts: Partial<Record<Skill, number>> = {}
  for (const skill of SKILLS) {
    const shortfall = minAttemptsPerSkill - stats[skill].attempts
    if (shortfall > 0) needsAttempts[skill] = shortfall
  }

  return {
    level: target,
    needsAttempts,
    needsScore: Math.max(0, minScore - masteryScore(stats)),
  }
}
