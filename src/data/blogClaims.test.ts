import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FACTS } from '../config/facts'
import { DESCRIPTION_MAX, TITLE_MAX, blogPage, findPage } from '../config/pages'
import { CITATIONS } from '../config/site'
import {
  PARIS_KEYING_UNITS,
  PARIS_SPACING_UNITS,
  PARIS_UNITS,
  UNITS,
  buildTimeline,
  dotDuration,
  timelineDuration,
} from '../engine/timingEngine'
import { encode } from '../engine/morseEncoder'
import { CURRICULUM, charactersThroughDay } from './curriculum'
import { numberWord } from './format'
import { METHODS } from './methods'
import {
  CODE_TO_CHARACTER,
  LEARNING_STAGES,
  LETTERS,
  DIGITS,
  PROSIGNS,
  codeLength,
} from './morseAlphabet'
import { WORDS } from './words'

/**
 * The blog posts make factual claims in prose, and several of them rest on the
 * same data the trainer runs on: a code, a count, a duration. A page's FAQ is
 * covered by the FAQ tests; this file does the same for the Markdown, so a post
 * cannot go on saying "two to four new characters a day" after the plan changes
 * to two to ten.
 *
 * Every dot-dash token in a post must decode to what the sentence beside it
 * says, and every number that comes from the data must still match it.
 */

const DIRECTORY = new URL('../content/blog/', import.meta.url)

interface Post {
  slug: string
  meta: Record<string, string>
  body: string
  /** The body with every run of whitespace collapsed, so a sentence wrapped across lines still matches. */
  flat: string
}

