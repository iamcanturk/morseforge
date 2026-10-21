/**
 * The other languages a page exists in: what `hreflang`, the language switcher
 * and the sitemap's alternates are built from.
 *
 * The set is every published language plus the one being rendered. With only
 * English published, an English page has no alternates at all, so none of this
 * emits anything today; the first language switched on in `locales.ts` turns
 * it on everywhere at once. The pseudo-locale is never published, but its own
 * pages list it beside English, which is how the plumbing is checked under
 * `astro dev`.
 */

import {
  DEFAULT,
  isLocalizable,
  localizePath,
  publishedLocales,
  stripLocale,
  type LocaleDef,
} from './locales'

export interface Alternate {
  locale: LocaleDef
  /** `hreflang` value: the language tag, or `x-default`. */
  hreflang: string
  /** Site path of the page in that language. */
  path: string
}

/** The languages a page at `pathname`, rendered in `current`, is offered in. Empty for one. */
export function alternateLocales(
  pathname: string,
  current: LocaleDef,
  published: readonly LocaleDef[] = publishedLocales(),
): LocaleDef[] {
  if (!isLocalizable(stripLocale(pathname))) return []
  const set = published.some((locale) => locale.code === current.code)
    ? [...published]
    : [...published, current]
  return set.length > 1 ? set : []
}

/**
 * `<link rel="alternate" hreflang>` entries for a page: one per language, and
 * `x-default` pointing at the English page, which is the one a visitor with no
 * matching language should get.
 */
export function hreflangLinks(
  pathname: string,
  current: LocaleDef,
  published: readonly LocaleDef[] = publishedLocales(),
): Alternate[] {
  const locales = alternateLocales(pathname, current, published)
  if (locales.length === 0) return []
  const key = stripLocale(pathname)
  return [
    ...locales.map((locale) => ({
      locale,
      hreflang: locale.lang,
      path: localizePath(key, locale),
    })),
    { locale: DEFAULT, hreflang: 'x-default', path: key },
  ]
}

/**
 * The sitemap integration's `i18n` option, or undefined while only English is
 * published (the integration then adds no `xhtml:link` at all).
 */
export function sitemapI18n(
  published: readonly LocaleDef[] = publishedLocales(),
): { defaultLocale: string; locales: Record<string, string> } | undefined {
  if (published.length < 2) return undefined
  return {
    defaultLocale: DEFAULT.code,
    locales: Object.fromEntries(
      published.map((locale) => [locale.path || DEFAULT.code, locale.lang]),
    ),
  }
}
