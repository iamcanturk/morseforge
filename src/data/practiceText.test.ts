import { describe, expect, it } from 'vitest'
import {
  COMMON_WORDS,
  ON_AIR_PHRASES,
  TEXT_KINDS,
  callsign,
  charactersIn,
  codeGroup,
  generateText,
  isAvailable,
  wordsFor,
} from './practiceText'
import { ALL_DIGITS, ALL_LETTERS, isEncodable } from './morseAlphabet'
import { decode } from '../engine/morseDecoder'
import { encode } from '../engine/morseEncoder'

/** Deterministic 0..1 source, so a failure is reproducible. */
function seeded(seed = 1) {
  let state = seed
  return () => {
    state = (state * 9301 + 49297) % 233280
    return state / 233280
  }
}

describe('word and phrase lists', () => {
  it('can encode every entry', () => {
    for (const text of [...COMMON_WORDS, ...ON_AIR_PHRASES]) {
      for (const character of text) {
        expect(isEncodable(character), `"${text}" contains "${character}"`).toBe(true)
      }
    }
  })

  it('round-trips every entry through the real engine', () => {
    for (const text of [...COMMON_WORDS, ...ON_AIR_PHRASES]) {
      expect(decode(encode(text)), text).toBe(text)
    }
  })

  it('is uppercase, since Morse has no case', () => {
    for (const text of [...COMMON_WORDS, ...ON_AIR_PHRASES]) {
      expect(text).toBe(text.toUpperCase())
    }
  })

  it('has no duplicates', () => {
    expect(new Set(COMMON_WORDS).size).toBe(COMMON_WORDS.length)
    expect(new Set(ON_AIR_PHRASES).size).toBe(ON_AIR_PHRASES.length)
  })
})

describe('codeGroup', () => {
  it('produces the requested length', () => {
    expect(codeGroup(5, { random: seeded() })).toHaveLength(5)
    expect(codeGroup(3, { random: seeded() })).toHaveLength(3)
  })

  it('only uses the alphabet it was given', () => {
    // Offering a character the learner has not been taught is the one thing a
    // generator must never do.
    const alphabet = ['E', 'T']
    for (let i = 0; i < 50; i++) {
      for (const character of codeGroup(5, { alphabet, random: seeded(i + 1) })) {
        expect(alphabet).toContain(character)
      }
    }
  })

  it('falls back to the full alphabet when given an empty one', () => {
    expect(codeGroup(5, { alphabet: [], random: seeded() })).toHaveLength(5)
  })
})

describe('callsign', () => {
  it('looks like a callsign: prefix, digit, one to three letters', () => {
    for (let i = 0; i < 40; i++) {
      const call = callsign({ random: seeded(i + 1) })
      expect(call, call).toMatch(/^[A-Z]{1,2}[0-9][A-Z]{1,3}$/)
    }
  })

  it('can always be sent', () => {
    for (let i = 0; i < 20; i++) {
      const call = callsign({ random: seeded(i + 1) })
      expect(decode(encode(call)), call).toBe(call)
    }
  })
})

describe('wordsFor', () => {
  it('keeps only words the learner can spell', () => {
    // Handing someone who knows six characters a word containing a seventh
    // teaches them the app is not tracking what it taught.
    const known = ['T', 'H', 'E']
    expect(wordsFor(known, COMMON_WORDS)).toEqual(['THE'])
  })

  it('allows spaces through', () => {
    expect(wordsFor(['C', 'Q'], ['CQ CQ'])).toEqual(['CQ CQ'])
  })

  it('returns nothing when nothing fits', () => {
    expect(wordsFor(['E'], COMMON_WORDS)).toEqual([])
  })
})

describe('generateText', () => {
  it('produces something for every kind on the full alphabet', () => {
    const full = [...ALL_LETTERS, ...ALL_DIGITS]
    for (const kind of TEXT_KINDS) {
      expect(generateText(kind, { alphabet: full, random: seeded() }), kind).toBeTruthy()
    }
  })

  it('returns null rather than inventing something it cannot spell', () => {
    // With two characters unlocked there is no real word to offer, and making
    // one up would be worse than admitting it.
    expect(generateText('words', { alphabet: ['E', 'T'], random: seeded() })).toBeNull()
    expect(generateText('phrases', { alphabet: ['E', 'T'], random: seeded() })).toBeNull()
    expect(generateText('callsigns', { alphabet: ['E', 'T'], random: seeded() })).toBeNull()
  })

  it('still produces code groups from a tiny alphabet', () => {
    // Groups are the one kind that always works, which is why they are the
    // fallback for a beginner.
    expect(generateText('groups', { alphabet: ['E', 'T'], random: seeded() })).toHaveLength(5)
  })

  it('never produces a character outside the alphabet', () => {
    const alphabet = ['E', 'T', 'A', 'N']
    for (let i = 0; i < 30; i++) {
      const text = generateText('groups', { alphabet, random: seeded(i + 1) })
      for (const character of text ?? '') expect(alphabet).toContain(character)
    }
  })
})

describe('isAvailable', () => {
  it('reports what a small alphabet can and cannot do', () => {
    expect(isAvailable('groups', ['E', 'T'])).toBe(true)
    expect(isAvailable('words', ['E', 'T'])).toBe(false)
  })

  it('reports everything available on the full alphabet', () => {
    const full = [...ALL_LETTERS, ...ALL_DIGITS]
    for (const kind of TEXT_KINDS) expect(isAvailable(kind, full), kind).toBe(true)
  })

  it('is stable across calls, so the UI does not flicker', () => {
    const alphabet = [...ALL_LETTERS]
    const first = TEXT_KINDS.map((k) => isAvailable(k, alphabet))
    const second = TEXT_KINDS.map((k) => isAvailable(k, alphabet))
    expect(second).toEqual(first)
  })
})

describe('charactersIn', () => {
  it('lists sendable characters and drops spaces', () => {
    expect(charactersIn('CQ CQ')).toEqual(['C', 'Q', 'C', 'Q'])
  })

  it('drops anything unsendable rather than recording a result against it', () => {
    expect(charactersIn('AB🚀')).toEqual(['A', 'B'])
  })
})
