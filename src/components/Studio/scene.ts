/**
 * Frame maths for the video studio.
 *
 * Everything that decides *where* something goes lives here, separate from the
 * canvas calls that put it there, so the parts worth being sure about can be
 * tested. A visualiser that looks fine at 1920×1080 and puts the logo off the
 * bottom edge at 1080×1920 is the normal failure, and it is a layout bug, not
 * a drawing bug.
 */

export interface Size {
  id: string
  label: string
  hint: string
  width: number
  height: number
}

export const SIZES: readonly Size[] = [
  { id: 'landscape', label: '16:9', hint: 'YouTube, X, the README', width: 1920, height: 1080 },
  { id: 'portrait', label: '9:16', hint: 'Reels, Shorts, TikTok', width: 1080, height: 1920 },
  { id: 'square', label: '1:1', hint: 'Feed posts', width: 1080, height: 1080 },
]

export type ModeId = 'keying' | 'bars' | 'wave' | 'radial'

export interface Mode {
  id: ModeId
  label: string
  description: string
}

export const MODES: readonly Mode[] = [
  {
    id: 'keying',
    label: 'Keying',
    description:
      'The dots and dashes themselves, scrolling past and lighting as they sound. The only one of these that is about Morse rather than about audio.',
  },
  {
    id: 'bars',
    label: 'Spectrum',
    description: 'Mirrored frequency bars. A CW tone is one pitch, so this reads as a rhythm.',
  },
  {
    id: 'wave',
    label: 'Waveform',
    description: 'An oscilloscope trace. Closest to what the signal actually looks like.',
  },
  {
    id: 'radial',
    label: 'Radial',
    description: 'The spectrum wrapped around the mark. Best for square and portrait.',
  },
]

export interface Layout {
  width: number
  height: number
  centreX: number
  centreY: number
  /** The shorter edge. Everything is sized from this so nothing stretches. */
  unit: number
  margin: number
  logo: { x: number; y: number; size: number }
  caption: { x: number; y: number; size: number }
  /** Radius of the radial visualiser. */
  radius: number
}

/**
 * Place everything for a canvas of this size.
 *
 * Sized from the shorter edge rather than the width, so a 9:16 frame gets a
 * logo in proportion to itself instead of one scaled for a widescreen.
 */
export function layout(width: number, height: number): Layout {
  const unit = Math.min(width, height)
  const margin = Math.round(unit * 0.07)
  const logoSize = Math.round(unit * 0.052)

  return {
    width,
    height,
    centreX: width / 2,
    centreY: height / 2,
    unit,
    margin,
    logo: { x: margin, y: margin, size: logoSize },
    caption: { x: width / 2, y: height - margin, size: Math.round(unit * 0.032) },
    radius: Math.round(unit * 0.19),
  }
}

/**
 * Average the FFT bins into `count` bars, 0..1 each.
 *
 * Weighted towards the low end, because a CW sidetone is a single pitch in the
 * low hundreds of hertz: spreading the bins evenly across 22 kHz puts the
 * entire signal in the first bar and leaves the rest dead.
 */
export function barHeights(data: Uint8Array, count: number): number[] {
  if (count <= 0) return []
  if (data.length === 0) return new Array<number>(count).fill(0)

  // Only the bottom eighth of the spectrum carries anything at these
  // frequencies, so that is what gets spread across the bars.
  const usable = Math.max(count, Math.floor(data.length / 8))
  const perBar = usable / count

  return Array.from({ length: count }, (_, index) => {
    const start = Math.floor(index * perBar)
    const end = Math.max(start + 1, Math.floor((index + 1) * perBar))
    let sum = 0
    for (let i = start; i < end && i < data.length; i++) sum += data[i] ?? 0
    return sum / (end - start) / 255
  })
}

/**
 * Fold a series into a symmetric shape, first value at the centre.
 *
 * Returns `heights.length * 2` values: the input reversed, then the input. So
 * `[a, b, c]` becomes `[c, b, a, a, b, c]` — whatever is first ends up in the
 * middle of the frame.
 */
export function mirrorBars(heights: readonly number[]): number[] {
  return [...heights].reverse().concat(heights)
}

/**
 * The loudest bin, or -1 when nothing is sounding.
 *
 * The threshold matters: without it, silence still has a "loudest" bin — noise
 * — and the display would lock onto a different random frequency every frame.
 */
export function peakBin(data: Uint8Array, threshold = 16): number {
  let best = -1
  let loudest = threshold
  for (let i = 1; i < data.length; i++) {
    const value = data[i] ?? 0
    if (value > loudest) {
      loudest = value
      best = i
    }
  }
  return best
}

