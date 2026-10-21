/**
 * Hands the language list to Astro's built-in i18n routing.
 *
 * An integration rather than a literal in `astro.config.mjs` because the list
 * depends on the command: `astro dev` routes the pseudo-locale, a build never
 * does. The config hook is told which command is running, so nothing has to
 * sniff `process.argv`. The route that renders the translated pages
 * (`src/pages/[locale]/[...path].astro`) reads the same function with
 * `import.meta.env.DEV`, which is true in exactly the same runs.
 *
 * English has no prefix (`prefixDefaultLocale: false`), so every URL the site
 * had before this existed is unchanged, and with no other language enabled a
 * build writes the same set of files.
 */

import type { AstroIntegration } from 'astro'
import { DEFAULT_LOCALE, routedLocales } from './locales'

export function i18nRouting(): AstroIntegration {
  return {
    name: 'morseforge:i18n',
    hooks: {
      'astro:config:setup': ({ command, updateConfig }) => {
        const locales = routedLocales({ dev: command === 'dev' })
        updateConfig({
          i18n: {
            defaultLocale: DEFAULT_LOCALE,
            locales: locales.map((locale) =>
              locale.path === '' ? locale.code : { path: locale.path, codes: [locale.code] },
            ),
            // No `fallback`: a missing translation falls back string by string
            // (catalogs.ts), never by redirecting a whole page to English.
            routing: {
              prefixDefaultLocale: false,
              redirectToDefaultLocale: false,
              fallbackType: 'redirect',
            },
          },
        })
      },
    },
  }
}
