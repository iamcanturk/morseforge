/**
 * The site's navigation, once, for the header, the mobile menu and the footer.
 *
 * Every link is checked against the files in src/pages at build time and
 * dropped if its page does not exist. That lets the menu name a page another
 * change is still building (the secret message) without shipping a 404 in the
 * meantime: the link appears in the same build as the page, with no second
 * edit here. It also means a page that is deleted or renamed leaves the menu
 * instead of leaving a dead link in it.
 */

import type { MessageKey } from '../../i18n/keys'
import { translatorFor, type ServerTranslator } from '../../i18n/server'

export interface NavLink {
  href: string
  label: string
  hint: string
}

export interface NavGroup {
  title: string
  links: NavLink[]
}

/** The page files that exist, as keys like `../../pages/learn.astro`. */
const PAGE_FILES = Object.keys(import.meta.glob('../../pages/**/*.astro'))

/** The page files that could serve `href`, relative to src/pages. */
export function pageFilesFor(href: string): string[] {
  const path = href.replace(/^\/+|\/+$/g, '')
  if (path === '') return ['index.astro']
  return [`${path}.astro`, `${path}/index.astro`]
}

/** Whether a page exists for `href`, given the list of page files. */
export function hasPage(href: string, files: readonly string[] = PAGE_FILES): boolean {
  const relative = files.map((file) => file.replace(/^.*\/pages\//, ''))
  return pageFilesFor(href).some((candidate) => relative.includes(candidate))
}

function existing(groups: NavGroup[], files: readonly string[]): NavGroup[] {
  return groups
    .map((group) => ({ ...group, links: group.links.filter((link) => hasPage(link.href, files)) }))
    .filter((group) => group.links.length > 0)
}

/**
 * A registry page as a link: label and hint come from `src/config/pages.ts`
 * (in the page's language), so the menu, the footer, the 404 and `llms.txt`
 * all name a page the same way. `label` overrides the registry's name where
 * the bar needs a shorter one. `href` is the registry path here; `localize`
 * turns it into the language's URL once the existence filter has run.
 */
function linkTo(t: ServerTranslator, path: string, label?: MessageKey): NavLink {
  const page = t.page(path)
  return { href: page.key, label: label ? t.raw(label) : page.navLabel, hint: page.hint }
}

/** A column of the menu, titled from the registry's group names where one applies. */
function column(t: ServerTranslator, title: string, paths: readonly string[]): NavGroup {
  return { title, links: paths.map((path) => linkTo(t, path)) }
}

/**
 * The bar. Telegraph and Daily are here, not hidden in a menu: they are the
 * most fun and the most shareable things on the site. The bar uses one-word
 * labels; everything else is the registry's.
 */
function primary(t: ServerTranslator): NavLink[] {
  return [
    linkTo(t, '/learn/', 'nav.learn'),
    linkTo(t, '/practice/', 'nav.practice'),
    linkTo(t, '/telegraph/', 'nav.telegraph'),
    linkTo(t, '/daily/', 'nav.daily'),
  ]
}

/**
 * The menu's columns. Which page sits in which column is layout, so it lives
 * here; what each link says is copy, so it comes from the registry. "Send"
 * gathers the three ways to compose Morse, which the registry files under
 * Practise and Look up, because the menu reads better in four columns.
 */
function groups(t: ServerTranslator): NavGroup[] {
  return [
    column(t, t.groupLabel('learn'), ['/learn/', '/learn-morse-code-in-7-days/', '/tree/']),
    column(t, t.groupLabel('practise'), [
      '/practice/',
      '/copy/',
      '/daily/',
      '/challenge/',
      '/games/signal-defender/',
      '/games/morse-runner/',
    ]),
    column(t, t('nav.send'), ['/telegraph/', '/message/', '/morse-code-translator/']),
    column(t, t.groupLabel('lookup'), [
      '/morse-code-alphabet/',
      '/words/',
      '/morse-code-speed/',
      '/how-to-learn-morse-code/',
      '/blog/',
      '/stats/',
      '/privacy/',
    ]),
  ]
}

/**
 * The boxed tiles at the top of the phone menu: the bar's four, plus the two a
 * phone otherwise had no short way to — progress was hidden below `lg`.
 */
function tiles(t: ServerTranslator): NavLink[] {
  return [...primary(t), linkTo(t, '/challenge/'), linkTo(t, '/stats/', 'nav.progress')].filter(
    (link) => hasPage(link.href),
  )
}

/**
 * The lists under the phone menu's tiles: every group, minus the pages a tile
 * already links (V-13, J-23). The panel used to list the six tiles' pages a
 * second time, which made it two screens long, so no destination appears
 * twice in it now. Groups left empty are dropped.
 */
export function phoneGroups(
  navGroups: readonly NavGroup[],
  menuTiles: readonly NavLink[],
): NavGroup[] {
  const tiled = new Set(menuTiles.map((link) => link.href))
  return navGroups
    .map((group) => ({ ...group, links: group.links.filter((link) => !tiled.has(link.href)) }))
    .filter((group) => group.links.length > 0)
}

/** Links from registry paths to this language's URLs. */
function localize(t: ServerTranslator, links: readonly NavLink[]): NavLink[] {
  return links.map((link) => ({ ...link, href: t.href(link.href) }))
}

export interface SiteNav {
  primary: NavLink[]
  tiles: NavLink[]
  groups: NavGroup[]
  phoneGroups: NavGroup[]
}

const navs = new Map<string, SiteNav>()

/** The whole navigation in one language, with every link pointing at that language's pages. */
export function siteNav(t: ServerTranslator): SiteNav {
  const cached = navs.get(t.locale.code)
  if (cached) return cached
  const shownGroups = existing(groups(t), PAGE_FILES)
  const shownTiles = tiles(t)
  const nav: SiteNav = {
    primary: localize(
      t,
      primary(t).filter((link) => hasPage(link.href)),
    ),
    tiles: localize(t, shownTiles),
    groups: shownGroups.map((group) => ({ ...group, links: localize(t, group.links) })),
    phoneGroups: phoneGroups(shownGroups, shownTiles).map((group) => ({
      ...group,
      links: localize(t, group.links),
    })),
  }
  navs.set(t.locale.code, nav)
  return nav
}

// The English navigation, as the tests and the older call sites know it.
const english = siteNav(translatorFor('en'))
export const PRIMARY_NAV: NavLink[] = english.primary
export const MENU_TILES: NavLink[] = english.tiles
export const NAV_GROUPS: NavGroup[] = english.groups
export const PHONE_GROUPS: NavGroup[] = english.phoneGroups

/** Exposed for the test, which checks the filter against a fixed file list. */
export const ALL_NAV_GROUPS: readonly NavGroup[] = groups(translatorFor('en'))
export const filterExisting = existing

/** Whether `href` is the page being rendered. Trailing slashes are site-wide. */
export function isCurrent(href: string, pathname: string): boolean {
  const normalise = (path: string) => (path.endsWith('/') ? path : `${path}/`)
  return normalise(pathname) === normalise(href)
}
