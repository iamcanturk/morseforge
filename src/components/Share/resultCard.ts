/**
 * The shareable result card (PROJECT.md §35, §39.2): the "Telegram" card of
 * the Signal Office design (TASK-001 §4.2).
 *
 * Drawn on a canvas rather than screenshotted, so it looks the same on every
 * device and carries the URL. That URL is the entire point: the card is the
 * growth loop, and a handsome image with no way back to the site is a poster
 * for nothing. It is still only the optional extra: the share text, which
 * always contains the link, is the primary way out (flow audit B6).
 *
 * One look in both themes. A telegram form is paper whatever the page is
 * doing, and the CRT inset is dark glass whatever the page is doing, which is
 * the same rule the screens follow (DEC-008).
 *
 * Kept apart from React because it is plain 2D drawing, and because the layout
 * maths and the words on it, which are the parts that can be wrong, are then
 * testable.
 */

import { ALL_LETTERS } from '../../data/morseAlphabet'
import { encode, prettify } from '../../engine/morseEncoder'
import { DEFAULT_CHALLENGE } from '../../game/challengeLink'
import { DARK, LIGHT, SCREEN, SCREEN_GLASS } from '../../styles/palette'
import { drawMarkTile } from '../brand/mark'

export interface CardData {
  accuracy: number
  correct: number
  total: number
  /** The summary's `wpm`: correct characters ÷ 5 ÷ minutes. Shown per minute. */
  wpm: number
  streak: number
  mastered: number
  challenge: boolean
  /** The session score. Printed as the telegram's number. */
  score?: number
  /** `YYYY-MM-DD`, in the player's own calendar. */
  date?: string
  /** Challenge length in seconds, for the headline. */
  time?: number
}

export const CARD = {
  width: 1200,
  height: 630,
  pad: 72,
  /** Inset of the double border frame. */
  frame: 24,
  colors: {
    paper: LIGHT.paper,
    ink: LIGHT['paper-ink'],
    muted: LIGHT['paper-muted'],
    rule: LIGHT['paper-ink'],
    tape: LIGHT.elevated,
    stamp: LIGHT.danger,
    url: LIGHT.cyan,
    glassCentre: SCREEN_GLASS.centre,
    glass: SCREEN_GLASS.body,
    glassRim: SCREEN_GLASS.rim,
    phosphor: SCREEN.signal,
    phosphorMuted: SCREEN.muted,
    brass: DARK['brass-deep'],
  },
  /** The CRT inset on the left. */
  screen: { x: 72, y: 150, w: 488, h: 320 },
  /** The typed fields on the right. */
  fields: { x: 616, right: 1128, top: 196, step: 66 },
  /** The punched tape along the bottom. */
  tape: { y: 500, h: 66 },
} as const

export interface Stat {
  label: string
  value: string
}

/**
 * The stats to show, in order.
 *
 * Accuracy leads, because §34 puts accuracy above speed and a card that opens
 * with a speed number teaches the opposite. Anything at zero is dropped rather
 * than shown as "0": a card advertising a zero-day streak is worse than one
 * with three stats on it.
 *
 * Speed is correct characters per minute, not WPM. In listening and reading
 * modes the measured rate is how fast answers were typed, and calling that
 * words per minute would be a number the card cannot back up (DEC-006, B9).
 */
export function cardStats(data: CardData): Stat[] {
  const stats: Stat[] = [
    { label: 'ACCURACY', value: `${Math.round(data.accuracy * 100)}%` },
    { label: 'DECODED', value: `${data.correct}` },
  ]

  if (data.wpm >= 1) stats.push({ label: 'CHARS/MIN', value: `${Math.round(data.wpm * 5)}` })
  if (data.streak > 0)
    stats.push({ label: 'STREAK', value: `${data.streak} ${data.streak === 1 ? 'DAY' : 'DAYS'}` })
  if (data.mastered > 0)
    stats.push({ label: 'MASTERED', value: `${data.mastered}/${ALL_LETTERS.length}` })

  // Four is what fits down the card's right-hand column.
  return stats.slice(0, 4)
}