/** A minimal reader for the flat `key: value` frontmatter these posts use. */
function readPost(file: string): Post {
  const source = readFileSync(new URL(file, DIRECTORY), 'utf8')
  const match = source.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (!match) throw new Error(`${file} has no frontmatter`)
  const meta: Record<string, string> = {}
  for (const line of match[1]!.split('\n')) {
    const entry = line.match(/^([A-Za-z]+):\s*(.*)$/)
    if (!entry) continue
    meta[entry[1]!] = entry[2]!.replace(/^(['"])(.*)\1$/, '$2')
  }
  const body = match[2]!
  return { slug: file.replace(/\.md$/, ''), meta, body, flat: body.replace(/\s+/g, ' ') }
}

const POSTS = readdirSync(DIRECTORY)
  .filter((file) => file.endsWith('.md'))
  .sort()
  .map(readPost)

const post = (slug: string): Post => {
  const found = POSTS.find((entry) => entry.slug === slug)
  if (!found) throw new Error(`no post ${slug}`)
  return found
}

/** Words to numbers for the few the posts spell out. */
const SPELLED: Record<string, number> = {
  two: 2,
  three: 3,
  four: 4,
  ten: 10,
  fifteen: 15,
  'twenty-five': 25,
}

const PROSIGN_CODES = new Set<string>(Object.values(PROSIGNS))
const knownCode = (code: string): boolean => CODE_TO_CHARACTER.has(code) || PROSIGN_CODES.has(code)

describe('the posts', () => {
  it('finds all five', () => {
    expect(POSTS.map((entry) => entry.slug)).toEqual([
      'how-long-does-it-take-to-learn-morse-code',
      'sos-does-not-stand-for-anything',
      'what-farnsworth-timing-is',
      'which-order-should-you-learn-morse-in',
      'why-a-morse-code-chart-does-not-work',
    ])
  })

  it.each(POSTS.map((entry) => [entry.slug, entry] as const))(
    '%s fits a results page: title, description and dates',
    (_slug, entry) => {
      const page = blogPage({
        slug: entry.slug,
        title: entry.meta['title']!,
        seoTitle: entry.meta['seoTitle'],
        description: entry.meta['description']!,
      })
      expect(page.title.length, page.title).toBeLessThanOrEqual(TITLE_MAX)
      expect(entry.meta['description']!.length).toBeLessThanOrEqual(DESCRIPTION_MAX)
      expect(entry.meta['description']!.length).toBeGreaterThanOrEqual(70)
      if (entry.meta['seoTitle']) {
        expect(entry.meta['seoTitle'].length).toBeLessThanOrEqual(60)
      }
      if (entry.meta['updated']) {
        expect(new Date(entry.meta['updated']).getTime()).toBeGreaterThanOrEqual(
          new Date(entry.meta['published']!).getTime(),
        )
      }
    },
  )

  it('gives the two renamed posts a results-page title and keeps the author H1', () => {
    const sos = post('sos-does-not-stand-for-anything')
    expect(sos.meta['seoTitle']).toBe('What Does SOS Stand For? Nothing — Here Is Why')
    expect(sos.meta['title']).toBe('SOS does not stand for anything')
    expect(
      blogPage({
        slug: sos.slug,
        title: sos.meta['title']!,
        seoTitle: sos.meta['seoTitle'],
        description: '',
      }).title,
    ).toBe('What Does SOS Stand For? Nothing — Here Is Why | MorseForge')
    expect(post('what-farnsworth-timing-is').meta['seoTitle']).toBe(
      'Farnsworth Timing: Why It Beats Slowing Down',
    )
  })

  it('marks the posts whose facts changed as updated', () => {
    for (const slug of [
      'how-long-does-it-take-to-learn-morse-code',
      'sos-does-not-stand-for-anything',
      'what-farnsworth-timing-is',
      'which-order-should-you-learn-morse-in',
    ]) {
      expect(post(slug).meta['updated'], slug).toBe('2026-10-21')
    }
  })

  it('links only to pages that exist', () => {
    const slugs = new Set(POSTS.map((entry) => entry.slug))
    const wordSlugs = new Set(WORDS.map((word) => word.slug))
    for (const entry of POSTS) {
      for (const match of entry.body.matchAll(/\]\((\/[^)\s]*)\)/g)) {
        const path = match[1]!
        const blog = path.match(/^\/blog\/([^/]+)\/$/)
        const word = path.match(/^\/words\/([^/]+)\/$/)
        const exists = blog
          ? slugs.has(blog[1]!)
          : word
            ? wordSlugs.has(word[1]!)
            : findPage(path) !== undefined
        expect(exists, `${entry.slug} links to ${path}`).toBe(true)
      }
    }
  })
})

describe('dot-dash tokens', () => {
  /** Every inline or fenced code span made only of dots, dashes and spaces. */
  function tokens(entry: Post): string[] {
    const found: string[] = []
    for (const block of entry.body.matchAll(/```[^\n]*\n([\s\S]*?)```/g)) {
      for (const line of block[1]!.split('\n')) if (line.trim()) found.push(line.trim())
    }
    const withoutFences = entry.body.replace(/```[\s\S]*?```/g, '')
    for (const span of withoutFences.matchAll(/`([^`\n]+)`/g)) {
      if (/^[.\-\s]+$/.test(span[1]!)) found.push(span[1]!.trim())
    }
    return found
  }

  it.each(POSTS.map((entry) => [entry.slug, entry] as const))(
    '%s only quotes codes that are real characters or prosigns',
    (_slug, entry) => {
      for (const token of tokens(entry)) {
        for (const code of token.split(/\s+/)) {
          expect(knownCode(code), `${entry.slug}: "${code}" is not in the alphabet`).toBe(true)
        }
      }
    },
  )

  it('checked something in the posts that have codes', () => {
    expect(tokens(post('sos-does-not-stand-for-anything')).length).toBeGreaterThanOrEqual(4)
    expect(tokens(post('which-order-should-you-learn-morse-in')).length).toBeGreaterThanOrEqual(8)
  })

  describe('and the letters stated beside them', () => {
    const all = POSTS.map((entry) => ({ entry, body: entry.body }))
    const checks: string[] = []
    const lookup = (letter: string): string | undefined =>
      LETTERS[letter as keyof typeof LETTERS] ?? DIGITS[letter as keyof typeof DIGITS]

    it('table rows: | A | `.-` |', () => {
      let rows = 0
      for (const { entry, body } of all) {
        for (const match of body.matchAll(/^\|\s*([A-Z0-9])\s*\|\s*`([.-]+)`\s*\|/gm)) {
          rows++
          expect(lookup(match[1]!), `${entry.slug}: ${match[1]}`).toBe(match[2])
        }
      }
      expect(rows).toBeGreaterThanOrEqual(6)
      checks.push('rows')
    })

    it('a letter followed by its code: E `.`, T `-`', () => {
      let found = 0
      for (const { entry, body } of all) {
        for (const match of body.matchAll(/\b([A-Z])\s+`([.-]+)`/g)) {
          found++
          expect(lookup(match[1]!), `${entry.slug}: ${match[1]}`).toBe(match[2])
        }
      }
      expect(found).toBeGreaterThanOrEqual(2)
    })

    it('a code followed by its letter: `.-` is A, `-.-.` as C', () => {
      let found = 0
      for (const { entry, body } of all) {
        for (const match of body.matchAll(/`([.-]+)`\s+(?:is|as)\s+([A-Z0-9])\b/g)) {
          found++
          expect(lookup(match[2]!), `${entry.slug}: ${match[2]}`).toBe(match[1])
        }
      }
      expect(found).toBeGreaterThanOrEqual(2)
    })

    it('an equation: `A = .-`', () => {
      let found = 0
      for (const { entry, body } of all) {
        for (const match of body.matchAll(/`([A-Z0-9])\s*=\s*([.-]+)`/g)) {
          found++
          expect(lookup(match[1]!), `${entry.slug}: ${match[1]}`).toBe(match[2])
        }
      }
      expect(found).toBeGreaterThanOrEqual(1)
    })
  })
})

describe('the SOS post', () => {
  const sos = post('sos-does-not-stand-for-anything')

  it('quotes the prosign as one nine-element signal', () => {
    expect(sos.body).toContain(`\n${PROSIGNS.SOS}\n`)
    expect(PROSIGNS.SOS.length).toBe(9)
    expect(sos.body).toContain('Nine elements')
  })

  it('shows the same letters sent apart with proper gaps', () => {
    const apart = sos.body.match(/```\n(\.\.\.\s+---\s+\.\.\.)\n```/)
    expect(apart).not.toBeNull()
    expect(apart![1]!.split(/\s+/).join(' ')).toBe(encode('SOS'))
  })

  it('names the starting signal, which is the letters K and A run together', () => {
    expect(sos.flat).toContain(`\`${PROSIGNS.CT}\` is the "starting transmission" signal`)
    expect(PROSIGNS.CT).toBe(LETTERS.K + LETTERS.A)
    expect(sos.flat).toContain('not the letters K and A')
  })

  it('quotes CQD as C, Q and D', () => {
    expect(sos.body).toContain(`\`${encode('CQD')}\``)
  })

  it('says run together it lasts about two seconds at 15 WPM', () => {
    const seconds = timelineDuration(buildTimeline(PROSIGNS.SOS, { wpm: 15 })) / 1000
    expect(seconds).toBeCloseTo(1.84, 2)
    expect(sos.flat).toContain('about two seconds at 15 WPM')
    expect(Math.round(seconds)).toBe(2)
  })

  it('hedges the CQ etymology', () => {
    expect(sos.flat).toContain('usually said to come from the French _sécurité_')
  })
})

