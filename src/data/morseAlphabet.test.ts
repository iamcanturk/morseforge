import { describe, expect, it } from 'vitest'
import {
  ALL_LETTERS,
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
