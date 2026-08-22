import { describe, expect, it } from 'vitest'
import { dailyChallenge, dailyKey, msUntilNext } from './dailyChallenge'
import { isEncodable } from '../data/morseAlphabet'

describe('dailyKey', () => {
  it('formats as YYYY-MM-DD', () => {
    expect(dailyKey(Date.UTC(2026, 7, 22, 12))).toBe('2026-08-22')
  })

  it('pads single digits', () => {
    expect(dailyKey(Date.UTC(2026, 0, 5, 12))).toBe('2026-01-05')
  })

  it('is UTC, not local', () => {
    // Deliberately different from the streak code, which uses the local day. A
    // shared challenge only works if "today" means the same thing everywhere.
    expect(dailyKey(Date.UTC(2026, 7, 22, 23, 30))).toBe('2026-08-22')
    expect(dailyKey(Date.UTC(2026, 7, 23, 0, 30))).toBe('2026-08-23')
  })
})

describe('msUntilNext', () => {
  it('counts down to the next UTC midnight', () => {
    expect(msUntilNext(Date.UTC(2026, 7, 22, 23, 0))).toBe(60 * 60 * 1000)
  })

  it('is a full day at midnight, never zero or negative', () => {
    expect(msUntilNext(Date.UTC(2026, 7, 22, 0, 0))).toBe(24 * 60 * 60 * 1000)
  })

  it('rolls over a month end', () => {
    expect(msUntilNext(Date.UTC(2026, 7, 31, 23, 0))).toBe(60 * 60 * 1000)
  })
})

describe('dailyChallenge', () => {
  it('is identical for the same date', () => {
    // The entire premise: no backend hands this out, so the date has to be
    // enough to reproduce it byte for byte on any device.
    expect(dailyChallenge('2026-08-22')).toEqual(dailyChallenge('2026-08-22'))
  })

  it('differs from the day before and the day after', () => {
    const today = dailyChallenge('2026-08-22')
    expect(today.prompts).not.toEqual(dailyChallenge('2026-08-21').prompts)
    expect(today.prompts).not.toEqual(dailyChallenge('2026-08-23').prompts)
  })

  it('always produces a full challenge', () => {
    for (let day = 1; day <= 28; day++) {
      const date = `2026-02-${String(day).padStart(2, '0')}`
      const challenge = dailyChallenge(date)
      expect(challenge.prompts, date).toHaveLength(8)
      expect(challenge.date).toBe(date)
    }
  })

  it('never repeats a line within a day', () => {
    for (let day = 1; day <= 31; day++) {
      const date = `2026-03-${String(day).padStart(2, '0')}`
      const { prompts } = dailyChallenge(date)
      expect(new Set(prompts).size, date).toBe(prompts.length)
    }
  })

  it('only ever asks for sendable characters', () => {
    for (let day = 1; day <= 30; day++) {
      const date = `2026-04-${String(day).padStart(2, '0')}`
      for (const prompt of dailyChallenge(date).prompts) {
        for (const character of prompt) {
          if (character === ' ') continue
          expect(isEncodable(character), `${date}: ${prompt}`).toBe(true)
        }
      }
    }
  })

  it('stays at a speed a learner can attempt', () => {
    // A day that landed on 35 WPM would be unattemptable for most people, and
    // one that landed on 5 would teach counting beeps.
    for (let day = 1; day <= 31; day++) {
      const { wpm, farnsworthWpm } = dailyChallenge(`2026-05-${String(day).padStart(2, '0')}`)
      expect(wpm).toBeGreaterThanOrEqual(15)
      expect(wpm).toBeLessThanOrEqual(20)
      expect(farnsworthWpm).toBeLessThanOrEqual(wpm)
      expect(farnsworthWpm).toBeGreaterThanOrEqual(7)
    }
  })

  it('varies what it asks for across a month', () => {
    // Not a distribution test — just that a month is not eight identical days.
    const kinds = new Set(
      Array.from(
        { length: 31 },
        (_, i) => dailyChallenge(`2026-06-${String(i + 1).padStart(2, '0')}`).kind,
      ),
    )
    expect(kinds.size).toBeGreaterThan(1)
  })

  it('sets a pass mark below the one a single line is judged at', () => {
    // Eight lines at a speed you did not choose. A pass mark nobody reaches is
    // a pass mark nobody attempts.
    expect(dailyChallenge('2026-08-22').passMark).toBeLessThan(0.9)
    expect(dailyChallenge('2026-08-22').passMark).toBeGreaterThan(0.5)
  })
})
