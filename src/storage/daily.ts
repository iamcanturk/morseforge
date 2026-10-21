/**
 * Daily challenge results (PROJECT.md §19).
 *
 * Kept apart from lifetime stats because it answers "which days have I done",
 * which is a list, not a counter. Folding it into stats would mean every
 * practice screen parses a month of history it never looks at.
 *
 * Only the last `HISTORY_DAYS` are kept. An unbounded list in localStorage is a
 * slow leak — nobody would ever notice it growing, and nothing on the site
 * shows more than a few weeks. The streak is not limited by that window: the
 * record also carries the length of the newest run (`run`), kept up as days
 * are added, so day 40 of a streak reads as 40 and not as the 35 still listed.
 */

import { type Store, type StorageDriver, sharedStore, count, isRecord, num } from './store'

export const DAILY_KEY = 'morseforge_daily'
export const DAILY_VERSION = 1

/** How many days of history are kept. Enough for a month strip. */
export const HISTORY_DAYS = 35

export interface DailyResult {
  /** UTC date key, `YYYY-MM-DD`. */
  date: string
  /** 0..1, characters copied correctly. */
  accuracy: number
  score: number
  passed: boolean
  /**
   * Accuracy per line, 0..1, in the order the lines were played. Kept so a
   * result can be shown and shared again after a reload. An unplayed line is
   * stored as 0, because it was not copied.
   */
  lines?: readonly number[]
  /**
   * False when the run stopped before its last line. An abandoned run is a
   * result, but not one that can be called a pass.
   */
  completed?: boolean
}

/** More lines than any daily has; a longer list is not from this app. */
const MAX_LINES = 32

/** A score no daily can reach; anything above it was edited in. */
const MAX_SCORE = 1_000_000_000

/**
 * The run of consecutive days that ends on `end`, counted when `end` was
 * recorded, before older days were trimmed from `results`.
 */
export interface DailyRun {
  /** UTC date key of the run's last day: the newest result. */
  end: string
  /** Consecutive days attempted, ending on `end`. At least 1. */
  days: number
}

export interface DailyRecord {
  /** Newest first. */
  results: readonly DailyResult[]
  /** The newest run, so a streak can outlast the trimmed history. */
  run?: DailyRun
}

export function emptyDaily(): DailyRecord {
  return { results: [] }
}

const isDateKey = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

function validateResult(value: unknown): DailyResult | null {
  if (!isRecord(value) || !isDateKey(value['date'])) return null
  const completed = value['completed']
  const result: DailyResult = {
    date: value['date'],
    accuracy: num(value['accuracy'], 0, 0, 1),
    score: count(value['score'], 0, MAX_SCORE),
    // A run recorded as unfinished cannot also be a pass, whatever the file says.
    passed: value['passed'] === true && completed !== false,
  }
  const lines = value['lines']
  if (Array.isArray(lines) && lines.length <= MAX_LINES) {
    result.lines = lines.map((line) => num(line, 0, 0, 1))
  }
  if (typeof completed === 'boolean') result.completed = completed
  return result
}

/**
 * Narrow untrusted data to a daily record, or null if it is not one.
 *
 * Exported for the backup import, which must be able to say "rejected" rather
 * than accept an empty history in place of the user's.
 */
export function validateDaily(value: unknown): DailyRecord | null {
  if (!isRecord(value)) return null
  const raw = Array.isArray(value['results']) ? value['results'] : []

  // A malformed entry is dropped rather than taking the whole history with it.
  const seen = new Set<string>()
  const results: DailyResult[] = []
  for (const entry of raw) {
    const result = validateResult(entry)
    if (result === null || seen.has(result.date)) continue
    seen.add(result.date)
    results.push(result)
  }

  results.sort((a, b) => b.date.localeCompare(a.date))
  const record: DailyRecord = { results: results.slice(0, HISTORY_DAYS) }
  const run = validateRun(value['run'], record.results)
  if (run) record.run = run
  return record
}

/** Longer than anyone has been playing; a bigger run was edited in. */
const MAX_RUN_DAYS = 100_000

/**
 * A stored run, or null. Trusted only when it ends on the newest result: any
 * other end is stale or edited, and the visible history is then the truth.
 */
function validateRun(value: unknown, results: readonly DailyResult[]): DailyRun | null {
  if (!isRecord(value) || !isDateKey(value['end'])) return null
  const days = count(value['days'], 0, MAX_RUN_DAYS)
  if (days < 1 || results[0]?.date !== value['end']) return null
  return { end: value['end'], days }
}

