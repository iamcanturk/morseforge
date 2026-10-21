import { readFileSync, readdirSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FACTS } from '../../config/facts'
import { DESCRIPTION_MAX, TITLE_MAX, characterPage, findPage, getPage } from '../../config/pages'
import {
  CHARACTERS,
  PAGE_CHARACTERS,
  characterBySlug,
  characterSlug,
  distinctFacts,
} from '../../data/characters'
import { characterFaq, faqFor } from '../../data/faq'
import { DIGITS, LETTERS, MORSE_ALPHABET, PUNCTUATION } from '../../data/morseAlphabet'
import { PARIS_KEYING_UNITS, PARIS_SPACING_UNITS, PARIS_UNITS } from '../../engine/timingEngine'
import { handTypedMorse } from '../../seo/proseScan'
import { WPM_RANGE } from '../../storage/settings'
import {
  HOW_TO_INTRO_LINKS,
  MIN_FACTS,
  SPEED_INTRO_LINKS,
  characterFactRows,
  characterHref,
  characterIntro,
  characterPages,
  characterSiblings,
  digitsInRuleOrder,
  digitsPlanDay,
  elementsInOrder,
  farnsworthRows,
  formatMs,
  howToSchema,
  howToSteps,
  linkParts,
  parisSegments,
  speedRows,
  treePath,
} from './reference'

const wordsIn = (text: string) => text.trim().split(/\s+/).length

describe('linkParts', () => {
  it('links the first occurrence of each phrase and keeps the rest as text', () => {
    expect(
      linkParts('a dot then a dot', [
        { text: 'dot', href: '/d/' },
        { text: 'then', href: '/t/' },
      ]),
    ).toEqual([
      { text: 'a ' },
      { text: 'dot', href: '/d/' },
      { text: ' ' },
      { text: 'then', href: '/t/' },
      { text: ' a dot' },
    ])
  })

  it('leaves the text alone when a phrase is missing', () => {
    expect(linkParts('plain', [{ text: 'absent', href: '/x/' }])).toEqual([{ text: 'plain' }])
  })
})

describe('characterSlug (the link contract for the alphabet page)', () => {
  it('gives the page slug for every letter and digit, case-insensitively', () => {
    for (const character of PAGE_CHARACTERS) {
      expect(characterSlug(character), character).toBe(character.toLowerCase())
    }
    expect(characterSlug('a')).toBe('a')
  })

  it('is null for punctuation and anything unknown, so no caller links a 404', () => {
    for (const mark of Object.keys(PUNCTUATION)) expect(characterSlug(mark), mark).toBeNull()
    expect(characterSlug('€')).toBeNull()
    expect(characterHref('?')).toBeNull()
    expect(characterHref('Q')).toBe('/morse-code-alphabet/q/')
  })
})

