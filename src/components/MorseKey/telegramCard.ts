/**
 * "Share this as a telegram": what was keyed on the telegraph, typed onto a
 * telegram form (TASK-001 §4.2 stock, Q4a).
 *
 * The card carries only the decoded text and its Morse, both of which the
 * sender produced themselves; there is no score on it, so there is nothing on
 * it to inflate. It is drawn on a canvas, never as HTML, so whatever was sent
 * is only ever text.
 *
 * The drawing is the same in both themes, as a telegram form is paper whatever
 * the page is doing. Colours come from palette.ts and the mark from mark.ts.
 * The words and the wrapping, the parts that can be wrong, are pure and
 * tested; the drawing itself is plain 2D calls.
 */

import { encode, prettify } from '../../engine/morseEncoder'
import { encodeMessageLink } from '../../game/messageLink'
import type { ShareMessage } from '../../game/share'
import { DARK, LIGHT } from '../../styles/palette'
import { drawMarkTile, drawWordmark } from '../brand/mark'

export const TELEGRAM = {
  width: 1200,
  height: 630,
  pad: 72,
  frame: 24,
  colors: {
    paper: LIGHT.paper,
    ink: LIGHT['paper-ink'],
    muted: LIGHT['paper-muted'],
    tape: LIGHT.elevated,
    stamp: LIGHT.danger,
    code: LIGHT.cyan,
    brass: DARK['brass-deep'],
  },
  /** The message block. */
  body: { top: 236, maxLines: 3 },
  tape: { y: 470, h: 66 },
} as const

const DISPLAY = "'Space Grotesk', ui-sans-serif, system-ui, sans-serif"
const MONO = "'JetBrains Mono', ui-monospace, 'SF Mono', Menlo, monospace"