/**
 * Bar heights measured outward from whatever frequency is actually sounding.
 *
 * A CW sidetone is one pitch. Mapping the bins from zero upwards puts that one
 * spike a fixed fraction of the way along and leaves the rest of the frame
 * dead, and simply mirroring that splits it into two peaks with a hole in the
 * middle — worse, because now it looks deliberate.
 *
 * Sampling outward from the peak instead means the tone is always the centre
 * bar and the shape falls away from it on both sides. Returns `count` values,
 * nearest-to-peak first, ready for `mirrorBars`.
 */
export function spectrumAroundPeak(data: Uint8Array, count: number, spread = 40): number[] {
  if (count <= 0) return []

  const peak = peakBin(data, 16)
  if (peak < 0) return new Array<number>(count).fill(0)

  return Array.from({ length: count }, (_, index) => {
    const offset = Math.round((index / count) * spread)
    // Averaged with the bin the same distance below the peak, so the shape
    // reflects the real skirt of the signal rather than one arbitrary side.
    const above = data[peak + offset] ?? 0
    const below = data[Math.max(0, peak - offset)] ?? 0
    return (above + below) / 2 / 255
  })
}

/**
 * Where to start drawing a waveform so it does not jitter.
 *
 * The analyser hands back an arbitrary window of the signal, so consecutive
 * frames start at different points in the cycle and the trace appears to
 * shiver sideways. An oscilloscope solves this with a trigger: start at a
 * rising zero-crossing and the wave stands still.
 *
 * Samples are 0..255 centred on 128. Returns 0 when there is no crossing to
 * find, which is silence — nothing to hold steady.
 */
export function triggerOffset(samples: Uint8Array, searchWithin = 0.5): number {
  const limit = Math.min(samples.length - 1, Math.floor(samples.length * searchWithin))
  for (let i = 1; i < limit; i++) {
    if ((samples[i - 1] ?? 128) < 128 && (samples[i] ?? 128) >= 128) return i
  }
  return 0
}

/**
 * How far from the edge a point is, 0..1, for fading a trace out.
 *
 * Without it the waveform slams into both frame edges mid-cycle, which reads
 * as a rendering error rather than as a signal continuing beyond the frame.
 */
export function edgeFade(position: number, width = 0.08): number {
  if (width <= 0) return 1
  const distance = Math.min(position, 1 - position)
  return Math.max(0, Math.min(1, distance / width))
}

export interface KeyedElement {
  /** '.' or '-'. */
  element: string
  /** Milliseconds from the start of the message. */
  startMs: number
  durationMs: number
}

/**
 * Flatten a timeline into just the sounding elements, with absolute times.
 *
 * The keying visualiser needs to know what is where on a scrolling strip, which
 * the gap-and-tone timeline does not directly say.
 */
export function keyedElements(
  timeline: readonly { type: string; duration: number; on: boolean }[],
): KeyedElement[] {
  const elements: KeyedElement[] = []
  let at = 0
  for (const item of timeline) {
    if (item.on) {
      elements.push({
        element: item.type === 'dash' ? '-' : '.',
        startMs: at,
        durationMs: item.duration,
      })
    }
    at += item.duration
  }
  return elements
}

/**
 * Which elements fall inside the scrolling window, and where.
 *
 * `x` is 0..1 across the window with the *current moment* at `playhead`, so
 * elements arrive from the right and leave on the left.
 */
export function visibleElements(
  elements: readonly KeyedElement[],
  elapsedMs: number,
  windowMs: number,
  playhead = 0.35,
): { element: KeyedElement; x: number; width: number; lit: boolean }[] {
  if (windowMs <= 0) return []

  const from = elapsedMs - windowMs * playhead
  const to = from + windowMs

  return elements
    .filter((item) => item.startMs + item.durationMs >= from && item.startMs <= to)
    .map((item) => ({
      element: item,
      x: (item.startMs - from) / windowMs,
      width: item.durationMs / windowMs,
      lit: elapsedMs >= item.startMs && elapsedMs <= item.startMs + item.durationMs,
    }))
}

/** A filename that says what it is, without a clock. */
export function fileName(message: string, size: Size, mode: ModeId, extension = 'mp4'): string {
  const slug =
    message
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 40) || 'morse'
  return `morseforge-${slug}-${mode}-${size.width}x${size.height}.${extension}`
}

/**
 * The extension for a MediaRecorder mime type.
 *
 * Not cosmetic: a WebM named `.mp4` is rejected by everything, and an `.mp4`
 * named `.webm` uploads but confuses editors.
 */
export function extensionFor(mimeType: string): string {
  return mimeType.startsWith('video/mp4') ? 'mp4' : 'webm'
}
