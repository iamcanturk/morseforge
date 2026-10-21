import { existsSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FACTS } from '../config/facts'
import { PAGES, getPage, wordPage } from '../config/pages'
import { CITATIONS } from '../config/site'
import { CHARACTERS } from '../data/characters'
import { CURRICULUM } from '../data/curriculum'
import { faqFor, wordFaq } from '../data/faq'
import {
  ALL_DIGITS,
  ALL_LETTERS,
  ITU_PUNCTUATION,
  NON_ITU_PUNCTUATION,
  PROSIGNS,
  PROSIGN_MEANINGS,
} from '../data/morseAlphabet'
import { WORDS, morseFor } from '../data/words'
import {
  alphabetMarkdown,
  cell,
  faqSection,
  linkAnswer,
  markdownDocument,
  markdownPathFor,
  markdownResponse,
  planMarkdown,
  quotable,
  table,
  wordMarkdown,
  wordMarkdownPath,
} from './markdown'
import { handTypedMorse } from './proseScan'

const PAGES_DIR = new URL('../pages/', import.meta.url)

/** `/morse-code-alphabet.md` → `src/pages/morse-code-alphabet.md.ts`. */
const endpointFor = (path: string) => new URL(`.${path}.ts`, PAGES_DIR)

/** Nothing a template slip would leave behind. */
const BROKEN = /\bundefined\b|\bNaN\b|\bnull\b|\[object Object\]/

const ALPHABET = alphabetMarkdown()
const PLAN = planMarkdown()

describe('markdownPathFor', () => {
  it('returns the registry path for a page that declares one', () => {
    expect(markdownPathFor('/morse-code-alphabet/')).toBe('/morse-code-alphabet.md')
    expect(markdownPathFor('/learn-morse-code-in-7-days/')).toBe('/learn-morse-code-in-7-days.md')
  })

  it('returns null for a registered page without one', () => {
    expect(markdownPathFor('/practice/')).toBeNull()
    expect(markdownPathFor('/')).toBeNull()
  })

  it('gives every word page its own alternate', () => {
    for (const word of WORDS) {
      expect(markdownPathFor(`/words/${word.slug}/`)).toBe(`/words/${word.slug}.md`)
    }
  })

  it('returns null for unknown words, blog posts and unregistered paths', () => {
    expect(markdownPathFor('/words/not-a-word/')).toBeNull()
    expect(markdownPathFor('/blog/what-farnsworth-timing-is/')).toBeNull()
    expect(markdownPathFor('/nowhere/')).toBeNull()
  })
})

describe('every declared alternate has an endpoint', () => {
  // A registry `markdown` path with no endpoint would put a dead
  // rel="alternate" link on the page and in llms.txt.
  it.each(PAGES.filter((page) => page.markdown !== null).map((page) => [page.path, page.markdown]))(
    '%s → %s',
    (_path, markdown) => {
      expect(existsSync(endpointFor(markdown!))).toBe(true)
    },
  )

  it('word alternates are served by words/[slug].md.ts', () => {
    expect(existsSync(new URL('./words/[slug].md.ts', PAGES_DIR))).toBe(true)
    expect(wordMarkdownPath('sos')).toBe('/words/sos.md')
  })
})

