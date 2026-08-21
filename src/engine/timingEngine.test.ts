import { describe, expect, it } from 'vitest'
import {
  buildTimeline,
  dashDuration,
  dotDuration,
  estimateDuration,
  measureWpm,
  resolveTiming,
  timelineDuration,
} from './timingEngine'

describe('dotDuration', () => {
  it('follows the PARIS standard: 1200 / WPM', () => {
    expect(dotDuration(20)).toBe(60)
    expect(dotDuration(12)).toBe(100)
    expect(dotDuration(5)).toBe(240)
  })

  it('makes a dash exactly three dots', () => {
    expect(dashDuration(20)).toBe(dotDuration(20) * 3)
  })

  it('rejects speeds that would produce nonsense timing', () => {
    expect(() => dotDuration(0)).toThrow(RangeError)
    expect(() => dotDuration(-5)).toThrow(RangeError)
    expect(() => dotDuration(Number.NaN)).toThrow(RangeError)
  })
})

describe('resolveTiming', () => {
  it('uses standard 1:3:1:3:7 ratios without Farnsworth', () => {
    const t = resolveTiming({ wpm: 20 })
    expect(t).toEqual({ dot: 60, dash: 180, elementGap: 60, characterGap: 180, wordGap: 420 })
  })

  it('ignores a Farnsworth speed at or above the character speed', () => {
    const standard = resolveTiming({ wpm: 20 })
    expect(resolveTiming({ wpm: 20, farnsworthWpm: 20 })).toEqual(standard)
    expect(resolveTiming({ wpm: 20, farnsworthWpm: 25 })).toEqual(standard)
  })

  it('stretches only the gaps under Farnsworth, never the characters', () => {
    const t = resolveTiming({ wpm: 18, farnsworthWpm: 5 })
    // Characters keep 18 WPM timing — this is the whole point of the technique.
    expect(t.dot).toBeCloseTo(1200 / 18, 6)
    expect(t.dash).toBeCloseTo((1200 / 18) * 3, 6)
    expect(t.elementGap).toBeCloseTo(1200 / 18, 6)
    // Gaps blow out well past standard.
    expect(t.characterGap).toBeGreaterThan((1200 / 18) * 3)
    expect(t.wordGap).toBeGreaterThan((1200 / 18) * 7)
  })

  it('keeps the gaps in their 3:7 ratio', () => {
    const t = resolveTiming({ wpm: 18, farnsworthWpm: 5 })
    expect(t.wordGap / t.characterGap).toBeCloseTo(7 / 3, 6)
  })
})

describe('PARIS is exactly one word', () => {
  // The definition of WPM: sending PARIS once, including its trailing word
  // space, takes exactly 60/WPM seconds. If this drifts, every speed readout,
  // every challenge duration and every leaderboard number is wrong.
  it.each([5, 12, 20, 35])('holds at %i WPM with standard timing', (wpm) => {
    const t = resolveTiming({ wpm })
    const total = estimateDuration('PARIS', { wpm }) + t.wordGap
    expect(total).toBeCloseTo(60_000 / wpm, 6)
  })

  it('holds under Farnsworth at the effective speed, not the character speed', () => {
    const options = { wpm: 18, farnsworthWpm: 5 }
    const t = resolveTiming(options)
    const total = estimateDuration('PARIS', options) + t.wordGap
    expect(total).toBeCloseTo(60_000 / 5, 6)
  })
})

describe('buildTimeline', () => {
  it('expands a character into tones separated by element gaps', () => {
    const timeline = buildTimeline('.-', { wpm: 20 })
    expect(timeline).toEqual([
      { type: 'dot', duration: 60, on: true },
      { type: 'gap', duration: 60, on: false },
      { type: 'dash', duration: 180, on: true },
    ])
  })

  it('never starts or ends with silence', () => {
    const timeline = buildTimeline('... --- ...', { wpm: 20 })
    expect(timeline.at(0)?.on).toBe(true)
    expect(timeline.at(-1)?.on).toBe(true)
  })

  it('separates characters by 3 units and words by 7', () => {
    const timeline = buildTimeline('. / .', { wpm: 20 })
    expect(timeline).toEqual([
      { type: 'dot', duration: 60, on: true },
      { type: 'gap', duration: 420, on: false },
      { type: 'dot', duration: 60, on: true },
    ])

    const twoChars = buildTimeline('. .', { wpm: 20 })
    expect(twoChars[1]).toEqual({ type: 'gap', duration: 180, on: false })
  })

  it('accepts a run of spaces as a word break, like hand-typed Morse', () => {
    expect(buildTimeline('.   .', { wpm: 20 })).toEqual(buildTimeline('. / .', { wpm: 20 }))
  })

  it('produces an empty timeline for empty input', () => {
    expect(buildTimeline('   ', { wpm: 20 })).toEqual([])
    expect(timelineDuration([])).toBe(0)
  })
})

describe('estimateDuration', () => {
  it('ignores characters it cannot send rather than throwing', () => {
    expect(estimateDuration('E🚀', { wpm: 20 })).toBe(estimateDuration('E', { wpm: 20 }))
  })

  it('charges a word gap for a space and a character gap otherwise', () => {
    const wpm = 20
    const single = estimateDuration('E', { wpm })
    expect(estimateDuration('EE', { wpm })).toBeCloseTo(single * 2 + 180, 6)
    expect(estimateDuration('E E', { wpm })).toBeCloseTo(single * 2 + 420, 6)
  })

  it('does not charge a leading or trailing gap', () => {
    expect(estimateDuration('  E  ', { wpm: 20 })).toBe(estimateDuration('E', { wpm: 20 }))
  })
})

describe('measureWpm', () => {
  it('uses the 5-characters-per-word convention', () => {
    // 100 characters = 20 words; in 60s that is 20 WPM.
    expect(measureWpm(100, 60_000)).toBeCloseTo(20, 6)
  })

  it('returns 0 rather than Infinity for degenerate input', () => {
    expect(measureWpm(0, 1000)).toBe(0)
    expect(measureWpm(10, 0)).toBe(0)
  })
})
