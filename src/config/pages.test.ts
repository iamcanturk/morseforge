import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { CHARACTERS } from '../data/characters'
import { PAGE_FAQ } from '../data/faq'
import { WORDS } from '../data/words'
import { handTypedMorse } from '../seo/proseScan'
import { LANDING } from './landing'
import {
  DESCRIPTION_MAX,
  PAGES,
  TITLE_MAX,
  blogPage,
  breadcrumbTrail,
  characterPage,
  findPage,
  fitDescription,
  getPage,
  indexablePages,
  pageUrl,
  pagesInGroup,
  titleWithBrand,
  wordPage,
} from './pages'

const wordsIn = (text: string) => text.trim().split(/\s+/).length

describe('registry shape', () => {
  it('has a unique path per page, with a leading and trailing slash', () => {
    const paths = PAGES.map((page) => page.path)
    expect(new Set(paths).size).toBe(paths.length)
    for (const path of paths) expect(path, path).toMatch(/^\/(?:[a-z0-9-]+\/)*$/)
  })

  it('fills in every field of every page', () => {
    for (const page of PAGES) {
      for (const key of [
        'title',
        'description',
        'h1',
        'intro',
        'navLabel',
        'hint',
        'llmsSummary',
      ] as const) {
        expect(page[key].trim().length, `${page.path} ${key}`).toBeGreaterThan(0)
      }
    }
  })

  it('points every parent at a registered page and never loops', () => {
    for (const page of PAGES) {
      if (page.parent === null) continue
      expect(findPage(page.parent), `${page.path} parent`).toBeDefined()
      expect(page.parent).not.toBe(page.path)
    }
  })

  it('matches the files in src/pages one to one', () => {
    const root = new URL('../pages', import.meta.url).pathname
    const routes: string[] = []
    const walk = (dir: string, prefix: string) => {
      for (const entry of readdirSync(dir)) {
        const full = join(dir, entry)
        if (statSync(full).isDirectory()) {
          walk(full, `${prefix}${entry}/`)
          continue
        }
        // Endpoints (.ts) and dynamic routes ([slug]) have no single path.
        if (!entry.endsWith('.astro') || entry.includes('[')) continue
        const name = entry.replace(/\.astro$/, '')
        routes.push(name === 'index' ? `/${prefix}` : `/${prefix}${name}/`)
      }
    }
    walk(root, '')

    const registered = PAGES.map((page) => page.path)
    for (const route of routes) expect(registered, route).toContain(route)
    // Every registered page is served by a file: no orphan registry entries.
    const unserved = registered.filter((path) => !routes.includes(path))
    expect(unserved).toEqual([])
  })
})

describe('search-result limits, measured on the rendered strings', () => {
  it.each(PAGES.map((page) => [page.path, page] as const))(
    '%s fits a title of %s',
    (_path, page) => {
      expect(page.title.length, page.title).toBeLessThanOrEqual(TITLE_MAX)
    },
  )

  it.each(PAGES.map((page) => [page.path, page] as const))(
    '%s fits a description',
    (_path, page) => {
      expect(page.description.length, page.description).toBeLessThanOrEqual(DESCRIPTION_MAX)
    },
  )

  it('gives every indexable page a real description and a quotable intro', () => {
    for (const page of indexablePages()) {
      expect(page.description.length, page.path).toBeGreaterThanOrEqual(100)
      expect(wordsIn(page.intro), `${page.path} intro`).toBeGreaterThanOrEqual(30)
      expect(wordsIn(page.intro), `${page.path} intro`).toBeLessThanOrEqual(75)
    }
  })

  it('ends every title with the brand', () => {
    for (const page of PAGES) expect(page.title, page.path).toMatch(/MorseForge$/)
  })

  it('keeps navigation labels short enough for a menu', () => {
    for (const page of PAGES) {
      expect(page.navLabel.length, page.path).toBeLessThanOrEqual(24)
      expect(page.hint.length, page.path).toBeLessThanOrEqual(40)
    }
  })
})

