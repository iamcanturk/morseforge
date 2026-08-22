import { describe, expect, it } from 'vitest'
import {
  DAILY_KEY,
  DAILY_VERSION,
  HISTORY_DAYS,
  createDailyStore,
  dailyStreak,
  emptyDaily,
  recordDaily,
  resultFor,
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
