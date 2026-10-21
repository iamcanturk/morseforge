/**
 * The MorseForge identity, as geometry: the Split M and the wordmark.
 *
 * One source for every place the logo is drawn: the header and footer
 * (Logo.tsx), the share cards and the Studio video (canvas, through the
 * `draw*` helpers below), and the favicon, app icons and OG images that
 * scripts/make-brand.mjs generates. Hand-copied SVGs are how a logo ends up in
 * three slightly different versions.
 *
 * The concept (DEC-039): M is dah-dah, so the M is written in two strokes.
 * Each half of the letter, stem and diagonal, is one dah, and the diagonals
 * stop exactly one stroke width apart: the one-unit gap between the elements
 * of a letter. The code is read from MORSE_ALPHABET, never typed here, so the
 * mark cannot spell something the rest of the product disagrees with, and
 * mark.test.ts decodes the drawn strokes back to the code.
 *
 * The wordmark is "MorseForge" in Space Grotesk 700, traced into path data by
 * scripts/trace-wordmark.mjs (wordmarkOutline.ts), so it needs no font.
 */

import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { SITE } from '../../config/site'
import { DARK, LIGHT } from '../../styles/palette'
import { WORDMARK_OUTLINE } from './wordmarkOutline'

const round = (value: number) => Math.round(value * 1000) / 1000

/* -------------------------------------------------------------------------- */
/* Timing                                                                      */
/* -------------------------------------------------------------------------- */

/** One stretch of the keyed signal: on (tone) or off (silence), in units. */
export interface Segment {
  on: boolean
  units: number
}

/**
 * The ITU timing of a code: a dit is one unit on, a dah three, and the gap
 * between elements of one character is one unit off.
 */
export function timing(code: string): Segment[] {
  const segments: Segment[] = []
  for (const [index, symbol] of [...code].entries()) {
    if (symbol !== '.' && symbol !== '-') throw new Error(`Not a Morse element: ${symbol}`)
    if (index > 0) segments.push({ on: false, units: 1 })
    segments.push({ on: true, units: symbol === '.' ? 1 : 3 })
  }
  return segments
}

/** Total length of a code in units, including the gaps inside it. */
export function codeUnits(code: string): number {
  return timing(code).reduce((total, segment) => total + segment.units, 0)
}

export interface TraceBox {
  /** Where the baseline enters and leaves, in viewBox units. */
  from: number
  to: number
  /** Horizontal centre of the keyed part. */
  centre: number
  /** Width of one Morse unit. */
  unit: number
  /** y of the baseline (key up) and of the pulse tops (key down). */
  base: number
  top: number
}

/**
 * The square-wave trace of a code, as an SVG path: baseline, a pulse per
 * element at its true length, baseline out. The OG cards run the name through
 * it as a signal strip.
 */
export function signalTrace(code: string, box: TraceBox): string {
  let x = box.centre - (codeUnits(code) * box.unit) / 2
  const parts = [`M${round(box.from)} ${round(box.base)}`, `H${round(x)}`]
  for (const segment of timing(code)) {
    const end = x + segment.units * box.unit
    if (segment.on) parts.push(`V${round(box.top)}`, `H${round(end)}`, `V${round(box.base)}`)
    else parts.push(`H${round(end)}`)
    x = end
  }
  parts.push(`H${round(box.to)}`)
  return parts.join(' ')
}

/** A rounded rectangle as a path, so canvas and SVG draw the same outline. */
export function roundedRectPath(x: number, y: number, w: number, h: number, r: number): string {
  const n = (value: number) => round(value)
  return [
    `M${n(x + r)} ${n(y)}`,
    `H${n(x + w - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + w)} ${n(y + r)}`,
    `V${n(y + h - r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + w - r)} ${n(y + h)}`,
    `H${n(x + r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x)} ${n(y + h - r)}`,
    `V${n(y + r)}`,
    `A${n(r)} ${n(r)} 0 0 1 ${n(x + r)} ${n(y)}`,
    'Z',
  ].join(' ')
}

/* -------------------------------------------------------------------------- */
/* The mark: Split M                                                           */
/* -------------------------------------------------------------------------- */

/** The letter the mark keys. M, for MorseForge. */
export const MARK_LETTER = 'M'

function codeFor(character: string): string {
  const code = MORSE_ALPHABET[character]
  if (code === undefined) throw new Error(`No Morse code for ${character}`)
  return code
}

export const MARK_CODE = codeFor(MARK_LETTER)

