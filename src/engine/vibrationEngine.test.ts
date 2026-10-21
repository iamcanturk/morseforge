import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  patternDuration,
  stopVibration,
  toVibrationPattern,
  vibrateTimeline,
} from './vibrationEngine'
import { buildTimeline, timelineDuration } from './timingEngine'
import { encode } from './morseEncoder'

describe('toVibrationPattern', () => {
  it('converts a character into alternating on/off durations', () => {
    // "A" at 20 WPM: dot 60, gap 60, dash 180.
    expect(toVibrationPattern(buildTimeline('.-', { wpm: 20 }))).toEqual([60, 60, 180])
  })

  it('always starts with an on', () => {
    // The API reads the array as on, off, on… — an off in position zero
    // inverts the entire message.
    const pattern = toVibrationPattern([
      { type: 'gap', duration: 500, on: false },
      { type: 'dot', duration: 60, on: true },
    ])
    expect(pattern).toEqual([60])
  })

  it('never ends with an off, which would only delay the finish', () => {
    const pattern = toVibrationPattern([
      { type: 'dot', duration: 60, on: true },
      { type: 'gap', duration: 500, on: false },
    ])
    expect(pattern.length % 2).toBe(1)
    expect(pattern).toEqual([60])
  })

  it('merges consecutive silences instead of shifting the phase', () => {
    // Two gaps in a row pushed through unmerged would put every later element
    // in the wrong phase and buzz the message as its own inverse.
    const pattern = toVibrationPattern([
      { type: 'dot', duration: 60, on: true },
      { type: 'gap', duration: 60, on: false },
      { type: 'gap', duration: 120, on: false },
      { type: 'dash', duration: 180, on: true },
    ])
    expect(pattern).toEqual([60, 180, 180])
  })

  it('merges consecutive tones too', () => {
    const pattern = toVibrationPattern([
      { type: 'dot', duration: 60, on: true },
      { type: 'dot', duration: 60, on: true },
    ])
    expect(pattern).toEqual([120])
  })

  it('drops zero-length elements rather than emitting a phase with no time', () => {
    const pattern = toVibrationPattern([
      { type: 'dot', duration: 60, on: true },
      { type: 'gap', duration: 0, on: false },
      { type: 'dash', duration: 180, on: true },
    ])
    // The zero gap disappears, so the two tones merge.
    expect(pattern).toEqual([240])
  })

  it('handles an empty timeline', () => {
    expect(toVibrationPattern([])).toEqual([])
  })

  it('keeps the buzzing time equal to the sounding time', () => {
    // Whatever the merging does to the array, the device must be on for
    // exactly as long as the speaker would have been.
    const timeline = buildTimeline(encode('SOS'), { wpm: 20 })
    const pattern = toVibrationPattern(timeline)
    const buzzing = pattern.filter((_, i) => i % 2 === 0).reduce((a, b) => a + b, 0)
    const sounding = timeline.filter((e) => e.on).reduce((sum, e) => sum + e.duration, 0)
    expect(buzzing).toBeCloseTo(sounding, 0)
  })

  it('never runs longer than the timeline it came from', () => {
    const timeline = buildTimeline(encode('HELLO'), { wpm: 20 })
    expect(patternDuration(toVibrationPattern(timeline))).toBeLessThanOrEqual(
      timelineDuration(timeline) + 1,
    )
  })

  it('rounds to whole milliseconds, which is all the API accepts', () => {
    for (const value of toVibrationPattern(buildTimeline(encode('Q'), { wpm: 13 }))) {
      expect(Number.isInteger(value)).toBe(true)
    }
  })
})

describe('vibrate calls before and after user activation', () => {
  const timeline = buildTimeline(encode('E'), { wpm: 20 })

  function fakeNavigator(hasBeenActive: boolean) {
    const calls: Array<number | number[]> = []
    const nav = {
      userActivation: { hasBeenActive, isActive: hasBeenActive },
      vibrate: (pattern: number | number[]) => {
        calls.push(pattern)
        return true
      },
    }
    vi.stubGlobal('navigator', nav)
    return { calls, nav }
  }

  afterEach(() => {
    stopVibration()
    vi.unstubAllGlobals()
  })

  it('never calls vibrate before the user has interacted (Chrome logs each refusal)', () => {
    const { calls } = fakeNavigator(false)
    stopVibration()
    expect(vibrateTimeline(timeline)).toBe(false)
    stopVibration()
    expect(calls).toEqual([])
  })

  it('stops only a vibration it actually started', () => {
    const { calls } = fakeNavigator(true)
    stopVibration()
    expect(calls).toEqual([])
    expect(vibrateTimeline(timeline)).toBe(true)
    stopVibration()
    stopVibration()
    expect(calls).toEqual([toVibrationPattern(timeline), 0])
  })
})