describe('the how-long post', () => {
  const howLong = post('how-long-does-it-take-to-learn-morse-code')
  const days = CURRICULUM.map((day) => day.characters.length)
  const minutes = CURRICULUM.map((day) => day.minutes)

  it('says the plan teaches two to ten new characters a day', () => {
    const claim = howLong.flat.match(/(\w+) to (\w+) new characters a day/)!
    expect(SPELLED[claim[1]!]).toBe(Math.min(...days))
    expect(SPELLED[claim[2]!]).toBe(Math.max(...days))
  })

  it('says sessions run ten to twenty-five minutes, here and in the first-month list', () => {
    const claims = [...howLong.flat.matchAll(/(\w+) to ([\w-]+) minutes/g)]
    expect(claims.length).toBeGreaterThanOrEqual(2)
    for (const claim of claims) {
      expect(SPELLED[claim[1]!], claim[0]).toBe(Math.min(...minutes))
      expect(SPELLED[claim[2]!], claim[0]).toBe(Math.max(...minutes))
    }
  })

  it('no longer calls the plan fifteen minutes at a time', () => {
    expect(howLong.body).not.toMatch(/two to four new characters/)
    expect(howLong.flat).not.toMatch(/fifteen minutes at a time/)
  })

  it('counts the plan as 26 letters and 10 digits', () => {
    expect(howLong.flat).toContain('All 26 letters and 10 digits')
    expect(FACTS.letterCount).toBe(26)
    expect(FACTS.digitCount).toBe(10)
  })

  it('has the description the audit gave it', () => {
    expect(howLong.meta['description']).toBe(
      'Two hours teaches every Morse character. Copying at a useful speed takes two to three months of short daily sessions, and that is the number that matters.',
    )
  })
})

