import { describe, expect, it } from 'vitest'
import {
  MODES,
  SIZES,
  barHeights,
  fileName,
  keyedElements,
  layout,
  visibleElements,
  type KeyedElement,
} from './scene'
import { buildTimeline } from '../../engine/timingEngine'
import { encode } from '../../engine/morseEncoder'

describe('sizes and modes', () => {
  it('offers the three shapes people actually post', () => {
    expect(SIZES.map((size) => size.label)).toEqual(['16:9', '9:16', '1:1'])
  })

  it('has no duplicate ids', () => {
    expect(new Set(SIZES.map((s) => s.id)).size).toBe(SIZES.length)
    expect(new Set(MODES.map((m) => m.id)).size).toBe(MODES.length)
  })
})

describe('layout', () => {
  it('sizes from the shorter edge, so nothing stretches', () => {
    // A logo scaled from the width would be nearly twice as big in portrait as
    // in landscape, which is the classic way a 9:16 export looks wrong.
    const wide = layout(1920, 1080)
    const tall = layout(1080, 1920)
    expect(wide.logo.size).toBe(tall.logo.size)
    expect(wide.unit).toBe(1080)
    expect(tall.unit).toBe(1080)
  })

  it('keeps everything inside the frame', () => {
    for (const size of SIZES) {
      const frame = layout(size.width, size.height)
      expect(frame.logo.x + frame.logo.size, size.id).toBeLessThan(frame.width)
      expect(frame.logo.y + frame.logo.size, size.id).toBeLessThan(frame.height)
      expect(frame.caption.y, size.id).toBeLessThan(frame.height)
      expect(frame.centreY + frame.radius, size.id).toBeLessThan(frame.height)
      expect(frame.centreX + frame.radius, size.id).toBeLessThan(frame.width)
    }
  })

  it('centres on the frame', () => {
    const frame = layout(1000, 500)
    expect(frame.centreX).toBe(500)
    expect(frame.centreY).toBe(250)
  })
})

describe('barHeights', () => {
  const flat = (value: number, length = 1024) => new Uint8Array(length).fill(value)

  it('returns the requested number of bars', () => {
    expect(barHeights(flat(128), 48)).toHaveLength(48)
  })

  it('normalises to 0..1', () => {
    expect(barHeights(flat(255), 8).every((v) => v === 1)).toBe(true)
    expect(barHeights(flat(0), 8).every((v) => v === 0)).toBe(true)
  })

  it('spreads a low-frequency tone across the bars rather than into bar one', () => {
    // A CW sidetone is a single pitch in the low hundreds of hertz. Spreading
    // the bins evenly across the whole spectrum would put the entire signal in
    // the first bar and leave every other one dead.
    const data = new Uint8Array(1024)
    for (let i = 10; i < 40; i++) data[i] = 255
    const bars = barHeights(data, 32)
    expect(bars.filter((v) => v > 0.1).length).toBeGreaterThan(1)
  })

  it('handles degenerate input without throwing', () => {
    expect(barHeights(new Uint8Array(0), 8)).toHaveLength(8)
    expect(barHeights(flat(100), 0)).toEqual([])
  })
})

describe('keyedElements', () => {
  it('keeps only the sounding parts, with absolute times', () => {
    const timeline = buildTimeline(encode('E'), { wpm: 20 })
    const elements = keyedElements(timeline)
    expect(elements).toHaveLength(1)
    expect(elements[0]?.element).toBe('.')
    expect(elements[0]?.startMs).toBe(0)
  })

  it('advances past the gaps', () => {
    // A: dot, gap, dash. The dash cannot start at zero.
    const elements = keyedElements(buildTimeline(encode('A'), { wpm: 20 }))
    expect(elements.map((e) => e.element)).toEqual(['.', '-'])
    expect(elements[1]!.startMs).toBeGreaterThan(elements[0]!.durationMs)
  })

  it('reads a whole word in sending order', () => {
    const elements = keyedElements(buildTimeline(encode('SOS'), { wpm: 20 }))
    expect(elements.map((e) => e.element).join('')).toBe('...---...')
  })
})

describe('visibleElements', () => {
  const elements: KeyedElement[] = [
    { element: '.', startMs: 0, durationMs: 60 },
    { element: '-', startMs: 120, durationMs: 180 },
    { element: '.', startMs: 5000, durationMs: 60 },
  ]

  it('leaves out what is far in the future', () => {
    const visible = visibleElements(elements, 0, 1000)
    expect(visible.map((v) => v.element.startMs)).not.toContain(5000)
  })

  it('lights only the element sounding right now', () => {
    const visible = visibleElements(elements, 200, 1000)
    const lit = visible.filter((v) => v.lit)
    expect(lit).toHaveLength(1)
    expect(lit[0]?.element.element).toBe('-')
  })

  it('lights nothing during a gap', () => {
    expect(visibleElements(elements, 90, 1000).some((v) => v.lit)).toBe(false)
  })

  it('moves an element leftwards as time passes', () => {
    // Elements arrive from the right and leave on the left; if x grew with
    // time the whole strip would scroll backwards.
    const early = visibleElements(elements, 100, 1000).find((v) => v.element.startMs === 120)
    const later = visibleElements(elements, 400, 1000).find((v) => v.element.startMs === 120)
    expect(later!.x).toBeLessThan(early!.x)
  })

  it('puts the current moment at the playhead', () => {
    const visible = visibleElements(
      [{ element: '.', startMs: 1000, durationMs: 60 }],
      1000,
      1000,
      0.35,
    )
    expect(visible[0]?.x).toBeCloseTo(0.35, 5)
  })

  it('returns nothing rather than dividing by zero', () => {
    expect(visibleElements(elements, 100, 0)).toEqual([])
  })
})

describe('fileName', () => {
  it('says what it is', () => {
    expect(fileName('CQ CQ', SIZES[0]!, 'keying')).toBe('morseforge-cq-cq-keying-1920x1080.webm')
  })

  it('survives a message that slugs to nothing', () => {
    expect(fileName('!!!', SIZES[0]!, 'bars')).toBe('morseforge-morse-bars-1920x1080.webm')
  })

  it('does not run away with a long message', () => {
    expect(fileName('A'.repeat(500), SIZES[0]!, 'wave').length).toBeLessThan(80)
  })
})
