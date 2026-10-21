/**
 * Links to the per-character pages, only where those pages exist.
 *
 * The pages under `/morse-code-alphabet/<slug>/` are built by a separate
 * dynamic route, which may cover only some characters or not exist yet. A
 * chart tile that links to a page the build did not produce is a 404 that
 * `check-links` fails the build on, and a dead URL in structured data is worse
 * than none. So the set of linkable slugs is read from the route's own
 * `getStaticPaths()`: the same list the build uses, never a guess.
 */

import { characterFacts } from '../../data/characters'

/** The shape `getStaticPaths()` returns, as far as this needs it. */
interface PathEntry {
  params?: Record<string, unknown>
}

/**
 * The slugs a dynamic route's static paths produce. Tolerant of the param's
 * name (`slug`, `character`, …): a single-segment route has one param, and
 * that is the slug.
 */
export function slugsFromPaths(paths: unknown): Set<string> {
  const slugs = new Set<string>()
  if (!Array.isArray(paths)) return slugs
  for (const entry of paths as PathEntry[]) {
    const values = Object.values(entry?.params ?? {})
    if (values.length !== 1) continue
    const value = values[0]
    if (typeof value === 'string' || typeof value === 'number') slugs.add(String(value))
  }
  return slugs
}

/** The character page for `character`, or null when the build has none. */
export function characterHref(character: string, slugs: ReadonlySet<string>): string | null {
  const facts = characterFacts(character)
  if (!facts || !slugs.has(facts.slug)) return null
  return `/morse-code-alphabet/${facts.slug}/`
}

type RouteModule = { getStaticPaths?: () => unknown }

const ROUTES = import.meta.glob<RouteModule>('../../pages/morse-code-alphabet/*.astro')

/** A dynamic route file: `[slug].astro`, `[character].astro`. */
const DYNAMIC = /\/\[[^\]/.]+\]\.astro$/

/**
 * Every character slug that has a built page. Empty until the route exists.
 * Called from page frontmatter, at build time only.
 */
export async function characterPageSlugs(): Promise<ReadonlySet<string>> {
  const slugs = new Set<string>()
  for (const [file, load] of Object.entries(ROUTES)) {
    if (!DYNAMIC.test(file)) continue
    const route = await load()
    for (const slug of slugsFromPaths(await route.getStaticPaths?.())) slugs.add(slug)
  }
  return slugs
}
