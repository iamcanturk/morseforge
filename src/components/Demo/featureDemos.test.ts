import { describe, expect, it } from 'vitest'
import { elementsSent, revealedStages } from './FeatureDemos'
import { buildTimeline } from '../../engine/timingEngine'
import { encode } from '../../engine/morseEncoder'
import { LEARNING_STAGES } from '../../data/morseAlphabet'

describe('elementsSent', () => {
  // "A" at 20 WPM: dot 0–60, gap 60–120, dash 120–300.
  const timeline = buildTimeline('.-', { wpm: 20 })

  it('counts nothing before the first element finishes', () => {
    expect(elementsSent(timeline, 0)).toBe(0)
    expect(elementsSent(timeline, 59)).toBe(0)
  })

  it('counts an element the moment it completes, not when it starts', () => {
    // Filling the trace as an element begins would show a dash as sent while
    // the operator is still holding the key.
    expect(elementsSent(timeline, 60)).toBe(1)
    expect(elementsSent(timeline, 299)).toBe(1)
    expect(elementsSent(timeline, 300)).toBe(2)
  })

  it('never exceeds the number of sounding elements', () => {
    const sounding = timeline.filter((element) => element.on).length
    expect(elementsSent(timeline, 10_000)).toBe(sounding)
  })

  it('reaches every element of a real word', () => {
    const sos = buildTimeline(encode('SOS'), { wpm: 20 })
    expect(elementsSent(sos, 10_000)).toBe(9)
  })

  it('handles an empty timeline', () => {
    expect(elementsSent([], 500)).toBe(0)
  })
})

describe('revealedStages', () => {
  const total = LEARNING_STAGES.length

  it('shows the first stage immediately, so the panel is never blank', () => {
    expect(revealedStages(0, 900, total)).toBe(1)
  })

  it('adds one stage per beat', () => {
    expect(revealedStages(899, 900, total)).toBe(1)
    expect(revealedStages(900, 900, total)).toBe(2)
    expect(revealedStages(1800, 900, total)).toBe(3)
  })

  it('clamps during the pause between loops', () => {
    // useAutoLoop reports elapsed across the whole cycle including the pause,
    // so without a ceiling the last beat would ask for stages that do not exist.
    expect(revealedStages(999_999, 900, total)).toBe(total)
  })
})
