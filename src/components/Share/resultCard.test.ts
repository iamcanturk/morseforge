import { describe, expect, it } from 'vitest'
import {
  CARD,
  type CardData,
  cardDescription,
  cardFields,
  cardStats,
  cardUrl,
  columnCentres,
  headline,
  referenceLine,
  stampLines,
  tapeLine,
  taunt,
} from './resultCard'
import { ALL_LETTERS, CODE_TO_CHARACTER } from '../../data/morseAlphabet'
import { DEFAULT_CHALLENGE } from '../../game/challengeLink'
import { LIGHT, SCREEN, contrast } from '../../styles/palette'

const card = (patch: Partial<CardData> = {}): CardData => ({
  accuracy: 0.9,
  correct: 24,
  total: 27,
  wpm: 14,
  streak: 3,
  mastered: 8,
  challenge: true,
  ...patch,
})

describe('cardStats', () => {
  it('leads with accuracy', () => {
    // §34 puts accuracy above speed, and a card that opens with a speed number
    // teaches the opposite of what the scoring is trying to.
    expect(cardStats(card())[0]!.label).toBe('ACCURACY')
  })

  it('drops a zero streak rather than advertising it', () => {
    const labels = cardStats(card({ streak: 0 })).map((s) => s.label)
    expect(labels).not.toContain('STREAK')
  })

  it('says "1 DAY" and "3 DAYS", never "3 DAY"', () => {
    // Flow audit B6: the card printed "2 DAY".
    const streak = (n: number) => cardStats(card({ streak: n })).find((s) => s.label === 'STREAK')
    expect(streak(1)!.value).toBe('1 DAY')
    expect(streak(3)!.value).toBe('3 DAYS')
  })

  it('drops speed when there is not enough of it to report', () => {
    expect(cardStats(card({ wpm: 0.4 })).map((s) => s.label)).not.toContain('CHARS/MIN')
  })

  it('reports speed as characters per minute, never as WPM', () => {
    // DEC-006 / B9: the measured rate is answering speed, not words per minute.
    const stats = cardStats(card({ wpm: 13.7 }))
    expect(stats.map((s) => `${s.label} ${s.value}`).join(' ')).not.toMatch(/WPM/)
    expect(stats.find((s) => s.label === 'CHARS/MIN')!.value).toBe('69')
  })

  it('counts mastered letters out of the real alphabet, not a typed 26', () => {
    expect(cardStats(card({ streak: 0 })).find((s) => s.label === 'MASTERED')!.value).toBe(
      `8/${ALL_LETTERS.length}`,
    )
  })

  it('drops mastered when nothing is mastered yet', () => {
    expect(cardStats(card({ mastered: 0 })).map((s) => s.label)).not.toContain('MASTERED')
  })

  it('never shows more than four, which is what fits', () => {
    expect(cardStats(card()).length).toBeLessThanOrEqual(4)
  })

  it('always shows at least accuracy and a count, even for a blank run', () => {
    const stats = cardStats(
      card({ accuracy: 0, correct: 0, total: 0, wpm: 0, streak: 0, mastered: 0 }),
    )
    expect(stats.map((s) => s.label)).toEqual(['ACCURACY', 'DECODED'])
  })

  it('rounds rather than printing a float at people', () => {
    expect(cardStats(card({ accuracy: 0.8666 }))[0]!.value).toBe('87%')
  })
})

describe('cardFields', () => {
  it('puts the score first, then everything after accuracy', () => {
    const fields = cardFields(card({ score: 372 }))
    expect(fields[0]).toEqual({ label: 'SCORE', value: '372' })
    expect(fields.map((f) => f.label)).not.toContain('ACCURACY')
  })

  it('fits the right-hand column', () => {
    expect(cardFields(card({ score: 1 })).length).toBeLessThanOrEqual(4)
    // Four rows from the top must end above the tape.
    expect(CARD.fields.top + 3 * CARD.fields.step).toBeLessThan(CARD.tape.y)
  })
})

