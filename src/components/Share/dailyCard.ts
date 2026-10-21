/**
 * The daily share card: a telegram form (UI audit §4.3).
 *
 * The same 1200 × 630 stock as the result card, so a feed of MorseForge posts
 * reads as one product: paper, a CRT inset with the headline number, typed
 * fields, and a strip of tape punched once per line. Like the text share it
 * never shows the text of a line, so it spoils nothing for a later player.
 *
 * The layout is a plain model built by a pure function, and drawing only
 * paints that model. The part that can be wrong — what the card claims — is
 * therefore testable without a canvas.
 */

import { LIGHT, SCREEN, SCREEN_GLASS } from '../../styles/palette'
import { drawMarkTile } from '../brand/mark'
import { SITE } from '../../config/site'
import {
  DAILY_URL,
  shareStreak,
  summarizeDaily,
  type DailyShareInput,
  type LineTone,
} from '../../game/dailyShare'

export const DAILY_CARD = { width: 1200, height: 630, pad: 72 } as const

/** Ink on the card, all from the palette: paper is light in both themes. */
const INK = {
  paper: LIGHT.paper,
  ink: LIGHT['paper-ink'],
  muted: LIGHT['paper-muted'],
  perfect: LIGHT.signal,
  pass: LIGHT.amber,
  under: LIGHT.danger,
  link: LIGHT.cyan,
} as const

export type StampTone = 'passed' | 'short' | 'incomplete'

export interface DailyCardInput extends DailyShareInput {
  /** Character speed of the day. */
  wpm: number
}

export interface CardField {
  label: string
  value: string
}

export interface DailyCardModel {
  title: string
  subtitle: string
  stamp: { text: string; tone: StampTone }
  /** The CRT inset: lines over the bar, out of the day's lines. */
  big: string
  bigLabel: string
  fields: CardField[]
  tones: LineTone[]
  tapeText: string
  /** The URL as printed, without the scheme. */
  url: string
  /** The canvas's accessible name, with the actual numbers. */
  alt: string
}

/**
 * The stamp. Never a red "FAILED": the same wire for everyone at a speed
 * nobody chose, so short of the bar is a day on the wire, not a verdict.
 */
export function stampFor(
  summary: { completed: boolean },
  passed: boolean,
): DailyCardModel['stamp'] {
  if (!summary.completed) return { text: 'INCOMPLETE', tone: 'incomplete' }
  return passed ? { text: 'PASSED', tone: 'passed' } : { text: 'ON THE WIRE', tone: 'short' }
}

