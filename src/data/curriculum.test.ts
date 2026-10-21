import { describe, expect, it } from 'vitest'
import {
  CURRICULUM,
  CURRICULUM_CHARACTER_COUNT,
  CURRICULUM_TOTAL_MINUTES,
  charactersThroughDay,
  codeFor,
} from './curriculum'
import { ALL_LETTERS, MORSE_ALPHABET, codeLength } from './morseAlphabet'
import { encode } from '../engine/morseEncoder'

describe('CURRICULUM', () => {
  it('runs for exactly seven days, numbered 1 to 7', () => {
    expect(CURRICULUM).toHaveLength(7)
    expect(CURRICULUM.map((day) => day.day)).toEqual([1, 2, 3, 4, 5, 6, 7])
  })

  it('teaches all 26 letters plus 10 digits, none of them twice', () => {
    const taught = CURRICULUM.flatMap((day) => [...day.characters])
    expect(taught).toHaveLength(36)
    expect(new Set(taught).size).toBe(36)
    expect(CURRICULUM_CHARACTER_COUNT).toBe(36)

    const letters = taught.filter((c) => /[A-Z]/.test(c))
    expect([...letters].sort().join('')).toBe(ALL_LETTERS.join(''))
  })

  it('teaches only characters the app can actually send', () => {
    for (const day of CURRICULUM) {
      for (const character of day.characters) {
        expect(MORSE_ALPHABET[character], `${character} is not in the alphabet`).toBeDefined()
      }
    }
  })

  it('never gets shallower: each day is at least as deep as the last', () => {
    // The plan's whole premise is descending the Morse tree one layer at a
    // time. A day that stepped back up would break the explanation given on
    // the page, not just the ordering.
    const depths = CURRICULUM.map((day) => Math.min(...day.characters.map(codeLength)))
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]!, `day ${i + 1} is shallower than day ${i}`).toBeGreaterThanOrEqual(
        depths[i - 1]!,
      )
    }
  })

  it('opens with the two one-element characters', () => {
    expect(CURRICULUM[0]!.characters).toEqual(['E', 'T'])
  })

  it('splits the three-element layer by first element', () => {
    const dotFirst = CURRICULUM[2]!.characters
    const dashFirst = CURRICULUM[3]!.characters
    for (const character of dotFirst) expect(codeFor(character).startsWith('.')).toBe(true)
    for (const character of dashFirst) expect(codeFor(character).startsWith('-')).toBe(true)
  })

  it('only claims words the learner can actually spell by that day', () => {
    // The single most embarrassing failure this page could have: telling
    // someone on day 2 to send a word containing a letter from day 5.
    for (const day of CURRICULUM) {
      const known = new Set(charactersThroughDay(day.day))
      for (const word of day.words) {
        for (const character of word.replace(/\s/g, '')) {
          expect(
            known.has(character),
            `day ${day.day} suggests "${word}" but ${character} is not taught yet`,
          ).toBe(true)
        }
      }
    }
  })

  it('can encode every suggested word', () => {
    for (const day of CURRICULUM) {
      for (const word of day.words) {
        expect(encode(word), `${word} did not encode`).not.toBe('')
      }
    }
  })

  it('gives every day an answer-first summary of roughly snippet length', () => {
    for (const day of CURRICULUM) {
      const words = day.summary.trim().split(/\s+/).length
      expect(words, `day ${day.day} summary is ${words} words`).toBeGreaterThanOrEqual(35)
      expect(words, `day ${day.day} summary is ${words} words`).toBeLessThanOrEqual(75)
    }
  })

  it('asks for a realistic amount of practice', () => {
    expect(CURRICULUM_TOTAL_MINUTES).toBeLessThanOrEqual(180)
    for (const day of CURRICULUM) {
      expect(day.minutes).toBeGreaterThan(0)
      expect(day.minutes).toBeLessThanOrEqual(30)
    }
  })
})

/**
 * Sentences in the plan's own prose that are claims about the plan, asserted so
 * they cannot drift. "The longest day" was once written under day five while
 * day six asks for exactly as long.
 */
describe('claims the plan makes about itself', () => {
  const longest = Math.max(...CURRICULUM.map((day) => day.minutes))
  const longestDays = CURRICULUM.filter((day) => day.minutes === longest).map((day) => day.day)

  it('shares the longest day between days five and six', () => {
    expect(longestDays).toEqual([5, 6])
  })

  it('says so on day five, rather than claiming the title outright', () => {
    const summary = CURRICULUM[4]!.summary
    expect(summary).toContain('longest day of the plan')
    expect(summary).toContain('Together with day six')
  })

  it('teaches the most characters on day seven', () => {
    const counts = CURRICULUM.map((day) => day.characters.length)
    expect(counts.indexOf(Math.max(...counts))).toBe(6)
  })

  it('has taught fourteen of the twenty-six letters by the end of day four', () => {
    // Day four's summary says exactly this.
    expect(CURRICULUM[3]!.summary).toContain('fourteen of the twenty-six letters')
    const letters = charactersThroughDay(4).filter((character) => /[A-Z]/.test(character))
    expect(letters).toHaveLength(14)
  })

  it('asks for between ten and twenty-five minutes a day', () => {
    // The how-long post quotes this range; blogClaims.test.ts reads it too.
    expect(Math.min(...CURRICULUM.map((day) => day.minutes))).toBe(10)
    expect(longest).toBe(25)
  })
})

describe('charactersThroughDay', () => {
  it('accumulates', () => {
    expect(charactersThroughDay(1)).toEqual(['E', 'T'])
    expect(charactersThroughDay(2)).toEqual(['E', 'T', 'I', 'A', 'N', 'M'])
    expect(charactersThroughDay(7)).toHaveLength(36)
  })

  it('returns nothing before the plan starts', () => {
    expect(charactersThroughDay(0)).toEqual([])
  })
})

describe('codeFor', () => {
  it('reads from the alphabet rather than a copy', () => {
    expect(codeFor('E')).toBe('.')
    expect(codeFor('0')).toBe('-----')
    expect(codeFor('🚀')).toBe('')
  })
})