describe('building blocks', () => {
  it('escapes pipes and newlines in table cells', () => {
    expect(cell('a|b')).toBe('a\\|b')
    expect(cell('a\nb')).toBe('a b')
  })

  it('builds a table with a header separator', () => {
    const lines = table(['A', 'B'], [['1', '2']]).split('\n')
    expect(lines).toHaveLength(3)
    expect(lines[0]).toBe('| A | B |')
    expect(lines[1]).toMatch(/^\| -{3} \| -{3} \|$/)
    expect(lines[2]).toBe('| 1 | 2 |')
  })

  it('drops sentences that only make sense beside the controls', () => {
    expect(quotable('Morse is a code. Press any key below to hear it.')).toBe('Morse is a code.')
    expect(quotable('Tap here. Hold that. Keep this.')).toBe('Keep this.')
    expect(quotable('Nothing to drop here.')).toBe('Nothing to drop here.')
  })

  it('links the first occurrence of each declared phrase, absolutely', () => {
    const linked = linkAnswer({
      question: 'Q',
      answer: 'Read the plan, then the plan again.',
      links: [{ text: 'the plan', href: '/learn-morse-code-in-7-days/' }],
    })
    expect(linked).toBe(
      'Read [the plan](https://morse.iamcanturk.dev/learn-morse-code-in-7-days/), then the plan again.',
    )
  })

  it('leaves an answer alone when a declared phrase is missing', () => {
    expect(linkAnswer({ question: 'Q', answer: 'A.', links: [{ text: 'x', href: '/' }] })).toBe(
      'A.',
    )
  })

  it('renders no FAQ section for an empty list', () => {
    expect(faqSection([])).toBe('')
  })

  it('opens every document like the blog alternates do', () => {
    const doc = markdownDocument({
      title: 'Title',
      path: '/x/',
      answer: 'The answer.',
      sections: ['## One\n\nBody', '', '  '],
    })
    const lines = doc.split('\n')
    expect(lines[0]).toBe('# Title')
    expect(lines[2]).toBe('**The answer.**')
    expect(doc).toContain('*Source: https://morse.iamcanturk.dev/x/*')
    expect(doc).toMatch(/\n-{3}\n\n## One\n\nBody\n$/)
    expect(doc).not.toMatch(/\n{3}/)
  })

  it('serves text/markdown, inline', () => {
    const response = markdownResponse('# Hi\n')
    expect(response.headers.get('Content-Type')).toBe('text/markdown; charset=utf-8')
    expect(response.headers.get('Content-Disposition')).toBe('inline')
  })
})

describe('/morse-code-alphabet.md', () => {
  it('opens with the page H1 and its quotable intro', () => {
    const page = getPage('/morse-code-alphabet/')
    expect(ALPHABET.startsWith(`# ${page.h1}\n`)).toBe(true)
    expect(ALPHABET).toContain(`**${quotable(page.intro)}**`)
    expect(ALPHABET).not.toMatch(/Press any character/)
  })

  it('has a row with the ASCII code and spoken form for every letter and digit', () => {
    for (const character of [...ALL_LETTERS, ...ALL_DIGITS]) {
      const facts = CHARACTERS[character]!
      expect(ALPHABET).toContain(
        `| ${character} | \`${facts.code}\` | ${facts.spoken} | ${facts.elements} |`,
      )
    }
  })

  it('keeps the ITU and non-ITU punctuation in separate tables, in that order', () => {
    const itu = ALPHABET.indexOf(`## Punctuation in ${CITATIONS.itu.short}`)
    const extra = ALPHABET.indexOf(`## Common punctuation not in ${CITATIONS.itu.short}`)
    expect(itu).toBeGreaterThan(-1)
    expect(extra).toBeGreaterThan(itu)
    const ituBlock = ALPHABET.slice(itu, extra)
    const extraBlock = ALPHABET.slice(extra, ALPHABET.indexOf('## Prosigns'))
    for (const [mark, morse] of Object.entries(ITU_PUNCTUATION)) {
      expect(ituBlock).toContain(`| \`${mark}\` | ${CHARACTERS[mark]!.name} | \`${morse}\` |`)
    }
    for (const [mark, morse] of Object.entries(NON_ITU_PUNCTUATION)) {
      expect(extraBlock).toContain(`| \`${mark}\` | ${CHARACTERS[mark]!.name} | \`${morse}\` |`)
      expect(ituBlock).not.toContain(`\`${mark}\``)
    }
    expect(ituBlock).toContain(`these ${FACTS.ituPunctuationCount} marks`)
    expect(extraBlock).toContain(`These ${FACTS.nonItuPunctuationCount} marks`)
  })

  it('gives every prosign its meaning', () => {
    for (const name of Object.keys(PROSIGNS) as (keyof typeof PROSIGNS)[]) {
      expect(ALPHABET).toContain(`| ${name} | \`${PROSIGNS[name]}\` | ${PROSIGN_MEANINGS[name]} |`)
    }
  })

  it('cites the ITU recommendation by its URL', () => {
    expect(ALPHABET).toContain(CITATIONS.itu.url)
  })

  it('carries the page FAQ word for word', () => {
    for (const item of faqFor('/morse-code-alphabet/')) {
      expect(ALPHABET).toContain(`### ${item.question}`)
    }
  })

  it('has nothing a template slip would leave', () => {
    expect(ALPHABET).not.toMatch(BROKEN)
  })
})

describe('/learn-morse-code-in-7-days.md', () => {
  it('opens with the page H1', () => {
    expect(PLAN.startsWith(`# ${getPage('/learn-morse-code-in-7-days/').h1}\n`)).toBe(true)
  })

  it('has a section per day with its codes, drill and words', () => {
    for (const day of CURRICULUM) {
      expect(PLAN).toContain(`## Day ${day.day}: ${day.title}`)
      expect(PLAN).toContain(day.summary)
      expect(PLAN).toContain(day.drill)
      for (const character of day.characters) {
        expect(PLAN).toContain(`- ${character}: \`${CHARACTERS[character]!.code}\``)
      }
    }
  })

  it('states the computed total', () => {
    expect(PLAN).toContain(`${FACTS.planTime} over ${FACTS.planDays} days`)
  })

  it('carries the page FAQ', () => {
    const items = faqFor('/learn-morse-code-in-7-days/')
    expect(items.length).toBeGreaterThan(0)
    for (const item of items) expect(PLAN).toContain(`### ${item.question}`)
  })

  it('has nothing a template slip would leave', () => {
    expect(PLAN).not.toMatch(BROKEN)
  })
})

describe('/words/<slug>.md', () => {
  it.each(WORDS.map((word) => [word.slug, word]))('%s', (_slug, word) => {
    const doc = wordMarkdown(word)
    const meta = wordPage(word)
    expect(doc.startsWith(`# ${meta.h1}\n`)).toBe(true)
    expect(doc).toContain(`"${morseFor(word)}"`)
    expect(doc).toContain(word.note)
    expect(doc).toContain(`*Source: https://morse.iamcanturk.dev${meta.path}*`)
    for (const item of wordFaq(word)) expect(doc).toContain(`### ${item.question}`)
    expect(doc).not.toMatch(BROKEN)
  })
})

describe('the source', () => {
  it('types no Morse by hand', () => {
    const source = readFileSync(new URL('./markdown.ts', import.meta.url), 'utf8')
    expect(handTypedMorse(source)).toEqual([])
  })
})
