import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { breadcrumbTrail } from '../config/pages'
import { CHARACTERS, PAGE_CHARACTERS } from '../data/characters'
import { CURRICULUM, CURRICULUM_TOTAL_MINUTES } from '../data/curriculum'
import { faqFor } from '../data/faq'
import { handTypedMorse } from './proseScan'
import {
  IDS,
  absoluteUrl,
  article,
  breadcrumbs,
  characterTerms,
  course,
  definedTerm,
  definedTermSet,
  faqPage,
  howTo,
  isoDate,
  isoMinutes,
  termSetId,
  webPage,
} from './schema'

/** Every value in a JSON-LD tree, keyed by path, for the URL checks. */
function walk(value: unknown, path = '$'): [string, unknown][] {
  if (Array.isArray(value)) return value.flatMap((item, i) => walk(item, `${path}[${i}]`))
  if (value && typeof value === 'object') {
    return Object.entries(value).flatMap(([key, child]) => walk(child, `${path}.${key}`))
  }
  return [[path, value]]
}

const all = {
  breadcrumbs: breadcrumbs(breadcrumbTrail('/tree/')),
  faq: faqPage(faqFor('/')),
  webPage: webPage({ path: '/tree/', name: 'Tree', description: 'd' }),
  course: course({
    path: '/learn-morse-code-in-7-days/',
    name: 'Learn Morse Code in 7 Days',
    description: 'd',
    days: CURRICULUM,
    teaches: 'International Morse code',
  }),
  article: article({
    path: '/blog/p/',
    headline: 'h',
    description: 'd',
    datePublished: '2026-08-23',
  }),
}

