/**
 * Which page file renders a registry path, for the catch-all route that
 * serves the translated pages. A separate module because Astro hoists
 * `getStaticPaths` out of the page's frontmatter, so it cannot see anything
 * declared there.
 */

import type { AstroComponentFactory } from 'astro/runtime/server/index.js'
import { hasPage, pageFilesFor } from '../components/ui/siteNav'

/** Every static page file, keyed by its path relative to this file. Dynamic routes are left out. */
const FILES = import.meta.glob<{ default: AstroComponentFactory }>(
  ['../pages/**/*.astro', '!../pages/**/\\[*\\]*.astro', '!../pages/**/\\[*/**'],
  { eager: true },
)

/** The page component for a registry path, or undefined when no file serves it. */
export function viewFor(key: string): AstroComponentFactory | undefined {
  if (!hasPage(key)) return undefined
  return pageFilesFor(key)
    .map((file) => FILES[`../pages/${file}`]?.default)
    .find((view) => view !== undefined)
}
