import { describe, expect, it } from 'vitest'
import {
  MODES,
  SIZES,
  barHeights,
  edgeFade,
  extensionFor,
  fileName,
  keyedElements,
  layout,
  mirrorBars,
  peakBin,
  spectrumAroundPeak,
  triggerOffset,
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
    expect(fileName('CQ CQ', SIZES[0]!, 'keying')).toBe('morseforge-cq-cq-keying-1920x1080.mp4')
  })

  it('survives a message that slugs to nothing', () => {
    expect(fileName('!!!', SIZES[0]!, 'bars')).toBe('morseforge-morse-bars-1920x1080.mp4')
  })

  it('does not run away with a long message', () => {
    expect(fileName('A'.repeat(500), SIZES[0]!, 'wave').length).toBeLessThan(80)
  })
})

describe('mirrorBars', () => {
  it('doubles the length', () => {
    expect(mirrorBars([1, 2, 3])).toHaveLength(6)
  })

  it('is symmetric about the middle', () => {
    // A CW sidetone is one frequency, so an unmirrored spectrum puts the whole
    // signal a fifth of the way in and leaves the rest of the frame dead.
    const mirrored = mirrorBars([0.1, 0.5, 0.9])
    expect(mirrored).toEqual([0.9, 0.5, 0.1, 0.1, 0.5, 0.9])
    for (let i = 0; i < mirrored.length; i++) {
      expect(mirrored[i]).toBe(mirrored[mirrored.length - 1 - i])
    }
  })

  it('puts the loudest bin at the outside, not the middle', () => {
    // The low bins carry the tone, so they belong at the centre where the eye
    // goes; the empty high end fades out to the edges.
    const mirrored = mirrorBars([1, 0, 0])
    expect(mirrored[0]).toBe(0)
    expect(mirrored[2]).toBe(1)
    expect(mirrored[3]).toBe(1)
  })

  it('does not mutate its input', () => {
    const input = [1, 2, 3]
    mirrorBars(input)
    expect(input).toEqual([1, 2, 3])
  })

  it('handles an empty spectrum', () => {
    expect(mirrorBars([])).toEqual([])
  })
})

describe('triggerOffset', () => {
  /** `cycles` of a sine, as the analyser would hand it over. */
  const sine = (length: number, cycles: number, phase = 0) =>
    new Uint8Array(
      Array.from({ length }, (_, i) =>
        Math.round(128 + 120 * Math.sin((i / length) * cycles * Math.PI * 2 + phase)),
      ),
    )

  it('finds a rising crossing', () => {
    const offset = triggerOffset(sine(512, 4))
    expect(offset).toBeGreaterThan(0)
    expect(sine(512, 4)[offset]).toBeGreaterThanOrEqual(128)
    expect(sine(512, 4)[offset - 1]!).toBeLessThan(128)
  })

  it('lands on the same phase whatever the window started at', () => {
    // This is the whole point: consecutive analyser windows start at different
    // points in the cycle, and without a trigger the trace shivers sideways.
    const a = sine(512, 4, 0)
    const b = sine(512, 4, 1.1)
    const phaseOf = (samples: Uint8Array) => {
      const offset = triggerOffset(samples)
      return Math.sign((samples[offset + 1] ?? 128) - (samples[offset] ?? 128))
    }
    expect(phaseOf(a)).toBe(phaseOf(b))
  })

  it('returns 0 for silence, since there is nothing to hold steady', () => {
    expect(triggerOffset(new Uint8Array(512).fill(128))).toBe(0)
  })

  it('never returns an offset that would read past the buffer', () => {
    const samples = sine(512, 4)
    expect(triggerOffset(samples)).toBeLessThan(samples.length)
  })

  it('survives an empty buffer', () => {
    expect(triggerOffset(new Uint8Array(0))).toBe(0)
  })
})

