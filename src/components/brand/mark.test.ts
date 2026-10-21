import { describe, expect, it } from 'vitest'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { SITE } from '../../config/site'
import {
  MARK,
  MARK_CODE,
  MARK_HEIGHT,
  MARK_LETTER,
  MARK_SMALL,
  MARK_WIDTH,
  type MarkGeometry,
  WORDMARK,
  WORDMARK_TEXT,
  codeUnits,
  horizontalLockup,
  lockupSvg,
  markFor,
  markSvg,
  signalTrace,
  splitM,
  stackedLockup,
  timing,
} from './mark'
import { WORDMARK_OUTLINE } from './wordmarkOutline'

/**
 * The mark claims to be a letter keyed in Morse. These tests are what make
 * that claim true: the drawn strokes are read back into elements and gaps and
 * compared with MORSE_ALPHABET, so a "tidier" redraw that closes the gap or
 * shortens a stroke fails.
 */

/** Read a trace path back into on/off runs, in units. */
function decodeTrace(d: string, unit: number, top: number): string {
  const commands = [...d.matchAll(/([MHV])(-?[\d.]+)(?: (-?[\d.]+))?/g)]
  let x = 0
  let y = 0
  let code = ''
  for (const [, command, a, b] of commands) {
    const value = Number(a)
    if (command === 'M') {
      x = value
      y = Number(b)
    } else if (command === 'V') {
      y = value
    } else if (command === 'H') {
      const units = Math.round((value - x) / unit)
      // Only runs along the pulse tops are tone; the rest is baseline.
      if (y === top) code += units === 1 ? '.' : units === 3 ? '-' : '?'
      x = value
    }
  }
  return code
}

describe('timing', () => {
  it('follows ITU proportions: dit 1, dah 3, gap 1', () => {
    expect(timing('.-')).toEqual([
      { on: true, units: 1 },
      { on: false, units: 1 },
      { on: true, units: 3 },
    ])
    expect(codeUnits('--')).toBe(7)
    // F: dit, gap, dit, gap, dah, gap, dit.
    expect(codeUnits('..-.')).toBe(9)
  })

  it('refuses anything that is not a dot or a dash', () => {
    expect(() => timing('.x')).toThrow()
  })
})

describe('signalTrace', () => {
  const box = { from: 0, to: 100, centre: 50, unit: 5, base: 40, top: 10 }

  it.each(['E', 'T', 'A', 'S', 'O', 'F', 'Q'])('%s decodes back to its own code', (letter) => {
    const code = MORSE_ALPHABET[letter]!
    expect(decodeTrace(signalTrace(code, box), box.unit, box.top)).toBe(code)
  })

  it('centres the keyed part', () => {
    // M is 7 units: 17.5 either side of the centre.
    expect(signalTrace('--', box)).toBe('M0 40 H32.5 V10 H47.5 V40 H52.5 V10 H67.5 V40 H100')
  })
})

/** The vertices of one open stroke path (M x y V y L x y …). */
function vertices(d: string): [number, number][] {
  const points: [number, number][] = []
  for (const [, command, a, b] of d.matchAll(/([MLHV])(-?[\d.]+)(?: (-?[\d.]+))?/g)) {
    const last = points.at(-1) ?? [0, 0]
    if (command === 'M' || command === 'L') points.push([Number(a), Number(b)])
    else if (command === 'H') points.push([Number(a), last[1]])
    else points.push([last[0], Number(a)])
  }
  return points
}

const length = (points: [number, number][]) =>
  points.slice(1).reduce((t, [x, y], i) => t + Math.hypot(x - points[i]![0], y - points[i]![1]), 0)

/**
 * Read the drawn mark back into Morse, with the stroke width as the unit. A
 * stroke whose centre line has no length is a round dot: a dit. One that is at
 * least three units of ink long (centre line plus the two half-width caps) is
 * a dah. Between two strokes, the gap from cap edge to cap edge must be one
 * unit, or the letter is not keyed as one character.
 */
function decodeMark(geometry: MarkGeometry): string {
  const unit = geometry.strokeWidth
  let code = ''
  for (const [i, stroke] of geometry.strokes.entries()) {
    const ink = length(vertices(stroke)) + unit
    code += ink < unit * 1.01 ? '.' : ink >= unit * 3 ? '-' : '?'
    if (i > 0) {
      const [ax, ay] = geometry.ends[i - 1]!
      const [bx, by] = geometry.ends[i]!
      const gap = Math.hypot(bx - ax, by - ay) - unit
      if (Math.abs(gap - unit) > 0.01) code += '!'
    }
  }
  return code
}

