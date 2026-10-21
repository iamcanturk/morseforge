/**
 * Canvas drawing for the studio.
 *
 * Kept apart from `scene.ts`, which decides where things go and is tested.
 * Nothing here makes a decision — it takes a layout and some numbers and puts
 * pixels down.
 *
 * Colours come from palette.ts, which palette.test.ts holds to global.css, so
 * the exported video uses the real brand green rather than a copy of it that
 * can drift. The logo is drawn from the mark's own geometry for the same
 * reason.
 */

import { drawLockup, horizontalLockup } from '../brand/mark'
import { DARK, SCREEN } from '../../styles/palette'

import {
  barHeights,
  edgeFade,
  mirrorBars,
  spectrumAroundPeak,
  triggerOffset,
  visibleElements,
  type KeyedElement,
  type Layout,
  type ModeId,
} from './scene'

export interface Palette {
  background: string
  signal: string
  dim: string
  cyan: string
  ink: string
}

/**
 * The studio's colours: the CRT screen tokens, in every theme.
 *
 * Not read from the page. The page's `--color-signal` is the light theme's
 * ink green when the site is in light mode, which nearly vanishes on a dark
 * frame — and the frame is always dark: a video is not a page, and a white
 * background with a green trace reads as a spreadsheet. A scope's glass is
 * the same glass in both themes (DEC-008), so the video is too.
 */
export const STUDIO_PALETTE: Palette = {
  background: DARK.screen,
  signal: SCREEN.signal,
  dim: SCREEN['signal-dim'],
  cyan: SCREEN.cyan,
  ink: SCREEN.ink,
}

/**
 * The logo, from the mark's own geometry: the Split M in phosphor and the
 * traced wordmark beside it, in the header's compact lockup, fitted to the
 * square the scene reserves for it. Path data, not text, so the video carries
 * the same logo as the site whatever fonts the browser has loaded.
 */
export function drawLogo(context: CanvasRenderingContext2D, frame: Layout, palette: Palette) {
  const { x, y, size } = frame.logo
  const markHeight = size * 0.72
  const lockup = horizontalLockup(markHeight, true)
  drawLockup(context, x, y + (size - markHeight) / 2, lockup, {
    mark: palette.signal,
    word: palette.ink,
  })
}

/** The message, under the visualiser. */
export function drawCaption(
  context: CanvasRenderingContext2D,
  frame: Layout,
  palette: Palette,
  text: string,
  morse: string,
) {
  context.textAlign = 'center'
  context.textBaseline = 'alphabetic'

  context.fillStyle = palette.ink
  context.font = `700 ${frame.caption.size}px "Space Grotesk", system-ui, sans-serif`
  context.letterSpacing = `${Math.round(frame.caption.size * 0.1)}px`
  context.fillText(text.toUpperCase(), frame.caption.x, frame.caption.y - frame.caption.size * 1.5)

  context.fillStyle = palette.dim
  context.font = `400 ${Math.round(frame.caption.size * 0.62)}px "JetBrains Mono", ui-monospace, monospace`
  context.letterSpacing = `${Math.round(frame.caption.size * 0.14)}px`
  context.fillText(morse, frame.caption.x, frame.caption.y)
  context.letterSpacing = '0px'
}

export interface FrameInput {
  mode: ModeId
  frame: Layout
  palette: Palette
  /** Frequency bins, 0..255. */
  frequency: Uint8Array
  /** Waveform samples, 0..255 centred on 128. */
  waveform: Uint8Array
  /** Overall loudness right now, 0..1. Drives the glow. */
  level: number
  elements: readonly KeyedElement[]
  elapsedMs: number
}

export function drawFrame(context: CanvasRenderingContext2D, input: FrameInput) {
  const { frame, palette } = input

  context.fillStyle = palette.background
  context.fillRect(0, 0, frame.width, frame.height)

  // The glow scales with the signal, so silence is genuinely black and a tone
  // visibly lights the frame.
  context.shadowColor = palette.signal
  context.shadowBlur = frame.unit * 0.03 * input.level

  switch (input.mode) {
    case 'bars':
      drawBars(context, input)
      break
    case 'wave':
      drawWave(context, input)
      break
    case 'radial':
      drawRadial(context, input)
      break
    case 'keying':
      drawKeying(context, input)
      break
  }

  context.shadowBlur = 0
}