export function createDailyStore(driver?: StorageDriver): Store<DailyRecord> {
  return sharedStore<DailyRecord>(
    {
      key: DAILY_KEY,
      version: DAILY_VERSION,
      validate: validateDaily,
      createDefault: emptyDaily,
    },
    driver,
  )
}

/* -------------------------------------------------------------------------- */
/* Operations                                                                  */
/* -------------------------------------------------------------------------- */

export function resultFor(record: DailyRecord, date: string): DailyResult | null {
  return record.results.find((result) => result.date === date) ?? null
}

/**
 * Record an attempt.
 *
 * A day can only be attempted once for the record. Letting a second attempt
 * overwrite the first would make the whole thing meaningless — everyone would
 * hold 100%, because everyone would retry until they did.
 */
export function recordDaily(record: DailyRecord, result: DailyResult): DailyRecord {
  if (resultFor(record, result.date) !== null) return record
  // Same rule as the read path, applied on the way in too: otherwise the
  // store's cache reports an abandoned run as a pass until the next reload.
  const normalised: DailyResult = { ...result, passed: result.passed && result.completed !== false }

  const all: DailyRecord = {
    results: [normalised, ...record.results].sort((a, b) => b.date.localeCompare(a.date)),
    ...(record.run ? { run: record.run } : {}),
  }
  // Count the newest run while every day is still listed, then trim.
  const end = all.results[0]!.date
  const next: DailyRecord = {
    results: all.results.slice(0, HISTORY_DAYS),
    run: { end, days: dailyStreak(all, end) },
  }
  return next
}

const DAY_MS = 86_400_000

/** Whole days from `from` to `to`, both UTC date keys. NaN for a bad key. */
function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS)
}

/**
 * Consecutive days completed, counting back from `today`.
 *
 * Counts attempts, not passes. A streak that broke because you had a bad day at
 * 20 WPM would punish showing up, which is the only thing a streak is for.
 */
export function dailyStreak(record: DailyRecord, today: string): number {
  const done = new Set(record.results.map((result) => result.date))
  if (!done.has(today)) return 0

  let streak = 0
  let reachesRunEnd = false
  const cursor = new Date(`${today}T00:00:00Z`)
  // Shaped like a date but not one (2026-01-45): it was attempted, and there
  // is no calendar to walk back through.
  if (Number.isNaN(cursor.getTime())) return 1
  for (;;) {
    const key = cursor.toISOString().slice(0, 10)
    if (!done.has(key)) break
    if (key === record.run?.end) reachesRunEnd = true
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }

  // The listed days stop at the trimmed window. When the walk from today runs
  // unbroken through the stored run's last day, that run's length, counted
  // before the trim, carries the streak back past it.
  const run = record.run
  if (run && reachesRunEnd) {
    const carried = daysBetween(run.end, today) + run.days
    if (Number.isFinite(carried)) streak = Math.max(streak, carried)
  }
  return streak
}

export interface DailyStreakStatus {
  /** Consecutive days attempted, up to today if done, else up to yesterday. */
  days: number
  /** Whether today's challenge has been attempted. */
  doneToday: boolean
}

/**
 * The streak as it stands before and after today's run (B4).
 *
 * `dailyStreak` is 0 until today is attempted, so a twelve-day run read as
 * "no run yet" every morning. This keeps yesterday's run alive until today is
 * over: twelve days, play today to keep it.
 */
export function dailyStreakStatus(record: DailyRecord, today: string): DailyStreakStatus {
  if (resultFor(record, today) !== null) {
    return { days: dailyStreak(record, today), doneToday: true }
  }
  const yesterday = new Date(`${today}T00:00:00Z`)
  if (Number.isNaN(yesterday.getTime())) return { days: 0, doneToday: false }
  yesterday.setUTCDate(yesterday.getUTCDate() - 1)
  return { days: dailyStreak(record, yesterday.toISOString().slice(0, 10)), doneToday: false }
}

/**
 * Whether untrusted data is a whole daily record rather than a fragment.
 *
 * For the import: `{ results: 'oops' }` must not "restore" an empty history,
 * and a list with a malformed entry is not one to trust over the current one,
 * because the validator would quietly drop the entry.
 */
export function isCompleteDaily(value: unknown): boolean {
  if (!isRecord(value) || !Array.isArray(value['results'])) return false
  return value['results'].every((entry) => validateResult(entry) !== null)
}