export function dailyCardModel(input: DailyCardInput): DailyCardModel {
  const s = summarizeDaily(input)
  const passed = s.completed && input.accuracy >= input.passMark
  const streak = shareStreak(input.streak)
  const days = streak === null ? 0 : Math.floor(input.streak)

  const fields: CardField[] = [
    { label: 'ACCURACY', value: `${s.percent}%` },
    { label: 'CLEAN LINES', value: `${s.clean}/${s.total}` },
    ...(days > 0 ? [{ label: 'STREAK', value: `${days} DAY${days === 1 ? '' : 'S'}` }] : []),
    ...(Number.isFinite(input.wpm) && input.wpm > 0
      ? [{ label: 'SPEED', value: `${Math.round(input.wpm)} WPM` }]
      : []),
  ]

  return {
    title: `${SITE.name.toUpperCase()} DAILY WIRE`,
    subtitle: `No. ${s.number}  ·  ${input.date} UTC`,
    stamp: stampFor(s, passed),
    big: `${s.overBar}/${s.total}`,
    bigLabel: 'LINES OVER THE BAR',
    fields,
    tones: s.tones,
    tapeText: 'SAME WIRE FOR EVERYONE STOP',
    url: DAILY_URL.replace(/^https?:\/\//, '').replace(/\/$/, ''),
    alt:
      `${SITE.name} Daily number ${s.number}: ${s.overBar} of ${s.total} lines over the bar, ` +
      `${s.percent}% accuracy${days > 0 ? `, ${days}-day streak` : ''}` +
      `${s.completed ? '' : ', incomplete'}.`,
  }
}

/* -------------------------------------------------------------------------- */
/* Drawing                                                                     */
/* -------------------------------------------------------------------------- */

const DISPLAY = '"Space Grotesk", ui-sans-serif, system-ui, sans-serif'
const MONO = '"JetBrains Mono", ui-monospace, Menlo, monospace'

/**
 * Wait for the brand fonts, but not for long: a card in a fallback face is
 * better than a share button that does nothing for three seconds.
 */
export async function loadCardFonts(timeoutMs = 1000): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.race([
    Promise.all([
      document.fonts.load(`700 48px ${DISPLAY}`),
      document.fonts.load(`400 20px ${MONO}`),
    ]).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

type Ctx = CanvasRenderingContext2D

function spaced(c: Ctx, px: number) {
  // Not in every engine yet; without it the text is merely untracked.
  if ('letterSpacing' in c) (c as Ctx & { letterSpacing: string }).letterSpacing = `${px}px`
}

function paper(c: Ctx) {
  const { width, height } = DAILY_CARD
  c.fillStyle = INK.paper
  c.fillRect(0, 0, width, height)

  // Ruled form lines.
  c.strokeStyle = INK.ink
  c.globalAlpha = 0.06
  c.lineWidth = 1
  for (let y = 42; y < height; y += 42) {
    c.beginPath()
    c.moveTo(0, y + 0.5)
    c.lineTo(width, y + 0.5)
    c.stroke()
  }
  c.globalAlpha = 1

  // Double frame.
  c.strokeStyle = INK.muted
  c.lineWidth = 2
  c.strokeRect(24, 24, width - 48, height - 48)
  c.lineWidth = 1
  c.strokeRect(31.5, 31.5, width - 63, height - 63)
}

function stamp(c: Ctx, model: DailyCardModel) {
  const colour = model.stamp.tone === 'passed' ? INK.perfect : INK.pass
  c.save()
  c.font = `700 30px ${DISPLAY}`
  spaced(c, 3)
  const width = c.measureText(model.stamp.text).width + 40
  c.translate(DAILY_CARD.width - DAILY_CARD.pad - width / 2, 100)
  c.rotate((-8 * Math.PI) / 180)
  c.globalAlpha = 0.85
  c.strokeStyle = colour
  c.lineWidth = 3
  c.strokeRect(-width / 2, -30, width, 60)
  c.lineWidth = 1.5
  c.strokeRect(-width / 2 + 6, -24, width - 12, 48)
  c.fillStyle = colour
  c.textAlign = 'center'
  c.textBaseline = 'middle'
  c.fillText(model.stamp.text, 0, 2)
  c.restore()
}

function screen(c: Ctx, model: DailyCardModel, x: number, y: number, w: number, h: number) {
  c.save()
  c.beginPath()
  c.roundRect(x, y, w, h, 18)
  c.clip()

  const glass = c.createRadialGradient(x + w / 2, y + h * 0.45, 10, x + w / 2, y + h / 2, w * 0.7)
  glass.addColorStop(0, SCREEN_GLASS.centre)
  glass.addColorStop(0.65, SCREEN_GLASS.body)
  glass.addColorStop(1, SCREEN_GLASS.rim)
  c.fillStyle = glass
  c.fillRect(x, y, w, h)

  c.fillStyle = SCREEN.signal
  c.textAlign = 'center'
  c.textBaseline = 'alphabetic'
  c.font = `700 150px ${DISPLAY}`
  c.shadowColor = SCREEN.signal
  c.shadowBlur = 24
  c.fillText(model.big, x + w / 2, y + h / 2 + 40)
  c.shadowBlur = 0

  c.fillStyle = SCREEN.muted
  c.font = `400 20px ${MONO}`
  spaced(c, 2)
  c.fillText(model.bigLabel, x + w / 2, y + h - 34)
  spaced(c, 0)

  // Scanlines over everything, as on the page's own screens.
  c.fillStyle = 'rgba(0, 0, 0, 0.18)'
  for (let line = y; line < y + h; line += 3) c.fillRect(x, line, w, 1)
  c.restore()

  c.strokeStyle = INK.ink
  c.lineWidth = 6
  c.beginPath()
  c.roundRect(x - 3, y - 3, w + 6, h + 6, 21)
  c.stroke()
}

function fields(c: Ctx, model: DailyCardModel, x: number, right: number, top: number) {
  model.fields.forEach((field, index) => {
    const y = top + index * 74
    c.textBaseline = 'alphabetic'
    c.textAlign = 'left'
    c.fillStyle = INK.muted
    c.font = `400 20px ${MONO}`
    spaced(c, 2)
    c.fillText(field.label, x, y)
    const labelEnd = x + c.measureText(field.label).width + 14

    c.textAlign = 'right'
    c.fillStyle = INK.ink
    c.font = `700 34px ${MONO}`
    spaced(c, 0)
    c.fillText(field.value, right, y + 4)
    const valueStart = right - c.measureText(field.value).width - 14

    // Dotted leader between the label and the typed value.
    c.fillStyle = INK.muted
    for (let dot = labelEnd; dot < valueStart; dot += 10) c.fillRect(dot, y - 4, 2, 2)
  })
  c.textAlign = 'left'
}

function tape(c: Ctx, model: DailyCardModel, x: number, y: number, w: number, h: number) {
  c.fillStyle = INK.paper
  c.fillRect(x, y, w, h)
  c.strokeStyle = INK.muted
  c.lineWidth = 1
  c.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1)

  // Sprocket holes.
  c.fillStyle = INK.muted
  for (let hole = x + 10; hole < x + w - 4; hole += 14) {
    c.beginPath()
    c.arc(hole, y + 9, 2.4, 0, Math.PI * 2)
    c.fill()
  }

  // One punched square per line, with a shape for each tone, not only a
  // colour: filled for perfect, half for over the bar, empty for under it.
  const size = 34
  const gap = 12
  const top = y + 20
  model.tones.forEach((tone, index) => {
    const left = x + 22 + index * (size + gap)
    c.lineWidth = 3
    c.strokeStyle = INK[tone]
    c.strokeRect(left + 1.5, top + 1.5, size - 3, size - 3)
    c.fillStyle = INK[tone]
    if (tone === 'perfect') c.fillRect(left, top, size, size)
    if (tone === 'pass') c.fillRect(left, top + size / 2, size, size / 2)
  })

  c.fillStyle = INK.ink
  c.font = `400 26px ${MONO}`
  spaced(c, 3)
  c.textAlign = 'right'
  c.textBaseline = 'middle'
  c.fillText(model.tapeText, x + w - 24, top + size / 2 + 1)
  spaced(c, 0)
  c.textAlign = 'left'
}

/** Paint the card. The canvas is resized to the card. */
export function drawDailyCard(canvas: HTMLCanvasElement, model: DailyCardModel): void {
  const c = canvas.getContext('2d')
  if (!c) return
  canvas.width = DAILY_CARD.width
  canvas.height = DAILY_CARD.height
  const { width, pad } = DAILY_CARD

  paper(c)
  drawMarkTile(c, pad, 58, 64)

  c.textBaseline = 'alphabetic'
  c.textAlign = 'left'
  c.fillStyle = INK.ink
  c.font = `700 34px ${DISPLAY}`
  spaced(c, 4)
  c.fillText(model.title, pad + 84, 92)
  c.fillStyle = INK.muted
  c.font = `400 20px ${MONO}`
  spaced(c, 1)
  c.fillText(model.subtitle, pad + 84, 120)
  spaced(c, 0)

  stamp(c, model)
  screen(c, model, pad, 162, 452, 290)
  fields(c, model, 588, width - pad, 214)
  tape(c, model, pad, 480, width - pad * 2, 74)

  c.fillStyle = INK.link
  c.font = `400 22px ${MONO}`
  c.textAlign = 'right'
  c.textBaseline = 'alphabetic'
  c.fillText(model.url, width - pad, 588)
  c.textAlign = 'left'
}

/** Render to a PNG blob, or null if the browser refuses. */
export function dailyCardBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
