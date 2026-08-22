/**
 * Daily challenge results (PROJECT.md §19).
 *
 * Kept apart from lifetime stats because it answers "which days have I done",
 * which is a list, not a counter. Folding it into stats would mean every
 * practice screen parses a month of history it never looks at.
 *
 * Only the last `HISTORY_DAYS` are kept. An unbounded list in localStorage is a
 * slow leak — nobody would ever notice it growing, and nothing on the site
 * shows more than a few weeks.
 */

import { Store, type StorageDriver, count, isRecord, num } from './store'

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
}

export interface DailyRecord {
  /** Newest first. */
  results: readonly DailyResult[]
}

export function emptyDaily(): DailyRecord {
  return { results: [] }
}

const isDateKey = (value: unknown): value is string =>
  typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)

function validateResult(value: unknown): DailyResult | null {
  if (!isRecord(value) || !isDateKey(value['date'])) return null
  return {
    date: value['date'],
    accuracy: num(value['accuracy'], 0, 0, 1),
    score: count(value['score']),
    passed: value['passed'] === true,
  }
}

function validateDaily(value: unknown): DailyRecord | null {
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
  return { results: results.slice(0, HISTORY_DAYS) }
}

export function createDailyStore(driver?: StorageDriver): Store<DailyRecord> {
  return new Store<DailyRecord>(
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

  return {
    results: [result, ...record.results]
      .sort((a, b) => b.date.localeCompare(a.date))
      .slice(0, HISTORY_DAYS),
  }
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
  const cursor = new Date(`${today}T00:00:00Z`)
  while (done.has(cursor.toISOString().slice(0, 10))) {
    streak++
    cursor.setUTCDate(cursor.getUTCDate() - 1)
  }
  return streak
}