describe('character pages: never a doorway page', () => {
  const pages = characterPages()

  it('builds one page per letter and digit, and none for punctuation', () => {
    expect(pages.map((facts) => facts.character)).toEqual([...PAGE_CHARACTERS])
    expect(pages).toHaveLength(Object.keys(LETTERS).length + Object.keys(DIGITS).length)
  })

  it(`requires at least ${MIN_FACTS} distinct computed facts on every page it builds`, () => {
    for (const facts of pages) {
      expect(distinctFacts(facts).length, facts.character).toBeGreaterThanOrEqual(MIN_FACTS)
      expect(characterFactRows(facts).length, facts.character).toBeGreaterThanOrEqual(MIN_FACTS)
    }
  })

  it('leaves out every character below the floor', () => {
    const thin = Object.values(CHARACTERS).filter(
      (facts) => distinctFacts(facts).length < MIN_FACTS,
    )
    expect(thin.length).toBeGreaterThan(0)
    for (const facts of thin) expect(pages, facts.character).not.toContain(facts)
  })

  it('shows only facts that have a value', () => {
    for (const facts of pages) {
      for (const row of characterFactRows(facts)) {
        expect(row.value.trim().length, `${facts.character} ${row.label}`).toBeGreaterThan(0)
        expect(row.value, `${facts.character} ${row.label}`).not.toMatch(/undefined|null|NaN/)
      }
    }
    const h = characterFactRows(CHARACTERS['H']!).map((row) => row.label)
    expect(h).not.toContain('Mirror image')
    expect(h).not.toContain('Read backwards')
  })

  it('links every fact row only to characters that have pages', () => {
    for (const facts of pages) {
      for (const row of characterFactRows(facts)) {
        for (const link of row.links ?? []) {
          expect(characterBySlug(link.href.split('/')[2]!), link.href).toBeDefined()
          expect(PAGE_CHARACTERS).toContain(link.character)
        }
      }
    }
  })

  it('fits every title and description in the search-result budget, with real values', () => {
    for (const facts of pages) {
      const meta = characterPage(facts)
      expect(meta.title.length, meta.title).toBeLessThanOrEqual(TITLE_MAX)
      expect(meta.description.length, meta.description).toBeLessThanOrEqual(DESCRIPTION_MAX)
      expect(meta.title, meta.title).toContain(facts.code)
      expect(meta.path).toBe(`/morse-code-alphabet/${characterSlug(facts.character)}/`)
    }
  })

  it('has a FAQ on every page', () => {
    for (const facts of pages) {
      expect(characterFaq(facts).length, facts.character).toBeGreaterThanOrEqual(3)
    }
  })
})

describe('characterIntro', () => {
  it('follows the audit template for A', () => {
    expect(characterIntro(CHARACTERS['A']!)).toBe(
      `A in Morse code is "${LETTERS.A}": one dot followed by one dash, spoken "di-dah". It is one of the 4 two-element letters, so it sits two steps from the root of the Morse code tree, and it is the mirror image of N, which is dash-dot. The 7-day plan teaches A on day 2. At 20 words per minute it takes 300 milliseconds to send.`,
    )
  })

  it('reads well for a digit and a letter with no mirror', () => {
    expect(characterIntro(CHARACTERS['7']!)).toContain(
      'It is one of the 10 digits, all exactly five elements long, and it is the mirror image of 2',
    )
    expect(characterIntro(CHARACTERS['H']!)).not.toContain('mirror')
  })

  it('is a quotable paragraph for every page', () => {
    for (const facts of characterPages()) {
      const intro = characterIntro(facts)
      expect(wordsIn(intro), facts.character).toBeGreaterThanOrEqual(30)
      expect(wordsIn(intro), facts.character).toBeLessThanOrEqual(75)
      expect(intro.startsWith(`${facts.character} in Morse code is "${facts.code}"`)).toBe(true)
      expect(intro).not.toMatch(/undefined|null|NaN| {2}/)
    }
  })
})

describe('elementsInOrder', () => {
  it('says the elements the way they are sent', () => {
    expect(elementsInOrder(LETTERS.E)).toBe('a single dot')
    expect(elementsInOrder(LETTERS.T)).toBe('a single dash')
    expect(elementsInOrder(LETTERS.H)).toBe('four dots')
    expect(elementsInOrder(LETTERS.B)).toBe('one dash followed by three dots')
    expect(elementsInOrder(LETTERS.C)).toBe('dash, dot, dash and dot')
  })
})

describe('characterSiblings', () => {
  it('walks the alphabet and wraps at both ends', () => {
    expect(characterSiblings(CHARACTERS['A']!).previous.character).toBe('9')
    expect(characterSiblings(CHARACTERS['A']!).next.character).toBe('B')
    expect(characterSiblings(CHARACTERS['Z']!).next.character).toBe('0')
  })

  it('refuses a character without a page', () => {
    expect(() => characterSiblings(CHARACTERS['?']!)).toThrow(/no page/)
  })
})