describe('columnCentres', () => {
  it('spaces columns evenly inside the padding', () => {
    const centres = columnCentres(4)
    expect(centres).toHaveLength(4)

    const gaps = centres.slice(1).map((x, i) => x - centres[i]!)
    for (const gap of gaps) expect(gap).toBeCloseTo(gaps[0]!, 6)
  })

  it('keeps every column on the card', () => {
    for (const count of [1, 2, 3, 4]) {
      for (const x of columnCentres(count)) {
        expect(x).toBeGreaterThan(CARD.pad)
        expect(x).toBeLessThan(CARD.width - CARD.pad)
      }
    }
  })

  it('centres a single column', () => {
    expect(columnCentres(1)[0]).toBeCloseTo(CARD.width / 2, 6)
  })

  it('handles zero without dividing by it', () => {
    expect(columnCentres(0)).toEqual([])
  })
})

describe('headline, stamp and taunt', () => {
  it('names the challenge when it was one, with its real length', () => {
    expect(headline(card({ challenge: true }))).toContain('CHALLENGE')
    expect(headline(card({ challenge: true }))).toContain(String(DEFAULT_CHALLENGE.time))
    expect(headline(card({ challenge: true, time: 120 }))).toContain('120')
    expect(headline(card({ challenge: false }))).not.toContain('CHALLENGE')
  })

  it('stamps a challenge card with the score to beat', () => {
    expect(stampLines(card({ score: 372 }))).toEqual([headline(card()), 'BEAT 372'])
    expect(stampLines(card({ challenge: false, score: 372 }))).toHaveLength(1)
    expect(stampLines(card({ score: 0, total: 0, correct: 0 }))).toHaveLength(1)
  })

  it('does not boast on a run that does not support it', () => {
    // "Can you beat me?" over three correct answers at 40% reads as a joke at
    // the sharer's expense.
    expect(taunt(card({ accuracy: 0.4, correct: 3 }))).not.toContain('BEAT')
    expect(taunt(card({ accuracy: 0.95, correct: 30 }))).toContain('BEAT')
  })

  it('asks a question rather than claiming a result when nothing was answered', () => {
    expect(taunt(card({ total: 0, correct: 0, accuracy: 0 }))).toBe('Can you decode Morse code?')
  })
})

describe('the words on the card', () => {
  it('numbers the telegram with the score, and dates it', () => {
    expect(referenceLine(card({ score: 372, date: '2026-10-21' }))).toBe(
      'No. 372  ·  24/27 DECODED  ·  2026-10-21',
    )
    expect(referenceLine(card())).toBe('24/27 DECODED')
  })

  it('spells the score in Morse on the tape, encoded rather than typed', () => {
    const line = tapeLine(card({ score: 372 }))
    const morse = line.split('   ')[0]!
    const decoded = morse
      .replaceAll('·', '.')
      .replaceAll('−', '-')
      .split(' ')
      .map((code) => CODE_TO_CHARACTER.get(code))
      .join('')
    expect(decoded).toBe('372')
    expect(line.endsWith(' STOP')).toBe(true)
  })

  it('describes itself with the real numbers for a screen reader', () => {
    const text = cardDescription(card({ score: 372 }))
    for (const fact of ['90%', '24 of 27', '372', 'challenge']) expect(text).toContain(fact)
  })

  it('prints the page that runs it, so the image alone leads back', () => {
    expect(cardUrl(card(), 'https://morse.example/')).toBe('morse.example/challenge')
    expect(cardUrl(card({ challenge: false }), 'https://morse.example')).toBe(
      'morse.example/practice',
    )
  })
})

describe('the card colours', () => {
  it('come from the palette and stay readable on the stock', () => {
    expect(CARD.colors.paper).toBe(LIGHT.paper)
    expect(contrast(CARD.colors.ink, CARD.colors.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(CARD.colors.muted, CARD.colors.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(CARD.colors.url, CARD.colors.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(CARD.colors.stamp, CARD.colors.paper)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(CARD.colors.ink, CARD.colors.tape)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(SCREEN.signal, CARD.colors.glass)).toBeGreaterThanOrEqual(4.5)
    expect(contrast(SCREEN.muted, CARD.colors.glass)).toBeGreaterThanOrEqual(4.5)
  })
})