/** The mark's own box, ink edge to ink edge: 84 wide, 64 tall. */
export const MARK_WIDTH = 84
export const MARK_HEIGHT = 64

export interface MarkGeometry {
  /** One open path per element of MARK_CODE, in order, left to right. */
  strokes: readonly string[]
  /** The same strokes as one path. Stroke it; never fill it. */
  d: string
  /** Round caps and round joins, always. */
  strokeWidth: number
  /**
   * Where each stroke ends at the vertex: the centres of the two round caps
   * that face each other across the gap.
   */
  ends: readonly (readonly [number, number])[]
}

/**
 * Write a two-dah letter as an M: each dah is one half of the letter, a stem
 * then a diagonal toward the vertex, and the diagonals stop so that the gap
 * between their round caps is one unit, which is one stroke width.
 *
 * `vertexY` is where the diagonals would meet if they were not keyed apart.
 */
export function splitM(code: string, strokeWidth: number, vertexY: number): MarkGeometry {
  const elements = [...code]
  if (elements.length !== 2 || elements.some((element) => element !== '-')) {
    throw new Error(`The Split M is written in two dahs, not ${code}`)
  }
  const w = strokeWidth
  const x0 = w / 2
  const x1 = MARK_WIDTH - w / 2
  const top = w / 2
  const bottom = MARK_HEIGHT - w / 2
  const centre = MARK_WIDTH / 2
  // Cap centres one stroke width either side of the centre line: the cap
  // edges are then exactly one stroke width (one unit) apart.
  const ex = centre - w
  const t = (ex - x0) / (centre - x0)
  const ey = top + (vertexY - top) * t
  const n = round
  const left = `M${n(x0)} ${n(bottom)}V${n(top)}L${n(ex)} ${n(ey)}`
  const right = `M${n(x1)} ${n(bottom)}V${n(top)}L${n(MARK_WIDTH - ex)} ${n(ey)}`
  return {
    strokes: [left, right],
    d: `${left} ${right}`,
    strokeWidth: w,
    ends: [
      [n(ex), n(ey)],
      [n(MARK_WIDTH - ex), n(ey)],
    ],
  }
}

/** For 20 px of mark height and up: the header, cards, the OG images, icons. */
export const MARK = splitM(MARK_CODE, 13, 48)

/**
 * For favicons, below 20 px. Heavier, because at 16 px the regular stroke is
 * barely two pixels and the vertex gap closes to a smudge. The stroke is 3/16
 * of the mark's width, so in a 16 px square favicon each stem is exactly three
 * whole pixel columns (1-3 and 13-15) instead of four half-lit ones.
 */
export const MARK_SMALL = splitM(MARK_CODE, (MARK_WIDTH * 3) / 16, 52)

/** The geometry to draw at a given rendered mark height, in px. */
export function markFor(height: number): MarkGeometry {
  return height < 20 ? MARK_SMALL : MARK
}

/**
 * The mark's colours: phosphor on the dark ground, the inky green of the
 * light theme on paper. In the DOM, Logo.tsx uses `var(--color-signal)`
 * instead, so it follows the theme like any other token.
 */
export const MARK_COLOURS = {
  dark: { mark: DARK.signal, word: DARK.ink, ground: DARK.void },
  light: { mark: LIGHT.signal, word: LIGHT.ink, ground: LIGHT.void },
} as const

export type MarkTheme = keyof typeof MARK_COLOURS

/* -------------------------------------------------------------------------- */
/* The wordmark                                                                */
/* -------------------------------------------------------------------------- */

/**
 * "MorseForge", traced. Font units with the cap line at y = 0 and the baseline
 * at y = `capHeight`; the descender of the g reaches `bottom`.
 */
export const WORDMARK = {
  text: WORDMARK_OUTLINE.text,
  d: WORDMARK_OUTLINE.d,
  width: WORDMARK_OUTLINE.width,
  capHeight: WORDMARK_OUTLINE.capHeight,
  top: WORDMARK_OUTLINE.top,
  bottom: WORDMARK_OUTLINE.bottom,
} as const

/** The name the wordmark spells: SITE.name, which the outline was traced from. */
export const WORDMARK_TEXT = SITE.name

/* -------------------------------------------------------------------------- */
/* Lockups                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Wordmark cap height and the space before it, as fractions of the mark's
 * height. `compact` is the optical size for small UI (the header): at 20 px a
 * half-height wordmark is under 10 px and reads as an afterthought.
 */
