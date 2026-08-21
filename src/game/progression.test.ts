import { describe, expect, it } from 'vitest'
import {
  STREAK_GRACE_DAYS,
  XP,
  currentStreak,
  dayKey,
  daysBetween,
  isActiveToday,
  levelFromXp,
  levelProgress,
  newStreak,
  recordActivity,
  xpForAnswer,
  xpForLevel,
} from './progression'

/** Local noon on a given date, so a test never sits on a midnight boundary. */
const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).getTime()

describe('dayKey', () => {
  it('uses the local calendar day', () => {
    expect(dayKey(at(2026, 8, 22))).toBe('2026-08-22')
  })

  it('pads single-digit months and days, so keys sort correctly', () => {
    expect(dayKey(at(2026, 1, 5))).toBe('2026-01-05')
  })

  it('treats one minute past local midnight as a new day', () => {
    // The whole point of using local time: 00:01 is tomorrow to the person
    // sitting there, whatever UTC thinks.
    expect(dayKey(at(2026, 8, 22, 23))).toBe('2026-08-22')
    expect(dayKey(at(2026, 8, 23, 0))).toBe('2026-08-23')
  })
})

describe('daysBetween', () => {
  it('counts whole days', () => {
    expect(daysBetween('2026-08-22', '2026-08-23')).toBe(1)
    expect(daysBetween('2026-08-22', '2026-08-22')).toBe(0)
    expect(daysBetween('2026-08-23', '2026-08-22')).toBe(-1)
  })

  it('crosses months and years', () => {
    expect(daysBetween('2026-08-31', '2026-09-01')).toBe(1)
    expect(daysBetween('2026-12-31', '2027-01-01')).toBe(1)
  })

  it('handles a leap day', () => {
    expect(daysBetween('2028-02-28', '2028-03-01')).toBe(2)
  })

  it('is exact across a daylight-saving change', () => {
    // The reason this works off day keys rather than dividing milliseconds:
    // two days a year are 23 or 25 hours long, and a naive division loses a
    // streak on each of them.
    expect(daysBetween('2026-03-28', '2026-03-29')).toBe(1)
    expect(daysBetween('2026-10-24', '2026-10-25')).toBe(1)
  })
})

describe('recordActivity', () => {
  it('starts a streak at 1', () => {
    const streak = recordActivity(newStreak(), at(2026, 8, 22))
    expect(streak).toMatchObject({ current: 1, longest: 1, lastActiveDay: '2026-08-22' })
  })

  it('does not count the same day twice', () => {
    const once = recordActivity(newStreak(), at(2026, 8, 22, 9))
    const twice = recordActivity(once, at(2026, 8, 22, 21))
    expect(twice.current).toBe(1)
    expect(twice).toBe(once)
  })

  it('extends on consecutive days', () => {
    let streak = newStreak()
    for (let day = 22; day <= 26; day++) streak = recordActivity(streak, at(2026, 8, day))
    expect(streak.current).toBe(5)
  })

  it('forgives a single missed day', () => {
    // A streak that breaks on one busy Tuesday punishes exactly the person it
    // is meant to keep.
    let streak = recordActivity(newStreak(), at(2026, 8, 22))
    streak = recordActivity(streak, at(2026, 8, 24))
    expect(streak.current).toBe(2)
  })

  it('resets after more missed days than the grace allows', () => {
    let streak = recordActivity(newStreak(), at(2026, 8, 22))
    streak = recordActivity(streak, at(2026, 8, 22 + STREAK_GRACE_DAYS + 2))
    expect(streak.current).toBe(1)
  })

  it('remembers the longest streak through a reset', () => {
    let streak = newStreak()
    for (let day = 1; day <= 6; day++) streak = recordActivity(streak, at(2026, 8, day))
    streak = recordActivity(streak, at(2026, 8, 20))
    expect(streak.current).toBe(1)
    expect(streak.longest).toBe(6)
  })

  it('ignores a clock that went backwards', () => {
    // A manual time change, or a progress file imported from a device in
    // another timezone. Rebuilding a streak from a date we cannot trust is
    // worse than leaving it alone.
    const streak = recordActivity(newStreak(), at(2026, 8, 22))
    expect(recordActivity(streak, at(2026, 8, 20))).toEqual(streak)
  })
})

describe('currentStreak', () => {
  it('reports a lapsed streak as zero without writing it away', () => {
    // Stored state only changes when the user acts, so a streak that lapsed
    // while the app was closed would otherwise still read as unbroken.
    const streak = recordActivity(newStreak(), at(2026, 8, 22))
    expect(currentStreak(streak, at(2026, 8, 23))).toBe(1)
    expect(currentStreak(streak, at(2026, 8, 24))).toBe(1)
    expect(currentStreak(streak, at(2026, 8, 30))).toBe(0)
    // The record itself is untouched.
    expect(streak.current).toBe(1)
  })

  it('is zero before anything has happened', () => {
    expect(currentStreak(newStreak(), at(2026, 8, 22))).toBe(0)
  })
})

describe('isActiveToday', () => {
  it('knows whether today has been counted', () => {
    const streak = recordActivity(newStreak(), at(2026, 8, 22))
    expect(isActiveToday(streak, at(2026, 8, 22, 23))).toBe(true)
    expect(isActiveToday(streak, at(2026, 8, 23))).toBe(false)
  })
})

describe('xp and levels', () => {
  it('pays more for a harder character', () => {
    expect(xpForAnswer('Q')).toBeGreaterThan(xpForAnswer('E'))
    expect(xpForAnswer('E')).toBe(XP.perCorrect)
  })

  it('starts everyone at level 1 with no xp', () => {
    expect(levelFromXp(0)).toBe(1)
    expect(levelFromXp(-50)).toBe(1)
    expect(xpForLevel(1)).toBe(0)
  })

  it('is self-consistent: the level at a threshold is that level', () => {
    for (let level = 1; level <= 40; level++) {
      const threshold = xpForLevel(level)
      expect(levelFromXp(threshold), `at exactly ${threshold} xp`).toBe(level)
      if (level > 1) {
        expect(levelFromXp(threshold - 1), `one xp short of ${level}`).toBe(level - 1)
      }
    }
  })

  it('never goes backwards as xp increases', () => {
    let previous = 1
    for (let xp = 0; xp < 20_000; xp += 37) {
      const level = levelFromXp(xp)
      expect(level).toBeGreaterThanOrEqual(previous)
      previous = level
    }
  })

  it('gets harder without becoming a wall', () => {
    const span = (level: number) => xpForLevel(level + 1) - xpForLevel(level)
    expect(span(2)).toBeGreaterThan(span(1))
    expect(span(20)).toBeGreaterThan(span(10))
    // Ten levels on should cost more, but not absurdly more.
    expect(span(20) / span(10)).toBeLessThan(3)
  })

  it('reports progress through the current level', () => {
    const progress = levelProgress(xpForLevel(3))
    expect(progress.level).toBe(3)
    expect(progress.into).toBe(0)
    expect(progress.fraction).toBe(0)

    const halfway = levelProgress(xpForLevel(3) + (xpForLevel(4) - xpForLevel(3)) / 2)
    expect(halfway.fraction).toBeCloseTo(0.5, 6)
  })

  it('keeps the fraction inside 0..1 everywhere', () => {
    for (let xp = 0; xp < 10_000; xp += 13) {
      const { fraction } = levelProgress(xp)
      expect(fraction).toBeGreaterThanOrEqual(0)
      expect(fraction).toBeLessThan(1)
    }
  })
})
