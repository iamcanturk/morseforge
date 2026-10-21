/**
 * schema.org JSON-LD builders.
 *
 * Every page used to build its own object literal in its frontmatter, which is
 * how the 7-day Course ended up with a `provider` that was a WebApplication (not
 * a valid provider type), how word pages shipped a BreadcrumbList that did not
 * match the visible crumb, and how three pages ended up with an Article that had
 * no dates. These builders take the same data the page renders, so the markup
 * and the visible content cannot disagree, and each returns a plain object the
 * layout serialises.
 *
 * The identity graph (Person `#author`, WebSite `#website`, WebApplication
 * `#app`) is declared once in `BaseLayout`; everything here points at it by
 * `@id` instead of repeating it.
 */

import { AUTHOR, CITATIONS, MORSE_CODE_ABOUT, SITE } from '../config/site'
import type { Crumb } from '../config/pages'
import type { CharacterFacts } from '../data/characters'
import type { CurriculumDay } from '../data/curriculum'
import type { FaqItem } from '../data/faq'

export type JsonLd = { readonly '@type': string } & Readonly<Record<string, unknown>>

const CONTEXT = 'https://schema.org'

/** The `@id`s of the site-wide graph that `BaseLayout` emits. */
export const IDS = {
  website: `${SITE.url}/#website`,
  app: `${SITE.url}/#app`,
  author: `${SITE.url}/#author`,
} as const

/** An absolute URL for a site path. */
export function absoluteUrl(path: string): string {
  return new URL(path, SITE.url).href
}

/** `YYYY-MM-DD` for a date or date string; schema.org accepts the short form. */
export function isoDate(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError(`Not a date: ${String(value)}`)
  return date.toISOString().slice(0, 10)
}

/** An ISO 8601 duration for whole minutes: 135 becomes `PT135M`. */
export function isoMinutes(minutes: number): string {
  return `PT${minutes}M`
}

/** The author as a full Person, for the places a validator wants a type and not just an `@id`. */
const AUTHOR_PERSON = {
  '@type': 'Person',
  '@id': IDS.author,
  name: AUTHOR.name,
  url: AUTHOR.url,
} as const

const ITU_WORK = {
  '@type': 'CreativeWork',
  name: CITATIONS.itu.name,
  url: CITATIONS.itu.url,
  publisher: { '@type': 'Organization', name: CITATIONS.itu.publisher },
} as const

/** A BreadcrumbList for a trail from `breadcrumbTrail()`. Position starts at 1. */
export function breadcrumbs(trail: readonly Crumb[]): JsonLd {
  if (trail.length === 0) throw new RangeError('A breadcrumb needs at least one item')
  return {
    '@context': CONTEXT,
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((crumb, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: crumb.name,
      item: absoluteUrl(crumb.path),
    })),
  }
}

/** A FAQPage from the same items the page shows. */
export function faqPage(items: readonly FaqItem[]): JsonLd {
  if (items.length === 0) throw new RangeError('A FAQPage needs at least one question')
  return {
    '@context': CONTEXT,
    '@type': 'FAQPage',
    mainEntity: items.map((item) => ({
      '@type': 'Question',
      name: item.question,
      acceptedAnswer: { '@type': 'Answer', text: item.answer },
    })),
  }
}

export interface WebPageInput {
  path: string
  name: string
  description: string
  /** `CollectionPage` for an index, `AboutPage`, etc. Defaults to `WebPage`. */
  type?: 'WebPage' | 'CollectionPage' | 'AboutPage' | 'ProfilePage'
  /** The main thing the page is, by `@id`: the app, a defined term set. */
  mainEntityId?: string
  /** Say the page is about Morse code (default), or leave `about` off. */
  aboutMorse?: boolean
  datePublished?: Date | string
  dateModified?: Date | string
}

/** The generic page node: ties a page to the site and to the Morse code entity. */
export function webPage(input: WebPageInput): JsonLd {
  const url = absoluteUrl(input.path)
  return {
    '@context': CONTEXT,
    '@type': input.type ?? 'WebPage',
    '@id': `${url}#webpage`,
    url,
    name: input.name,
    description: input.description,
    inLanguage: SITE.locale,
    isPartOf: { '@id': IDS.website },
    ...(input.aboutMorse === false ? {} : { about: MORSE_CODE_ABOUT }),
    ...(input.mainEntityId ? { mainEntity: { '@id': input.mainEntityId } } : {}),
    ...(input.datePublished ? { datePublished: isoDate(input.datePublished) } : {}),
    ...(input.dateModified ? { dateModified: isoDate(input.dateModified) } : {}),
  }
}

export interface TermInput {
  name: string
  /** The code, in ASCII. */
  termCode: string
  description: string
  /** The character's own page, once it exists. */
  url?: string
}

export interface DefinedTermSetInput {
  path: string
  name: string
  description: string
  terms: readonly TermInput[]
}

/** `@id` of the term set a page defines, so a character page can point back at it. */
export function termSetId(path: string): string {
  return `${absoluteUrl(path)}#set`
}

/** One DefinedTerm, optionally standing alone on its own page. */
export function definedTerm(term: TermInput, setPath: string): JsonLd {
  return {
    '@context': CONTEXT,
    '@type': 'DefinedTerm',
    name: term.name,
    termCode: term.termCode,
    description: term.description,
    inDefinedTermSet: { '@id': termSetId(setPath) },
    ...(term.url ? { url: term.url } : {}),
  }
}

/**
 * A DefinedTermSet with one DefinedTerm per entry, citing the ITU
 * recommendation. The alphabet page passes every character it shows.
 */
