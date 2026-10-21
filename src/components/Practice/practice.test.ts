import { describe, expect, it } from 'vitest'
import { distinctPools, feedbackSpeech, receiveLabel, signalNote } from './practice'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { spokenCode } from '../../engine/spokenCode'

describe('feedbackSpeech', () => {
  it('names a right answer', () => {
    expect(feedbackSpeech({ correct: true, expected: 'T', given: 'T' })).toBe('T, correct.')
  })

  it('says what a missed character was, and how it sounds, in words', () => {
    const text = feedbackSpeech({ correct: false, expected: 'E', given: 'Q' })
    expect(text).toBe(`You said Q. It was E, ${spokenCode(MORSE_ALPHABET.E!)}.`)
    expect(text).toContain('It was E')
    expect(text).toContain('dot')
  })

  it('never reads a display glyph or a raw code mark', () => {
    for (const expected of ['E', 'T', 'Q', '5']) {
      const text = feedbackSpeech({ correct: false, expected, given: 'X' })
      expect(text).not.toMatch(/[·−.-]{2}|[·−]/)
    }
  })

  it('still tells the answer when nothing was given', () => {
    expect(feedbackSpeech({ correct: false, expected: 'A', given: '' })).toMatch(
      /^Missed\. It was A, /,
    )
  })
})

describe('distinctPools', () => {
  const fixed = [
    { id: 'a', label: 'E T', characters: ['E', 'T'] },
    { id: 'b', label: 'First 6', characters: ['E', 'T', 'I', 'A', 'N', 'M'] },
  ]

  it('drops a fixed pool that holds exactly the method’s characters, in any order', () => {
    expect(distinctPools(fixed, ['T', 'E']).map((pool) => pool.id)).toEqual(['b'])
  })

  it('keeps every pool that differs', () => {
    expect(distinctPools(fixed, ['E', 'T', 'I']).map((pool) => pool.id)).toEqual(['a', 'b'])
  })
})

describe('signal copy', () => {
  it('watches a lamp and listens to a tone', () => {
    expect(receiveLabel('lamp')).toBe('RX · watch')
    expect(receiveLabel('sound')).toBe('RX · listen')
    expect(receiveLabel('both')).toBe('RX · listen')
  })

  it('says nothing for the plain tone, and what the mode does otherwise', () => {
    expect(signalNote('sound', 'character')).toBeNull()
    expect(signalNote('lamp', 'character')).toBe(
      'Signal is set to Lamp: each character flashes instead of sounding.',
    )
    expect(signalNote('both', 'character')).toContain('sounds and flashes')
  })
})
