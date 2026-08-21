import { describe, expect, it } from 'vitest'
import { buildTimeline } from './timingEngine'
import { playheadAt } from '../components/MorsePlayer/MorsePlayer'

/**
 * The playhead drives the signal lamp. If it disagrees with the audio timeline
 * the lamp flashes on the wrong beats, which is worse than no lamp at all —
 * a learner reading the light would be learning the wrong rhythm.
 */
describe('playheadAt', () => {
  // "A" at 20 WPM: dot 60ms, gap 60ms, dash 180ms. Total 300ms.
  const timeline = buildTimeline('.-', { wpm: 20 })

  it('is on during the dot', () => {
    expect(playheadAt(timeline, 0).on).toBe(true)
    expect(playheadAt(timeline, 59).on).toBe(true)
  })

  it('is off during the element gap', () => {
    expect(playheadAt(timeline, 60).on).toBe(false)
    expect(playheadAt(timeline, 119).on).toBe(false)
  })

  it('is on during the dash', () => {
    expect(playheadAt(timeline, 120).on).toBe(true)
    expect(playheadAt(timeline, 299).on).toBe(true)
  })

  it('is off past the end', () => {
    expect(playheadAt(timeline, 300)).toEqual({ on: false, index: -1 })
    expect(playheadAt(timeline, 10_000).on).toBe(false)
  })

  it('reports which element is playing', () => {
    expect(playheadAt(timeline, 0).index).toBe(0)
    expect(playheadAt(timeline, 60).index).toBe(1)
    expect(playheadAt(timeline, 120).index).toBe(2)
  })

  it('switches exactly at each boundary, never a frame early', () => {
    // Off-by-one here would clip the start of every element.
    let offset = 0
    for (const element of timeline) {
      expect(playheadAt(timeline, offset).on, `at ${offset}ms`).toBe(element.on)
      offset += element.duration
    }
  })

  it('lights for the same total time as the audio sounds', () => {
    // Sample the whole timeline and compare lit time against the summed
    // duration of the sounding elements.
    const step = 1
    let litMs = 0
    for (let t = 0; t < 300; t += step) {
      if (playheadAt(timeline, t).on) litMs += step
    }
    const soundingMs = timeline.filter((e) => e.on).reduce((sum, e) => sum + e.duration, 0)
    expect(litMs).toBe(soundingMs)
  })

  it('handles an empty timeline', () => {
    expect(playheadAt([], 0)).toEqual({ on: false, index: -1 })
  })

  it('tracks a word gap as a long dark period', () => {
    const withWordGap = buildTimeline('. / .', { wpm: 20 })
    // dot 0-60, gap 60-480, dot 480-540
    expect(playheadAt(withWordGap, 30).on).toBe(true)
    expect(playheadAt(withWordGap, 300).on).toBe(false)
    expect(playheadAt(withWordGap, 500).on).toBe(true)
  })
})