export function definedTermSet(input: DefinedTermSetInput): JsonLd {
  const { terms, ...rest } = input
  const url = absoluteUrl(rest.path)
  return {
    '@context': CONTEXT,
    '@type': 'DefinedTermSet',
    '@id': termSetId(rest.path),
    url,
    name: rest.name,
    description: rest.description,
    inLanguage: SITE.locale,
    citation: ITU_WORK,
    hasDefinedTerm: terms.map((term) => {
      const { '@context': _context, ...node } = definedTerm(term, rest.path)
      return node
    }),
  }
}

/**
 * Character facts as terms. `linked` adds each character's own page URL, which
 * should only be on once those pages exist, because a URL that 404s in a
 * structured-data block is worse than none.
 */
export function characterTerms(
  characters: readonly CharacterFacts[],
  options: { linked?: boolean } = {},
): TermInput[] {
  return characters.map((facts) => ({
    name: facts.character,
    termCode: facts.code,
    description: `${facts.character} in Morse code: ${facts.code} (${facts.spoken})`,
    ...(options.linked ? { url: absoluteUrl(`/morse-code-alphabet/${facts.slug}/`) } : {}),
  }))
}

export interface CourseInput {
  path: string
  name: string
  description: string
  days: readonly CurriculumDay[]
  /** What the course teaches, as running text. */
  teaches: string
}

/**
 * A free Course taught by the author.
 *
 * `provider` is a Person with its type spelled out, not a bare `@id`: the
 * previous version pointed it at the WebApplication, which Google's Course
 * feature rejects because a provider has to be a Person or an Organization.
 */
export function course(input: CourseInput): JsonLd {
  const total = input.days.reduce((sum, day) => sum + day.minutes, 0)
  const url = absoluteUrl(input.path)
  return {
    '@context': CONTEXT,
    '@type': 'Course',
    '@id': `${url}#course`,
    name: input.name,
    description: input.description,
    url,
    provider: AUTHOR_PERSON,
    author: { '@id': IDS.author },
    isAccessibleForFree: true,
    offers: { '@type': 'Offer', category: 'Free', price: 0, priceCurrency: 'USD' },
    inLanguage: SITE.locale,
    educationalLevel: 'Beginner',
    teaches: input.teaches,
    about: MORSE_CODE_ABOUT,
    timeRequired: isoMinutes(total),
    hasCourseInstance: {
      '@type': 'CourseInstance',
      courseMode: 'online',
      courseWorkload: isoMinutes(total),
    },
    syllabusSections: input.days.map((day) => ({
      '@type': 'Syllabus',
      name: `Day ${day.day}: ${day.title}`,
      description: day.summary,
      timeRequired: isoMinutes(day.minutes),
    })),
  }
}

/** A HowTo with one step per curriculum day, for answer engines. */
export function howTo(input: Omit<CourseInput, 'teaches'>): JsonLd {
  const total = input.days.reduce((sum, day) => sum + day.minutes, 0)
  const url = absoluteUrl(input.path)
  return {
    '@context': CONTEXT,
    '@type': 'HowTo',
    name: input.name,
    description: input.description,
    totalTime: isoMinutes(total),
    step: input.days.map((day) => ({
      '@type': 'HowToStep',
      position: day.day,
      name: `Day ${day.day}: ${day.title}`,
      text: day.summary,
      url: `${url}#day-${day.day}`,
    })),
  }
}

export interface ArticleInput {
  path: string
  headline: string
  description: string
  /** `BlogPosting` for the notes, `Article` for reference pages. */
  type?: 'Article' | 'BlogPosting'
  datePublished: Date | string
  /** Omit when the page has not changed since it was published. */
  dateModified?: Date | string
  /** Absolute URLs of the images that represent it, widest first. */
  images?: readonly string[]
  wordCount?: number
  /** Whether it cites the ITU recommendation and/or the ARRL paper. */
  cites?: readonly ('itu' | 'arrl')[]
  /** Path of the Markdown alternate, if there is one. */
  markdownPath?: string
  /**
   * Set when the page also emits a `webPage()` node, so the article points at
   * that node (`#webpage`) instead of declaring a second WebPage for one URL.
   */
  hasWebPage?: boolean
}

/** An Article or BlogPosting that always carries its dates. */
export function article(input: ArticleInput): JsonLd {
  const url = absoluteUrl(input.path)
  const citations = (input.cites ?? []).map((key) => ({
    '@type': 'CreativeWork',
    name: CITATIONS[key].name,
    url: CITATIONS[key].url,
    publisher: { '@type': 'Organization', name: CITATIONS[key].publisher },
  }))
  return {
    '@context': CONTEXT,
    '@type': input.type ?? 'Article',
    '@id': `${url}#article`,
    headline: input.headline,
    description: input.description,
    url,
    mainEntityOfPage: input.hasWebPage
      ? { '@id': `${url}#webpage` }
      : { '@type': 'WebPage', '@id': url },
    author: { '@id': IDS.author },
    publisher: { '@id': IDS.author },
    isPartOf: { '@id': IDS.website },
    inLanguage: SITE.locale,
    about: MORSE_CODE_ABOUT,
    datePublished: isoDate(input.datePublished),
    dateModified: isoDate(input.dateModified ?? input.datePublished),
    ...(input.images && input.images.length > 0 ? { image: [...input.images] } : {}),
    ...(input.wordCount ? { wordCount: input.wordCount } : {}),
    ...(citations.length > 0 ? { citation: citations } : {}),
    ...(input.markdownPath
      ? {
          encoding: {
            '@type': 'MediaObject',
            encodingFormat: 'text/markdown',
            contentUrl: absoluteUrl(input.markdownPath),
          },
        }
      : {}),
  }
}
