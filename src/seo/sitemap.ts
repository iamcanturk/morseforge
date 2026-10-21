/**
 * Which URLs the sitemap lists.
 *
 * `astro.config.mjs` used to hold its own regex for the author tools, which is
 * how `/stats/`, `/settings/` and the 404 stayed in the sitemap after they were
 * marked noindex: the layout and the sitemap read different lists. Both now
 * read the registry's `indexable` flag, so a page that is noindexed is also
 * left out of the sitemap, and nothing has to be kept in step by hand.
 */

import { PAGES } from '../config/pages'

/**
 * Pages that must never be listed. The author tools are named explicitly as
 * well as through the registry, so dropping their registry entry cannot put
 * them back in.
 */
export const SITEMAP_EXCLUDED: ReadonlySet<string> = new Set([
  ...PAGES.filter((page) => !page.indexable).map((page) => page.path),
  '/panel/',
  '/studio/',
  '/404/',
])

/** Normalise to the registry's form: leading and trailing slash. */
function normalise(pathname: string): string {
  const withLead = pathname.startsWith('/') ? pathname : `/${pathname}`
  if (/\.[a-z0-9]+$/i.test(withLead)) return withLead
  return withLead.endsWith('/') ? withLead : `${withLead}/`
}

/** True when a page URL (absolute or a path) belongs in the sitemap. */
export function inSitemap(page: string): boolean {
  const pathname = page.includes('://') ? new URL(page).pathname : page
  return !SITEMAP_EXCLUDED.has(normalise(pathname))
}