/**
 * Frequency bars, centred on whatever is actually sounding.
 *
 * A CW sidetone is one pitch. Mapping the bins from zero upwards parks that
 * spike about a fifth of the way in and leaves the rest of the frame flat;
 * mirroring *that* splits it into two peaks with a hole in the middle, which
 * is worse because it looks deliberate. Sampling outward from the peak puts
 * the tone dead centre and lets the shape fall away on both sides.
 */
function drawBars(context: CanvasRenderingContext2D, { frame, palette, frequency }: FrameInput) {
  const half = Math.max(4, Math.round(frame.width / (frame.unit * 0.044)))
  const heights = mirrorBars(spectrumAroundPeak(frequency, half))
  const slot = frame.width / heights.length
  const width = slot * 0.55
  const max = frame.unit * 0.3

  for (const [index, value] of heights.entries()) {
    const height = Math.max(frame.unit * 0.004, value * max)
    const x = index * slot + (slot - width) / 2

    // Faded at the edges so the row of resting bars reads as a signal path
    // continuing past the frame rather than as a dashed line stopping at it.
    context.globalAlpha = edgeFade((index + 0.5) / heights.length, 0.1)
    // Cyan at the peaks — the same cue the site uses for a sounding tone.
    context.fillStyle = value > 0.6 ? palette.cyan : palette.signal
    context.beginPath()
    context.roundRect(x, frame.centreY - height, width, height * 2, width / 2)
    context.fill()
  }

  context.globalAlpha = 1
}

/**
 * An oscilloscope trace.
 *
 * Three things a naive version gets wrong, all of which were visible:
 *
 * 1. **It shivers.** The analyser hands over an arbitrary window, so every
 *    frame starts at a different point in the cycle. Triggering on a rising
 *    zero-crossing holds the wave still, exactly as a scope does.
 * 2. **It is too dense.** The full buffer is dozens of cycles at 600 Hz, which
 *    reads as a comb rather than a wave. Only a slice is drawn.
 * 3. **It is cut off.** Running the trace into both frame edges mid-cycle
 *    reads as a rendering error, so it fades out at each end.
 */
function drawWave(
  context: CanvasRenderingContext2D,
  { frame, palette, waveform, level }: FrameInput,
) {
  const start = triggerOffset(waveform)
  // About four cycles of a 600 Hz tone, whatever the sample rate turns out to
  // be — enough to read as a wave, few enough to stay legible at any size.
  const span = Math.min(waveform.length - start, Math.max(64, Math.floor(waveform.length / 6)))
  if (span < 2) {
    drawRestingLine(context, frame, palette)
    return
  }

  const amplitude = frame.unit * 0.26
  context.lineWidth = Math.max(2, frame.unit * 0.005)
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.strokeStyle = level > 0.5 ? palette.cyan : palette.signal

  // Drawn in short segments rather than one path, because the fade has to vary
  // along its length and a single stroke can only have one alpha.
  for (let i = 1; i < span; i++) {
    const from = (i - 1) / (span - 1)
    const to = i / (span - 1)
    context.globalAlpha = edgeFade(to, 0.12)
    context.beginPath()
    context.moveTo(
      from * frame.width,
      frame.centreY + (((waveform[start + i - 1] ?? 128) - 128) / 128) * amplitude,
    )
    context.lineTo(
      to * frame.width,
      frame.centreY + (((waveform[start + i] ?? 128) - 128) / 128) * amplitude,
    )
    context.stroke()
  }

  context.globalAlpha = 1
}

