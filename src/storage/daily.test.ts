import { describe, expect, it } from 'vitest'
import {
  DAILY_KEY,
  DAILY_VERSION,
  HISTORY_DAYS,
  createDailyStore,
  dailyStreak,
  dailyStreakStatus,
  emptyDaily,
  recordDaily,
  resultFor,
  isCompleteDaily,
  validateDaily,
  type DailyResult,
} from './daily'
import { createMemoryDriver } from './store'

const result = (date: string, overrides: Partial<DailyResult> = {}): DailyResult => ({
  date,
  accuracy: 0.9,
  score: 100,
  passed: true,
  ...overrides,
})

describe('recordDaily', () => {
  it('records a day', () => {
    const record = recordDaily(emptyDaily(), result('2026-08-22'))
    expect(resultFor(record, '2026-08-22')?.score).toBe(100)
  })

  it('refuses a second attempt at the same day', () => {
    // Letting a retry overwrite the first score would make the whole thing
    // meaningless — everyone would hold 100%, because everyone would retry.
    const first = recordDaily(emptyDaily(), result('2026-08-22', { score: 40, accuracy: 0.4 }))
    const second = recordDaily(first, result('2026-08-22', { score: 900, accuracy: 1 }))
    expect(second).toBe(first)
    expect(resultFor(second, '2026-08-22')?.score).toBe(40)
  })

  it('keeps the newest first whatever order they arrive in', () => {
    let record = recordDaily(emptyDaily(), result('2026-08-20'))
    record = recordDaily(record, result('2026-08-22'))
    record = recordDaily(record, result('2026-08-21'))
    expect(record.results.map((r) => r.date)).toEqual(['2026-08-22', '2026-08-21', '2026-08-20'])
  })

  it('drops the oldest past the history limit', () => {
    // An unbounded list in localStorage is a leak nobody would ever notice.
    let record = emptyDaily()
    for (let day = 1; day <= HISTORY_DAYS + 10; day++) {
      record = recordDaily(record, result(`2026-01-${String(day).padStart(2, '0')}`))
    }
    expect(record.results).toHaveLength(HISTORY_DAYS)
    expect(record.results.at(-1)?.date).toBe('2026-01-11')
  })

  it('does not mutate the record it was given', () => {
    const before = emptyDaily()
    recordDaily(before, result('2026-08-22'))
    expect(before.results).toEqual([])
  })
})

describe('resultFor', () => {
  it('returns null for a day never attempted', () => {
    expect(resultFor(emptyDaily(), '2026-08-22')).toBeNull()
  })
})

describe('dailyStreak', () => {
  it('is 0 when today has not been done, however long the run before it', () => {
    let record = emptyDaily()
    for (const date of ['2026-08-19', '2026-08-20', '2026-08-21']) {
      record = recordDaily(record, result(date))
    }
    expect(dailyStreak(record, '2026-08-22')).toBe(0)
  })

  it('counts back through consecutive days', () => {
    let record = emptyDaily()
    for (const date of ['2026-08-20', '2026-08-21', '2026-08-22']) {
      record = recordDaily(record, result(date))
    }
    expect(dailyStreak(record, '2026-08-22')).toBe(3)
  })

  it('stops at the first gap', () => {
    let record = emptyDaily()
    for (const date of ['2026-08-18', '2026-08-21', '2026-08-22']) {
      record = recordDaily(record, result(date))
    }
    expect(dailyStreak(record, '2026-08-22')).toBe(2)
  })

  it('counts a failed attempt, since showing up is the point', () => {
    let record = recordDaily(emptyDaily(), result('2026-08-21', { passed: false, accuracy: 0.2 }))
    record = recordDaily(record, result('2026-08-22'))
    expect(dailyStreak(record, '2026-08-22')).toBe(2)
  })

  it('walks back across a month boundary', () => {
    let record = emptyDaily()
    for (const date of ['2026-07-30', '2026-07-31', '2026-08-01']) {
      record = recordDaily(record, result(date))
    }
    expect(dailyStreak(record, '2026-08-01')).toBe(3)
  })
})