describe('final copy with the bound values rendered', () => {
  it('matches the audit for the home page', () => {
    const home = getPage('/')
    expect(home.title).toBe('Learn Morse Code Online — Free Morse Trainer | MorseForge')
    expect(home.description).toBe(
      'Learn Morse code by sound in 7 days with a free online trainer: real CW audio, a keyboard telegraph key and daily drills. No account, no ads, offline.',
    )
    expect(home.h1).toBe('Learn Morse code by ear, not from a chart')
  })

  it('matches the audit for the 7-day plan', () => {
    const plan = getPage('/learn-morse-code-in-7-days/')
    expect(plan.title).toBe('Learn Morse Code in 7 Days — Free Daily Plan | MorseForge')
    expect(plan.description).toBe(
      'Learn all 26 letters and 10 digits of Morse code in 7 days, about 2 hours 15 minutes in total. Shortest codes first, with audio and drills for every day.',
    )
    expect(plan.intro).toContain(
      'takes about 2 hours 15 minutes of practice in total, spread over 7 days',
    )
  })

  it('matches the audit for the alphabet', () => {
    const alphabet = getPage('/morse-code-alphabet/')
    expect(alphabet.title).toBe('Morse Code Alphabet: A–Z, 0–9 Chart With Sound | MorseForge')
    expect(alphabet.description).toBe(
      'The Morse code alphabet per ITU-R M.1677-1: 26 letters, 10 numbers and punctuation. Press any character to hear it from 5 to 40 WPM. Free, no signup.',
    )
    expect(alphabet.intro).toContain(
      'has 26 letters between one and four elements long, 10 digits of exactly five elements, and 13 punctuation marks',
    )
  })

  it('matches the audit for the translator', () => {
    const translator = getPage('/morse-code-translator/')
    expect(translator.title).toBe('Morse Code Translator With Audio: Text to Morse | MorseForge')
    expect(translator.title.length).toBe(60)
    expect(translator.intro).toContain('at 5 to 40 words per minute')
  })

  it('binds the challenge and daily figures to their constants', () => {
    expect(getPage('/challenge/').title).toBe(
      'Morse Code Practice Test: 60-Second Challenge | MorseForge',
    )
    expect(getPage('/challenge/').h1).toBe('The 60-second Morse code test')
    expect(getPage('/daily/').description).toContain('8 lines at a set speed')
    expect(getPage('/daily/').intro).toContain('8 lines at a fixed speed')
  })

  it('counts the tree layers from the letters', () => {
    expect(getPage('/tree/').intro).toContain(
      'E and T are one step from the root, the 4 two-element letters two steps away, and the 12 four-element letters four.',
    )
  })

  it('counts the words from the data', () => {
    expect(getPage('/words/').description).toMatch(/^22 words and phrases/)
    expect(getPage('/words/').intro).toContain('These 22 words and phrases')
  })

  it('uses the ITU wording the owner approved on the alphabet page (DEC-012)', () => {
    const summary = getPage('/morse-code-alphabet/').llmsSummary
    expect(summary).toContain('13 punctuation marks from ITU-R M.1677-1')
    expect(summary).toContain('5 common marks it does not define')
  })

  it('names the two new routes from the sprint', () => {
    const message = getPage('/message/')
    expect(message.h1).toBe('Send a secret message in Morse code')
    expect(message.description).toContain('never reaches a server')
    expect(message.indexable).toBe(true)
    expect(getPage('/challenge/').description).toContain('60-second Morse code test')
  })

  it('only promises off switches for our own counter and GA, not the Cloudflare beacon', () => {
    const privacy = getPage('/privacy/')
    for (const text of [privacy.description, privacy.intro]) {
      expect(text).toContain('switch our own counter and')
      expect(text).toMatch(/and (GA|Google Analytics) off/)
      expect(text).not.toMatch(/switch the counting off|turn it off|each count/)
    }
  })

  it('keeps the examples named on the words page in WORDS', () => {
    const texts = WORDS.map((word) => word.text)
    for (const example of ['SOS', 'I LOVE YOU', 'CQ', '73']) expect(texts).toContain(example)
  })
})