/** The flat line the wave collapses to in silence, faded at both ends. */
function drawRestingLine(context: CanvasRenderingContext2D, frame: Layout, palette: Palette): void {
  const segments = 60
  context.lineWidth = Math.max(2, frame.unit * 0.005)
  context.lineCap = 'round'
  context.strokeStyle = palette.dim

  for (let i = 1; i <= segments; i++) {
    const from = (i - 1) / segments
    const to = i / segments
    context.globalAlpha = edgeFade(to, 0.12) * 0.6
    context.beginPath()
    context.moveTo(from * frame.width, frame.centreY)
    context.lineTo(to * frame.width, frame.centreY)
    context.stroke()
  }

  context.globalAlpha = 1
}

/** The spectrum wrapped around the centre. */
function drawRadial(
  context: CanvasRenderingContext2D,
  { frame, palette, frequency, level }: FrameInput,
) {
  const count = 96
  const heights = barHeights(frequency, count)
  const inner = frame.radius
  const max = frame.unit * 0.17

  context.lineWidth = Math.max(2, (Math.PI * 2 * inner) / count / 2.2)
  context.lineCap = 'round'

  for (const [index, value] of heights.entries()) {
    // Starts at the top and goes clockwise, so the shape reads as a dial.
    const angle = (index / count) * Math.PI * 2 - Math.PI / 2
    const length = Math.max(frame.unit * 0.006, value * max)
    const x1 = frame.centreX + Math.cos(angle) * inner
    const y1 = frame.centreY + Math.sin(angle) * inner
    const x2 = frame.centreX + Math.cos(angle) * (inner + length)
    const y2 = frame.centreY + Math.sin(angle) * (inner + length)

    context.strokeStyle = value > 0.6 ? palette.cyan : palette.signal
    context.beginPath()
    context.moveTo(x1, y1)
    context.lineTo(x2, y2)
    context.stroke()
  }

  // A ring that breathes with the level, so silence is not an empty circle.
  context.strokeStyle = palette.dim
  context.lineWidth = Math.max(1, frame.unit * 0.002)
  context.beginPath()
  context.arc(frame.centreX, frame.centreY, inner * (0.88 + level * 0.06), 0, Math.PI * 2)
  context.stroke()
}

/**
 * The dots and dashes themselves, scrolling past a fixed playhead.
 *
 * The one mode here that is about Morse rather than about audio: what you see
 * is the code, at its real timing, arriving when you hear it.
 */
function drawKeying(
  context: CanvasRenderingContext2D,
  { frame, palette, elements, elapsedMs, level }: FrameInput,
) {
  const windowMs = 3600
  const playhead = 0.35
  const visible = visibleElements(elements, elapsedMs, windowMs, playhead)

  const height = frame.unit * 0.075
  const y = frame.centreY - height / 2

  // The baseline the elements sit on, so an empty stretch still reads as a
  // signal path rather than as a broken render.
  context.shadowBlur = 0
  context.strokeStyle = palette.dim
  context.globalAlpha = 0.25
  context.lineWidth = Math.max(1, frame.unit * 0.0015)
  context.beginPath()
  context.moveTo(0, frame.centreY)
  context.lineTo(frame.width, frame.centreY)
  context.stroke()
  context.globalAlpha = 1

  for (const item of visible) {
    const x = item.x * frame.width
    const width = Math.max(height * 0.34, item.width * frame.width)

    // Fades in at the right edge and out at the left, so nothing pops.
    const edge = Math.min(1, Math.min(item.x + 0.06, 1.06 - item.x) / 0.12)
    context.globalAlpha = Math.max(0, Math.min(1, edge))

    context.shadowColor = palette.signal
    context.shadowBlur = item.lit ? frame.unit * 0.04 : 0
    context.fillStyle = item.lit ? palette.cyan : palette.dim
    context.beginPath()
    context.roundRect(x, y, width, height, height / 2)
    context.fill()
  }

  context.globalAlpha = 1
  context.shadowBlur = 0

  // The playhead: a fixed line the code passes through.
  context.strokeStyle = palette.signal
  context.globalAlpha = 0.35 + level * 0.65
  context.lineWidth = Math.max(2, frame.unit * 0.003)
  context.beginPath()
  context.moveTo(playhead * frame.width, frame.centreY - height * 1.5)
  context.lineTo(playhead * frame.width, frame.centreY + height * 1.5)
  context.stroke()
  context.globalAlpha = 1
}
