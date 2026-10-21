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

import { GROUP_LABELS, getPage } from '../../config/pages'

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
 * A registry page as a link: label and hint come from `src/config/pages.ts`,
 * so the menu, the footer, the 404 and `llms.txt` all name a page the same
 * way. `label` overrides the registry's name where the bar needs a shorter one.
 */
function linkTo(path: string, label?: string): NavLink {
  const page = getPage(path)
  return { href: page.path, label: label ?? page.navLabel, hint: page.hint }
}

/** A column of the menu, titled from the registry's group names where one applies. */
function column(title: string, paths: readonly string[]): NavGroup {
  return { title, links: paths.map((path) => linkTo(path)) }
}

/**
 * The bar. Telegraph and Daily are here, not hidden in a menu: they are the
 * most fun and the most shareable things on the site. The bar uses one-word
 * labels; everything else is the registry's.
 */
const PRIMARY: NavLink[] = [
  linkTo('/learn/', 'Learn'),
  linkTo('/practice/', 'Practice'),
  linkTo('/telegraph/', 'Telegraph'),
  linkTo('/daily/', 'Daily'),
]

/**
 * The menu's columns. Which page sits in which column is layout, so it lives
 * here; what each link says is copy, so it comes from the registry. "Send"
 * gathers the three ways to compose Morse, which the registry files under
 * Practise and Look up, because the menu reads better in four columns.
 */
const GROUPS: NavGroup[] = [
  column(GROUP_LABELS.learn, ['/learn/', '/learn-morse-code-in-7-days/', '/tree/']),
  column(GROUP_LABELS.practise, [
    '/practice/',
    '/copy/',
    '/daily/',
    '/challenge/',
    '/games/signal-defender/',
    '/games/morse-runner/',
  ]),
  column('Send', ['/telegraph/', '/message/', '/morse-code-translator/']),
  column(GROUP_LABELS.lookup, [
    '/morse-code-alphabet/',
    '/words/',
    '/morse-code-speed/',
    '/how-to-learn-morse-code/',
    '/blog/',
    '/stats/',
    '/privacy/',
  ]),
]

export const PRIMARY_NAV: NavLink[] = PRIMARY.filter((link) => hasPage(link.href))

/**
 * The boxed tiles at the top of the phone menu: the bar's four, plus the two a
 * phone otherwise had no short way to — progress was hidden below `lg`.
 */
export const MENU_TILES: NavLink[] = [
  ...PRIMARY,
  linkTo('/challenge/'),
  linkTo('/stats/', 'Progress'),
].filter((link) => hasPage(link.href))
export const NAV_GROUPS: NavGroup[] = existing(GROUPS, PAGE_FILES)

/**
 * The lists under the phone menu's tiles: every group, minus the pages a tile
 * already links (V-13, J-23). The panel used to list the six tiles' pages a
 * second time, which made it two screens long, so no destination appears
 * twice in it now. Groups left empty are dropped.
 */
export function phoneGroups(
  groups: readonly NavGroup[] = NAV_GROUPS,
  tiles: readonly NavLink[] = MENU_TILES,
): NavGroup[] {
  const tiled = new Set(tiles.map((link) => link.href))
  return groups
    .map((group) => ({ ...group, links: group.links.filter((link) => !tiled.has(link.href)) }))
    .filter((group) => group.links.length > 0)
}

export const PHONE_GROUPS: NavGroup[] = phoneGroups()

/** Exposed for the test, which checks the filter against a fixed file list. */
export const ALL_NAV_GROUPS: readonly NavGroup[] = GROUPS
export const filterExisting = existing

/** Whether `href` is the page being rendered. Trailing slashes are site-wide. */
export function isCurrent(href: string, pathname: string): boolean {
  const normalise = (path: string) => (path.endsWith('/') ? path : `${path}/`)
  return normalise(pathname) === normalise(href)
}
