/**
 * The i18n plumbing, end to end, without a translated language.
 *
 * - Every catalog lists every English key, with the same placeholders and tags.
 * - The pseudo-locale renders every message and every page's copy, and keeps
 *   the registry's length limits.
 * - With English as the only enabled language, the build has exactly the URLs
 *   it had before: no translated route, no hreflang, no sitemap alternates.
 * - Extracted components keep no English in their JSX text nodes.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { DESCRIPTION_MAX, PAGES, TITLE_MAX } from '../config/pages'
import { PAGE_FAQ } from '../data/faq'
import { alternateLocales, hreflangLinks, sitemapI18n } from './alternates'
import { EN_CATALOG, catalogFor, contentFor, coverage, hasCatalog, messagesFor } from './catalogs'
import { UNTRANSLATED } from './define'
import { EN_MESSAGES } from './en'
import { ISLANDS } from './islands'
import {
  DEFAULT,
  LOCALES,
  PSEUDO_LOCALE,
  getLocale,
  localeFromPath,
  localizePath,
  publishedLocales,
  routedLocales,
  stripLocale,
  type LocaleDef,
} from './locales'
import { formatMessage, isPlural, placeholdersOf, type Message } from './message'
import { pseudoString } from './pseudo'
import { parseRich, richTags, richText } from './rich'
import { localizablePages, localizedRoutes } from './routes'
import { translatorFor } from './server'
import { createTranslator } from './translator'
import { inSitemap } from '../seo/sitemap'
import { handTypedMorse } from '../seo/proseScan'

const keys = Object.keys(EN_MESSAGES)
const SRC = new URL('..', import.meta.url).pathname

describe('locales', () => {
  it('has a catalog for every locale it declares', () => {
    for (const locale of LOCALES) expect(hasCatalog(locale.code), locale.code).toBe(true)
  })

  it('publishes only English today', () => {
    expect(publishedLocales().map((l) => l.code)).toEqual(['en'])
  })

  it('routes the pseudo-locale under astro dev and never in a build', () => {
    expect(routedLocales({ dev: false }).map((l) => l.code)).toEqual(['en'])
    expect(routedLocales({ dev: true }).map((l) => l.code)).toContain(PSEUDO_LOCALE)
  })

  it('keeps English unprefixed and prefixes the rest', () => {
    const pseudo = getLocale(PSEUDO_LOCALE)
    expect(localizePath('/tree/', DEFAULT)).toBe('/tree/')
    expect(localizePath('/tree/', pseudo)).toBe('/en-xa/tree/')
    expect(localizePath('/', pseudo)).toBe('/en-xa/')
    expect(localizePath('/settings/#signal', pseudo)).toBe('/en-xa/settings/#signal')
    // Never translated: the articles, files, anchors and other sites.
    expect(localizePath('/blog/what-farnsworth-timing-is/', pseudo)).toBe(
      '/blog/what-farnsworth-timing-is/',
    )
    expect(localizePath('/morse-code-alphabet.md', pseudo)).toBe('/morse-code-alphabet.md')
    expect(localizePath('https://example.com/', pseudo)).toBe('https://example.com/')
    expect(localeFromPath('/en-xa/tree/').code).toBe(PSEUDO_LOCALE)
    expect(localeFromPath('/tree/').code).toBe('en')
    expect(stripLocale('/en-xa/tree/')).toBe('/tree/')
    expect(stripLocale('/en-xa/')).toBe('/')
  })
})

describe('the URL set with only English enabled', () => {
  const pages = localizablePages(() => true)
  const dynamic = [{ view: 'word', path: '/words/sos/', props: {} }]

  it('adds no translated route to a build', () => {
    expect(localizedRoutes({ dev: false }, pages, dynamic)).toEqual([])
  })

  it('routes every localisable page for the pseudo-locale under astro dev', () => {
    const routes = localizedRoutes({ dev: true }, pages, dynamic)
    expect(routes.length).toBe(pages.length + dynamic.length)
    expect(routes.every((route) => route.params.locale === 'en-xa')).toBe(true)
    expect(routes.map((route) => route.props.key)).not.toContain('/blog/')
  })

  it('emits no hreflang, no sitemap alternates and no switcher', () => {
    for (const page of PAGES) {
      expect(hreflangLinks(page.path, DEFAULT), page.path).toEqual([])
      expect(alternateLocales(page.path, DEFAULT), page.path).toEqual([])
    }
    expect(sitemapI18n()).toBeUndefined()
  })

  it('turns all of it on once a second language is published', () => {
    const de: LocaleDef = { ...getLocale(PSEUDO_LOCALE), code: 'de', path: 'de', lang: 'de' }
    const links = hreflangLinks('/tree/', DEFAULT, [DEFAULT, de])
    expect(links.map((link) => [link.hreflang, link.path])).toEqual([
      ['en', '/tree/'],
      ['de', '/de/tree/'],
      ['x-default', '/tree/'],
    ])
    expect(sitemapI18n([DEFAULT, de])).toEqual({
      defaultLocale: 'en',
      locales: { en: 'en', de: 'de' },
    })
    // An article has no translated copy, so it is offered in no other language.
    expect(hreflangLinks('/blog/what-farnsworth-timing-is/', DEFAULT, [DEFAULT, de])).toEqual([])
  })

  it('keeps a translated noindex page out of the sitemap', () => {
    expect(inSitemap('/en-xa/stats/')).toBe(false)
    expect(inSitemap('/en-xa/tree/')).toBe(true)
  })
})

describe('catalog completeness', () => {
  for (const locale of LOCALES) {
    describe(locale.code, () => {
      const { messages, content } = catalogFor(locale.code)

      it('lists every English message, with the same placeholders, tags and shape', () => {
        for (const key of keys) {
          const value = (messages as Record<string, Message | typeof UNTRANSLATED | undefined>)[key]
          expect(value, key).not.toBeUndefined()
          if (value === UNTRANSLATED || value === undefined) continue
          const english = (EN_MESSAGES as Record<string, Message>)[key]!
          expect(isPlural(value), key).toBe(isPlural(english))
          expect(placeholdersOf(value), key).toEqual(placeholdersOf(english))
          const tags = (m: Message) =>
            [...new Set((isPlural(m) ? Object.values(m) : [m]).flatMap(richTags))].sort()
          expect(tags(value), key).toEqual(tags(english))
        }
        expect(Object.keys(messages).sort()).toEqual([...keys].sort())
      })

      it('lists every registry page and every FAQ', () => {
        expect(Object.keys(content.pages).sort()).toEqual(PAGES.map((p) => p.path).sort())
        expect(Object.keys(content.faq).sort()).toEqual(Object.keys(PAGE_FAQ).sort())
        expect(content.curriculum).toHaveLength(EN_CATALOG.content.curriculum.length)
      })

      it('keeps every title and description within the result-page limits', () => {
        const resolved = contentFor(locale.code)
        for (const [path, copy] of Object.entries(resolved.pages)) {
          expect(copy.title.length, `${path} title`).toBeLessThanOrEqual(TITLE_MAX)
          expect(copy.description.length, `${path} description`).toBeLessThanOrEqual(
            DESCRIPTION_MAX,
          )
        }
      })

      it('keeps every FAQ link phrase inside its answer', () => {
        for (const [path, items] of Object.entries(contentFor(locale.code).faq)) {
          for (const item of items) {
            for (const link of item.links ?? []) {
              expect(item.answer, `${path}: ${link.text}`).toContain(link.text)
            }
          }
        }
      })
    })
  }

  it('types no Morse into any catalog file', () => {
    const dir = join(SRC, 'i18n/en')
    for (const name of readdirSync(dir)) {
      expect(handTypedMorse(readFileSync(join(dir, name), 'utf8')), name).toEqual([])
    }
  })

  it('reports what is left to translate', () => {
    const report = coverage('en')
    expect(report.untranslated).toEqual([])
    expect(report.translated).toBe(report.total)
  })
})

describe('the pseudo-locale', () => {
  const pseudo = messagesFor(PSEUDO_LOCALE)
  const english = messagesFor('en')

  it('renders every message, and none of them as plain English', () => {
    for (const key of keys) {
      const message = pseudo[key as keyof typeof pseudo]
      const params = Object.fromEntries(
        placeholdersOf(english[key as keyof typeof english]).map((name) => [
          name,
          name === 'count' ? 2 : 'X',
        ]),
      )
      const text = richText(parseRich(formatMessage(message, params, 'en-XA')))
      expect(text, key).not.toMatch(/\{[A-Za-z]\w*\}/)
      const englishText = richText(
        parseRich(formatMessage(english[key as keyof typeof english], params, 'en')),
      )
      // A message with a word in it must come out changed.
      if (/[a-z]{2,}/.test(englishText)) expect(text, key).not.toBe(englishText)
    }
  })

  it('leaves placeholders, tags, digits, Morse and short capitals alone', () => {
    expect(pseudoString('Send <b>{code}</b> as .- at 20 WPM, E and T')).toBe(
      'Šééñð <b>{code}</b> ååš .- ååţ 20 WPM, E ååñð T',
    )
  })

  it('renders every page in the registry', () => {
    const t = translatorFor(PSEUDO_LOCALE)
    for (const page of PAGES) {
      const entry = t.page(page.path)
      expect(entry.title, page.path).not.toBe(page.title)
      if (localizablePages(() => true).includes(page.path)) {
        expect(entry.path, page.path).toBe(`/en-xa${page.path}`)
      }
    }
  })
})

describe('the translator', () => {
  const t = translatorFor('en')

  it('fills placeholders and picks plural forms by Intl.PluralRules', () => {
    expect(t('result.streakDays', { count: 1 })).toBe('1 day')
    expect(t('result.streakDays', { count: 3 })).toBe('3 days')
    expect(t('header.chipStreak', { days: 5 })).toBe('5-day streak')
  })

  it('formats lists and number words the way the English copy always has', () => {
    expect(t.list(['E', 'T'])).toBe('E and T')
    expect(t.list(['A', 'B', 'C'])).toBe('A, B and C')
    expect(t.list(['sound', 'lamp', 'both'], 'or')).toBe('sound, lamp or both')
    expect(t.numberWord(7)).toBe('seven')
    expect(t.numberWord(26)).toBe('26')
    expect(t.describeElements('-....')).toBe('one dash and four dots')
    expect(t.spokenCode('.- / -.')).toBe('dot dash break dash dot')
  })

  it('falls back to digits when a language has no number words', () => {
    const bare = createTranslator(
      { code: 'xx', path: 'xx', lang: 'de', dir: 'ltr' },
      { 'format.numberWords': '' },
    )
    expect(bare.numberWord(7)).toBe('7')
  })

  it('gives each island only the namespaces it asked for', () => {
    const slice = t.island('tree')
    const namespaces = new Set(Object.keys(slice.messages).map((key) => key.split('.')[0]))
    expect([...namespaces].sort()).toEqual([...ISLANDS.tree].sort())
  })
})

/* ---- Extracted components keep their English in the catalog ------------ */