export const LOCKUP_RATIOS = {
  horizontal: { cap: 0.5, gap: 0.34 },
  compact: { cap: 0.6, gap: 0.45 },
  stacked: { cap: 0.3, gap: 0.3 },
} as const

/** A placement: draw the mark at `mark`, the wordmark with its cap line at `word.y`. */
export interface Lockup {
  width: number
  /** From the top of the ink to the bottom of the g. */
  height: number
  mark: { x: number; y: number; width: number; height: number }
  word: { x: number; y: number; cap: number; width: number; scale: number }
}

/** The mark beside the name, the name centred on the mark. */
export function horizontalLockup(markHeight: number, compact = false): Lockup {
  const ratios = compact ? LOCKUP_RATIOS.compact : LOCKUP_RATIOS.horizontal
  const markWidth = (markHeight * MARK_WIDTH) / MARK_HEIGHT
  const cap = markHeight * ratios.cap
  const scale = cap / WORDMARK.capHeight
  const wordWidth = WORDMARK.width * scale
  const x = markWidth + markHeight * ratios.gap
  const y = (markHeight - cap) / 2
  const descent = (WORDMARK.bottom - WORDMARK.capHeight) * scale
  return {
    width: x + wordWidth,
    height: Math.max(markHeight, y + cap + descent),
    mark: { x: 0, y: 0, width: markWidth, height: markHeight },
    word: { x, y, cap, width: wordWidth, scale },
  }
}

/** The mark above the name, both centred. */
export function stackedLockup(markHeight: number): Lockup {
  const ratios = LOCKUP_RATIOS.stacked
  const markWidth = (markHeight * MARK_WIDTH) / MARK_HEIGHT
  const cap = markHeight * ratios.cap
  const scale = cap / WORDMARK.capHeight
  const wordWidth = WORDMARK.width * scale
  const width = Math.max(markWidth, wordWidth)
  const y = markHeight + markHeight * ratios.gap
  return {
    width,
    height: y + WORDMARK.bottom * scale,
    mark: { x: (width - markWidth) / 2, y: 0, width: markWidth, height: markHeight },
    word: { x: (width - wordWidth) / 2, y, cap, width: wordWidth, scale },
  }
}

/**
 * Clear space around any lockup: the wordmark's cap height in the horizontal
 * lockup, which is half the mark's height. Nothing else sits inside it.
 */
export function clearSpace(markHeight: number): number {
  return markHeight * LOCKUP_RATIOS.horizontal.cap
}

/** Smallest sizes, in px: below these the favicon geometry or nothing. */
export const MIN_SIZE = { mark: 16, horizontalWidth: 112 } as const

/* -------------------------------------------------------------------------- */
/* SVG                                                                         */
/* -------------------------------------------------------------------------- */

function markElement(geometry: MarkGeometry, colour: string): string {
  return `<path d="${geometry.d}" fill="none" stroke="${colour}" stroke-width="${geometry.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"/>`
}

/** The mark scaled into a placement box (mark coordinates → px). */
export function markGroup(
  box: { x: number; y: number; height: number },
  colour: string,
  geometry: MarkGeometry = markFor(box.height),
): string {
  const s = round(box.height / MARK_HEIGHT)
  return `<g transform="translate(${round(box.x)} ${round(box.y)}) scale(${s})">${markElement(geometry, colour)}</g>`
}

/** The wordmark scaled into a placement (cap line at `y`). */
export function wordGroup(word: Lockup['word'], colour: string): string {
  return `<g transform="translate(${round(word.x)} ${round(word.y)}) scale(${round(word.scale * 10000) / 10000})"><path d="${WORDMARK.d}" fill="${colour}"/></g>`
}

export interface MarkSvgOptions {
  /** Pixel size of the (square) file; picks the stroke weight. Default 64. */
  size?: number
  /** One colour for the mark. Default: the dark theme's phosphor. */
  colour?: string
  /** Fill the square with this colour first. Default: transparent. */
  background?: string
}

/**
 * The mark alone as a square SVG document, centred: for public/favicon.svg
 * and as the source the rasteriser turns into icons.
 */
export function markSvg({
  size = 64,
  colour = MARK_COLOURS.dark.mark,
  background,
}: MarkSvgOptions = {}): string {
  const geometry = markFor(size * (MARK_HEIGHT / MARK_WIDTH))
  const pad = 4
  const side = MARK_WIDTH + pad * 2
  const y = (side - MARK_HEIGHT) / 2
  const bg = background ? `<rect width="${side}" height="${side}" fill="${background}"/>` : ''
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${side} ${side}" width="${size}" height="${size}" role="img" aria-label="${SITE.name}"><title>${SITE.name}</title>${bg}<g transform="translate(${pad} ${y})">${markElement(geometry, colour)}</g></svg>`
}

