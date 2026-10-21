/**
 * The translator an Astro component uses: `const t = useTranslations(Astro)`.
 *
 * The language comes from the URL, so no prop has to be threaded through: the
 * same component renders English at `/tree/` and German at `/de/tree/`. Beyond
 * `t()` it reads the per-language registry, FAQs and landing copy, and builds
 * the message slice a React island needs.
 */

import {
  GROUP_LABELS,
  PAGES,
  breadcrumbTrail,
  getPage,
  pageUrl,
  type CharacterPageMeta,
  type Crumb,
  type PageEntry,
  type PageGroup,
  type WordPageMeta,
} from '../config/pages'
import type { LandingCopy } from '../config/landing'
import type { CharacterFacts } from '../data/characters'
import type { CurriculumDay } from '../data/curriculum'
import type { FaqItem } from '../data/faq'
import type { MorseWord } from '../data/words'
import { contentFor, messagesFor } from './catalogs'
import { ISLANDS, type Island, type IslandMessages } from './islands'
import type { MessageKey, Namespace } from './keys'
import { DEFAULT_LOCALE, getLocale, localeFromPath, localizePath, type LocaleDef } from './locales'
import type { Message } from './message'
import { createTranslator, type LocaleInfo, type Translator } from './translator'

/**
 * A registry entry in one language. `path` is where the page lives in that
 * language (`/de/tree/`); `key` is its registry path (`/tree/`), which is what
 * the FAQ, the breadcrumb and every other lookup take. In English they are the
 * same string.
 */
export interface LocalizedPage extends PageEntry {
  key: string
}

export interface ServerTranslator extends Translator {
  readonly def: LocaleDef
  readonly isDefault: boolean
  /** The registry entry for a path, in this language. Throws on an unknown path. */
  page(key: string): LocalizedPage
  /** Registry pages in a navigation group, in registry order, in this language. */
  pagesInGroup(group: PageGroup): LocalizedPage[]
  /** Every indexable page, in this language. */
  indexablePages(): LocalizedPage[]
  /** The group headings, in this language. */
  groupLabel(group: Exclude<PageGroup, 'home' | 'internal'>): string
  /** The breadcrumb for a registry path, names and links in this language. */
  trail(key: string, leaf?: { name: string; parent: string }): Crumb[]
  /** The FAQ for a registry path, or an empty list. */
  faq(key: string): readonly FaqItem[]
  readonly landing: LandingCopy
  /** The plan, day by day, in this language. */
  readonly curriculum: readonly CurriculumDay[]
  wordPage(word: MorseWord): WordPageMeta
  wordFaq(word: MorseWord): FaqItem[]
  characterPage(facts: CharacterFacts): CharacterPageMeta
  characterFaq(facts: CharacterFacts): FaqItem[]
  /** The absolute URL of a site path in this language. */
  url(path: string): string
  /** The message slice for a React island, from its namespace list. */
  island(name: Island): IslandMessages
}

const GROUP_KEYS = {
  learn: 'nav.groupLearn',
  practise: 'nav.groupPractise',
  lookup: 'nav.groupLookup',
} as const satisfies Record<keyof typeof GROUP_LABELS, MessageKey>

const cache = new Map<string, ServerTranslator>()

export function localeInfo(def: LocaleDef): LocaleInfo {
  return { code: def.code, path: def.path, lang: def.lang, dir: def.dir }
}

/** The translator for a language code. Cached: build-time pages share one per language. */
export function translatorFor(code: string = DEFAULT_LOCALE): ServerTranslator {
  const cached = cache.get(code)
  if (cached) return cached

  const def = getLocale(code)
  const isDefault = def.code === DEFAULT_LOCALE
  const messages = messagesFor(code)
  const content = contentFor(code)
  const base = createTranslator(localeInfo(def), messages)
  const href = (path: string) => localizePath(path, def)

  const page = (key: string): LocalizedPage => {
    const entry = getPage(key)
    const copy = content.pages[key]!
    return {
      ...entry,
      ...copy,
      key,
      path: href(entry.path),
      // The Markdown copies are English; another language's page points at none.
      markdown: isDefault ? entry.markdown : null,
    }
  }

  const all = () => PAGES.map((entry) => page(entry.path))

  const translator: ServerTranslator = Object.assign(base, {
    def,
    isDefault,
    page,
    pagesInGroup: (group: PageGroup) => all().filter((entry) => entry.group === group),
    indexablePages: () => all().filter((entry) => entry.indexable),
    groupLabel: (group: keyof typeof GROUP_KEYS) => base(GROUP_KEYS[group]),
    trail: (key: string, leaf?: { name: string; parent: string }): Crumb[] =>
      breadcrumbTrail(key, leaf).map((crumb, index, crumbs) => {
        const isLeaf = leaf !== undefined && index === crumbs.length - 1
        return {
          name: isLeaf ? crumb.name : page(crumb.path).navLabel,
          path: href(crumb.path),
        }
      }),
    faq: (key: string) => content.faq[key] ?? [],
    landing: content.landing,
    curriculum: content.curriculum,
    wordPage: (word: MorseWord) => {
      const meta = content.wordPage(word)
      return { ...meta, path: href(meta.path) }
    },
    wordFaq: content.wordFaq,
    characterPage: (facts: CharacterFacts) => {
      const meta = content.characterPage(facts)
      return { ...meta, path: href(meta.path) }
    },
    characterFaq: content.characterFaq,
    url: (path: string) => pageUrl(href(path)),
    island: (name: Island) => pickNamespaces(messages, ISLANDS[name], def),
  })

  cache.set(code, translator)
  return translator
}

function pickNamespaces(
  messages: Readonly<Record<MessageKey, Message>>,
  namespaces: readonly Namespace[],
  def: LocaleDef,
): IslandMessages {
  const wanted = new Set<string>(namespaces)
  const table: Record<string, Message> = {}
  for (const [key, message] of Object.entries(messages)) {
    if (wanted.has(key.slice(0, key.indexOf('.')))) table[key] = message
  }
  return { locale: localeInfo(def), messages: table }
}

/** The translator for the page being rendered, from its URL. */
export function useTranslations(astro: { url: URL }): ServerTranslator {
  return translatorFor(localeFromPath(astro.url.pathname).code)
}