describe('noindex pages (DEC-012)', () => {
  it('marks progress, settings, the 404 and the owner tools as not indexable', () => {
    const hidden = PAGES.filter((page) => !page.indexable).map((page) => page.path)
    expect(hidden.sort()).toEqual(['/404/', '/panel/', '/settings/', '/stats/', '/studio/'])
  })

  it('leaves the 404 and owner tools out of navigation groups', () => {
    expect(
      pagesInGroup('internal')
        .map((page) => page.path)
        .sort(),
    ).toEqual(['/404/', '/panel/', '/studio/'])
  })
})

describe('lookups', () => {
  it('finds, throws and builds URLs', () => {
    expect(findPage('/tree/')?.navLabel).toBe('The Morse tree')
    expect(findPage('/nope/')).toBeUndefined()
    expect(() => getPage('/nope/')).toThrow(/No page registered/)
    expect(pageUrl('/tree/')).toBe('https://morse.iamcanturk.dev/tree/')
  })

  it('lists the navigation groups in the order the header shows them', () => {
    expect(pagesInGroup('learn').map((page) => page.path)).toEqual([
      '/learn/',
      '/learn-morse-code-in-7-days/',
      '/tree/',
    ])
  })
})

describe('breadcrumbTrail', () => {
  it('has no trail for Home', () => {
    expect(breadcrumbTrail('/')).toEqual([])
  })

  it('goes Home to the page for a top-level page', () => {
    expect(breadcrumbTrail('/tree/')).toEqual([
      { name: 'Home', path: '/' },
      { name: 'The Morse tree', path: '/tree/' },
    ])
  })

  it('goes through the registered parent for a dynamic page', () => {
    expect(breadcrumbTrail('/words/sos/', { name: 'SOS', parent: '/words/' })).toEqual([
      { name: 'Home', path: '/' },
      { name: 'Words in Morse', path: '/words/' },
      { name: 'SOS', path: '/words/sos/' },
    ])
  })
})

describe('FAQ and landing wiring', () => {
  it('only has FAQs for registered pages', () => {
    for (const path of Object.keys(PAGE_FAQ)) expect(findPage(path), path).toBeDefined()
  })

  it('only links the landing page to registered pages', () => {
    const hrefs = [
      LANDING.hero.primaryCta.href,
      LANDING.hero.secondaryCta.href,
      LANDING.hero.tertiaryCta.href,
      ...LANDING.steps.items.map((step) => step.href),
      ...LANDING.tools.items.map((tool) => tool.href),
    ]
    for (const href of hrefs) expect(findPage(href), href).toBeDefined()
  })

  it('sends the llms.txt-bound Markdown paths to .md files', () => {
    for (const page of PAGES) {
      if (page.markdown !== null) expect(page.markdown, page.path).toMatch(/^\/[a-z0-9-]+\.md$/)
    }
  })
})

describe('titleWithBrand and fitDescription', () => {
  it('adds the brand while it fits and drops it when it would not', () => {
    expect(titleWithBrand('Short')).toBe('Short | MorseForge')
    const long = 'x'.repeat(50)
    expect(titleWithBrand(long)).toBe(long)
  })

  it('picks the fullest suffix that fits', () => {
    const base = 'b'.repeat(100)
    expect(fitDescription(base, ['x'.repeat(80), 'y'.repeat(40), 'z'])).toBe(base + 'y'.repeat(40))
    expect(fitDescription(base, ['x'.repeat(80)])).toBe(base)
  })
})