describe('treePath', () => {
  it('walks from the root to the target, one lit branch per element', () => {
    const layout = treePath(LETTERS.A)
    const taken = layout.nodes.filter((node) => node.taken)
    expect(taken.map((node) => node.character)).toEqual([null, 'E', 'A'])
    expect(layout.nodes.filter((node) => node.target).map((node) => node.code)).toEqual([LETTERS.A])
    expect(layout.edges).toHaveLength(LETTERS.A.length * 2)
    expect(layout.edges.filter((edge) => edge.taken)).toHaveLength(LETTERS.A.length)
  })

  it('shows the sibling at each step, which is the one-element neighbour at the last', () => {
    const layout = treePath(LETTERS.A)
    const last = layout.nodes.filter((node) => node.code.length === LETTERS.A.length)
    expect(last.map((node) => node.character).sort()).toEqual(['A', 'I'])
  })

  it('reaches a digit through letter prefixes and links the other nodes', () => {
    const layout = treePath(DIGITS['7'])
    expect(layout.description).toBe(
      'The path through the Morse code tree to 7: from the root, a dash to T, a dash to M, a dot to G, a dot to Z then a dot to 7.',
    )
    const target = layout.nodes.find((node) => node.target)!
    expect(target.href).toBeNull()
    for (const node of layout.nodes) {
      if (node.href) expect(node.href).toBe(characterHref(node.character!))
    }
  })

  it('keeps every node inside the drawing', () => {
    for (const facts of characterPages()) {
      const layout = treePath(facts.code)
      for (const node of layout.nodes) {
        expect(node.x, facts.character).toBeGreaterThan(0)
        expect(node.x, facts.character).toBeLessThan(layout.width)
        expect(node.y, facts.character).toBeLessThan(layout.height)
      }
    }
  })
})

describe('numbers page helpers', () => {
  it('orders the digits the way the rule counts: 1 to 9, then 0', () => {
    expect(digitsInRuleOrder().map((facts) => facts.character)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      '0',
    ])
  })

  it('finds the plan day that teaches the digits', () => {
    expect(digitsPlanDay()).toBe(CHARACTERS['0']!.planDay)
  })

  it('states the rule the numbers page intro claims', () => {
    const rule = digitsInRuleOrder()
    rule.forEach((facts, index) => {
      // 1..5 lead with index+1 dots; 6..0 lead with index-4 dashes.
      const lead = index < 5 ? '.'.repeat(index + 1) : '-'.repeat(index - 4)
      expect(facts.code.startsWith(lead), facts.character).toBe(true)
      expect(facts.elements).toBe(FACTS.digitElements)
    })
    expect(getPage('/morse-code-numbers/').intro).toContain(
      '1 is one dot and four dashes, each digit after it moves one more dot in until 5 is five dots, and from 6 the dashes return until 0 is five dashes.',
    )
  })
})