describe('the Split M', () => {
  it('keys M, read from MORSE_ALPHABET', () => {
    expect(MARK_LETTER).toBe('M')
    expect(MARK_CODE).toBe(MORSE_ALPHABET.M)
  })

  it.each([
    ['regular', MARK],
    ['small', MARK_SMALL],
  ])('the %s mark decodes back to the code', (_, geometry) => {
    expect(decodeMark(geometry)).toBe(MARK_CODE)
  })

  it('the stroke ends in the geometry are the ends of the drawn strokes', () => {
    for (const geometry of [MARK, MARK_SMALL]) {
      geometry.strokes.forEach((stroke, i) => {
        expect(vertices(stroke).at(-1)).toEqual(geometry.ends[i])
      })
    }
  })

  it('keeps every stroke, caps included, inside its 84 × 64 box', () => {
    for (const geometry of [MARK, MARK_SMALL]) {
      const half = geometry.strokeWidth / 2
      for (const [x, y] of geometry.strokes.flatMap(vertices)) {
        expect(x - half).toBeGreaterThanOrEqual(0)
        expect(x + half).toBeLessThanOrEqual(MARK_WIDTH)
        expect(y - half).toBeGreaterThanOrEqual(0)
        expect(y + half).toBeLessThanOrEqual(MARK_HEIGHT)
      }
    }
  })

  it('is symmetric', () => {
    const [left, right] = MARK.strokes.map(vertices)
    left!.forEach(([x, y], i) => {
      expect(right![i]![0]).toBeCloseTo(MARK_WIDTH - x, 3)
      expect(right![i]![1]).toBeCloseTo(y, 3)
    })
  })

  it('refuses a letter that is not two dahs', () => {
    expect(() => splitM(MORSE_ALPHABET.A!, 13, 48)).toThrow()
    expect(() => splitM(MORSE_ALPHABET.O!, 13, 48)).toThrow()
  })

  it('uses the heavier strokes below 20 px', () => {
    expect(markFor(16)).toBe(MARK_SMALL)
    expect(markFor(20)).toBe(MARK)
    expect(MARK_SMALL.strokeWidth).toBeGreaterThan(MARK.strokeWidth)
  })
})

describe('the wordmark', () => {
  it('is SITE.name, traced', () => {
    expect(WORDMARK_TEXT).toBe(SITE.name)
    expect(WORDMARK.text).toBe(SITE.name)
    expect(WORDMARK_OUTLINE.text).toBe(SITE.name)
    expect(WORDMARK.d.length).toBeGreaterThan(1000)
  })

  it('has the proportions of the word, not of a placeholder', () => {
    expect(WORDMARK.capHeight).toBe(700)
    expect(WORDMARK.width / WORDMARK.capHeight).toBeGreaterThan(6)
    expect(WORDMARK.width / WORDMARK.capHeight).toBeLessThan(10)
    // The g descends below the baseline.
    expect(WORDMARK.bottom).toBeGreaterThan(WORDMARK.capHeight)
  })
})

describe('lockups', () => {
  it('centres the wordmark on the mark in the horizontal lockup', () => {
    for (const compact of [false, true]) {
      const l = horizontalLockup(40, compact)
      expect(l.word.y + l.word.cap / 2).toBeCloseTo(l.mark.height / 2, 6)
      expect(l.word.x).toBeGreaterThan(l.mark.width)
      expect(l.width).toBeCloseTo(l.word.x + l.word.width, 6)
    }
  })

  it('gives the compact (header) lockup the larger wordmark', () => {
    expect(horizontalLockup(20, true).word.cap).toBeGreaterThan(horizontalLockup(20).word.cap)
  })

  it('centres both parts of the stacked lockup', () => {
    const l = stackedLockup(80)
    expect(l.mark.x + l.mark.width / 2).toBeCloseTo(l.width / 2, 6)
    expect(l.word.x + l.word.width / 2).toBeCloseTo(l.width / 2, 6)
    expect(l.word.y).toBeGreaterThan(l.mark.height)
  })
})

describe('standalone SVG', () => {
  it('draws the favicon with the small strokes and the given colour', () => {
    const svg = markSvg({ size: 16, colour: '#123456' })
    expect(svg).toContain(`stroke-width="${MARK_SMALL.strokeWidth}"`)
    expect(svg).toContain('stroke="#123456"')
    expect(svg).toContain('stroke-linecap="round"')
    expect(svg).toContain(`<title>${SITE.name}</title>`)
  })

  it('draws a mono lockup entirely in the one ink', () => {
    const svg = lockupSvg({ theme: 'mono', ink: '#000000' })
    expect(svg).toContain('stroke="#000000"')
    expect(svg).toContain('fill="#000000"')
    expect(svg).toContain(WORDMARK.d.slice(0, 40))
  })
})

describe('timing of the mark against codeUnits', () => {
  it('M is seven units: two dahs and the gap the mark draws', () => {
    expect(codeUnits(MARK_CODE)).toBe(7)
    expect(timing(MARK_CODE).filter((s) => s.on)).toHaveLength(MARK.strokes.length)
  })
})