describe('wordPage', () => {
  it('fits every word page in a title and a description', () => {
    for (const word of WORDS) {
      const page = wordPage(word)
      expect(page.title.length, page.title).toBeLessThanOrEqual(TITLE_MAX)
      expect(page.description.length, page.description).toBeLessThanOrEqual(DESCRIPTION_MAX)
      expect(page.path).toBe(`/words/${word.slug}/`)
    }
  })

  it('matches the title lengths the audit predicted', () => {
    const length = (slug: string) =>
      wordPage(WORDS.find((word) => word.slug === slug)!).title.length
    expect(length('sos')).toBe(43)
    expect(length('mayday')).toBe(57)
    expect(length('73')).toBe(42)
    expect(length('good-morning')).toBe(58)
    expect(length('i-love-you')).toBe(56)
  })

  it('puts the code in the title first, and falls back for the longest entries', () => {
    const sos = wordPage(WORDS.find((word) => word.slug === 'sos')!)
    expect(sos.title).toBe('SOS in Morse Code: ... --- ... | MorseForge')
    const telegraph = wordPage(WORDS.find((word) => word.slug === 'telegraph')!)
    expect(telegraph.title).toBe('Telegraph in Morse Code — Hear It, Send It | MorseForge')
  })

  it('uses sentence case, never an all-caps title', () => {
    const page = wordPage(WORDS.find((word) => word.slug === 'i-love-you')!)
    expect(page.title.startsWith('I love you in Morse Code')).toBe(true)
    expect(page.h1).toBe('I love you in Morse code')
  })

  it('adds the longest description suffix that fits', () => {
    const sos = wordPage(WORDS.find((word) => word.slug === 'sos')!)
    expect(sos.description).toBe(
      'SOS in Morse code is "... --- ...". Hear it at your own speed, see the code for each of its 3 characters, and learn to send it yourself.',
    )
  })

  it('states the answer block from the computed facts', () => {
    const sos = wordPage(WORDS.find((word) => word.slug === 'sos')!)
    expect(sos.answer.detail).toBe(
      'It is 3 characters made of 6 dots and 3 dashes, and takes about 1.6 seconds to send at 20 words per minute.',
    )
    const love = wordPage(WORDS.find((word) => word.slug === 'i-love-you')!)
    expect(love.answer.detail).toContain('about 5.6 seconds')
  })
})

describe('blogPage', () => {
  const post = { slug: 'p', title: 'A title', description: 'd'.repeat(90) }

  it('keeps the author H1 and adds the brand when it fits', () => {
    expect(blogPage(post)).toMatchObject({
      path: '/blog/p/',
      title: 'A title | MorseForge',
      h1: 'A title',
      parent: '/blog/',
    })
  })

  it('prefers the seoTitle for the <title>', () => {
    const page = blogPage({ ...post, seoTitle: 'What Does SOS Stand For? Nothing — Here Is Why' })
    expect(page.title).toBe('What Does SOS Stand For? Nothing — Here Is Why | MorseForge')
    expect(page.title.length).toBe(59)
    expect(page.h1).toBe('A title')
  })

  it('drops the brand rather than overflow', () => {
    const long = 'w'.repeat(55)
    expect(blogPage({ ...post, seoTitle: long }).title).toBe(long)
  })
})

describe('characterPage', () => {
  it('fits every character in a title and a description', () => {
    for (const facts of Object.values(CHARACTERS)) {
      const page = characterPage(facts)
      expect(page.title.length, page.title).toBeLessThanOrEqual(TITLE_MAX)
      expect(page.description.length, page.description).toBeLessThanOrEqual(DESCRIPTION_MAX)
    }
  })

  it('follows the audit template for A', () => {
    const page = characterPage(CHARACTERS['A']!)
    expect(page.path).toBe('/morse-code-alphabet/a/')
    expect(page.title).toBe('A in Morse Code: .- (di-dah) With Sound | MorseForge')
    expect(page.description).toBe(
      'The letter A in Morse code is .- (dot dash, "di-dah"). Hear it, see where it sits in the Morse tree, what it is confused with, and how to send it.',
    )
  })

  it('drops the spoken form from the title when a digit would overflow', () => {
    expect(characterPage(CHARACTERS['0']!).title).toBe(
      '0 in Morse Code: ----- With Sound | MorseForge',
    )
  })
})

describe('copy discipline', () => {
  it('never types Morse into pages.ts', () => {
    const source = readFileSync(new URL('./pages.ts', import.meta.url), 'utf8')
    expect(handTypedMorse(source)).toEqual([])
  })
})
