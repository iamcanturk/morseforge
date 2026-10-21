import { describe, expect, it } from 'vitest'
import {
  ALL_LETTERS,
  DIGITS,
  ITU_PUNCTUATION,
  NON_ITU_PUNCTUATION,
  PUNCTUATION,
  PUNCTUATION_NAMES,
  PROSIGN_MEANINGS,
  CODE_TO_CHARACTER,
  LEARNING_ORDER,
  LEARNING_STAGES,
  LETTERS,
  MORSE_ALPHABET,
  PROSIGNS,
  codeLength,
  isEncodable,
} from './morseAlphabet'

describe('MORSE_ALPHABET', () => {
  it('covers all 26 English letters', () => {
    expect(ALL_LETTERS).toHaveLength(26)
    expect(ALL_LETTERS.join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  })

  it('uses only dots and dashes', () => {
    for (const [character, code] of Object.entries(MORSE_ALPHABET)) {
      expect(code, `${character} has a non-dot/dash element`).toMatch(/^[.-]+$/)
    }
  })

  it('assigns every character a unique code', () => {
    // CODE_TO_CHARACTER is built by collapsing this object into a Map — a
    // duplicate here would silently drop a character from every decode.
    const codes = Object.values(MORSE_ALPHABET)
    expect(CODE_TO_CHARACTER.size).toBe(codes.length)
  })

  it('matches ITU-R M.1677-1 for a spot-check of every code length', () => {
    expect(LETTERS.E).toBe('.')
    expect(LETTERS.T).toBe('-')
    expect(LETTERS.A).toBe('.-')
    expect(LETTERS.M).toBe('--')
    expect(LETTERS.S).toBe('...')
    expect(LETTERS.O).toBe('---')
    expect(LETTERS.H).toBe('....')
    expect(LETTERS.Q).toBe('--.-')
    expect(MORSE_ALPHABET['0']).toBe('-----')
    expect(MORSE_ALPHABET['5']).toBe('.....')
    expect(MORSE_ALPHABET['?']).toBe('..--..')
  })

  it('round-trips every character through the reverse map', () => {
    for (const [character, code] of Object.entries(MORSE_ALPHABET)) {
      expect(CODE_TO_CHARACTER.get(code)).toBe(character)
    }
  })
})

describe('PROSIGNS', () => {
  it('adds the ITU starting signal, which is not a letter', () => {
    // The SOS post quotes it; it has to exist in the data to be checkable.
    expect(PROSIGNS.CT).toBe(LETTERS.K + LETTERS.A)
    expect(CODE_TO_CHARACTER.get(PROSIGNS.CT)).toBeUndefined()
  })

  it('explains every prosign, and only the prosigns', () => {
    expect(Object.keys(PROSIGN_MEANINGS).sort()).toEqual(Object.keys(PROSIGNS).sort())
    for (const [name, meaning] of Object.entries(PROSIGN_MEANINGS)) {
      expect(meaning.length, name).toBeGreaterThan(3)
    }
  })

  it('keeps SOS out of the main alphabet so S-O-S still decodes to SOS', () => {
    // If '...---...' were in MORSE_ALPHABET, the reverse map would let a
    // correctly-spaced "... --- ..." decode inconsistently.
    expect(Object.values(MORSE_ALPHABET)).not.toContain(PROSIGNS.SOS)
    expect(CODE_TO_CHARACTER.get(PROSIGNS.SOS)).toBeUndefined()
  })
})

describe('learning order', () => {
  it('teaches all 26 letters exactly once', () => {
    expect(LEARNING_ORDER).toHaveLength(26)
    expect(new Set(LEARNING_ORDER).size).toBe(26)
    expect([...LEARNING_ORDER].sort().join('')).toBe('ABCDEFGHIJKLMNOPQRSTUVWXYZ')
  })

  it('opens with E and T, the two single-element characters', () => {
    expect(LEARNING_STAGES[0]).toEqual(['E', 'T'])
  })

  it('never shortens: each stage is at least as deep as the last', () => {
    // The Signal Tree lights up a full ring per stage, which only reads as
    // "descending the tree" if stages never step back up.
    const stageDepths = LEARNING_STAGES.map((stage) =>
      Math.min(...stage.map((character) => codeLength(character))),
    )
    for (let i = 1; i < stageDepths.length; i++) {
      expect(stageDepths[i]!).toBeGreaterThanOrEqual(stageDepths[i - 1]!)
    }
  })
})

describe('helpers', () => {
  it('reports code length, and 0 for unknown characters', () => {
    expect(codeLength('E')).toBe(1)
    expect(codeLength('q')).toBe(4)
    expect(codeLength('€')).toBe(0)
  })

  it('treats space as encodable but emoji as not', () => {
    expect(isEncodable(' ')).toBe(true)
    expect(isEncodable('a')).toBe(true)
    expect(isEncodable('🚀')).toBe(false)
  })
})

describe('punctuation groups (DEC-012)', () => {
  it('splits the marks into the 13 in ITU-R M.1677-1 and the 5 that are not', () => {
    expect(Object.keys(ITU_PUNCTUATION)).toHaveLength(13)
    expect(Object.keys(NON_ITU_PUNCTUATION).join('')).toBe('!&;_$')
  })

  it('keeps PUNCTUATION as the union, so encode and decode are unchanged', () => {
    expect(Object.keys(PUNCTUATION)).toHaveLength(18)
    expect({ ...ITU_PUNCTUATION, ...NON_ITU_PUNCTUATION }).toEqual(PUNCTUATION)
    for (const mark of Object.keys(NON_ITU_PUNCTUATION)) {
      expect(mark in ITU_PUNCTUATION, mark).toBe(false)
    }
  })

  it('names every mark, so a heading or slug never has to say "?"', () => {
    expect(Object.keys(PUNCTUATION_NAMES).sort()).toEqual(Object.keys(PUNCTUATION).sort())
    expect(new Set(Object.values(PUNCTUATION_NAMES)).size).toBe(18)
  })
})

/**
 * Claims made in prose on the public pages, asserted here so they cannot
 * quietly become false. Every one of these sentences appears on
 * /morse-code-alphabet/ or /morse-code-translator/, and a wrong factual claim
 * on a page whose whole pitch is accuracy is worse than no page.
 */
describe('claims made on the public pages', () => {
  it('every letter is between one and four elements', () => {
    for (const [character, code] of Object.entries(LETTERS)) {
      expect(code.length, character).toBeGreaterThanOrEqual(1)
      expect(code.length, character).toBeLessThanOrEqual(4)
    }
  })

  it('every digit is exactly five elements', () => {
    for (const [character, code] of Object.entries(DIGITS)) {
      expect(code.length, character).toBe(5)
    }
  })

  it('punctuation runs from five to seven elements', () => {
    const lengths = Object.values(PUNCTUATION).map((code) => code.length)
    expect(Math.min(...lengths)).toBe(5)
    expect(Math.max(...lengths)).toBe(7)
  })

  it('ITU punctuation runs from five to six elements', () => {
    // The seven-element mark is the dollar sign, which is not in the standard.
    // A page that quotes the ITU range must not borrow it.
    const lengths = Object.values(ITU_PUNCTUATION).map((code) => code.length)
    expect(Math.min(...lengths)).toBe(5)
    expect(Math.max(...lengths)).toBe(6)
    expect(NON_ITU_PUNCTUATION.$.length).toBe(7)
  })

  it('H is the only letter made of four dots, and no letter is four dashes', () => {
    const fourDots = Object.entries(LETTERS).filter(([, code]) => code === '....')
    expect(fourDots.map(([character]) => character)).toEqual(['H'])
    for (const [character, code] of Object.entries(LETTERS)) {
      expect(code, character).not.toBe('----')
    }
  })

  it('twelve letters are four elements long, and they are the last tree layer', () => {
    const four = Object.entries(LETTERS)
      .filter(([, code]) => code.length === 4)
      .map(([character]) => character)
    expect(four.join('')).toBe('BCFHJLPQVXYZ')
  })

  it('the digits follow the dots-in-then-out rule', () => {
    // "1 is one dot then four dashes, 2 is two dots then three dashes, until 5
    // is five dots, then back out to 0 which is five dashes."
    for (let n = 1; n <= 5; n++) {
      expect(DIGITS[String(n) as keyof typeof DIGITS]).toBe('.'.repeat(n) + '-'.repeat(5 - n))
    }
    for (let n = 6; n <= 9; n++) {
      expect(DIGITS[String(n) as keyof typeof DIGITS]).toBe('-'.repeat(n - 5) + '.'.repeat(10 - n))
    }
    expect(DIGITS['0']).toBe('-----')
  })

  it('E and T are the only single-element characters', () => {
    const single = Object.entries(LETTERS).filter(([, code]) => code.length === 1)
    expect(single.map(([character]) => character).sort()).toEqual(['E', 'T'])
  })
})