/** The folders whose UI strings now live in the catalog. */
const EXTRACTED = [
  'components/Practice',
  'components/Challenge',
  'components/Lesson',
  'components/SignalTree',
  'components/Stats',
  'components/MorseKey',
  'components/Settings',
  'components/Games',
  'components/Share/ShareCard.tsx',
  'components/I18n',
  'components/Header.astro',
  'components/Footer.astro',
  'components/ThemeToggle.astro',
  'components/ThemeMenu.astro',
  'components/Faq.astro',
  'components/Alphabet/Breadcrumbs.astro',
  'pages/practice.astro',
  'pages/challenge.astro',
  'pages/learn.astro',
  'pages/tree.astro',
  'pages/stats.astro',
  'pages/telegraph.astro',
  'pages/settings.astro',
  'pages/games',
]

function files(entry: string): string[] {
  const full = join(SRC, entry)
  if (!statSync(full).isDirectory()) return [full]
  return readdirSync(full)
    .flatMap((name) => files(join(entry, name)))
    .filter((file) => /\.(tsx|astro)$/.test(file))
}

/**
 * JSX text between tags, and the plain-text attributes a reader or a screen
 * reader gets, with comments and expressions removed. Anything left that has
 * two words of letters is English that was never extracted.
 */
function strayEnglish(source: string): string[] {
  const markup = source
    .replace(/^---[\s\S]*?\n---/, '')
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
    .replace(/<script[\s\S]*?<\/script>/g, '')
    .replace(/<style[\s\S]*?<\/style>/g, '')
  const found: string[] = []
  for (const match of markup.matchAll(/>([^<>{}]*)</g)) {
    const text = match[1]!.trim()
    // A type annotation between two generics (`=> void\n pools: readonly X<`) is not text.
    const isType = /[=;()]|\b(?:void|readonly|string|number|boolean|undefined)\b/.test(text)
    if (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(text) && !isType) found.push(text)
  }
  for (const match of markup.matchAll(
    /\s(?:aria-label|title|placeholder|alt|label|hint|intro|caption)="([^"]*)"/g,
  )) {
    if (/[A-Za-z]{2,}\s+[A-Za-z]{2,}/.test(match[1]!)) found.push(match[1]!)
  }
  return found
}

describe('no English left in extracted components', () => {
  for (const file of EXTRACTED.flatMap(files)) {
    it(file.slice(SRC.length), () => {
      expect(strayEnglish(readFileSync(file, 'utf8'))).toEqual([])
    })
  }
})
