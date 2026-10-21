/**
 * Every language's catalog, and the fallback rule, in one place.
 *
 * Server-side only: this imports every catalog. Pages read it through
 * `server.ts`; React islands never import it, they get a resolved slice as a
 * prop (`islands.ts`).
 *
 * To add a language: write `src/i18n/locales/<code>.ts` exporting a
 * `LocaleCatalog`, register it in `CATALOGS` below, and give it an entry in
 * `locales.ts`. `docs/TRANSLATING.md` has the whole walk-through.
 */

import { UNTRANSLATED, type Untranslated } from './define'
import { EN_CONTENT } from './en/content'
import { EN_MESSAGES } from './en'
import { CURRICULUM } from '../data/curriculum'
import type { ContentCatalog, LocaleCatalog, PageCopy, ResolvedContent } from './catalog'
import { DEFAULT_LOCALE, PSEUDO_LOCALE, getLocale } from './locales'
import type { MessageKey } from './keys'
import type { Message } from './message'
import { pseudoString, pseudoValue } from './pseudo'

export const EN_CATALOG = {
  messages: EN_MESSAGES,
  content: EN_CONTENT,
} satisfies LocaleCatalog

/**
 * The pseudo-locale, generated from English rather than written. Interface
 * strings are accented and stretched; the registry's copy and the FAQs are
 * accented only, so their length limits and link phrases still hold.
 */
function pseudoCatalog(): LocaleCatalog {
  const messages: Record<string, Message> = {}
  for (const [key, message] of Object.entries(EN_MESSAGES) as [string, Message][]) {
    messages[key] =
      typeof message === 'string' ? pseudoString(message) : (pseudoValue(message) as Message)
  }
  const accent = <T>(value: T): T => pseudoValue(value, { accentOnly: true })
  const content: ContentCatalog = {
    pages: accent(EN_CONTENT.pages),
    faq: accent(EN_CONTENT.faq),
    landing: accent(EN_CONTENT.landing),
    curriculum: accent(EN_CONTENT.curriculum),
    wordPage: (word) => accent(EN_CONTENT.wordPage(word)),
    wordFaq: (word) => accent(EN_CONTENT.wordFaq(word)),
    characterPage: (facts) => accent(EN_CONTENT.characterPage(facts)),
    characterFaq: (facts) => accent(EN_CONTENT.characterFaq(facts)),
  }
  return { messages: messages as LocaleCatalog['messages'], content }
}

/** Every language with a catalog. A locale in `locales.ts` with no entry here fails a test. */
const CATALOGS: Readonly<Record<string, () => LocaleCatalog>> = {
  [DEFAULT_LOCALE]: () => EN_CATALOG,
  [PSEUDO_LOCALE]: pseudoCatalog,
}

export function hasCatalog(code: string): boolean {
  return code in CATALOGS
}

const built = new Map<string, LocaleCatalog>()

/** The catalog as written, untranslated markers and all. */
export function catalogFor(code: string): LocaleCatalog {
  let catalog = built.get(code)
  if (!catalog) {
    const make = CATALOGS[code]
    if (!make) throw new Error(`No catalog for "${code}". Register it in src/i18n/catalogs.ts.`)
    catalog = make()
    built.set(code, catalog)
  }
  return catalog
}

const isUntranslated = (value: unknown): value is Untranslated => value === UNTRANSLATED

const resolvedMessages = new Map<string, Readonly<Record<MessageKey, Message>>>()

/**
 * Every message in a language, with English wherever it is marked
 * untranslated. The number words are the one exception: English words in
 * another language's sentence would be wrong, so an untranslated list becomes
 * empty and the translator falls back to digits.
 */
export function messagesFor(code: string): Readonly<Record<MessageKey, Message>> {
  let resolved = resolvedMessages.get(code)
  if (resolved) return resolved
  const { messages } = catalogFor(code)
  const out: Record<string, Message> = {}
  for (const [key, english] of Object.entries(EN_MESSAGES) as [MessageKey, Message][]) {
    const value = (messages as Record<string, Message | Untranslated | undefined>)[key]
    if (value === undefined || isUntranslated(value)) {
      out[key] = key === 'format.numberWords' && code !== DEFAULT_LOCALE ? '' : english
    } else {
      out[key] = value
    }
  }
  resolved = out as Record<MessageKey, Message>
  resolvedMessages.set(code, resolved)
  return resolved
}

const resolvedContent = new Map<string, ResolvedContent>()

/** A language's content with English filled in wherever it is marked untranslated. */
export function contentFor(code: string): ResolvedContent {
  let resolved = resolvedContent.get(code)
  if (resolved) return resolved
  const { content } = catalogFor(code)
  const pick = <T>(value: T | Untranslated, english: T): T =>
    isUntranslated(value) ? english : value

  const pages: Record<string, PageCopy> = {}
  for (const [path, english] of Object.entries(EN_CONTENT.pages)) {
    pages[path] = pick((content.pages as Record<string, PageCopy | Untranslated>)[path]!, english)
  }
  const faq: Record<string, ContentCatalog['faq'][keyof ContentCatalog['faq']]> = {}
  for (const [path, english] of Object.entries(EN_CONTENT.faq)) {
    faq[path] = pick((content.faq as Record<string, typeof english | Untranslated>)[path]!, english)
  }
  resolved = {
    pages,
    faq: faq as ResolvedContent['faq'],
    landing: pick(content.landing, EN_CONTENT.landing),
    curriculum: CURRICULUM.map((day, index) => ({
      ...day,
      ...pick(content.curriculum[index] ?? UNTRANSLATED, EN_CONTENT.curriculum[index]!),
    })),
    wordPage: pick(content.wordPage, EN_CONTENT.wordPage),
    wordFaq: pick(content.wordFaq, EN_CONTENT.wordFaq),
    characterPage: pick(content.characterPage, EN_CONTENT.characterPage),
    characterFaq: pick(content.characterFaq, EN_CONTENT.characterFaq),
  }
  resolvedContent.set(code, resolved)
  return resolved
}

export interface Coverage {
  code: string
  /** Messages and content entries, translated and in total. */
  translated: number
  total: number
  /** What is still English, by key: `lesson.hint`, `pages./tree/`, `landing`. */
  untranslated: string[]
}

/**
 * How much of a language is done. The pseudo-locale counts as complete; it is
 * generated. `docs/TRANSLATING.md` shows how to print this for your language.
 */
export function coverage(code: string): Coverage {
  getLocale(code)
  const { messages, content } = catalogFor(code)
  const untranslated: string[] = []
  let total = 0
  for (const key of Object.keys(EN_MESSAGES)) {
    total += 1
    const value = (messages as Record<string, unknown>)[key]
    if (value === undefined || isUntranslated(value)) untranslated.push(key)
  }
  content.curriculum.forEach((day, index) => {
    total += 1
    if (isUntranslated(day)) untranslated.push(`curriculum.${index + 1}`)
  })
  for (const [group, table] of [
    ['pages', content.pages],
    ['faq', content.faq],
  ] as const) {
    for (const [path, value] of Object.entries(table)) {
      total += 1
      if (isUntranslated(value)) untranslated.push(`${group}.${path}`)
    }
  }
  for (const field of [
    'landing',
    'wordPage',
    'wordFaq',
    'characterPage',
    'characterFaq',
  ] as const) {
    total += 1
    if (isUntranslated(content[field])) untranslated.push(field)
  }
  return { code, translated: total - untranslated.length, total, untranslated }
}