export interface LockupSvgOptions {
  layout?: 'horizontal' | 'stacked'
  /** Mark height in the file's own units. Default 64. */
  markHeight?: number
  /** `dark`/`light` use MARK_COLOURS; `mono` draws everything in `ink`. */
  theme?: MarkTheme | 'mono'
  ink?: string
  /** Pad by the clear space. Default true. */
  clear?: boolean
}

/** A complete lockup as an SVG document. */
export function lockupSvg({
  layout = 'horizontal',
  markHeight = 64,
  theme = 'dark',
  ink = 'currentColor',
  clear = true,
}: LockupSvgOptions = {}): string {
  const lockup = layout === 'horizontal' ? horizontalLockup(markHeight) : stackedLockup(markHeight)
  const pad = clear ? clearSpace(markHeight) : 0
  const markColour = theme === 'mono' ? ink : MARK_COLOURS[theme].mark
  const wordColour = theme === 'mono' ? ink : MARK_COLOURS[theme].word
  const w = round(lockup.width + pad * 2)
  const h = round(lockup.height + pad * 2)
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w} ${h}" width="${w}" height="${h}" role="img" aria-label="${SITE.name}"><title>${SITE.name}</title>${markGroup(lockup.mark, markColour)}${wordGroup(lockup.word, wordColour)}</svg>`
}

/* -------------------------------------------------------------------------- */
/* Canvas                                                                      */
/* -------------------------------------------------------------------------- */

/** The part of a 2D context the logo needs, so a test can pass a recorder. */
export type LogoContext = Pick<
  CanvasRenderingContext2D,
  'save' | 'restore' | 'translate' | 'scale' | 'stroke' | 'fill' | 'beginPath' | 'roundRect'
> & {
  strokeStyle: CanvasRenderingContext2D['strokeStyle']
  fillStyle: CanvasRenderingContext2D['fillStyle']
  lineWidth: number
  lineCap: CanvasLineCap
  lineJoin: CanvasLineJoin
}

/** Path2D is a browser API; under Node (tests) the logo is skipped. */
const canPath = () => typeof Path2D !== 'undefined'

/** The mark with its top-left at (x, y), `height` px tall. */
export function drawMark(c: LogoContext, x: number, y: number, height: number, colour: string) {
  if (!canPath()) return
  const geometry = markFor(height)
  const s = height / MARK_HEIGHT
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  c.strokeStyle = colour
  c.lineWidth = geometry.strokeWidth
  c.lineCap = 'round'
  c.lineJoin = 'round'
  c.stroke(new Path2D(geometry.d))
  c.restore()
}

/** The wordmark with its cap line at `y`, `cap` px of cap height. */
export function drawWordmark(c: LogoContext, x: number, y: number, cap: number, colour: string) {
  if (!canPath()) return
  const s = cap / WORDMARK.capHeight
  c.save()
  c.translate(x, y)
  c.scale(s, s)
  c.fillStyle = colour
  c.fill(new Path2D(WORDMARK.d))
  c.restore()
}

/** A lockup at (x, y): `placement` from horizontalLockup / stackedLockup. */
export function drawLockup(
  c: LogoContext,
  x: number,
  y: number,
  placement: Lockup,
  colours: { mark: string; word: string },
) {
  drawMark(c, x + placement.mark.x, y + placement.mark.y, placement.mark.height, colours.mark)
  drawWordmark(c, x + placement.word.x, y + placement.word.y, placement.word.cap, colours.word)
}

/**
 * The app-icon tile: the mark on the dark ground in a rounded square, `size`
 * px a side. The paper cards wear it as their letterhead badge, the way the
 * home screen shows it.
 */
export function drawMarkTile(c: LogoContext, x: number, y: number, size: number) {
  if (!canPath()) return
  c.save()
  c.fillStyle = MARK_COLOURS.dark.ground
  c.beginPath()
  c.roundRect(x, y, size, size, size * 0.2237)
  c.fill()
  c.restore()
  const height = size * 0.5
  const width = (height * MARK_WIDTH) / MARK_HEIGHT
  drawMark(c, x + (size - width) / 2, y + (size - height) / 2, height, MARK_COLOURS.dark.mark)
}