/** The page the card and the share text point back to. */
export function telegraphUrl(siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/telegraph/`
}

/**
 * A /message/ link that plays the telegram back to whoever opens it, built by
 * the message page's own encoder. Null when the text cannot travel in one:
 * longer than `MESSAGE_MAX`, or holding a character the link refuses. The
 * telegram is shared without it then, never with a link that would fail.
 */
export function telegramMessageUrl(message: string, siteUrl: string): string | null {
  const link = encodeMessageLink(cleanMessage(message), { origin: siteUrl.replace(/\/$/, '') })
  return link.ok ? link.url : null
}

/** The message as it goes on the form: trimmed, single-spaced, upper case. */
export function cleanMessage(text: string): string {
  return text.trim().replace(/\s+/g, ' ').toUpperCase()
}

/**
 * Greedy word wrap to a character budget, ending in "…" when it runs out of
 * lines. A word longer than a whole line is broken, since a keyed run of
 * letters with no word gaps is perfectly normal on a straight key.
 */
export function wrapLines(text: string, perLine: number, maxLines: number): string[] {
  if (perLine < 1 || maxLines < 1) return []
  const words = cleanMessage(text).split(' ').filter(Boolean)
  const lines: string[] = []
  let line = ''

  const push = (value: string) => {
    lines.push(value)
    line = ''
  }

  for (const original of words) {
    let word = original
    while (word.length > perLine) {
      if (line) push(line)
      push(word.slice(0, perLine))
      word = word.slice(perLine)
    }
    if (!line) line = word
    else if (line.length + 1 + word.length <= perLine) line = `${line} ${word}`
    else {
      push(line)
      line = word
    }
  }
  if (line) lines.push(line)

  if (lines.length <= maxLines) return lines
  const kept = lines.slice(0, maxLines)
  const last = kept[maxLines - 1] ?? ''
  kept[maxLines - 1] = `${last.slice(0, Math.max(0, perLine - 1)).trimEnd()}…`
  return kept
}

/** The headline size that fits the message: shorter messages set bigger. */
export function messageSize(text: string): { px: number; perLine: number } {
  const length = cleanMessage(text).length
  if (length <= 6) return { px: 168, perLine: 8 }
  if (length <= 12) return { px: 112, perLine: 14 }
  if (length <= 32) return { px: 80, perLine: 20 }
  return { px: 58, perLine: 28 }
}

/**
 * The text for the clipboard, which stands on its own: the message, its
 * Morse, a link that plays it when it fits in one (`telegramMessageUrl`), and
 * where it was keyed. The share sheet gets `telegramShare` instead.
 */
export function telegramText(message: string, siteUrl: string): string {
  const clean = cleanMessage(message)
  const listen = telegramMessageUrl(clean, siteUrl)
  return [
    `${clean} STOP`,
    prettify(encode(clean)),
    '',
    ...(listen ? [`Hear it in Morse: ${listen}`] : []),
    `Keyed by hand on MorseForge: ${telegraphUrl(siteUrl)}`,
  ].join('\n')
}

/**
 * What the share sheet gets (DEC-035): the message and its Morse as text, and
 * one link as the url, never also inside the text. The link plays the
 * message when it fits in one, and is the telegraph otherwise.
 */
export function telegramShare(message: string, siteUrl: string): ShareMessage {
  const clean = cleanMessage(message)
  const listen = telegramMessageUrl(clean, siteUrl)
  return {
    title: 'A telegram',
    text: [
      `${clean} STOP`,
      prettify(encode(clean)),
      '',
      listen ? 'Keyed by hand on MorseForge. Hear it in Morse:' : 'Keyed by hand on MorseForge:',
    ].join('\n'),
    url: listen ?? telegraphUrl(siteUrl),
  }
}

/** What a screen reader hears for the card. */
export function telegramDescription(message: string): string {
  return `A telegram form reading "${cleanMessage(message)}", with its Morse code underneath.`
}

/** Today in the sender's own calendar, `YYYY-MM-DD`. */
export function localDate(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Wait briefly for the brand faces; a fallback face beats a card that never draws. */
export async function ensureFonts(timeoutMs = 1000): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts?.load) return
  await Promise.race([
    Promise.all([
      document.fonts.load(`700 48px ${DISPLAY}`),
      document.fonts.load(`400 20px ${MONO}`),
    ]).catch(() => undefined),
    new Promise((resolve) => setTimeout(resolve, timeoutMs)),
  ])
}

/** Draw the telegram at 1200 × 630. */
export function drawTelegram(
  canvas: HTMLCanvasElement,
  message: string,
  siteUrl: string,
  date: string,
): void {
  const c = canvas.getContext('2d')
  if (!c) return
  const { width: W, height: H, pad, frame, colors, body, tape } = TELEGRAM
  canvas.width = W
  canvas.height = H
  const clean = cleanMessage(message)

  // Stock, ruled like a telegraph form, and a double frame.
  c.fillStyle = colors.paper
  c.fillRect(0, 0, W, H)
  c.strokeStyle = colors.ink
  c.globalAlpha = 0.06
  c.lineWidth = 1
  for (let y = 42; y < H; y += 42) {
    c.beginPath()
    c.moveTo(0, y + 0.5)
    c.lineTo(W, y + 0.5)
    c.stroke()
  }
  c.globalAlpha = 1
  c.strokeStyle = colors.muted
  c.lineWidth = 2
  c.strokeRect(frame, frame, W - frame * 2, H - frame * 2)
  c.lineWidth = 1
  c.strokeRect(frame + 7.5, frame + 7.5, W - frame * 2 - 15, H - frame * 2 - 15)

  // Header: the mark, the wordmark drawn from its own paths, the form name.
  drawMarkTile(c, pad, 58, 60)
  drawWordmark(c, pad + 80, 61, 26, colors.ink)
  c.textBaseline = 'alphabetic'
  c.textAlign = 'left'
  c.fillStyle = colors.muted
  c.font = `400 20px ${MONO}`
  c.letterSpacing = '3px'
  c.fillText(`TELEGRAM  ·  ${clean.length} CHARACTERS  ·  ${date}`, pad + 80, 116)
  c.letterSpacing = '0px'

  // Stamp, top right.
  c.save()
  c.translate(W - 196, 96)
  c.rotate((-8 * Math.PI) / 180)
  c.globalAlpha = 0.85
  c.strokeStyle = colors.stamp
  c.fillStyle = colors.stamp
  c.font = `700 26px ${DISPLAY}`
  c.letterSpacing = '3px'
  const stamp = 'KEYED BY HAND'
  const sw = c.measureText(stamp).width + 44
  const sh = 58
  c.lineWidth = 3
  c.strokeRect(-sw / 2, -sh / 2, sw, sh)
  c.lineWidth = 1.5
  c.strokeRect(-sw / 2 + 6, -sh / 2 + 6, sw - 12, sh - 12)
  c.textAlign = 'center'
  c.fillText(stamp, 0, 10)
  c.letterSpacing = '0px'
  c.restore()

  // The message, typed big.
  const size = messageSize(clean)
  const lines = wrapLines(clean, size.perLine, body.maxLines)
  const lineHeight = size.px * 1.08
  const blockTop = body.top + (body.maxLines - lines.length) * lineHeight * 0.35
  c.textAlign = 'left'
  c.fillStyle = colors.ink
  c.font = `700 ${size.px}px ${DISPLAY}`
  c.letterSpacing = `${Math.round(size.px * 0.04)}px`
  lines.forEach((line, index) => {
    c.fillText(line, pad, blockTop + index * lineHeight, W - pad * 2)
  })
  c.letterSpacing = '0px'

  // The tape: the message in Morse, ending in STOP as a telegram does.
  const tapeX = frame + 16
  const tapeW = W - tapeX * 2
  c.fillStyle = colors.tape
  c.fillRect(tapeX, tape.y, tapeW, tape.h)
  c.strokeStyle = colors.muted
  c.globalAlpha = 0.35
  c.strokeRect(tapeX + 0.5, tape.y + 0.5, tapeW - 1, tape.h - 1)
  c.fillStyle = colors.muted
  for (let x = tapeX + 10; x < tapeX + tapeW - 4; x += 14) {
    c.beginPath()
    c.arc(x, tape.y + 10, 2.4, 0, Math.PI * 2)
    c.fill()
  }
  c.globalAlpha = 1
  c.fillStyle = colors.ink
  c.font = `400 28px ${MONO}`
  c.letterSpacing = '3px'
  const morse = `${prettify(encode(clean))}   STOP`
  c.save()
  c.beginPath()
  c.rect(tapeX + 16, tape.y, tapeW - 32, tape.h)
  c.clip()
  c.fillText(morse, tapeX + 20, tape.y + 50)
  c.restore()
  c.letterSpacing = '0px'

  // Where it came from.
  c.textAlign = 'right'
  c.fillStyle = colors.code
  c.font = `400 24px ${MONO}`
  c.fillText(telegraphUrl(siteUrl).replace(/^https?:\/\//, ''), W - pad, H - frame - 26)
  c.textAlign = 'left'
}

/** Render to a PNG blob. */
export function telegramBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
