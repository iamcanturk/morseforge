/**
 * Achievements (PROJECT.md §49).
 *
 * Each one is a pure predicate over a snapshot of the learner's state, so the
 * whole set can be re-evaluated at any time rather than being awarded by
 * whichever code path happened to notice. That matters because an achievement
 * awarded imperatively is one lost forever if the code that awards it is not
 * running — say, if the user imports progress from another device.
 */

export interface AchievementSnapshot {
  /** Elements ever keyed. */
  elementsSent: number
  /** Characters at mastery level 5. */
  mastered: number
  /** Characters introduced at all. */
  seen: number
  /** Best measured speed, in words per minute. */
  bestWpm: number
  /** Longest run of consecutive active days. */
  longestStreak: number
  sessions: number
  /** Correct answers across every session. */
  totalCorrect: number
  /** Prosigns or real messages sent, e.g. SOS or CQ. */
  messagesSent: number
}

export interface Achievement {
  id: string
  icon: string
  title: string
  description: string
  /** True once earned. Pure — never mutates. */
  earned: (snapshot: AchievementSnapshot) => boolean
  /** 0..1 toward earning it, for the ones worth showing progress on. */
  progress?: (snapshot: AchievementSnapshot) => number
}

const ratio = (value: number, target: number) => Math.min(value / target, 1)

/** The §49 list, in the order it is shown. */
export const ACHIEVEMENTS: readonly Achievement[] = [
  {
    id: 'first-signal',
    icon: '⚡',
    title: 'First Signal',
    description: 'Sent your first Morse element.',
    earned: (s) => s.elementsSent >= 1,
  },
  {
    id: 'circuit-started',
    icon: '🔌',
    title: 'Circuit Started',
    description: 'Met your first five characters.',
    earned: (s) => s.seen >= 5,
    progress: (s) => ratio(s.seen, 5),
  },
  {
    id: 'lightbulb',
    icon: '💡',
    title: 'Lightbulb',
    description: 'Mastered a character — all three skills, not just the easy one.',
    earned: (s) => s.mastered >= 1,
  },
  {
    id: 'radio-operator',
    icon: '📡',
    title: 'Radio Operator',
    description: 'Reached 10 words per minute.',
    earned: (s) => s.bestWpm >= 10,
    progress: (s) => ratio(s.bestWpm, 10),
  },
  {
    id: 'speed-demon',
    icon: '⚡',
    title: 'Speed Demon',
    description: 'Reached 25 words per minute.',
    earned: (s) => s.bestWpm >= 25,
    progress: (s) => ratio(s.bestWpm, 25),
  },
  {
    id: 'week-one',
    icon: '🔥',
    title: 'Week One',
    description: 'Practised seven days running.',
    earned: (s) => s.longestStreak >= 7,
    progress: (s) => ratio(s.longestStreak, 7),
  },
  {
    id: 'cq-cq-cq',
    icon: '🛰️',
    title: 'CQ CQ CQ',
    description: 'Sent a real message rather than a drill.',
    earned: (s) => s.messagesSent >= 1,
  },
  {
    id: 'half-way',
    icon: '🔋',
    title: 'Half The Network',
    description: 'Mastered thirteen characters.',
    earned: (s) => s.mastered >= 13,
    progress: (s) => ratio(s.mastered, 13),
  },
  {
    id: 'signal-master',
    icon: '🏆',
    title: 'Signal Master',
    description: 'Mastered all twenty-six letters.',
    earned: (s) => s.mastered >= 26,
    progress: (s) => ratio(s.mastered, 26),
  },
]

export interface EvaluatedAchievement extends Achievement {
  isEarned: boolean
  fraction: number
}

/** Evaluate the whole set against a snapshot. */
export function evaluate(snapshot: AchievementSnapshot): EvaluatedAchievement[] {
  return ACHIEVEMENTS.map((achievement) => {
    const isEarned = achievement.earned(snapshot)
    return {
      ...achievement,
      isEarned,
      // An earned achievement is always shown as complete, whatever its
      // progress function says — a badge reading "earned, 87%" is nonsense.
      fraction: isEarned ? 1 : (achievement.progress?.(snapshot) ?? 0),
    }
  })
}

/** Which achievements are newly earned between two snapshots. */
export function newlyEarned(
  before: AchievementSnapshot,
  after: AchievementSnapshot,
): Achievement[] {
  return ACHIEVEMENTS.filter(
    (achievement) => !achievement.earned(before) && achievement.earned(after),
  )
}