describe('every builder', () => {
  it('serialises to JSON and back unchanged', () => {
    for (const [name, node] of Object.entries(all)) {
      expect(JSON.parse(JSON.stringify(node)), name).toEqual(node)
    }
  })

  it('declares the schema.org context and a type', () => {
    for (const [name, node] of Object.entries(all)) {
      expect(node['@context'], name).toBe('https://schema.org')
      expect(typeof node['@type'], name).toBe('string')
    }
  })

  it('uses absolute https URLs, and a trailing slash on page URLs', () => {
    for (const [name, node] of Object.entries(all)) {
      for (const [path, value] of walk(node)) {
        const field = path.replace(/\[\d+\]/g, '')
        if (typeof value !== 'string' || !/\.(url|item|@id)$/.test(field)) continue
        expect(value, `${name} ${path}`).toMatch(/^https:\/\//)
        // Page URLs end in a slash; file URLs and fragments do not have to.
        if (field.endsWith('.item')) expect(value, `${name} ${path}`).toMatch(/\/$/)
      }
    }
    expect(absoluteUrl('/tree/')).toBe('https://morse.iamcanturk.dev/tree/')
  })
})

describe('breadcrumbs', () => {
  it('numbers the trail from one and links every crumb', () => {
    const node = breadcrumbs(breadcrumbTrail('/words/sos/', { name: 'SOS', parent: '/words/' }))
    expect(node['@type']).toBe('BreadcrumbList')
    expect(node['itemListElement']).toEqual([
      { '@type': 'ListItem', position: 1, name: 'Home', item: 'https://morse.iamcanturk.dev/' },
      {
        '@type': 'ListItem',
        position: 2,
        name: 'Words in Morse',
        item: 'https://morse.iamcanturk.dev/words/',
      },
      {
        '@type': 'ListItem',
        position: 3,
        name: 'SOS',
        item: 'https://morse.iamcanturk.dev/words/sos/',
      },
    ])
  })

  it('refuses an empty trail, which is what Home has', () => {
    expect(() => breadcrumbs(breadcrumbTrail('/'))).toThrow(RangeError)
  })
})

describe('faqPage', () => {
  it('turns the visible items into questions with accepted answers', () => {
    const items = faqFor('/')
    const node = faqPage(items)
    const entities = node['mainEntity'] as { name: string; acceptedAnswer: { text: string } }[]
    expect(entities).toHaveLength(5)
    expect(entities.map((entity) => entity.name)).toEqual(items.map((item) => item.question))
    expect(entities.map((entity) => entity.acceptedAnswer.text)).toEqual(
      items.map((item) => item.answer),
    )
  })

  it('refuses an empty list, which would be a FAQPage with nothing on the page', () => {
    expect(() => faqPage([])).toThrow(RangeError)
  })
})

describe('webPage', () => {
  it('belongs to the site and is about Morse code', () => {
    expect(all.webPage).toMatchObject({
      '@type': 'WebPage',
      '@id': 'https://morse.iamcanturk.dev/tree/#webpage',
      isPartOf: { '@id': IDS.website },
      about: {
        '@type': 'Thing',
        name: 'Morse code',
        sameAs: expect.arrayContaining(['https://www.wikidata.org/wiki/Q79897']),
      },
    })
  })

  it('can point at its main entity, change type, carry dates, or drop `about`', () => {
    const node = webPage({
      path: '/morse-code-alphabet/',
      name: 'Alphabet',
      description: 'd',
      type: 'CollectionPage',
      mainEntityId: termSetId('/morse-code-alphabet/'),
      datePublished: new Date('2026-08-23T10:00:00Z'),
      dateModified: '2026-10-21',
      aboutMorse: false,
    })
    expect(node['@type']).toBe('CollectionPage')
    expect(node['mainEntity']).toEqual({
      '@id': 'https://morse.iamcanturk.dev/morse-code-alphabet/#set',
    })
    expect(node['datePublished']).toBe('2026-08-23')
    expect(node['dateModified']).toBe('2026-10-21')
    expect(node).not.toHaveProperty('about')
  })
})

describe('course', () => {
  it('names a Person as the provider, not the WebApplication', () => {
    const provider = all.course['provider'] as { '@type': string; '@id': string; name: string }
    expect(provider['@type']).toBe('Person')
    expect(['Person', 'Organization']).toContain(provider['@type'])
    expect(provider['@id']).toBe(IDS.author)
    expect(provider['@id']).not.toBe(IDS.app)
    expect(provider.name).toBe('Can Türk')
  })

  it('is free, with a price of zero', () => {
    expect(all.course['isAccessibleForFree']).toBe(true)
    expect(all.course['offers']).toEqual({
      '@type': 'Offer',
      category: 'Free',
      price: 0,
      priceCurrency: 'USD',
    })
  })

  it('totals the workload from the days, not from a typed number', () => {
    expect(all.course['timeRequired']).toBe(isoMinutes(CURRICULUM_TOTAL_MINUTES))
    expect(all.course['timeRequired']).toBe('PT135M')
    expect(all.course['hasCourseInstance']).toMatchObject({ courseWorkload: 'PT135M' })
  })

  it('has one syllabus section per day, with that day’s time', () => {
    const sections = all.course['syllabusSections'] as { name: string; timeRequired: string }[]
    expect(sections).toHaveLength(CURRICULUM.length)
    expect(sections[4]).toMatchObject({
      name: 'Day 5: The four-element characters, part one',
      timeRequired: 'PT25M',
    })
  })
})

describe('howTo', () => {
  it('has a step per day, linked to its anchor', () => {
    const node = howTo({
      path: '/learn-morse-code-in-7-days/',
      name: 'How to learn Morse code in 7 days',
      description: 'd',
      days: CURRICULUM,
    })
    const steps = node['step'] as { position: number; url: string }[]
    expect(steps).toHaveLength(7)
    expect(steps[0]).toMatchObject({
      position: 1,
      url: 'https://morse.iamcanturk.dev/learn-morse-code-in-7-days/#day-1',
    })
    expect(node['totalTime']).toBe('PT135M')
  })
})

describe('definedTermSet', () => {
  const alphabetPath = '/morse-code-alphabet/'
  const facts = Object.values(CHARACTERS)
  const set = definedTermSet({
    path: alphabetPath,
    name: 'International Morse code',
    description: 'd',
    terms: characterTerms(facts),
  })
  const terms = set['hasDefinedTerm'] as {
    name: string
    termCode: string
    description: string
  }[]

  it('has one term for every character in the data', () => {
    expect(terms).toHaveLength(facts.length)
    expect(terms.map((term) => term.name).sort()).toEqual(facts.map((f) => f.character).sort())
  })

  it('carries the ASCII code and a description with the spoken form', () => {
    const a = terms.find((term) => term.name === 'A')!
    expect(a.termCode).toBe(CHARACTERS['A']!.code)
    expect(a.description).toBe(`A in Morse code: ${CHARACTERS['A']!.code} (di-dah)`)
  })

  it('cites ITU-R M.1677-1 and has a stable @id', () => {
    expect(set['@id']).toBe(termSetId(alphabetPath))
    expect(set['citation']).toMatchObject({
      '@type': 'CreativeWork',
      url: 'https://www.itu.int/rec/R-REC-M.1677-1-200910-I/en',
    })
  })

  it('points each term back at the set it belongs to', () => {
    for (const term of set['hasDefinedTerm'] as { inDefinedTermSet: unknown }[]) {
      expect(term.inDefinedTermSet).toEqual({ '@id': termSetId(alphabetPath) })
    }
  })

  it('adds character page URLs only when asked, because they must exist', () => {
    const plain = characterTerms([CHARACTERS['A']!])[0]!
    expect(plain.url).toBeUndefined()
    const linked = characterTerms([CHARACTERS['A']!], { linked: true })[0]!
    expect(linked.url).toBe('https://morse.iamcanturk.dev/morse-code-alphabet/a/')
    expect(PAGE_CHARACTERS).toHaveLength(36)
  })

  it('can stand alone as a single DefinedTerm', () => {
    const node = definedTerm(characterTerms([CHARACTERS['A']!], { linked: true })[0]!, alphabetPath)
    expect(node['@type']).toBe('DefinedTerm')
    expect(node['inDefinedTermSet']).toEqual({ '@id': termSetId(alphabetPath) })
  })
})

describe('article', () => {
  it('always carries both dates, defaulting the modified date to the published one', () => {
    expect(all.article['datePublished']).toBe('2026-08-23')
    expect(all.article['dateModified']).toBe('2026-08-23')
  })

  it("points at the page's own WebPage node when the page emits one", () => {
    const url = 'https://morse.iamcanturk.dev/morse-code-speed/'
    const linked = article({
      path: '/morse-code-speed/',
      headline: 'h',
      description: 'd',
      datePublished: '2026-10-21',
      hasWebPage: true,
    })
    expect(linked['mainEntityOfPage']).toEqual({
      '@id': webPage({ path: '/morse-code-speed/', name: 'h', description: 'd' })['@id'],
    })
    expect(linked['mainEntityOfPage']).toEqual({ '@id': `${url}#webpage` })
    // A blog post has no separate WebPage node, so it still declares one.
    expect(all.article['mainEntityOfPage']).toMatchObject({ '@type': 'WebPage' })
  })

  it('is a BlogPosting when asked, with the update date, images, words and citations', () => {
    const node = article({
      path: '/blog/what-farnsworth-timing-is/',
      headline: 'Farnsworth timing',
      description: 'd',
      type: 'BlogPosting',
      datePublished: '2026-08-23',
      dateModified: '2026-10-21',
      images: ['https://morse.iamcanturk.dev/og/default.png'],
      wordCount: 700,
      cites: ['arrl'],
      markdownPath: '/blog/what-farnsworth-timing-is.md',
    })
    expect(node['@type']).toBe('BlogPosting')
    expect(node['dateModified']).toBe('2026-10-21')
    expect(node['image']).toEqual(['https://morse.iamcanturk.dev/og/default.png'])
    expect(node['wordCount']).toBe(700)
    expect(node['citation']).toEqual([
      {
        '@type': 'CreativeWork',
        name: 'A Standard for Morse Timing Using the Farnsworth Technique',
        url: 'https://www.arrl.org/files/file/Technology/x9004008.pdf',
        publisher: { '@type': 'Organization', name: 'American Radio Relay League' },
      },
    ])
    expect(node['encoding']).toMatchObject({
      encodingFormat: 'text/markdown',
      contentUrl: 'https://morse.iamcanturk.dev/blog/what-farnsworth-timing-is.md',
    })
  })

  it('leaves out what it was not given', () => {
    for (const key of ['image', 'wordCount', 'citation', 'encoding']) {
      expect(all.article).not.toHaveProperty(key)
    }
  })
})

describe('isoDate', () => {
  it('formats dates and date strings, and rejects nonsense', () => {
    expect(isoDate(new Date('2026-10-21T23:59:00Z'))).toBe('2026-10-21')
    expect(isoDate('2026-08-23')).toBe('2026-08-23')
    expect(() => isoDate('not a date')).toThrow(RangeError)
  })
})

describe('copy discipline', () => {
  it('never types Morse into schema.ts', () => {
    const source = readFileSync(new URL('./schema.ts', import.meta.url), 'utf8')
    expect(handTypedMorse(source)).toEqual([])
  })
})
