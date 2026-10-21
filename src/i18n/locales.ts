/**
 * Which languages exist, which are switched on, and how a URL names one.
 *
 * English is the default and has no prefix, so every URL the site has today
 * stays exactly where it is. Any other language lives under `/<path>/`: the
 * German home page would be `/de/`, its alphabet `/de/morse-code-alphabet/`.
 *
 * A language ships when its entry here says `status: 'enabled'`. Until then its
 * catalog can be complete and tested and still produce no page, no hreflang and
 * no sitemap entry. `docs/TRANSLATING.md` is the walk-through.
 *
 * `en-XA` is a pseudo-locale: English run through an accent-and-stretch filter
 * (`pseudo.ts`), so a string that never went through the catalog shows up as
 * plain English beside it. Its status is `dev`, which routes it under
 * `astro dev` and never in a build.
 *
 * Plain data and pure functions, with no `import.meta.env`, so that
 * `astro.config.mjs` can import it too and both sides agree on the list.
 */

export type LocaleStatus = 'enabled' | 'disabled' | 'dev'

export interface LocaleDef {
  /** BCP 47 tag, also the catalog key: 'en', 'de', 'pt-BR'. */
  code: string
  /** URL segment. Empty for the default language only. Lower case. */
  path: string
  /** `<html lang>` and `hreflang`. Usually the same as `code`. */
  lang: string
  /** `og:locale`, which wants an underscore and a region. */
  ogLocale: string
  /** The language's name in itself, for the switcher: "Deutsch", not "German". */
  label: string
  dir: 'ltr' | 'rtl'
  status: LocaleStatus
}

export const DEFAULT_LOCALE = 'en'

/** The pseudo-locale's code. Exported for the tests and the docs. */
export const PSEUDO_LOCALE = 'en-XA'

export const LOCALES: readonly LocaleDef[] = [
  {
    code: 'en',
    path: '',
    // The copy is British English (DEC-012); `<html lang>` has always said the
    // plain `en`, and changing it now would be a visible change for no reader.
    lang: 'en',
    ogLocale: 'en_GB',
    label: 'English',
    dir: 'ltr',
    status: 'enabled',
  },
  {
    code: PSEUDO_LOCALE,
    path: 'en-xa',
    lang: 'en-XA',
    ogLocale: 'en_XA',
    label: 'Ƥšéûðöļöçåļé',
    dir: 'ltr',
    status: 'dev',
  },
]

/** Where the answer depends on whether this is `astro dev` or a build. */
export interface LocaleEnv {
  dev: boolean
}

const BY_CODE: ReadonlyMap<string, LocaleDef> = new Map(LOCALES.map((l) => [l.code, l]))
const BY_PATH: ReadonlyMap<string, LocaleDef> = new Map(
  LOCALES.filter((l) => l.path !== '').map((l) => [l.path, l]),
)

export function getLocale(code: string): LocaleDef {
  const locale = BY_CODE.get(code)
  if (!locale) throw new Error(`Unknown locale "${code}". Add it to src/i18n/locales.ts.`)
  return locale
}

export const DEFAULT = getLocale(DEFAULT_LOCALE)

/**
 * The languages that get pages in this run: the enabled ones, plus the `dev`
 * ones under `astro dev`. The default is always first.
 */
export function routedLocales(
  env: LocaleEnv,
  locales: readonly LocaleDef[] = LOCALES,
): LocaleDef[] {
  return locales.filter(
    (l) => l.status === 'enabled' || (env.dev && l.status === 'dev') || l.code === DEFAULT_LOCALE,
  )
}

/**
 * The languages the site advertises: hreflang, the sitemap's alternates,
 * `llms.txt` and the switcher. Only `enabled` ones, so the pseudo-locale is
 * never announced from an English page, even under `astro dev`.
 */
export function publishedLocales(locales: readonly LocaleDef[] = LOCALES): LocaleDef[] {
  return locales.filter((l) => l.status === 'enabled' || l.code === DEFAULT_LOCALE)
}

/** The routed languages that live under a prefix, i.e. every one but English. */
export function prefixedLocales(
  env: LocaleEnv,
  locales: readonly LocaleDef[] = LOCALES,
): LocaleDef[] {
  return routedLocales(env, locales).filter((l) => l.path !== '')
}

/** Which language a site path is in: `/de/tree/` is German, `/tree/` English. */
export function localeFromPath(pathname: string): LocaleDef {
  const first = pathname.split('/').filter(Boolean)[0]
  return (first && BY_PATH.get(first.toLowerCase())) || DEFAULT
}

/** The path with its language prefix removed: `/de/tree/` becomes `/tree/`. */
export function stripLocale(pathname: string): string {
  const locale = localeFromPath(pathname)
  if (locale.path === '') return pathname
  const rest = pathname.replace(new RegExp(`^/${locale.path}(?=/|$)`, 'i'), '')
  return rest === '' ? '/' : rest
}

/**
 * Paths that never get a translated copy, so a link to them is never prefixed.
 *
 * The articles stay English for now (issue #44 puts them out of scope); the
 * owner's tools and the machine-readable files are not pages a reader picks a
 * language for. Anything with a file extension is a file, not a page.
 */
const UNLOCALIZED = [/^\/blog\//, /^\/panel\//, /^\/studio\//, /^\/404\/$/, /\.[a-z0-9]+$/i]

export function isLocalizable(path: string): boolean {
  return path.startsWith('/') && !path.startsWith('//') && !UNLOCALIZED.some((re) => re.test(path))
}

/**
 * A site path in a language: `/tree/` in German is `/de/tree/`. English, an
 * external URL, an anchor and any path that has no translated copy come back
 * unchanged, which is what makes this safe to wrap round every `href`.
 */
export function localizePath(path: string, locale: Pick<LocaleDef, 'path'> | string): string {
  const def = typeof locale === 'string' ? getLocale(locale) : locale
  if (def.path === '' || !isLocalizable(path)) return path
  const hashAt = path.search(/[?#]/)
  const bare = hashAt === -1 ? path : path.slice(0, hashAt)
  const tail = hashAt === -1 ? '' : path.slice(hashAt)
  return `/${def.path}${bare === '/' ? '/' : bare}${tail}`
}
