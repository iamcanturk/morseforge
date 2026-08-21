/**
 * Lifetime statistics (PROJECT.md §19, §20, §49).
 *
 * Separate from progress because it answers a different question. Progress is
 * "what do I know" and is read on every keystroke; stats is "what have I done"
 * and is read on the dashboard. Keeping them apart means a practice screen does
 * not parse a growing pile of counters it will never look at.
 */

import { type Streak, newStreak, recordActivity } from '../game/progression'
import type { SessionSummary } from '../game/session'
import { Store, type StorageDriver, count, isRecord, num } from './store'

export const STATS_KEY = 'morseforge_statistics'
export const STATS_VERSION = 1

export interface StatsRecord {
  xp: number
  streak: Streak
  sessions: number
  /** Every prompt answered, across every session. */
  totalAnswers: number
  totalCorrect: number
  /** Elements keyed on the straight key. */
  elementsSent: number
  /** Prosigns or real words sent rather than drilled, for the §49 badge. */
  messagesSent: number
  bestWpm: number
  bestScore: number
  /** Total milliseconds spent in sessions. */
  practiceMs: number
}

export function defaultStats(): StatsRecord {
  return {
    xp: 0,
    streak: newStreak(),
    sessions: 0,
    totalAnswers: 0,
    totalCorrect: 0,
    elementsSent: 0,
    messagesSent: 0,
    bestWpm: 0,
    bestScore: 0,
    practiceMs: 0,
  }
}

function validateStreak(value: unknown): Streak {
  if (!isRecord(value)) return newStreak()
  const last = value['lastActiveDay']
  return {
    current: count(value['current']),
    longest: count(value['longest']),
    // Anything that is not a plausible day key is dropped: a malformed one
    // would make every date comparison NaN and silently freeze the streak.
    lastActiveDay: typeof last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : null,
  }
}

function validateStats(value: unknown): StatsRecord | null {
  if (!isRecord(value)) return null
  const fallback = defaultStats()

  const totalAnswers = count(value['totalAnswers'])
  const streak = validateStreak(value['streak'])

  return {
    xp: count(value['xp']),
    // Longest can never be below current, however the file was edited.
    streak: { ...streak, longest: Math.max(streak.longest, streak.current) },
    sessions: count(value['sessions']),
    totalAnswers,
    // Correct can never exceed answers.
    totalCorrect: Math.min(count(value['totalCorrect']), totalAnswers),
    elementsSent: count(value['elementsSent']),
    messagesSent: count(value['messagesSent']),
    bestWpm: num(value['bestWpm'], fallback.bestWpm, 0, 200),
    bestScore: count(value['bestScore']),
    practiceMs: count(value['practiceMs']),
  }
}

export function createStatsStore(driver?: StorageDriver): Store<StatsRecord> {
  return new Store<StatsRecord>(
    {
      key: STATS_KEY,
      version: STATS_VERSION,
      validate: validateStats,
      createDefault: defaultStats,
    },
    driver,
  )
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

/** Fold a finished session into the lifetime record. */
export function applySession(
  stats: StatsRecord,
  summary: SessionSummary,
  xpEarned: number,
  now: number,
): StatsRecord {
  return {
    ...stats,
    xp: stats.xp + xpEarned,
    streak: recordActivity(stats.streak, now),
    sessions: stats.sessions + 1,
    totalAnswers: stats.totalAnswers + summary.total,
    totalCorrect: stats.totalCorrect + summary.correct,
    // A best is only a best if something was actually answered — a session
    // where the user pressed start and walked away should not set a record.
    bestWpm: summary.total > 0 ? Math.max(stats.bestWpm, summary.wpm) : stats.bestWpm,
    bestScore: Math.max(stats.bestScore, summary.score),
    practiceMs: stats.practiceMs + summary.elapsedMs,
  }
}

/** Count elements keyed on the straight key, and mark the day as active. */
export function recordKeying(stats: StatsRecord, elements: number, now: number): StatsRecord {
  if (elements <= 0) return stats
  return {
    ...stats,
    elementsSent: stats.elementsSent + elements,
    streak: recordActivity(stats.streak, now),
  }
}

/** A real message went out, rather than a drilled character (§49). */
export function recordMessage(stats: StatsRecord, now: number): StatsRecord {
  return {
    ...stats,
    messagesSent: stats.messagesSent + 1,
    streak: recordActivity(stats.streak, now),
  }
}

/** Lifetime accuracy, 0..1. Zero answers reads as 0 rather than as perfect. */
export function lifetimeAccuracy(stats: StatsRecord): number {
  return stats.totalAnswers === 0 ? 0 : stats.totalCorrect / stats.totalAnswers
}
