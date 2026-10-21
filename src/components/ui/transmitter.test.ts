import { describe, expect, it } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'
import { createElement } from 'react'
import { encode } from '../../engine/morseEncoder'
import { buildTimeline, timelineDuration } from '../../engine/timingEngine'
import { SIGNAL_MODES } from '../../storage/settings'
import { SignalLamp } from './SignalLamp'
import { AUDIO_LEAD_MS, lampFlips, planTransmission } from './transmitter'

const TIMING = { wpm: 20, farnsworthWpm: 10 }
const timeline = (text: string) => buildTimeline(encode(text), TIMING)
const elements = (text: string) => encode(text).replace(/[^.-]/g, '').length

describe('lampFlips', () => {
  it('lights once per element, and goes dark after each', () => {
    const flips = lampFlips(timeline('SOS'))
    expect(flips).toHaveLength(2 * elements('SOS'))
    expect(flips.filter((flip) => flip.on)).toHaveLength(elements('SOS'))
    flips.forEach((flip, index) => expect(flip.on).toBe(index % 2 === 0))
  })

  it('holds each element exactly as long as the tone would', () => {
    const line = timeline('AN')
    const flips = lampFlips(line)
    const tones = line.filter((element) => element.on)
    tones.forEach((tone, index) => {
      const on = flips[index * 2]
      const off = flips[index * 2 + 1]
      expect(off && on && off.at - on.at).toBe(tone.duration)
    })
  })

  it('ends dark, at the end of the last element', () => {
    const line = timeline('PARIS')
    const last = lampFlips(line).at(-1)
    expect(last).toEqual({ at: timelineDuration(line), on: false })
  })

  it('never goes back in time', () => {
    const flips = lampFlips(timeline('HELLO WORLD'), 25)
    expect(flips[0]?.at).toBe(25)
    for (let i = 1; i < flips.length; i++) {
      expect(flips[i]!.at).toBeGreaterThanOrEqual(flips[i - 1]!.at)
    }
  })
})

describe('planTransmission', () => {
  it('sends sound only, lamp only, or both, as the Signal setting says', () => {
    const line = timeline('E')
    const table = SIGNAL_MODES.map((signal) => {
      const plan = planTransmission(line, signal)
      return [signal, plan.sound, plan.lamp, plan.flips.length]
    })
    expect(table).toEqual([
      ['sound', true, false, 0],
      ['lamp', false, true, 2],
      ['both', true, true, 2],
    ])
  })

  it('lights the lamp at once when silent, and in step with the tone when not', () => {
    const line = timeline('T')
    expect(planTransmission(line, 'lamp').flips[0]?.at).toBe(0)
    expect(planTransmission(line, 'both').flips[0]?.at).toBe(AUDIO_LEAD_MS)
  })

  it('ends when the last element ends', () => {
    const line = timeline('CQ CQ')
    expect(planTransmission(line, 'lamp').endsAt).toBe(timelineDuration(line))
    expect(planTransmission(line, 'sound').endsAt).toBe(AUDIO_LEAD_MS + timelineDuration(line))
    expect(planTransmission([], 'both').endsAt).toBe(0)
  })
})

describe('SignalLamp', () => {
  it('is hidden from screen readers and flips without a transition', () => {
    const off = renderToStaticMarkup(createElement(SignalLamp, { lit: false }))
    const on = renderToStaticMarkup(createElement(SignalLamp, { lit: true }))
    expect(off).toContain('aria-hidden="true"')
    expect(off).toContain('data-on="false"')
    expect(on).toContain('data-on="true"')
    expect(on).toContain('opacity:1')
    expect(off).toContain('opacity:0')
    expect(on + off).not.toMatch(/transition|animation/)
  })
})
