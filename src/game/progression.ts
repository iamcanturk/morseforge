/**
 * XP, levels and the daily streak (PROJECT.md §19, §20, §49, §57).
 *
 * All of it is pure and takes an explicit timestamp, because streaks are a
 * date-arithmetic problem and date arithmetic is where this kind of feature
 * quietly breaks — around midnight, across a timezone change, on the day the
 * clocks go back.
 */

import { difficultyWeight } from './session'

/* -------------------------------------------------------------------------- */
/* Days                                                                        */
/* -------------------------------------------------------------------------- */

/**
 * The calendar day a timestamp falls on, in the user's own timezone.
 *
 * Local rather than UTC on purpose. A learner in Istanbul practising at 01:00
 * has started a new day by any human definition; telling them their streak
 * broke because UTC disagreed would be indefensible, and "it was still
 * yesterday in London" is not an explanation anyone accepts.
 */
export function dayKey(timestamp: number): string {
  const date = new Date(timestamp)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

/**
 * Whole days between two day keys.
 *
 * Computed from the keys rather than by dividing milliseconds: a day is not
 * reliably 86,400,000 ms. Daylight saving makes two of them 23 or 25 hours
 * long, and a naive division loses a streak twice a year.
 */
export function daysBetween(from: string, to: string): number {
  const parse = (key: string) => {
    const [year, month, day] = key.split('-').map(Number)
    return Date.UTC(year!, month! - 1, day!)
  }
  return Math.round((parse(to) - parse(from)) / 86_400_000)
}

/* -------------------------------------------------------------------------- */
/* Streak                                                                      */
/* -------------------------------------------------------------------------- */

export interface Streak {
  current: number
  longest: number
  /** Day key of the last day with any activity, or null. */
  lastActiveDay: string | null
}

export function newStreak(): Streak {
  return { current: 0, longest: 0, lastActiveDay: null }
}

/**
 * How many missed days are forgiven before a streak resets.
 *
 * One. A streak that breaks the instant someone has a busy Tuesday punishes the
 * exact person it is meant to keep: the one who has been showing up. A grace of
 * one day keeps the habit intact without making the number meaningless.
 */
export const STREAK_GRACE_DAYS = 1

/** Record activity on `timestamp`. Idempotent within a single day. */
export function recordActivity(streak: Streak, timestamp: number): Streak {
  const today = dayKey(timestamp)

  if (streak.lastActiveDay === null) {
    return { current: 1, longest: Math.max(1, streak.longest), lastActiveDay: today }
  }

  const gap = daysBetween(streak.lastActiveDay, today)

  // Already counted today. Practising twice does not count twice.
  if (gap === 0) return streak

  // A clock that went backwards — a manual time change, or an imported file
  // from a device in another timezone. Leave the streak alone rather than
  // rebuilding it from a date we cannot trust.
  if (gap < 0) return streak

  const current = gap <= STREAK_GRACE_DAYS + 1 ? streak.current + 1 : 1

  return { current, longest: Math.max(current, streak.longest), lastActiveDay: today }
}

/**
 * The streak as it should be *displayed* now.
 *
 * Stored state is only updated when the user does something, so a streak that
 * lapsed while the app was closed would still read as unbroken until they next
 * practise. This reports the truth without writing it.
 */
export function currentStreak(streak: Streak, now: number): number {
  if (streak.lastActiveDay === null) return 0
  const gap = daysBetween(streak.lastActiveDay, dayKey(now))
  if (gap < 0) return streak.current
  return gap <= STREAK_GRACE_DAYS + 1 ? streak.current : 0
}

/** Whether today has already been counted. Drives "practise today" prompts. */
export function isActiveToday(streak: Streak, now: number): boolean {
  return streak.lastActiveDay === dayKey(now)
}

/* -------------------------------------------------------------------------- */
/* XP and levels                                                               */
/* -------------------------------------------------------------------------- */

export const XP = {
  /** Base award for a correct answer, before difficulty weighting. */
  perCorrect: 10,
  /** Flat award for finishing a session, however it went. */
  sessionComplete: 20,
  /** For reaching Mastered on a character. */
  characterMastered: 100,
} as const

/** XP for one correct answer, weighted by how hard the character is. */
export function xpForAnswer(character: string): number {
  return Math.round(XP.perCorrect * difficultyWeight(character))
}

/**
 * Total XP needed to *reach* a level. Level 1 starts at zero.
 *
 * Quadratic, so later levels take longer without the curve becoming a wall.
 * Level 2 at 100, level 5 at 1,000, level 10 at 4,050 — roughly a session per
 * level early on, and a week of them by level 20.
 */
export function xpForLevel(level: number): number {
  if (level <= 1) return 0
  return 50 * (level - 1) * level
}

export function levelFromXp(xp: number): number {
  if (xp <= 0) return 1
  // Closed form of the inverse, then a guard against float drift at the seam.
  let level = Math.floor((1 + Math.sqrt(1 + (4 * xp) / 50)) / 2)
  while (xpForLevel(level + 1) <= xp) level += 1
  while (level > 1 && xpForLevel(level) > xp) level -= 1
  return level
}

export interface LevelProgress {
  level: number
  /** XP earned within the current level. */
  into: number
  /** XP the current level spans. */
  span: number
  /** 0..1 through the current level. */
  fraction: number
}

export function levelProgress(xp: number): LevelProgress {
  const level = levelFromXp(xp)
  const floor = xpForLevel(level)
  const ceiling = xpForLevel(level + 1)
  const span = ceiling - floor
  const into = xp - floor
  return { level, into, span, fraction: span === 0 ? 0 : into / span }
}
