import { describe, expect, it } from 'vitest'
import { DEFAULT_AUDIO_SETTINGS, scheduleTimeline } from './audioEngine'
import { buildTimeline, timelineDuration } from './timingEngine'

describe('DEFAULT_AUDIO_SETTINGS', () => {
  it('matches the PROJECT.md §8 defaults', () => {
    expect(DEFAULT_AUDIO_SETTINGS.frequency).toBe(600)
    expect(DEFAULT_AUDIO_SETTINGS.volume).toBe(0.15)
  })

  it('shapes edges long enough to avoid key clicks but short enough for 35 WPM', () => {
    // A dot at 35 WPM is ~34ms; a rise time near that would swallow it.
    expect(DEFAULT_AUDIO_SETTINGS.riseTime).toBeGreaterThanOrEqual(0.002)
    expect(DEFAULT_AUDIO_SETTINGS.riseTime).toBeLessThanOrEqual(0.01)
  })
})

describe('scheduleTimeline', () => {
  it('emits one tone per sounding element and skips the gaps', () => {
    const { tones } = scheduleTimeline(buildTimeline('.-', { wpm: 20 }))
    expect(tones).toHaveLength(2)
    expect(tones[0]!.element.type).toBe('dot')
    expect(tones[1]!.element.type).toBe('dash')
  })

  it('converts to seconds and offsets each tone by everything before it', () => {
    const { tones } = scheduleTimeline(buildTimeline('.-', { wpm: 20 }))
    expect(tones[0]!.startAt).toBeCloseTo(0, 6)
    expect(tones[0]!.duration).toBeCloseTo(0.06, 6)
    // dot (60ms) + element gap (60ms) = 120ms
    expect(tones[1]!.startAt).toBeCloseTo(0.12, 6)
    expect(tones[1]!.duration).toBeCloseTo(0.18, 6)
  })

  it('reports a total that matches the timeline it was built from', () => {
    const timeline = buildTimeline('... --- ...', { wpm: 20 })
    const { totalDuration } = scheduleTimeline(timeline)
    expect(totalDuration).toBeCloseTo(timelineDuration(timeline) / 1000, 6)
  })

  it('leaves gaps silent — no tone ever starts inside one', () => {
    const timeline = buildTimeline('. / .', { wpm: 20 })
    const { tones } = scheduleTimeline(timeline)
    // Two dots, 420ms of silence between them.
    expect(tones).toHaveLength(2)
    expect(tones[1]!.startAt - (tones[0]!.startAt + tones[0]!.duration)).toBeCloseTo(0.42, 6)
  })

  it('handles an empty timeline', () => {
    expect(scheduleTimeline([])).toEqual({ tones: [], totalDuration: 0 })
  })
})
