/**
 * The shareable result card (PROJECT.md §35, §39.2).
 *
 * Drawn on a canvas rather than screenshotted, so it looks the same on every
 * device and carries the URL. That URL is the entire point: the card is the
 * growth loop, and a beautiful image with no way back to the site is a poster
 * for nothing.
 *
 * Kept apart from React because it is plain 2D drawing, and because the layout
 * maths — which is the part that can be wrong — is then testable.
 */

export interface CardData {
  accuracy: number
  correct: number
  total: number
  wpm: number
  streak: number
  mastered: number
  challenge: boolean
}

export const CARD = {
  width: 1200,
  height: 630,
  pad: 72,
  colors: {
    bg: '#080B10',
    panel: '#10151D',
    line: '#202A38',
    signal: '#00E88F',
    dim: '#00A868',
    cyan: '#22D3EE',
    ink: '#E6EDF3',
    muted: '#8B98A5',
  },
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
 * than shown as "0" — a card advertising a zero-day streak is worse than one
 * with three stats on it.
 */
export function cardStats(data: CardData): Stat[] {
  const stats: Stat[] = [
    { label: 'ACCURACY', value: `${Math.round(data.accuracy * 100)}%` },
    { label: 'DECODED', value: `${data.correct}` },
  ]

  if (data.wpm >= 1) stats.push({ label: 'SPEED', value: `${Math.round(data.wpm)} WPM` })
  if (data.streak > 0) stats.push({ label: 'STREAK', value: `${data.streak} DAY` })
  if (data.mastered > 0) stats.push({ label: 'MASTERED', value: `${data.mastered}/26` })

  // Four is what fits across the card without the columns becoming cramped.
  return stats.slice(0, 4)
}

/** Evenly spaced column centres for `count` stats across the card. */
export function columnCentres(count: number): number[] {
  if (count <= 0) return []
  const usable = CARD.width - CARD.pad * 2
  const step = usable / count
  return Array.from({ length: count }, (_, i) => CARD.pad + step * (i + 0.5))
}

export function headline(data: CardData): string {
  return data.challenge ? '60 SECOND CHALLENGE' : 'MORSE PRACTICE'
}

/** The line under the stats. Present tense, no boasting the numbers deny. */
export function taunt(data: CardData): string {
  if (data.total === 0) return 'Can you decode Morse code?'
  if (data.accuracy >= 0.9 && data.correct >= 20) return 'CAN YOU BEAT ME?'
  return 'CAN YOU DECODE THIS?'
}

/** Draw the card. Returns the canvas so the caller can export it. */
export function drawCard(canvas: HTMLCanvasElement, data: CardData, siteUrl: string): void {
  const c = canvas.getContext('2d')
  if (!c) return

  canvas.width = CARD.width
  canvas.height = CARD.height
  const { colors, pad } = CARD

  c.fillStyle = colors.bg
  c.fillRect(0, 0, CARD.width, CARD.height)

  // A faint grid, for the circuit-board feel of the rest of the product.
  c.strokeStyle = colors.line
  c.lineWidth = 1
  c.globalAlpha = 0.35
  for (let x = 0; x <= CARD.width; x += 40) {
    c.beginPath()
    c.moveTo(x, 0)
    c.lineTo(x, CARD.height)
    c.stroke()
  }
  for (let y = 0; y <= CARD.height; y += 40) {
    c.beginPath()
    c.moveTo(0, y)
    c.lineTo(CARD.width, y)
    c.stroke()
  }
  c.globalAlpha = 1

  // The mark: the letter M as its Morse form, matching the favicon.
  const barY = pad + 6
  c.fillStyle = colors.signal
  c.beginPath()
  c.roundRect(pad, barY, 84, 18, 9)
  c.fill()
  c.fillStyle = colors.dim
  c.beginPath()
  c.roundRect(pad, barY + 28, 60, 18, 9)
  c.fill()

  c.fillStyle = colors.ink
  c.font = 'bold 34px system-ui, sans-serif'
  c.textBaseline = 'top'
  c.fillText('MORSEFORGE', pad + 108, barY + 4)

  c.fillStyle = colors.muted
  c.font = '22px ui-monospace, monospace'
  c.fillText(headline(data), pad + 108, barY + 44)

  // Stats.
  const stats = cardStats(data)
  const centres = columnCentres(stats.length)
  const statsY = 250

  c.textAlign = 'center'
  stats.forEach((stat, index) => {
    const x = centres[index]!
    c.fillStyle = colors.signal
    c.font = 'bold 78px system-ui, sans-serif'
    c.fillText(stat.value, x, statsY)

    c.fillStyle = colors.muted
    c.font = '20px ui-monospace, monospace'
    c.fillText(stat.label, x, statsY + 96)
  })

  // Divider.
  c.strokeStyle = colors.line
  c.lineWidth = 2
  c.beginPath()
  c.moveTo(pad, 452)
  c.lineTo(CARD.width - pad, 452)
  c.stroke()

  c.fillStyle = colors.ink
  c.font = 'bold 40px system-ui, sans-serif'
  c.fillText(taunt(data), CARD.width / 2, 490)

  // The URL. This is the reason the card exists.
  c.fillStyle = colors.cyan
  c.font = '26px ui-monospace, monospace'
  c.fillText(siteUrl.replace(/^https?:\/\//, ''), CARD.width / 2, 556)

  c.textAlign = 'left'
}

/** Render to a PNG blob. */
export async function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/png'))
}
