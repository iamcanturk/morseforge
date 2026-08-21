import { describe, expect, it } from 'vitest'
import {
  WORDS,
  WORD_CATEGORIES,
  breakdown,
  findWord,
  morseFor,
  wordsByCategory,
  type WordCategory,
} from './words'
import { decode } from '../engine/morseDecoder'
import { isEncodable } from './morseAlphabet'

describe('WORDS', () => {
  it('has a unique slug per entry', () => {
    const slugs = WORDS.map((word) => word.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it('uses URL-safe slugs', () => {
    for (const word of WORDS) {
      expect(word.slug, word.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    }
  })

  it('has no duplicate text', () => {
    const texts = WORDS.map((word) => word.text)
    expect(new Set(texts).size).toBe(texts.length)
  })

  it('can encode every entry', () => {
    for (const word of WORDS) {
      for (const character of word.text) {
        expect(isEncodable(character), `${word.text} contains "${character}"`).toBe(true)
      }
      expect(morseFor(word), word.text).not.toBe('')
    }
  })

  it('round-trips every entry through encode and decode', () => {
    // A word page that printed Morse which decodes back to something else
    // would be worse than having no page at all.
    for (const word of WORDS) {
      expect(decode(morseFor(word)), word.text).toBe(word.text)
    }
  })

  it('is uppercase, since Morse has no case', () => {
    for (const word of WORDS) {
      expect(word.text).toBe(word.text.toUpperCase())
    }
  })

  it('gives every entry a note substantial enough not to be thin content', () => {
    // A page that is only "SOS = ... --- ..." ranks for nothing and gets cited
    // by nobody. The note is the reason the page exists.
    for (const word of WORDS) {
      const words = word.note.trim().split(/\s+/).length
      expect(words, `${word.slug} note is ${words} words`).toBeGreaterThanOrEqual(30)
    }
  })

  it('never hand-writes an element count in a note', () => {
    // Five of the six counts written by hand in the first draft of this file
    // were wrong. Element counts are derived and rendered by the page, so a
    // note that states one is guaranteed to drift and cannot be checked by
    // reading it. Banning them outright is the only fix that holds.
    const claim =
      /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|\d+)[- ]?(?:\w+[- ])?elements?\b/i
    for (const word of WORDS) {
      const match = word.note.match(claim)
      expect(
        match?.[0],
        `${word.slug} states "${match?.[0]}" — let the page compute it`,
      ).toBeUndefined()
    }
  })

  it('assigns every entry a known category', () => {
    for (const word of WORDS) {
      expect(WORD_CATEGORIES[word.category], word.slug).toBeDefined()
    }
  })

  it('leaves no category empty, or the index page renders a blank section', () => {
    for (const category of Object.keys(WORD_CATEGORIES) as WordCategory[]) {
      expect(wordsByCategory(category).length, category).toBeGreaterThan(0)
    }
  })
})

describe('findWord', () => {
  it('finds by slug and returns undefined otherwise', () => {
    expect(findWord('sos')?.text).toBe('SOS')
    expect(findWord('not-a-word')).toBeUndefined()
  })
})

describe('morseFor', () => {
  it('derives from the alphabet rather than storing a copy', () => {
    expect(morseFor(findWord('sos')!)).toBe('... --- ...')
  })

  it('separates words with a slash', () => {
    expect(morseFor(findWord('i-love-you')!)).toContain('/')
  })
})

describe('breakdown', () => {
  it('lists one row per character, skipping spaces', () => {
    const rows = breakdown(findWord('i-love-you')!)
    expect(rows.map((row) => row.character).join('')).toBe('ILOVEYOU')
    expect(rows[0]).toEqual({ character: 'I', code: '..' })
  })

  it('reassembles into the full code', () => {
    const word = findWord('sos')!
    expect(
      breakdown(word)
        .map((row) => row.code)
        .join(' '),
    ).toBe(morseFor(word))
  })
})