/**
 * The typed fields beside the screen: the score first when there is one,
 * then everything `cardStats` has after accuracy (which the screen shows).
 */
export function cardFields(data: CardData): Stat[] {
  const rest = cardStats(data).slice(1)
  const fields =
    data.score === undefined ? rest : [{ label: 'SCORE', value: `${data.score}` }, ...rest]
  return fields.slice(0, 4)
}

/** Evenly spaced column centres for `count` stats across the card. */
export function columnCentres(count: number): number[] {
  if (count <= 0) return []
  const usable = CARD.width - CARD.pad * 2
  const step = usable / count
  return Array.from({ length: count }, (_, i) => CARD.pad + step * (i + 0.5))
}

export function headline(data: CardData): string {
  return data.challenge
    ? `${data.time ?? DEFAULT_CHALLENGE.time} SECOND CHALLENGE`
    : 'MORSE PRACTICE'
}

/**
 * The stamp: the headline, and on a challenge card the score to beat. The
 * card is addressed to whoever sees it, so the number on the stamp is the
 * sharer's own result, which the link printed beside it lets them try.
 */
export function stampLines(data: CardData): string[] {
  const lines = [headline(data)]
  if (data.challenge && data.score !== undefined && data.total > 0) {
    lines.push(`BEAT ${data.score}`)
  }
  return lines
}

/** The line under the stats. Present tense, no boasting the numbers deny. */
export function taunt(data: CardData): string {
  if (data.total === 0) return 'Can you decode Morse code?'
  if (data.accuracy >= 0.9 && data.correct >= 20) return 'CAN YOU BEAT ME?'
  return 'CAN YOU DECODE THIS?'
}

/** The telegram's reference line: number, count and date. */
export function referenceLine(data: CardData): string {
  const parts: string[] = []
  if (data.score !== undefined) parts.push(`No. ${data.score}`)
  parts.push(`${data.correct}/${data.total} DECODED`)
  if (data.date) parts.push(data.date)
  return parts.join('  ·  ')
}

/**
 * The tape: the score in Morse, then the taunt, ending in STOP as a telegram
 * does. The Morse is encoded from the number, never typed.
 */
export function tapeLine(data: CardData): string {
  const number = data.score ?? data.correct
  return `${prettify(encode(String(number)))}   ${taunt(data).toUpperCase()} STOP`
}

/** What a screen reader hears for the card: the real numbers, not "an image". */
export function cardDescription(data: CardData): string {
  const parts = [
    data.challenge
      ? `${data.time ?? DEFAULT_CHALLENGE.time}-second challenge result`
      : 'Practice result',
    `${Math.round(data.accuracy * 100)}% accuracy`,
    `${data.correct} of ${data.total} decoded`,
  ]
  if (data.score !== undefined) parts.push(`score ${data.score}`)
  return `${parts.join(', ')}.`
}

/** The URL printed on the card: the page that runs it, without the scheme. */
export function cardUrl(data: CardData, siteUrl: string): string {
  const host = siteUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')
  return `${host}/${data.challenge ? 'challenge' : 'practice'}`
}

const DISPLAY = '"Space Grotesk", system-ui, sans-serif'
const MONO = '"JetBrains Mono", ui-monospace, monospace'

/**
 * Wait for the brand faces, briefly. A canvas draws with whatever is loaded at
 * that moment, and the card used to come out in system-ui. A second is the
 * cap: a card in a fallback face beats a card that never draws.
 */
