import { describe, expect, it } from 'vitest'
import {
  STATS_KEY,
  STATS_VERSION,
  applySession,
  createStatsStore,
  defaultStats,
  lifetimeAccuracy,
  recordKeying,
  recordMessage,
} from './stats'
import { createMemoryDriver } from './store'
import { summarize, type Attempt } from '../game/session'

const at = (year: number, month: number, day: number) =>
  new Date(year, month - 1, day, 12).getTime()

const attempts = (n: number, hits: number): Attempt[] =>
  Array.from({ length: n }, (_, i) => ({
    character: 'E',
    answer: 'E',
    correct: i < hits,
    elapsedMs: 500,
  }))

describe('applySession', () => {
  it('accumulates totals and counts the session', () => {
    const stats = applySession(
      defaultStats(),
      summarize(attempts(10, 8), 60_000),
      120,
      at(2026, 8, 22),
    )
    expect(stats).toMatchObject({ sessions: 1, totalAnswers: 10, totalCorrect: 8, xp: 120 })
    expect(stats.streak.current).toBe(1)
  })

  it('keeps the best speed and score', () => {
    let stats = applySession(
      defaultStats(),
      summarize(attempts(50, 50), 60_000),
      0,
      at(2026, 8, 22),
    )
    const best = stats.bestWpm
    stats = applySession(stats, summarize(attempts(10, 10), 60_000), 0, at(2026, 8, 23))
    expect(stats.bestWpm).toBe(best)
  })

  it('does not let an abandoned session set a record', () => {
    // Press start, walk away: zero answers, but `measureWpm` of nothing is 0
    // and `summarize` of nothing scores 0 — neither should overwrite a best.
    let stats = applySession(
      defaultStats(),
      summarize(attempts(20, 20), 30_000),
      0,
      at(2026, 8, 22),
    )
    const before = { wpm: stats.bestWpm, score: stats.bestScore }
    stats = applySession(stats, summarize([], 60_000), 0, at(2026, 8, 23))
    expect(stats.bestWpm).toBe(before.wpm)
    expect(stats.bestScore).toBe(before.score)
  })

  it('extends the streak across days but not within one', () => {
    let stats = applySession(defaultStats(), summarize(attempts(5, 5), 10_000), 0, at(2026, 8, 22))
    stats = applySession(stats, summarize(attempts(5, 5), 10_000), 0, at(2026, 8, 22))
    expect(stats.streak.current).toBe(1)
    expect(stats.sessions).toBe(2)

    stats = applySession(stats, summarize(attempts(5, 5), 10_000), 0, at(2026, 8, 23))
    expect(stats.streak.current).toBe(2)
  })
})

describe('recordKeying / recordMessage', () => {
  it('counts elements and marks the day active', () => {
    const stats = recordKeying(defaultStats(), 9, at(2026, 8, 22))
    expect(stats.elementsSent).toBe(9)
    expect(stats.streak.current).toBe(1)
  })

  it('ignores a zero or negative count', () => {
    const start = defaultStats()
    expect(recordKeying(start, 0, at(2026, 8, 22))).toBe(start)
    expect(recordKeying(start, -5, at(2026, 8, 22))).toBe(start)
  })

  it('counts messages', () => {
    expect(recordMessage(defaultStats(), at(2026, 8, 22)).messagesSent).toBe(1)
  })
})

describe('lifetimeAccuracy', () => {
  it('reads no answers as 0, not as perfect', () => {
    expect(lifetimeAccuracy(defaultStats())).toBe(0)
  })

  it('is correct over answers', () => {
    const stats = { ...defaultStats(), totalAnswers: 4, totalCorrect: 3 }
    expect(lifetimeAccuracy(stats)).toBe(0.75)
  })
})

describe('validation', () => {
  const load = (data: unknown) => {
    const driver = createMemoryDriver()
    driver.setItem(STATS_KEY, JSON.stringify({ version: STATS_VERSION, data }))
    return createStatsStore(driver).read()
  }

  it('clamps correct answers to answers given', () => {
    expect(load({ totalAnswers: 3, totalCorrect: 900 }).totalCorrect).toBe(3)
  })

  it('never lets the longest streak fall below the current one', () => {
    const streak = load({ streak: { current: 10, longest: 2 } }).streak
    expect(streak.longest).toBe(10)
  })

  it('drops a malformed day key rather than freezing the streak', () => {
    // A key that is not a date makes every comparison NaN, which would leave
    // the streak stuck forever with no visible cause.
    expect(
      load({ streak: { current: 3, lastActiveDay: 'yesterday' } }).streak.lastActiveDay,
    ).toBeNull()
    expect(load({ streak: { current: 3, lastActiveDay: '2026-08-22' } }).streak.lastActiveDay).toBe(
      '2026-08-22',
    )
  })

  it('rejects an impossible best speed', () => {
    expect(load({ bestWpm: 99_999 }).bestWpm).toBe(200)
    expect(load({ bestWpm: -5 }).bestWpm).toBe(0)
  })
})