describe('persistence', () => {
  it('round-trips', () => {
    const driver = createMemoryDriver()
    createDailyStore(driver).write(recordDaily(emptyDaily(), result('2026-08-22')))
    expect(resultFor(createDailyStore(driver).read(), '2026-08-22')?.passed).toBe(true)
  })

  it('drops a malformed entry rather than the whole history', () => {
    const driver = createMemoryDriver()
    driver.setItem(
      DAILY_KEY,
      JSON.stringify({
        version: DAILY_VERSION,
        data: {
          results: [
            { date: '2026-08-22', accuracy: 0.9, score: 10, passed: true },
            { date: 'yesterday', accuracy: 1, score: 1, passed: true },
            'not an object',
          ],
        },
      }),
    )

    const record = createDailyStore(driver).read()
    expect(record.results).toHaveLength(1)
    expect(record.results[0]?.date).toBe('2026-08-22')
  })

  it('clamps an edited accuracy claiming more than 100%', () => {
    const driver = createMemoryDriver()
    driver.setItem(
      DAILY_KEY,
      JSON.stringify({
        version: DAILY_VERSION,
        data: { results: [{ date: '2026-08-22', accuracy: 40, score: 5, passed: true }] },
      }),
    )
    expect(createDailyStore(driver).read().results[0]?.accuracy).toBe(1)
  })

  it('de-duplicates a hand-edited file listing the same day twice', () => {
    const driver = createMemoryDriver()
    driver.setItem(
      DAILY_KEY,
      JSON.stringify({
        version: DAILY_VERSION,
        data: {
          results: [
            { date: '2026-08-22', accuracy: 0.5, score: 5, passed: false },
            { date: '2026-08-22', accuracy: 1, score: 500, passed: true },
          ],
        },
      }),
    )
    const record = createDailyStore(driver).read()
    expect(record.results).toHaveLength(1)
    expect(record.results[0]?.score).toBe(5)
  })
})

describe('optional per-line fields', () => {
  const load = (entry: Record<string, unknown>) => {
    const driver = createMemoryDriver()
    driver.setItem(
      DAILY_KEY,
      JSON.stringify({ version: DAILY_VERSION, data: { results: [entry] } }),
    )
    return createDailyStore(driver).read().results[0]
  }

  it('round-trips per-line accuracy and completion', () => {
    const driver = createMemoryDriver()
    const entry = result('2026-08-22', { lines: [1, 0.5, 0], completed: true })
    createDailyStore(driver).write(recordDaily(emptyDaily(), entry))
    expect(createDailyStore(driver).read().results[0]).toEqual(entry)
  })

  it('reads a result without them exactly as before', () => {
    const entry = load({ date: '2026-08-22', accuracy: 0.9, score: 100, passed: true })
    expect(entry).toEqual(result('2026-08-22'))
  })

  it('clamps line accuracies and drops an implausibly long list', () => {
    expect(load({ ...result('2026-08-22'), lines: [4, -1, 'x'] })?.lines).toEqual([1, 0, 0])
    const long = Array.from({ length: 500 }, () => 1)
    expect(load({ ...result('2026-08-22'), lines: long })?.lines).toBeUndefined()
  })

  it('never reads an unfinished run as a pass', () => {
    // Giving up after one perfect line must not seal the day as passed.
    expect(load({ ...result('2026-08-22'), completed: false, passed: true })?.passed).toBe(false)
  })

  it('is exported as a validator that can say no', () => {
    expect(validateDaily('nope')).toBeNull()
    expect(validateDaily({ results: [] })).toEqual(emptyDaily())
  })
})

describe('an unfinished run on the way in', () => {
  it('is not a pass even before a reload', () => {
    // Only the read path used to normalise this, so the store's cache said
    // "passed" for an abandoned run until the page was reloaded.
    const store = createDailyStore(createMemoryDriver())
    store.update((record) =>
      recordDaily(record, result('2026-08-22', { passed: true, completed: false })),
    )
    expect(store.read().results[0]?.passed).toBe(false)
  })
})

describe('isCompleteDaily', () => {
  it('needs a list of well-formed results', () => {
    expect(isCompleteDaily({ results: [] })).toBe(true)
    expect(isCompleteDaily({ results: [result('2026-08-22')] })).toBe(true)
    expect(isCompleteDaily({ results: 'oops' })).toBe(false)
    expect(isCompleteDaily({ results: [{ date: 'yesterday' }] })).toBe(false)
    expect(isCompleteDaily({})).toBe(false)
  })
})

describe('dailyStreakStatus (B4)', () => {
  const days = (...dates: string[]) =>
    dates.reduce((record, date) => recordDaily(record, result(date)), emptyDaily())

  it('keeps a run alive on the morning before today is played', () => {
    // dailyStreak alone says 0 here, which the page showed as "no run yet".
    const record = days('2026-08-20', '2026-08-21', '2026-08-22')
    expect(dailyStreak(record, '2026-08-23')).toBe(0)
    expect(dailyStreakStatus(record, '2026-08-23')).toEqual({ days: 3, doneToday: false })
  })

  it('includes today once it has been played', () => {
    const record = days('2026-08-21', '2026-08-22', '2026-08-23')
    expect(dailyStreakStatus(record, '2026-08-23')).toEqual({ days: 3, doneToday: true })
  })

  it('is 0 once a whole day has been missed', () => {
    const record = days('2026-08-20', '2026-08-21')
    expect(dailyStreakStatus(record, '2026-08-23')).toEqual({ days: 0, doneToday: false })
  })

  it('walks back across a month boundary', () => {
    const record = days('2026-08-30', '2026-08-31')
    expect(dailyStreakStatus(record, '2026-09-01').days).toBe(2)
  })

  it('counts an incomplete run as showing up', () => {
    const record = recordDaily(
      days('2026-08-21'),
      result('2026-08-22', { passed: false, completed: false, lines: [1, 0, 0] }),
    )
    expect(dailyStreakStatus(record, '2026-08-22')).toEqual({ days: 2, doneToday: true })
  })

  it('is empty, not an error, for an empty record or a broken key', () => {
    expect(dailyStreakStatus(emptyDaily(), '2026-08-22')).toEqual({ days: 0, doneToday: false })
    expect(dailyStreakStatus(days('2026-08-22'), 'garbage')).toEqual({ days: 0, doneToday: false })
  })
})

