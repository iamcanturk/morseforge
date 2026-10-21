/**
 * Achievements (PROJECT.md §49).
 *
 * Each one is a pure predicate over a snapshot of the learner's state, so the
 * whole set can be re-evaluated at any time rather than being awarded by
 * whichever code path happened to notice. That matters because an achievement
 * awarded imperatively is one lost forever if the code that awards it is not
 * running — say, if the user imports progress from another device.
 */

import { joinList, numberWord } from '../data/format'
import { LESSON_STAGES } from '../data/lessonStages'
import { ALL_LETTERS } from '../data/morseAlphabet'

/**
 * The two speed badges, in correct characters per minute.
 *
 * They used to say "words per minute", but the stored best is a session's
 * correct answers per minute divided by five: typing pace in reading and
 * listening drills, not a sending or copying speed in WPM. The thresholds are
 * the old ones times five, so nobody loses a badge they already hold.
 */
export const RADIO_OPERATOR_CPM = 50
export const SPEED_DEMON_CPM = 125

export interface AchievementSnapshot {
  /** Elements ever keyed. */
  elementsSent: number
  /** Characters at mastery level 5. */
  mastered: number
  /** Characters introduced at all. */
  seen: number
  /** Lesson stages completed in a row from the first (see `stagesTaught`). */
  stagesTaught: number
  /**
   * Best session pace as stored: correct answers per minute divided by five
   * (`SessionSummary.wpm`). Times five is characters a minute; never show it as WPM.
   */
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

/**
 * The stored best, in the unit the speed badges state, **unrounded**.
 *
 * `charsPerMinute` rounds for display, and a badge judged on the rounded
 * figure was earned below its own threshold: a best of 49.5 a minute showed
 * as 50 and paid "50 characters a minute".
 */
const bestCpm = (s: AchievementSnapshot) => s.bestWpm * 5

/** The first lesson stage, named in First Ring. */
const FIRST_STAGE = LESSON_STAGES[0] ?? []

/**
 * Thresholds for the count badges, so their copy cannot drift from the rule.
 * Exported for the translated copy (`src/components/Stats/achievementCopy.ts`).
 */
export const CIRCUIT_STARTED_SEEN = 5
export const WEEK_ONE_DAYS = 7
export const HALF_WAY_MASTERED = Math.floor(ALL_LETTERS.length / 2)
export const SIGNAL_MASTER_MASTERED = ALL_LETTERS.length

/** The first lesson stage, named in First Ring. Exported for the translated copy. */
export const FIRST_RING_STAGE: readonly string[] = LESSON_STAGES[0] ?? []

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
    // The reward for a first sitting. Mastery needs thirty-odd answers per
    // letter, so without this the earliest honest badge after First Signal is
    // days away. Stage one is two letters, each answered correctly once: small,
    // but it is a thing the learner actually did, read from their progress.
    id: 'first-ring',
    icon: '📶',
    title: 'First Ring',
    description: `Completed the first lesson stage: ${joinList(FIRST_STAGE)}.`,
    earned: (s) => s.stagesTaught >= 1,
  },
  {
    id: 'circuit-started',
    icon: '🔌',
    title: 'Circuit Started',
    description: `Met your first ${numberWord(CIRCUIT_STARTED_SEEN)} characters.`,
    earned: (s) => s.seen >= CIRCUIT_STARTED_SEEN,
    progress: (s) => ratio(s.seen, CIRCUIT_STARTED_SEEN),
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
    description: `Answered ${RADIO_OPERATOR_CPM} characters a minute correctly in a session.`,
    earned: (s) => bestCpm(s) >= RADIO_OPERATOR_CPM,
    progress: (s) => ratio(bestCpm(s), RADIO_OPERATOR_CPM),
  },
  {
    id: 'speed-demon',
    icon: '⚡',
    title: 'Speed Demon',
    description: `Answered ${SPEED_DEMON_CPM} characters a minute correctly in a session.`,
    earned: (s) => bestCpm(s) >= SPEED_DEMON_CPM,
    progress: (s) => ratio(bestCpm(s), SPEED_DEMON_CPM),
  },
  {
    id: 'week-one',
    icon: '🔥',
    title: 'Week One',
    description: `Practised ${numberWord(WEEK_ONE_DAYS)} days running.`,
    earned: (s) => s.longestStreak >= WEEK_ONE_DAYS,
    progress: (s) => ratio(s.longestStreak, WEEK_ONE_DAYS),
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
    description: `Mastered ${numberWord(HALF_WAY_MASTERED)} characters.`,
    earned: (s) => s.mastered >= HALF_WAY_MASTERED,
    progress: (s) => ratio(s.mastered, HALF_WAY_MASTERED),
  },
  {
    id: 'signal-master',
    icon: '🏆',
    title: 'Signal Master',
    description: `Mastered all ${numberWord(SIGNAL_MASTER_MASTERED)} letters.`,
    earned: (s) => s.mastered >= SIGNAL_MASTER_MASTERED,
    progress: (s) => ratio(s.mastered, SIGNAL_MASTER_MASTERED),
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
