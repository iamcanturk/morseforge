/**
 * Lifetime statistics (PROJECT.md §19, §20, §49).
 *
 * Separate from progress because it answers a different question. Progress is
 * "what do I know" and is read on every keystroke; stats is "what have I done"
 * and is read on the dashboard. Keeping them apart means a practice screen does
 * not parse a growing pile of counters it will never look at.
 */

import {
  type Streak,
  MAX_XP,
  XP,
  dayKey,
  daysBetween,
  newStreak,
  recordActivity,
} from '../game/progression'
import type { SessionSummary } from '../game/session'
import { type Store, type StorageDriver, sharedStore, count, isRecord, num } from './store'

export const STATS_KEY = 'morseforge_statistics'
/**
 * Still version 1. `firstSignalAt` and `gameBests` are optional and additive:
 * a record without them is valid as it is, and an older build reading a record
 * with them ignores two keys. A version bump would buy nothing and cost a lot,
 * because an older build still open in a tab reads a newer version as "no
 * record" and would then save its defaults over the real one.
 */
export const STATS_VERSION = 1

/**
 * Ceilings for numbers read from storage or an import.
 *
 * Far beyond anything practice produces (a billion answers is decades of
 * round-the-clock drilling), but low enough that arithmetic on them stays
 * exact and terminates. An export edited to claim 1e40 XP once froze the stats
 * page in a level calculation that never finished.
 */
export const STATS_LIMITS = {
  count: 1_000_000_000,
  /** About 31 years of milliseconds. */
  practiceMs: 1_000_000_000_000,
  /** A streak longer than a century is not one. */
  streakDays: 36_500,
  /** The largest timestamp `Date` accepts. */
  timestamp: 8_640_000_000_000_000,
} as const

/** The fields every stats record has had since version 1. */
const REQUIRED_NUMBERS = [
  'xp',
  'sessions',
  'totalAnswers',
  'totalCorrect',
  'elementsSent',
  'messagesSent',
  'bestWpm',
  'bestScore',
  'practiceMs',
] as const

/** The games that keep a personal best. */
export const GAME_IDS = ['defender', 'runner'] as const
export type GameId = (typeof GAME_IDS)[number]

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
  /**
   * When the one-time first-signal XP was paid, epoch ms. Its presence is the
   * guard: absent means not yet paid, so it can never be paid twice.
   */
  firstSignalAt?: number
  /** Highest score per game. A game never played has no entry, not a zero. */
  gameBests?: Partial<Record<GameId, number>>
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
    current: count(value['current'], 0, STATS_LIMITS.streakDays),
    longest: count(value['longest'], 0, STATS_LIMITS.streakDays),
    // Anything that is not a plausible day key is dropped: a malformed one
    // would make every date comparison NaN and silently freeze the streak.
    // A day in the future is kept on a normal read: that is this device's
    // clock running behind, and `recordActivity` already waits it out without
    // touching the streak. Only an import corrects it (see `settleImportedStreak`).
    lastActiveDay: typeof last === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(last) ? last : null,
  }
}

function validateGameBests(value: unknown): Partial<Record<GameId, number>> | null {
  if (!isRecord(value)) return null
  const bests: Partial<Record<GameId, number>> = {}
  // Unknown games are dropped rather than carried: a key nothing reads would
  // sit in every export forever, and a hand-added one is not a best anyone set.
  for (const game of GAME_IDS) {
    const score = count(value[game], -1, STATS_LIMITS.count)
    if (score >= 0) bests[game] = score
  }
  return Object.keys(bests).length > 0 ? bests : null
}

/**
 * Narrow untrusted data to a stats record, or null if it is not one.
 *
 * Exported for the backup import, which has to tell "invalid" apart from
 * "valid" rather than quietly accepting a default in place of the user's data.
 */
export function validateStats(value: unknown): StatsRecord | null {
  if (!isRecord(value)) return null
  const fallback = defaultStats()
  const counter = (key: string, max: number = STATS_LIMITS.count) => count(value[key], 0, max)

  const totalAnswers = counter('totalAnswers')
  const streak = validateStreak(value['streak'])

  const record: StatsRecord = {
    xp: counter('xp', MAX_XP),
    // Longest can never be below current, however the file was edited.
    streak: { ...streak, longest: Math.max(streak.longest, streak.current) },
    sessions: counter('sessions'),
    totalAnswers,
    // Correct can never exceed answers.
    totalCorrect: Math.min(counter('totalCorrect'), totalAnswers),
    elementsSent: counter('elementsSent'),
    messagesSent: counter('messagesSent'),
    bestWpm: num(value['bestWpm'], fallback.bestWpm, 0, 200),
    bestScore: counter('bestScore'),
    practiceMs: counter('practiceMs', STATS_LIMITS.practiceMs),
  }

  // Optional fields are left off entirely when absent or unusable, so a record
  // without them looks exactly like one that never had them.
  const firstSignalAt = num(value['firstSignalAt'], -1, -1, STATS_LIMITS.timestamp)
  if (firstSignalAt >= 0) record.firstSignalAt = firstSignalAt
  const gameBests = validateGameBests(value['gameBests'])
  if (gameBests) record.gameBests = gameBests

  return record
}