describe('a shareable result survives a reload', () => {
  it('keeps every line, in order, with the run marked incomplete', () => {
    const driver = createMemoryDriver()
    const entry = result('2026-08-22', {
      accuracy: 0.25,
      passed: false,
      completed: false,
      lines: [1, 0, 0, 0, 0, 0, 0, 0],
    })
    createDailyStore(driver).update((record) => recordDaily(record, entry))
    // What a reload reads: the raw envelope, through the validator, with no
    // help from the page's cached store.
    const stored = JSON.parse(driver.getItem(DAILY_KEY) ?? 'null') as { data: unknown }
    expect(validateDaily(stored.data)?.results[0]).toEqual(entry)
  })
})

describe('a streak longer than the kept history', () => {
  /** `count` consecutive UTC days from `start`, recorded in order. */
  const run = (start: string, count: number, record = emptyDaily()) => {
    const cursor = new Date(`${start}T00:00:00Z`)
    for (let i = 0; i < count; i++) {
      record = recordDaily(record, result(cursor.toISOString().slice(0, 10)))
      cursor.setUTCDate(cursor.getUTCDate() + 1)
    }
    return { record, last: new Date(cursor.getTime() - 86_400_000).toISOString().slice(0, 10) }
  }

  it('counts 40 straight days as 40, with only the newest days listed', () => {
    const { record, last } = run('2026-08-21', HISTORY_DAYS + 5)
    expect(record.results).toHaveLength(HISTORY_DAYS)
    expect(dailyStreak(record, last)).toBe(HISTORY_DAYS + 5)
    expect(dailyStreakStatus(record, last)).toEqual({ days: HISTORY_DAYS + 5, doneToday: true })
  })

  it('keeps yesterday alive the next morning, and survives a reload', () => {
    const { record, last } = run('2026-08-21', HISTORY_DAYS + 5)
    const driver = createMemoryDriver()
    createDailyStore(driver).write(record)
    const reloaded = validateDaily(JSON.parse(driver.getItem(DAILY_KEY)!).data)!
    const morning = new Date(`${last}T00:00:00Z`)
    morning.setUTCDate(morning.getUTCDate() + 1)
    expect(dailyStreakStatus(reloaded, morning.toISOString().slice(0, 10)).days).toBe(
      HISTORY_DAYS + 5,
    )
  })

  it('starts again after a missed day', () => {
    const long = run('2026-08-21', HISTORY_DAYS + 5)
    const gap = new Date(`${long.last}T00:00:00Z`)
    gap.setUTCDate(gap.getUTCDate() + 2)
    const after = run(gap.toISOString().slice(0, 10), 3, long.record)
    expect(dailyStreak(after.record, after.last)).toBe(3)
  })

  it('carries on from an older record that has no run stored', () => {
    // Saved by an earlier build: 35 listed days and nothing else.
    const { record, last } = run('2026-08-21', HISTORY_DAYS)
    const old = { results: record.results }
    expect(dailyStreak(old, last)).toBe(HISTORY_DAYS)
    const next = new Date(`${last}T00:00:00Z`)
    next.setUTCDate(next.getUTCDate() + 1)
    const day = next.toISOString().slice(0, 10)
    expect(dailyStreak(recordDaily(old, result(day)), day)).toBe(HISTORY_DAYS + 1)
  })

  it('ignores a stored run that does not end on the newest result', () => {
    const value = { results: [result('2026-08-22')], run: { end: '2026-08-01', days: 900 } }
    expect(validateDaily(value)?.run).toBeUndefined()
    expect(validateDaily({ ...value, run: { end: '2026-08-22', days: 'many' } })?.run).toBe(
      undefined,
    )
    expect(dailyStreak(validateDaily(value)!, '2026-08-22')).toBe(1)
  })
})

describe('two tabs and the one attempt a day', () => {
  it('lets the second tab neither overwrite nor add a second attempt', () => {
    const backing = new Map<string, string>()
    const tabA = createDailyStore(createMemoryDriver(backing))
    const tabB = createDailyStore(createMemoryDriver(backing))
    tabA.read()
    tabB.update((record) => recordDaily(record, result('2026-08-22', { score: 40 })))
    tabA.update((record) => recordDaily(record, result('2026-08-22', { score: 900 })))
    const stored = createDailyStore(createMemoryDriver(backing)).read()
    expect(stored.results).toHaveLength(1)
    expect(stored.results[0]?.score).toBe(40)
  })
})
