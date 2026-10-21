import { describe, expect, it } from 'vitest'
import {
  CHARACTERS,
  PAGE_CHARACTERS,
  characterBySlug,
  characterFacts,
  distinctFacts,
} from './characters'
import { DIGITS, LETTERS, MORSE_ALPHABET, PUNCTUATION } from './morseAlphabet'

const facts = (character: string) => {
  const found = characterFacts(character)
  if (!found) throw new Error(`no facts for ${character}`)
  return found
}

describe('CHARACTERS', () => {
  it('covers letters, digits and punctuation, and nothing else', () => {
    const expected = [...Object.keys(LETTERS), ...Object.keys(DIGITS), ...Object.keys(PUNCTUATION)]
    expect(Object.keys(CHARACTERS).sort()).toEqual([...expected].sort())
    expect(PAGE_CHARACTERS).toHaveLength(36)
  })

  it('reads every code from the alphabet', () => {
    for (const [character, entry] of Object.entries(CHARACTERS)) {
      expect(entry.code, character).toBe(MORSE_ALPHABET[character])
      expect(entry.elements, character).toBe(entry.dots + entry.dashes)
    }
  })

  it('gives every character a unique, URL-safe slug', () => {
    const slugs = Object.values(CHARACTERS).map((entry) => entry.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) expect(slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    expect(facts('?').slug).toBe('question-mark')
    expect(facts('@').slug).toBe('at-sign')
    expect(characterBySlug('question-mark')?.character).toBe('?')
    expect(characterBySlug('a')?.character).toBe('A')
    expect(characterBySlug('nope')).toBeUndefined()
  })

  it('marks the five common extras as outside the standard', () => {
    for (const mark of ['!', '&', ';', '_', '$']) expect(facts(mark).itu, mark).toBe(false)
    for (const mark of ['.', '?', '@', '(', ')']) expect(facts(mark).itu, mark).toBe(true)
    expect(facts('A').itu).toBe(true)
  })

  it('looks characters up case-insensitively and rejects what it cannot send', () => {
    expect(characterFacts('a')?.character).toBe('A')
    expect(characterFacts('€')).toBeUndefined()
  })
})

describe('spoken form', () => {
  it('uses di for inner dots, dit for the last, dah for dashes', () => {
    expect(facts('A').spoken).toBe('di-dah')
    expect(facts('N').spoken).toBe('dah-dit')
    expect(facts('E').spoken).toBe('dit')
    expect(facts('T').spoken).toBe('dah')
    expect(facts('S').spoken).toBe('di-di-dit')
    expect(facts('A').spelled).toBe('dot dash')
  })
})

describe('timing', () => {
  it('matches the audit at 20 WPM: a 60 ms unit', () => {
    expect(facts('E').durationMs.wpm20).toBe(60)
    expect(facts('T').durationMs.wpm20).toBe(180)
    // dot, gap, dash: 60 + 60 + 180
    expect(facts('A').durationMs.wpm20).toBe(300)
  })

  it('is four times slower at 5 WPM', () => {
    expect(facts('E').durationMs.wpm5).toBe(240)
    expect(facts('A').durationMs.wpm5).toBe(facts('A').durationMs.wpm20 * 4)
  })
})

describe('tree position', () => {
  it('places E and T one step from the root with no parent', () => {
    expect(facts('E').tree).toEqual({ steps: 1, parent: null, dot: 'I', dash: 'A' })
    expect(facts('T').tree).toEqual({ steps: 1, parent: null, dot: 'N', dash: 'M' })
  })

  it('names the parent and children of an inner letter', () => {
    expect(facts('A').tree).toEqual({ steps: 2, parent: 'E', dot: 'R', dash: 'W' })
  })

  it('has no tree position for digits or punctuation', () => {
    expect(facts('7').tree).toBeNull()
    expect(facts('?').tree).toBeNull()
  })
})

describe('mirror and reverse', () => {
  it('matches the audit for the letters whose mirror is a letter', () => {
    const pairs: [string, string][] = [
      ['A', 'N'],
      ['B', 'J'],
      ['D', 'W'],
      ['E', 'T'],
      ['F', 'Q'],
      ['G', 'U'],
      ['I', 'M'],
      ['K', 'R'],
      ['L', 'Y'],
      ['O', 'S'],
      ['P', 'X'],
    ]
    for (const [a, b] of pairs) {
      expect(facts(a).mirror, a).toBe(b)
      expect(facts(b).mirror, b).toBe(a)
    }
  })

  it('has no mirror where the swapped code is an accented letter or nothing', () => {
    // C, V and Z mirror to Ä, Ö and Ü, which are extended letters.
    for (const letter of ['C', 'V', 'Z', 'H']) expect(facts(letter).mirror, letter).toBeNull()
  })

  it('mirrors the digits in pairs', () => {
    expect(facts('1').mirror).toBe('6')
    expect(facts('5').mirror).toBe('0')
  })

  it('matches the audit for reverses', () => {
    const pairs: [string, string][] = [
      ['A', 'N'],
      ['B', 'V'],
      ['D', 'U'],
      ['F', 'L'],
      ['G', 'W'],
      ['Q', 'Y'],
    ]
    for (const [a, b] of pairs) {
      expect(facts(a).reverse, a).toBe(b)
      expect(facts(b).reverse, b).toBe(a)
    }
    expect(facts('R').reverse).toBeNull()
  })
})

describe('neighbours', () => {
  it('differ by exactly one element in the same position, and never include the mirror', () => {
    for (const entry of Object.values(CHARACTERS)) {
      for (const other of entry.neighbours) {
        const otherFacts = facts(other)
        expect(otherFacts.elements, `${entry.character}/${other}`).toBe(entry.elements)
        const differing = [...entry.code].filter((e, i) => e !== otherFacts.code[i]).length
        expect(differing, `${entry.character}/${other}`).toBe(1)
        expect(other, entry.character).not.toBe(entry.mirror)
      }
    }
  })

  it('finds the ones people actually confuse', () => {
    expect(facts('S').neighbours).toEqual(['D', 'R', 'U'])
  })
})

describe('plan, Koch and words', () => {
  it('reads the plan day and its companions from the curriculum', () => {
    expect(facts('A').planDay).toBe(2)
    expect(facts('A').companions).toEqual(['I', 'N', 'M'])
    expect(facts('7').planDay).toBe(7)
    expect(facts('?').planDay).toBeNull()
    expect(facts('?').companions).toEqual([])
  })

  it('reads the Koch position from the Koch order, one-based', () => {
    expect(facts('K').kochPosition).toBe(1)
    expect(facts('M').kochPosition).toBe(2)
    expect(facts('?').kochPosition).toBeNull()
  })

  it('lists the word pages that contain a character', () => {
    expect(facts('S').words.map((word) => word.slug)).toContain('sos')
    expect(facts('7').words.map((word) => word.slug)).toContain('73')
    expect(facts('Z').words).toEqual([])
  })
})

describe('thin-page guard', () => {
  it('gives every letter and digit at least six distinct facts', () => {
    // Below six, a page is a chart row with a heading and is not worth the URL.
    for (const character of PAGE_CHARACTERS) {
      const found = distinctFacts(facts(character))
      expect(found.length, `${character} has only: ${found.join(', ')}`).toBeGreaterThanOrEqual(6)
    }
  })

  it('does not count facts a character does not have', () => {
    const found = distinctFacts(facts('Z'))
    expect(found).not.toContain('mirror image')
    expect(found).not.toContain('words containing it')
  })
})