describe('edgeFade', () => {
  it('is fully faded at both edges', () => {
    expect(edgeFade(0)).toBe(0)
    expect(edgeFade(1)).toBe(0)
  })

  it('is fully opaque in the middle', () => {
    expect(edgeFade(0.5)).toBe(1)
  })

  it('is symmetric', () => {
    expect(edgeFade(0.03)).toBeCloseTo(edgeFade(0.97), 6)
  })

  it('never leaves the 0..1 range', () => {
    for (const position of [-1, 0, 0.5, 1, 2]) {
      const value = edgeFade(position)
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })
})

describe('peakBin', () => {
  it('finds the loudest bin', () => {
    const data = new Uint8Array(256)
    data[42] = 250
    expect(peakBin(data)).toBe(42)
  })

  it('reports nothing during silence rather than locking onto noise', () => {
    // Without a threshold, silence still has a "loudest" bin and the display
    // would jump to a different random frequency every frame.
    expect(peakBin(new Uint8Array(256))).toBe(-1)
    expect(peakBin(new Uint8Array(256).fill(5))).toBe(-1)
  })

  it('ignores the DC bin', () => {
    const data = new Uint8Array(256)
    data[0] = 255
    data[30] = 200
    expect(peakBin(data)).toBe(30)
  })
})

describe('spectrumAroundPeak', () => {
  const tone = (bin: number, length = 512) => {
    const data = new Uint8Array(length)
    for (let i = -3; i <= 3; i++) data[bin + i] = Math.round(255 * (1 - Math.abs(i) / 4))
    return data
  }

  it('puts the sounding frequency first, which is the centre once mirrored', () => {
    const heights = spectrumAroundPeak(tone(25), 16)
    expect(heights[0]).toBeGreaterThan(0.9)
    const mirrored = mirrorBars(heights)
    const middle = mirrored.length / 2
    expect(mirrored[middle]).toBe(mirrored[middle - 1])
    expect(mirrored[middle]).toBeGreaterThan(mirrored[0]!)
  })

  it('centres wherever the tone actually is', () => {
    // The whole point: a 400 Hz tone and an 800 Hz one both end up centred,
    // rather than one of them sitting a fifth of the way along.
    for (const bin of [12, 25, 60, 120]) {
      expect(spectrumAroundPeak(tone(bin), 16)[0], String(bin)).toBeGreaterThan(0.9)
    }
  })

  it('falls away from the peak', () => {
    const heights = spectrumAroundPeak(tone(40), 16)
    expect(heights.at(-1)!).toBeLessThan(heights[0]!)
  })

  it('is flat during silence', () => {
    expect(spectrumAroundPeak(new Uint8Array(512), 16).every((v) => v === 0)).toBe(true)
  })

  it('returns the requested count and stays in 0..1', () => {
    const heights = spectrumAroundPeak(tone(25), 24)
    expect(heights).toHaveLength(24)
    for (const value of heights) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('does not read past the end of the buffer for a high peak', () => {
    const data = new Uint8Array(64)
    data[62] = 255
    expect(() => spectrumAroundPeak(data, 16)).not.toThrow()
    expect(spectrumAroundPeak(data, 16).every(Number.isFinite)).toBe(true)
  })

  it('handles a zero count', () => {
    expect(spectrumAroundPeak(tone(25), 0)).toEqual([])
  })
})

describe('extensionFor', () => {
  it('names an MP4 an mp4 and a WebM a webm', () => {
    // Not cosmetic: a WebM named .mp4 is rejected by everything that opens it.
    expect(extensionFor('video/mp4;codecs=avc1.42E01E,mp4a.40.2')).toBe('mp4')
    expect(extensionFor('video/mp4')).toBe('mp4')
    expect(extensionFor('video/webm;codecs=vp9,opus')).toBe('webm')
    expect(extensionFor('video/webm')).toBe('webm')
  })

  it('falls back to webm for anything it does not recognise', () => {
    expect(extensionFor('')).toBe('webm')
    expect(extensionFor('video/quicktime')).toBe('webm')
  })
})

describe('fileName with a container', () => {
  it('defaults to mp4, which is what the studio now records', () => {
    expect(fileName('CQ', SIZES[0]!, 'keying')).toMatch(/\.mp4$/)
  })

  it('uses whatever the recorder actually produced', () => {
    expect(fileName('CQ', SIZES[0]!, 'keying', 'webm')).toMatch(/\.webm$/)
  })
})
