import { describe, expect, it } from 'vitest'
import {
  STATS_KEY,
  STATS_VERSION,
  applySession,
  awardFirstSignal,
  createStatsStore,
  defaultStats,
  lifetimeAccuracy,
  recordGameBest,
  recordKeying,
  recordMessage,
  STATS_LIMITS,
  isCompleteStats,
  settleImportedStreak,
} from './stats'
import { createMemoryDriver } from './store'
import { summarize, type Attempt } from '../game/session'
import { MAX_XP, XP } from '../game/progression'

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

  it('counts messages without marking the day active', () => {
    const stats = recordMessage(defaultStats())
    expect(stats.messagesSent).toBe(1)
    expect(stats.streak).toEqual(defaultStats().streak)
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

describe('zero-answer sessions', () => {
  it('bank nothing: no session, no streak, no XP', () => {
    // START then END straight away is not practice. Counting it would keep a
    // streak alive on nothing.
    const start = defaultStats()
    expect(applySession(start, summarize([], 60_000), 50, at(2026, 8, 22))).toBe(start)
  })
})

describe('awardFirstSignal', () => {
  it('pays XP.firstSignal once and records when', () => {
    const paid = awardFirstSignal(defaultStats(), at(2026, 8, 22))
    expect(paid.xp).toBe(XP.firstSignal)
    expect(paid.firstSignalAt).toBe(at(2026, 8, 22))
  })

  it('never pays twice', () => {
    const paid = awardFirstSignal(defaultStats(), at(2026, 8, 22))
    expect(awardFirstSignal(paid, at(2026, 8, 23))).toBe(paid)
  })
})

describe('recordGameBest', () => {
  it('keeps the higher score per game', () => {
    let stats = recordGameBest(defaultStats(), 'defender', 400)
    stats = recordGameBest(stats, 'defender', 250)
    stats = recordGameBest(stats, 'runner', 90)
    expect(stats.gameBests).toEqual({ defender: 400, runner: 90 })
    expect(recordGameBest(stats, 'defender', 401).gameBests?.defender).toBe(401)
  })

  it('ignores scores that are not real numbers, and a first zero', () => {
    const start = defaultStats()
    expect(recordGameBest(start, 'runner', Number.NaN)).toBe(start)
    expect(recordGameBest(start, 'runner', -1)).toBe(start)
    expect(recordGameBest(start, 'runner', Infinity)).toBe(start)
    expect(recordGameBest(start, 'runner', 0)).toBe(start)
  })
})

describe('version 2 fields', () => {
  const load = (data: unknown, version = STATS_VERSION) => {
    const driver = createMemoryDriver()
    driver.setItem(STATS_KEY, JSON.stringify({ version, data }))
    return createStatsStore(driver).read()
  }

  it('round-trips firstSignalAt and gameBests', () => {
    const driver = createMemoryDriver()
    const stats = recordGameBest(awardFirstSignal(defaultStats(), at(2026, 8, 22)), 'runner', 12)
    createStatsStore(driver).write(stats)
    expect(createStatsStore(driver).read()).toEqual(stats)
  })

  it('leaves the optional fields off when they are absent or broken', () => {
    const stats = load({ xp: 10, firstSignalAt: 'soon', gameBests: { chess: 9, runner: -3 } })
    expect('firstSignalAt' in stats).toBe(false)
    expect('gameBests' in stats).toBe(false)
  })

  it('drops unknown games but keeps known ones', () => {
    expect(load({ gameBests: { chess: 9, defender: 30 } }).gameBests).toEqual({ defender: 30 })
  })
})

describe('records written before the optional fields existed', () => {
  // A record exactly as the build before firstSignalAt and gameBests wrote it.
  // The version is unchanged on purpose (see STATS_VERSION), so this is read
  // by the ordinary validator, and every number must survive.
  const OLD_RECORD = {
    version: 1,
    data: {
      xp: 1840,
      streak: { current: 4, longest: 9, lastActiveDay: '2026-08-21' },
      sessions: 37,
      totalAnswers: 912,
      totalCorrect: 801,
      elementsSent: 0,
      messagesSent: 0,
      bestWpm: 14.2,
      bestScore: 2210,
      practiceMs: 3_600_000,
    },
  }

  it('is still version 1, so an older build open in a tab can read new records', () => {
    expect(STATS_VERSION).toBe(1)
  })

  it('loads every field unchanged', () => {
    const driver = createMemoryDriver()
    driver.setItem(STATS_KEY, JSON.stringify(OLD_RECORD))
    const stats = createStatsStore(driver).read()
    expect(stats).toEqual(OLD_RECORD.data)
    expect('firstSignalAt' in stats).toBe(false)
    expect('gameBests' in stats).toBe(false)
  })

  it('is a complete record for the import', () => {
    expect(isCompleteStats(OLD_RECORD.data)).toBe(true)
    expect(isCompleteStats({ xp: 1840 })).toBe(false)
  })
})

describe('a record from a newer build', () => {
  it('is read as the default, and never overwritten by it', () => {
    // An old tab left open across a deploy reads a newer record as nothing.
    // Saving its defaults back would erase the real record.
    const driver = createMemoryDriver()
    const future = JSON.stringify({ version: STATS_VERSION + 1, data: { xp: 99 } })
    driver.setItem(STATS_KEY, future)

    const store = createStatsStore(driver)
    expect(store.read()).toEqual(defaultStats())
    expect(store.update((stats) => ({ ...stats, xp: 5 })).xp).toBe(5)
    expect(driver.getItem(STATS_KEY)).toBe(future)
  })
})

describe('plausibility ceilings', () => {
  const load = (data: unknown) => {
    const driver = createMemoryDriver()
    driver.setItem(STATS_KEY, JSON.stringify({ version: STATS_VERSION, data }))
    return createStatsStore(driver).read()
  }

  it('caps every counter at a finite maximum', () => {
    const stats = load({
      xp: 1e40,
      sessions: 1e300,
      totalAnswers: 1e20,
      totalCorrect: 1e20,
      bestScore: 1e18,
      practiceMs: 1e30,
      streak: { current: 1e9, longest: 1e9 },
      gameBests: { defender: 1e50 },
      firstSignalAt: 1e30,
    })
    expect(stats.xp).toBe(MAX_XP)
    expect(stats.sessions).toBe(STATS_LIMITS.count)
    expect(stats.totalAnswers).toBe(STATS_LIMITS.count)
    expect(stats.bestScore).toBe(STATS_LIMITS.count)
    expect(stats.practiceMs).toBe(STATS_LIMITS.practiceMs)
    expect(stats.streak.current).toBe(STATS_LIMITS.streakDays)
    expect(stats.gameBests?.defender).toBe(STATS_LIMITS.count)
    expect(stats.firstSignalAt).toBe(STATS_LIMITS.timestamp)
  })

  it('keeps a last active day in the future on a normal read', () => {
    // A device clock two days behind the last session is not a reason to lose
    // a 40-day streak: recordActivity waits the gap out and leaves it alone.
    const driver = createMemoryDriver()
    const ahead = { current: 40, longest: 40, lastActiveDay: '2026-08-24' }
    driver.setItem(
      STATS_KEY,
      JSON.stringify({ version: STATS_VERSION, data: { ...defaultStats(), streak: ahead } }),
    )
    const stats = createStatsStore(driver).read()
    expect(stats.streak).toEqual(ahead)
    expect(recordKeying(stats, 1, at(2026, 8, 22)).streak).toEqual(ahead)
  })
})

describe('settleImportedStreak', () => {
  const now = at(2026, 8, 22)
  const withDay = (lastActiveDay: string | null) => ({
    ...defaultStats(),
    streak: { current: 40, longest: 52, lastActiveDay },
  })

  it('moves a day more than one ahead to today, keeping the counts', () => {
    const settled = settleImportedStreak(withDay('2099-01-01'), now)
    expect(settled.streak).toEqual({ current: 40, longest: 52, lastActiveDay: '2026-08-22' })
  })

  it('leaves today, yesterday, one day ahead and no day alone', () => {
    for (const day of ['2026-08-21', '2026-08-22', '2026-08-23', null]) {
      const stats = withDay(day)
      expect(settleImportedStreak(stats, now), String(day)).toBe(stats)
    }
  })
})
