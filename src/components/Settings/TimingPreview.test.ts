import { describe, expect, it } from 'vitest'
import { REFERENCE_WORD, stripLayout } from './TimingPreview'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { PARIS_UNITS, dotDuration } from '../../engine/timingEngine'

const toneCount = [...REFERENCE_WORD].reduce(
  (sum, letter) => sum + (MORSE_ALPHABET[letter]?.length ?? 0),
  0,
)

describe('stripLayout', () => {
  it('lasts exactly one standard word at standard timing', () => {
    const { wordMs } = stripLayout(REFERENCE_WORD, { wpm: 20 })
    expect(wordMs).toBeCloseTo(PARIS_UNITS * dotDuration(20))
    expect(wordMs).toBeCloseTo(60_000 / 20)
  })

  it('lasts one word at the effective speed under Farnsworth', () => {
    const { wordMs } = stripLayout(REFERENCE_WORD, { wpm: 18, farnsworthWpm: 5 })
    expect(wordMs).toBeCloseTo(60_000 / 5)
  })

  it('draws one bar per element, in order and inside the strip', () => {
    const { tones, letters } = stripLayout(REFERENCE_WORD, { wpm: 15, farnsworthWpm: 8 })
    expect(tones).toHaveLength(toneCount)
    expect(letters.map((entry) => entry.letter).join('')).toBe(REFERENCE_WORD)
    for (const [index, tone] of tones.entries()) {
      expect(tone.x).toBeGreaterThanOrEqual(0)
      expect(tone.x + tone.width).toBeLessThanOrEqual(1)
      if (index > 0) expect(tone.x).toBeGreaterThan(tones[index - 1]!.x)
    }
  })

  it('keeps letters the same length when only the spacing changes', () => {
    const fast = stripLayout(REFERENCE_WORD, { wpm: 15 })
    const spaced = stripLayout(REFERENCE_WORD, { wpm: 15, farnsworthWpm: 8 })
    const firstDot = (layout: typeof fast) => layout.tones[0]!.width * layout.wordMs
    expect(firstDot(spaced)).toBeCloseTo(firstDot(fast))
    expect(spaced.wordMs).toBeGreaterThan(fast.wordMs)
  })
})