describe('speed page helpers', () => {
  const rows = speedRows()

  it('has a row for every whole speed the sliders offer', () => {
    expect(rows[0]!.wpm).toBe(WPM_RANGE.min)
    expect(rows.at(-1)!.wpm).toBe(WPM_RANGE.max)
    expect(rows).toHaveLength(WPM_RANGE.max - WPM_RANGE.min + 1)
  })

  it('obeys the PARIS arithmetic: one unit is 1200 ÷ WPM, one PARIS is a minute ÷ WPM', () => {
    for (const row of rows) {
      expect(row.dot).toBeCloseTo(1200 / row.wpm, 9)
      expect(row.dash).toBeCloseTo(row.dot * 3, 9)
      expect(row.characterGap).toBeCloseTo(row.dot * 3, 9)
      expect(row.wordGap).toBeCloseTo(row.dot * 7, 9)
      expect(row.paris * row.wpm).toBeCloseTo(60_000, 6)
    }
  })

  it('formats milliseconds without noise', () => {
    expect(formatMs(60)).toBe('60')
    expect(formatMs(1200 / 7)).toBe('171.4')
    expect(formatMs(1601.05)).toBe('1601.1')
  })

  it('spells PARIS out to exactly 50 units: 31 keyed, 19 spacing', () => {
    const segments = parisSegments()
    const total = segments.reduce((sum, segment) => sum + segment.units, 0)
    expect(total).toBe(PARIS_UNITS)
    const spacing = segments
      .filter((segment) => segment.kind === 'character-gap' || segment.kind === 'word-gap')
      .reduce((sum, segment) => sum + segment.units, 0)
    expect(spacing).toBe(PARIS_SPACING_UNITS)
    expect(total - spacing).toBe(PARIS_KEYING_UNITS)
    expect(segments.at(-1)!.kind).toBe('word-gap')
  })

  it('stretches only the gaps under Farnsworth, never the characters', () => {
    const farnsworth = farnsworthRows()
    expect(farnsworth[0]!.effective).toBe(WPM_RANGE.min)
    expect(farnsworth.at(-1)!.effective).toBe(FACTS.exampleWpm)
    for (const row of farnsworth) {
      expect(row.timing.dot).toBe(FACTS.unitMs)
      expect(row.timing.characterGap).toBeGreaterThanOrEqual(FACTS.unitMs * 3)
    }
    const gaps = farnsworth.map((row) => row.timing.characterGap)
    expect([...gaps].sort((a, b) => b - a)).toEqual(gaps)
  })

  it('links only phrases that are in the speed intro', () => {
    const intro = getPage('/morse-code-speed/').intro
    for (const link of SPEED_INTRO_LINKS) expect(intro, link.text).toContain(link.text)
  })
})

describe('how-to hub', () => {
  const steps = howToSteps()
  const posts = new Set(
    readdirSync(new URL('../../content/blog/', import.meta.url)).map((file) =>
      file.replace(/\.md$/, ''),
    ),
  )

  /** The `answer:` line of a post's frontmatter. */
  const answerOf = (slug: string): string => {
    const source = readFileSync(new URL(`../../content/blog/${slug}.md`, import.meta.url), 'utf8')
    const match = source.match(/^answer: (.+)$/m)
    if (!match) throw new Error(`${slug} has no answer`)
    return match[1]!
  }

  it('has six short steps with unique anchors', () => {
    expect(steps).toHaveLength(6)
    expect(new Set(steps.map((item) => item.id)).size).toBe(steps.length)
    for (const item of steps) {
      const text = 'post' in item.body ? answerOf(item.body.post) : item.body.text
      expect(wordsIn(text), item.id).toBeLessThanOrEqual(80)
      expect(wordsIn(text), item.id).toBeGreaterThanOrEqual(30)
    }
  })

  it('ends every step in a deep page that exists', () => {
    for (const item of steps) {
      expect(item.links.length, item.id).toBeGreaterThan(0)
      for (const link of item.links) {
        const blog = link.href.match(/^\/blog\/([^/]+)\/$/)
        if (blog) expect(posts, link.href).toContain(blog[1])
        else expect(findPage(link.href), link.href).toBeDefined()
      }
      if ('post' in item.body) expect(posts).toContain(item.body.post)
    }
  })

  it('links only phrases that are in the intro, each to a page that exists', () => {
    const intro = getPage('/how-to-learn-morse-code/').intro
    for (const link of HOW_TO_INTRO_LINKS) {
      expect(intro, link.text).toContain(link.text)
      const blog = link.href.match(/^\/blog\/([^/]+)\/$/)
      if (blog) expect(posts).toContain(blog[1])
      else expect(findPage(link.href)).toBeDefined()
    }
  })

  it('builds a HowTo from the same steps', () => {
    const schema = howToSchema({
      url: 'https://example.test/how/',
      name: 'How',
      description: 'd',
      steps: steps.map((item) => ({ id: item.id, title: item.title, text: 'x' })),
    })
    expect(schema['@type']).toBe('HowTo')
    expect(schema.step).toHaveLength(steps.length)
    expect(schema.step[0]).toMatchObject({
      position: 1,
      name: steps[0]!.title,
      url: `https://example.test/how/#step-${steps[0]!.id}`,
    })
  })
})