/**
 * Whether untrusted data is a whole stats record rather than a fragment.
 *
 * The validator fills gaps with defaults, which is right for a read and wrong
 * for an import: `{ xp: 500 }` would "restore" zero sessions, no streak and an
 * unpaid first-signal award over the real record. Optional fields may be
 * absent, but if present must have the right type.
 */
export function isCompleteStats(value: unknown): boolean {
  if (!isRecord(value) || !isRecord(value['streak'])) return false
  if (!REQUIRED_NUMBERS.every((key) => typeof value[key] === 'number')) return false
  const first = value['firstSignalAt']
  if (first !== undefined && typeof first !== 'number') return false
  const bests = value['gameBests']
  return bests === undefined || isRecord(bests)
}

/**
 * Settle an imported streak whose last day is later than tomorrow here.
 *
 * Only for imports. A backup from a device with a clock far ahead (or one
 * edited to 2099) would otherwise freeze the streak for good, because
 * `recordActivity` treats a later last day as this clock running behind and
 * waits. The day becomes today rather than being dropped, so the current and
 * longest counts survive and the next activity carries on from them. One day
 * ahead is left alone: that is only a device a timezone east of this one.
 */
export function settleImportedStreak(stats: StatsRecord, now: number): StatsRecord {
  const last = stats.streak.lastActiveDay
  const today = dayKey(now)
  if (last === null || daysBetween(today, last) <= 1) return stats
  return { ...stats, streak: { ...stats.streak, lastActiveDay: today } }
}

export function createStatsStore(driver?: StorageDriver): Store<StatsRecord> {
  return sharedStore<StatsRecord>(
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

/**
 * Fold a finished session into the lifetime record.
 *
 * A session with no answers is not folded in at all. Pressing START then END
 * is not practice, and counting it would keep a streak alive and bump the
 * session count on nothing.
 */
export function applySession(
  stats: StatsRecord,
  summary: SessionSummary,
  xpEarned: number,
  now: number,
): StatsRecord {
  if (summary.total <= 0) return stats
  return {
    ...stats,
    xp: stats.xp + Math.max(0, Math.round(xpEarned)),
    streak: recordActivity(stats.streak, now),
    sessions: stats.sessions + 1,
    totalAnswers: stats.totalAnswers + summary.total,
    totalCorrect: stats.totalCorrect + summary.correct,
    bestWpm: Math.max(stats.bestWpm, summary.wpm),
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

/**
 * A real message went out, rather than a drilled character (§49).
 *
 * Only counted: it does not mark the streak day. Creating a message link is
 * typing, not Morse, so it must not keep a practice streak alive by itself.
 * Keying a message on the telegraph marks the day through its elements.
 */
export function recordMessage(stats: StatsRecord): StatsRecord {
  return { ...stats, messagesSent: stats.messagesSent + 1 }
}

/**
 * Pay the one-time first-signal XP, if it has not been paid.
 *
 * Returns the record unchanged once paid. The caller decides that a signal was
 * sent; this only guarantees that the reward happens once per profile.
 */
export function awardFirstSignal(stats: StatsRecord, now: number): StatsRecord {
  if (stats.firstSignalAt !== undefined) return stats
  return { ...stats, xp: stats.xp + XP.firstSignal, firstSignalAt: now }
}

/**
 * Keep the higher of the stored best and `score` for a game.
 *
 * A score that is not a finite, non-negative number is ignored, so a broken
 * game loop cannot write NaN into a best that then never compares again.
 */
export function recordGameBest(stats: StatsRecord, game: GameId, score: number): StatsRecord {
  if (!Number.isFinite(score) || score < 0) return stats
  const rounded = Math.round(score)
  const previous = stats.gameBests?.[game]
  if (previous !== undefined && previous >= rounded) return stats
  // A zero is not a personal best; it is a game that has not been won yet.
  if (previous === undefined && rounded === 0) return stats
  return { ...stats, gameBests: { ...stats.gameBests, [game]: rounded } }
}

/** Lifetime accuracy, 0..1. Zero answers reads as 0 rather than as perfect. */
export function lifetimeAccuracy(stats: StatsRecord): number {
  return stats.totalAnswers === 0 ? 0 : stats.totalCorrect / stats.totalAnswers
}