export async function ensureCardFonts(timeoutMs = 1000): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return
  await Promise.race([
    Promise.all([
      document.fonts.load(`700 48px ${DISPLAY}`),
      document.fonts.load(`400 20px ${MONO}`),
    ]).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

function roundRect(
  c: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
) {
  c.beginPath()
  c.roundRect(x, y, w, h, r)
}

/** Draw the card onto a canvas, at 1200 × 630. */
export function drawCard(canvas: HTMLCanvasElement, data: CardData, siteUrl: string): void {
  const c = canvas.getContext('2d')
  if (!c) return

  canvas.width = CARD.width
  canvas.height = CARD.height
  const { colors, frame, screen, fields, tape } = CARD
  const W = CARD.width
  const H = CARD.height

  // Stock, with ruled lines like a telegraph form.
  c.fillStyle = colors.paper
  c.fillRect(0, 0, W, H)
  c.strokeStyle = colors.rule
  c.globalAlpha = 0.06
  c.lineWidth = 1
  for (let y = 42; y < H; y += 42) {
    c.beginPath()
    c.moveTo(0, y + 0.5)
    c.lineTo(W, y + 0.5)
    c.stroke()
  }
  c.globalAlpha = 1

  // Double frame.
  c.strokeStyle = colors.muted
  c.lineWidth = 2
  c.strokeRect(frame, frame, W - frame * 2, H - frame * 2)
  c.lineWidth = 1
  c.strokeRect(frame + 7.5, frame + 7.5, W - frame * 2 - 15, H - frame * 2 - 15)

  // Header: the mark, the office name, the reference line.
  drawMarkTile(c, CARD.pad, 56, 56)
  c.textBaseline = 'alphabetic'
  c.textAlign = 'left'
  c.fillStyle = colors.ink
  c.font = `700 34px ${DISPLAY}`
  c.letterSpacing = '4px'
  c.fillText('MORSEFORGE TELEGRAPH', CARD.pad + 76, 88)
  c.letterSpacing = '0px'
  c.fillStyle = colors.muted
  c.font = `400 20px ${MONO}`
  c.fillText(referenceLine(data), CARD.pad + 76, 120)

  // Stamp, top right, rotated.
  const lines = stampLines(data)
  c.save()
  c.translate(W - 236, 98)
  c.rotate((-8 * Math.PI) / 180)
  c.globalAlpha = 0.85
  c.strokeStyle = colors.stamp
  c.fillStyle = colors.stamp
  c.font = `700 24px ${DISPLAY}`
  c.letterSpacing = '2px'
  const stampWidth = Math.max(...lines.map((line) => c.measureText(line).width)) + 40
  const stampHeight = 24 + lines.length * 32
  c.lineWidth = 3
  c.strokeRect(-stampWidth / 2, -stampHeight / 2, stampWidth, stampHeight)
  c.lineWidth = 1.5
  c.strokeRect(-stampWidth / 2 + 6, -stampHeight / 2 + 6, stampWidth - 12, stampHeight - 12)
  c.textAlign = 'center'
  lines.forEach((line, index) => {
    c.font = index === 0 ? `700 22px ${DISPLAY}` : `700 30px ${DISPLAY}`
    c.fillText(line, 0, -stampHeight / 2 + 42 + index * 32)
  })
  c.letterSpacing = '0px'
  c.restore()

  // The CRT inset: accuracy, in phosphor.
  c.save()
  roundRect(c, screen.x, screen.y, screen.w, screen.h, 18)
  c.clip()
  const glass = c.createRadialGradient(
    screen.x + screen.w / 2,
    screen.y + screen.h * 0.45,
    10,
    screen.x + screen.w / 2,
    screen.y + screen.h / 2,
    screen.w * 0.62,
  )
  glass.addColorStop(0, colors.glassCentre)
  glass.addColorStop(0.65, colors.glass)
  glass.addColorStop(1, colors.glassRim)
  c.fillStyle = glass
  c.fillRect(screen.x, screen.y, screen.w, screen.h)

  c.textAlign = 'center'
  c.fillStyle = colors.phosphor
  c.shadowColor = colors.phosphor
  c.shadowBlur = 24
  c.font = `700 150px ${DISPLAY}`
  c.fillText(`${Math.round(data.accuracy * 100)}%`, screen.x + screen.w / 2, screen.y + 210)
  c.shadowBlur = 0
  c.fillStyle = colors.phosphorMuted
  c.font = `400 20px ${MONO}`
  c.letterSpacing = '4px'
  c.fillText('ACCURACY', screen.x + screen.w / 2, screen.y + 268)
  c.letterSpacing = '0px'

  // Scanlines over the glass, then the vignette.
  c.fillStyle = 'rgb(0 0 0 / 0.18)'
  for (let y = screen.y; y < screen.y + screen.h; y += 3) c.fillRect(screen.x, y, screen.w, 1)
  const vignette = c.createRadialGradient(
    screen.x + screen.w / 2,
    screen.y + screen.h / 2,
    screen.h * 0.4,
    screen.x + screen.w / 2,
    screen.y + screen.h / 2,
    screen.w * 0.7,
  )
  vignette.addColorStop(0, 'rgb(0 0 0 / 0)')
  vignette.addColorStop(1, 'rgb(0 0 0 / 0.45)')
  c.fillStyle = vignette
  c.fillRect(screen.x, screen.y, screen.w, screen.h)
  c.restore()

  // Brass bezel round the glass.
  c.strokeStyle = colors.brass
  c.lineWidth = 4
  roundRect(c, screen.x - 2, screen.y - 2, screen.w + 4, screen.h + 4, 20)
  c.stroke()

  // Typed fields with dotted leaders.
  cardFields(data).forEach((field, index) => {
    const y = fields.top + index * fields.step
    c.textAlign = 'left'
    c.fillStyle = colors.muted
    c.font = `400 20px ${MONO}`
    c.letterSpacing = '2px'
    c.fillText(field.label, fields.x, y)
    const labelEnd = fields.x + c.measureText(field.label).width + 12
    c.letterSpacing = '0px'

    c.textAlign = 'right'
    c.fillStyle = colors.ink
    c.font = `400 34px ${MONO}`
    c.fillText(field.value, fields.right, y + 2)
    const valueStart = fields.right - c.measureText(field.value).width - 12

    c.fillStyle = colors.muted
    for (let x = labelEnd; x < valueStart; x += 10) {
      c.beginPath()
      c.arc(x, y - 6, 1.4, 0, Math.PI * 2)
      c.fill()
    }
  })

  // The tape, full width inside the frame, with a row of sprocket holes.
  const tapeX = frame + 16
  const tapeW = W - tapeX * 2
  c.fillStyle = colors.tape
  c.fillRect(tapeX, tape.y, tapeW, tape.h)
  c.strokeStyle = colors.muted
  c.globalAlpha = 0.35
  c.lineWidth = 1
  c.strokeRect(tapeX + 0.5, tape.y + 0.5, tapeW - 1, tape.h - 1)
  c.fillStyle = colors.muted
  for (let x = tapeX + 10; x < tapeX + tapeW - 4; x += 14) {
    c.beginPath()
    c.arc(x, tape.y + 10, 2.4, 0, Math.PI * 2)
    c.fill()
  }
  c.globalAlpha = 1
  c.textAlign = 'left'
  c.fillStyle = colors.ink
  c.font = `400 28px ${MONO}`
  c.letterSpacing = '3px'
  c.fillText(tapeLine(data), tapeX + 20, tape.y + 50, tapeW - 40)
  c.letterSpacing = '0px'

  // The URL. This is the reason the card exists.
  c.textAlign = 'right'
  c.fillStyle = colors.url
  c.font = `400 24px ${MONO}`
  c.fillText(cardUrl(data, siteUrl), W - CARD.pad, H - frame - 16)
  c.textAlign = 'left'
}

/** Render to a PNG blob. */
export async function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