describe('the new routes', () => {
  it('are registered with an FAQ each', () => {
    for (const path of [
      '/morse-code-numbers/',
      '/morse-code-speed/',
      '/how-to-learn-morse-code/',
    ]) {
      expect(findPage(path), path).toBeDefined()
      expect(faqFor(path).length, path).toBeGreaterThanOrEqual(3)
    }
  })

  it('match the audit copy with the values rendered', () => {
    expect(getPage('/morse-code-numbers/').title).toBe(
      'Morse Code Numbers 0–9: Chart, Sound and Rule | MorseForge',
    )
    expect(getPage('/morse-code-numbers/').description).toBe(
      'Morse code numbers 0 to 9, each exactly five elements long. Learn the one rule that spells every digit, hear each number and practise them for free.',
    )
    expect(getPage('/morse-code-speed/').title).toBe(
      'Morse Code Speed: WPM, PARIS and Timing Chart | MorseForge',
    )
    expect(getPage('/morse-code-speed/').description).toBe(
      'How Morse code speed works: the PARIS standard, the 1:3:7 timing rule and the dot length at every speed from 5 to 40 WPM, computed from the timing engine.',
    )
    expect(getPage('/morse-code-speed/').intro).toContain(
      'exactly 50 units long including its trailing gap. A unit is one dot, so at W words per minute a dot lasts 1200 ÷ W milliseconds: 60 ms at 20 WPM.',
    )
    expect(getPage('/how-to-learn-morse-code/').title).toBe(
      'How to Learn Morse Code: A Step-by-Step Guide | MorseForge',
    )
    expect(getPage('/how-to-learn-morse-code/').intro).toContain(
      'practise for 10 to 25 minutes a day. The alphabet takes about seven days',
    )
  })

  it('quote the numbers FAQ from the data', () => {
    const [write, zero, time, mirrors] = faqFor('/morse-code-numbers/')
    expect(write!.answer).toContain(`"${MORSE_ALPHABET['7']} ${MORSE_ALPHABET['3']}"`)
    expect(zero!.question).toBe('Why is 0 five dashes in Morse code?')
    expect(time!.answer).toContain('5 (five dots), takes 540 milliseconds')
    expect(time!.answer).toContain('0 (five dashes), takes 1140 milliseconds')
    expect(mirrors!.answer).toContain('1 into 6, 2 into 7, 3 into 8, 4 into 9 and 5 into 0')
    expect(mirrors!.answer).toContain('1 and 9, 2 and 8, 3 and 7, and 4 and 6')
    expect(mirrors!.answer).toContain('Only 0 and 5 read the same')
  })

  it('quote the speed FAQ from the engine', () => {
    const answers = faqFor('/morse-code-speed/').map((item) => item.answer)
    expect(answers[1]).toContain('takes exactly 3 seconds')
    expect(answers[2]).toContain('grows from 180 to 1601 milliseconds')
  })
})

describe('copy discipline', () => {
  const files = [
    './reference.ts',
    './TreePath.astro',
    './CharTile.astro',
    './CharacterStrip.astro',
    './SectionHead.astro',
    '../../pages/morse-code-alphabet/[char].astro',
    '../../pages/morse-code-numbers.astro',
    '../../pages/how-to-learn-morse-code.astro',
    '../../pages/morse-code-speed.astro',
  ]

  it.each(files)('types no Morse into %s', (file) => {
    const source = readFileSync(new URL(file, import.meta.url), 'utf8')
    // Template text is full of apostrophes, which the literal scanner reads as
    // quotes, so it only runs on TypeScript.
    if (file.endsWith('.ts')) expect(handTypedMorse(source)).toEqual([])
    // The brief's grep for [.-]{3,}, over the whole file: comments included.
    // Only an Astro frontmatter fence and a spread (`...rest`) are not Morse.
    const code = source.replace(/^---$/gm, '')
    expect(code.match(/[.-]{3,}(?![\w[({$])/g) ?? [], file).toEqual([])
  })
})
