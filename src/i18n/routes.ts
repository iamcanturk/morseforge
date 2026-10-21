/**
 * The translated pages a run produces: one per routed language other than
 * English, per page that has a translated copy.
 *
 * With only English enabled this is empty in a build, so the catch-all route
 * writes nothing and the build's set of URLs is exactly what it was before
 * i18n existed (`routes.test.ts` holds that). Under `astro dev` it includes
 * the pseudo-locale, which is how every page is checked end to end without a
 * real translation.
 */

import { PAGES } from '../config/pages'
import { isLocalizable, prefixedLocales, type LocaleDef, type LocaleEnv } from './locales'

/** A dynamic route's own static paths, as its page file's `getStaticPaths` returns them. */
export interface DynamicRoute {
  /** The view the catch-all renders, e.g. `word`. */
  view: string
  /** The English path of one entry, e.g. `/words/sos/`. */
  path: string
  props: Record<string, unknown>
}

export interface LocalizedRoute {
  params: { locale: string; path: string | undefined }
  props: { view: string; key: string; locale: string; props: Record<string, unknown> }
}

/** Registry pages that get a translated copy: every one with a page file and a localisable path. */
export function localizablePages(hasFile: (path: string) => boolean): string[] {
  return PAGES.map((page) => page.path).filter((path) => isLocalizable(path) && hasFile(path))
}

function route(
  locale: LocaleDef,
  key: string,
  view: string,
  props: Record<string, unknown>,
): LocalizedRoute {
  const rest = key.replace(/^\/|\/$/g, '')
  return {
    params: { locale: locale.path, path: rest === '' ? undefined : rest },
    props: { view, key, locale: locale.code, props },
  }
}

export function localizedRoutes(
  env: LocaleEnv,
  pages: readonly string[],
  dynamic: readonly DynamicRoute[],
): LocalizedRoute[] {
  return prefixedLocales(env).flatMap((locale) => [
    ...pages.map((key) => route(locale, key, key, {})),
    ...dynamic
      .filter((entry) => isLocalizable(entry.path))
      .map((entry) => route(locale, entry.path, entry.view, entry.props)),
  ])
}