describe('"about two hours" holds for the plan', () => {
  it('rounds the plan total to the hours every post quotes', () => {
    const hours = Math.round(FACTS.planMinutes / 60)
    let seen = 0
    for (const entry of POSTS) {
      for (const match of `${entry.meta['answer']} ${entry.flat} ${entry.meta['description']}`.matchAll(
        /\b(?:about|roughly)\s+(\w+)\s+hours\b/gi,
      )) {
        seen++
        expect(numberWord(hours), `${entry.slug}: "${match[0]}"`).toBe(match[1]!.toLowerCase())
      }
    }
    expect(seen).toBeGreaterThanOrEqual(3)
  })

  it('keeps the total within a quarter hour of two hours', () => {
    expect(Math.abs(FACTS.planMinutes - 120)).toBeLessThanOrEqual(15)
  })
})

describe('the Farnsworth post', () => {
  const farnsworth = post('what-farnsworth-timing-is')

  it('links the ARRL paper from "The ARRL method"', () => {
    expect(farnsworth.flat).toContain(`[ARRL method](${CITATIONS.arrl.url})`)
  })

  it('states the PARIS split from the timing engine', () => {
    expect(farnsworth.flat).toContain(`PARIS is exactly ${PARIS_UNITS} units long`)
    expect(farnsworth.flat).toContain(
      `Of those ${PARIS_UNITS} units, ${PARIS_KEYING_UNITS} are the actual keying and ${PARIS_SPACING_UNITS} are the gaps`,
    )
    expect(PARIS_KEYING_UNITS + PARIS_SPACING_UNITS).toBe(PARIS_UNITS)
  })

  it('gives the unit table the engine uses', () => {
    const rows: [string, number][] = [
      ['Dot', UNITS.DOT],
      ['Dash', UNITS.DASH],
      ['Gap inside a character', UNITS.ELEMENT_GAP],
      ['Gap between characters', UNITS.CHARACTER_GAP],
      ['Gap between words', UNITS.WORD_GAP],
    ]
    for (const [label, units] of rows) {
      expect(farnsworth.body, label).toMatch(
        new RegExp(`\\|\\s*${label}\\s*\\|\\s*${units}\\s*\\|`),
      )
    }
  })

  it('quotes the unit length as 1200 over the speed', () => {
    expect(farnsworth.body).toContain('`1200 / W` milliseconds')
    expect(dotDuration(1)).toBe(1200)
  })

  it('says a dot lasts 240 milliseconds at 5 WPM', () => {
    expect(farnsworth.flat).toContain('At 5 words per minute a dot lasts 240 milliseconds')
    expect(dotDuration(5)).toBe(240)
  })
})

describe('the chart post', () => {
  it('says a dot lasts 120 milliseconds at 10 WPM', () => {
    expect(post('why-a-morse-code-chart-does-not-work').flat).toContain(
      'At 10 words per minute a dot lasts 120 milliseconds',
    )
    expect(dotDuration(10)).toBe(120)
  })
})

describe('the order post', () => {
  const order = post('which-order-should-you-learn-morse-in')

  it('lists each tree layer as the app teaches it', () => {
    const labels = ['One', 'Two', 'Three', 'Four']
    labels.forEach((label, index) => {
      const line = order.body.match(new RegExp(`\\*\\*${label} elements?:\\*\\*\\s*(.+)`))![1]!
      const letters = line.replace(/`[^`]*`/g, '').match(/\b[A-Z]\b/g) ?? []
      const stage = LEARNING_STAGES[index]!
      expect([...letters].sort(), label).toEqual([...stage].sort())
      for (const letter of letters)
        expect(codeLength(letter), `${label}: ${letter}`).toBe(index + 1)
    })
  })

  it('says the first fourteen characters are the first four days', () => {
    expect(order.flat).toContain('the first fourteen characters')
    expect(charactersThroughDay(4)).toHaveLength(14)
  })

  it('starts Koch with K and M and adds a character at 90%', () => {
    expect(order.flat).toContain('Usually K and M')
    expect(METHODS.koch.order.slice(0, 2)).toEqual(['K', 'M'])
    expect(order.flat).toContain('90% accuracy')
    expect(METHODS.koch.unlockAccuracy).toBe(0.9)
  })

  it('has the description the audit gave it', () => {
    expect(order.meta['description']).toBe(
      'Alphabetical is the worst order to learn Morse code in. Koch and shortest-first both work, and choosing between them matters far less than avoiding A B C.',
    )
  })
})
