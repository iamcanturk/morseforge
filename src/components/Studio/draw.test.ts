import { describe, expect, it } from 'vitest'
import { drawFrame, type Palette } from './draw'
import { layout } from './scene'

/**
 * A 2D context that records what was asked of it.
 *
 * The visualisers are the one part of the studio that cannot be checked by
 * reading the numbers — "is the signal in the middle of the frame" is a
 * question about pixels. This records the geometry instead, which answers the
 * same question without a browser.
 */
function recordingContext() {
  const bars: { x: number; y: number; width: number; height: number }[] = []
  const lines: { from: [number, number]; to: [number, number] }[] = []
  let pending: [number, number] = [0, 0]

  const context = {
    fillStyle: '',
    strokeStyle: '',
    lineWidth: 0,
    lineJoin: '',
    lineCap: '',
    globalAlpha: 1,
    shadowColor: '',
    shadowBlur: 0,
    font: '',
    textAlign: '',
    textBaseline: '',
    letterSpacing: '',
    fillRect: () => {},
    fillText: () => {},
    beginPath: () => {},
    stroke: () => {},
    fill: () => {},
    arc: () => {},
    moveTo: (x: number, y: number) => {
      pending = [x, y]
    },
    lineTo: (x: number, y: number) => {
      lines.push({ from: pending, to: [x, y] })
      pending = [x, y]
    },
    roundRect: (x: number, y: number, width: number, height: number) => {
      bars.push({ x, y, width, height })
    },
  }

  return { context: context as unknown as CanvasRenderingContext2D, bars, lines }
}

const palette: Palette = {
  background: '#080b10',
  signal: '#00e88f',
  dim: '#00a868',
  cyan: '#22d3ee',
  ink: '#f0f4f8',
}

/** A single tone at `bin`, as the analyser would report it. */
function tone(bin: number, length = 1024) {
  const data = new Uint8Array(length)
  for (let i = -4; i <= 4; i++) {
    if (bin + i >= 0 && bin + i < length) data[bin + i] = Math.round(255 * (1 - Math.abs(i) / 5))
  }
  return data
}

const silence = (length = 1024) => new Uint8Array(length)
const flatWave = (length = 2048) => new Uint8Array(length).fill(128)

function render(overrides: Partial<Parameters<typeof drawFrame>[1]> = {}) {
  const { context, bars, lines } = recordingContext()
  const frame = layout(1920, 1080)
  drawFrame(context, {
    mode: 'bars',
    frame,
    palette,
    frequency: silence(),
    waveform: flatWave(),
    level: 0,
    elements: [],
    elapsedMs: 0,
    ...overrides,
  })
  return { bars, lines, frame }
}

describe('the spectrum', () => {
  it('puts the sounding tone in the middle of the frame', () => {
    // The thing this mode is for. Mapping bins from zero upwards parked the
    // signal about a fifth of the way in and left the rest of the frame flat.
    const { bars, frame } = render({ frequency: tone(25) })
    const tallest = bars.reduce((best, bar) => (bar.height > best.height ? bar : best))
    const centre = Math.abs(tallest.x + tallest.width / 2 - frame.centreX)
    expect(centre).toBeLessThan(frame.width * 0.03)
  })

  it('centres it wherever the tone happens to be', () => {
    // A 400 Hz tone and an 1800 Hz one both belong in the middle. Before, one
    // of them would have sat a fifth of the way along and the other three
    // quarters.
    for (const bin of [10, 25, 60, 140]) {
      const { bars, frame } = render({ frequency: tone(bin) })
      const tallest = bars.reduce((best, bar) => (bar.height > best.height ? bar : best))
      expect(Math.abs(tallest.x + tallest.width / 2 - frame.centreX), `bin ${bin}`).toBeLessThan(
        frame.width * 0.03,
      )
    }
  })

  it('is symmetric about the centre', () => {
    const { bars, frame } = render({ frequency: tone(25) })
    const left = bars.filter((bar) => bar.x + bar.width / 2 < frame.centreX)
    const right = bars.filter((bar) => bar.x + bar.width / 2 > frame.centreX)
    expect(left.length).toBe(right.length)

    // Compare each bar with its mirror image.
    const byHeight = (list: typeof bars) => list.map((bar) => Math.round(bar.height))
    expect(byHeight(left)).toEqual(byHeight(right).reverse())
  })

  it('falls to a flat line in silence rather than showing noise', () => {
    const { bars, frame } = render({ frequency: silence() })
    for (const bar of bars) expect(bar.height).toBeLessThan(frame.unit * 0.01)
  })

  it('spans the frame', () => {
    const { bars, frame } = render({ frequency: tone(25) })
    expect(Math.min(...bars.map((bar) => bar.x))).toBeLessThan(frame.width * 0.02)
    expect(Math.max(...bars.map((bar) => bar.x + bar.width))).toBeGreaterThan(frame.width * 0.98)
  })
})

describe('the waveform', () => {
  /** `cycles` of a sine across the buffer. */
  const sine = (cycles: number, length = 2048) =>
    new Uint8Array(
      Array.from({ length }, (_, i) =>
        Math.round(128 + 110 * Math.sin((i / length) * cycles * Math.PI * 2)),
      ),
    )

  it('draws a trace across the whole frame', () => {
    const { lines, frame } = render({ mode: 'wave', waveform: sine(30), level: 0.8 })
    expect(lines.length).toBeGreaterThan(10)
    expect(Math.min(...lines.map((line) => line.from[0]))).toBeLessThan(frame.width * 0.02)
    expect(Math.max(...lines.map((line) => line.to[0]))).toBeGreaterThan(frame.width * 0.98)
  })

  it('shows a handful of cycles, not a comb', () => {
    // The full buffer is dozens of cycles at 600 Hz, which reads as a solid
    // band rather than as a wave.
    const { lines, frame } = render({ mode: 'wave', waveform: sine(30), level: 0.8 })
    const crossings = lines.filter(
      (line) => (line.from[1] - frame.centreY) * (line.to[1] - frame.centreY) < 0,
    ).length
    expect(crossings).toBeGreaterThan(1)
    expect(crossings).toBeLessThan(16)
  })

  it('stays inside the frame', () => {
    const { lines, frame } = render({ mode: 'wave', waveform: sine(20), level: 1 })
    for (const line of lines) {
      expect(line.to[1]).toBeGreaterThan(0)
      expect(line.to[1]).toBeLessThan(frame.height)
    }
  })

  it('collapses to a flat line in silence', () => {
    const { lines, frame } = render({ mode: 'wave', waveform: flatWave(), level: 0 })
    expect(lines.length).toBeGreaterThan(0)
    for (const line of lines) {
      expect(Math.abs(line.to[1] - frame.centreY)).toBeLessThan(1)
    }
  })

  it('is centred vertically', () => {
    const { lines, frame } = render({ mode: 'wave', waveform: sine(20), level: 1 })
    const average = lines.reduce((sum, line) => sum + line.to[1], 0) / Math.max(1, lines.length)
    expect(Math.abs(average - frame.centreY)).toBeLessThan(frame.unit * 0.05)
  })
})
