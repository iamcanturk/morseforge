import { describe, expect, it } from 'vitest'
import { CARD, type CardData, cardStats, columnCentres, headline, taunt } from './resultCard'

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

  it('drops speed when there is not enough of it to report', () => {
    expect(cardStats(card({ wpm: 0.4 })).map((s) => s.label)).not.toContain('SPEED')
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
    expect(cardStats(card({ accuracy: 0.8666, wpm: 13.7 }))[0]!.value).toBe('87%')
    expect(cardStats(card({ wpm: 13.7 })).find((s) => s.label === 'SPEED')!.value).toBe('14 WPM')
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

describe('headline and taunt', () => {
  it('names the challenge when it was one', () => {
    expect(headline(card({ challenge: true }))).toContain('CHALLENGE')
    expect(headline(card({ challenge: false }))).not.toContain('CHALLENGE')
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
