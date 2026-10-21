/**
 * `<lastmod>` for every sitemap URL, from the content's own history.
 *
 * Google ignores a `lastmod` that changes on every deploy, so the build time is
 * never used. Instead:
 *
 *   - a blog post uses its frontmatter, `updated` when there is one and
 *     `published` otherwise;
 *   - every other page uses the newest commit date (`git log -1 --format=%cI`)
 *     of its page file and the data files whose content it renders.
 *
 * Both are properties of the source tree, so two builds of the same commit give
 * byte-identical sitemaps. A file with no history yet (new and uncommitted)
 * contributes nothing; a URL with no dated source at all gets no `<lastmod>`
 * rather than a made-up one.
 *
 * `scripts/deploy.sh` builds from a full local checkout, so the git dates are
 * real. A CI build would need `fetch-depth: 0`, or every date collapses to the
 * one commit a shallow clone has.
 *
 * Plain JavaScript with no project imports, so `astro.config.mjs` can load it
 * before Vite exists. Read-only git commands only.
 */

import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

// The repository root. If a bundler has moved this module, the working
// directory (where `astro build` runs) is the fallback.
const HERE = fileURLToPath(new URL('..', import.meta.url))
const DEFAULT_ROOT = existsSync(join(HERE, 'src/pages')) ? HERE : process.cwd()

/**
 * Data a page renders beyond its own template, by path. Only files whose
 * change changes what the page *says* belong here: the registry and the FAQ
 * file hold copy for every page, so listing them would move every page's date
 * whenever any one page's title is edited, which is the same noise as a build
 * time. Keep this to the specific sources.
 */
export const DATA_SOURCES = {
  '/': ['src/config/landing.ts'],
  '/morse-code-alphabet/': [
    'src/data/morseAlphabet.ts',
    'src/data/characters.ts',
    'src/components/Alphabet/AlphabetChart.astro',
  ],
  '/learn-morse-code-in-7-days/': ['src/data/curriculum.ts'],
  '/words/': ['src/data/words.ts'],
  '/tree/': ['src/data/tree.ts'],
  '/copy/': ['src/data/practiceText.ts'],
  '/daily/': ['src/game/dailyChallenge.ts'],
}

/** Data behind every page of a dynamic route, by the route's directory. */
const DYNAMIC_SOURCES = {
  words: ['src/data/words.ts'],
  'morse-code-alphabet': ['src/data/characters.ts', 'src/data/morseAlphabet.ts'],
}

/** `2026-10-21T00:15:00+03:00` → `2026-10-20T21:15:00.000Z`, so the output does not depend on the committer's zone. */
function toUtc(value) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString()
}

/** The later of two ISO strings, either of which may be missing. */
function latest(a, b) {
  if (!a) return b
  if (!b) return a
  return a > b ? a : b
}

/**
 * `published` and `updated` from a post's YAML frontmatter.
 *
 * A deliberately small parser: the content schema (`src/content.config.ts`)
 * already guarantees both are bare dates, so this only has to find them.
 */
export function frontmatterDates(markdown) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(markdown)?.[1] ?? ''
  const field = (name) => {
    const raw = new RegExp(`^${name}:\\s*['"]?([^'"\\n]+?)['"]?\\s*$`, 'm').exec(block)?.[1]
    return raw ? toUtc(raw) : undefined
  }
  const draft = /^draft:\s*true\s*$/m.test(block)
  return { published: field('published'), updated: field('updated'), draft }
}

/** The page file behind a static route, relative to the root, or undefined. */
export function pageFileFor(pathname, root = DEFAULT_ROOT) {
  const trimmed = pathname.replace(/^\/|\/$/g, '')
  const candidates =
    trimmed === ''
      ? ['src/pages/index.astro']
      : [`src/pages/${trimmed}.astro`, `src/pages/${trimmed}/index.astro`]
  const direct = candidates.find((file) => existsSync(join(root, file)))
  if (direct) return direct

  // A dynamic route: `/words/sos/` is served by `src/pages/words/[slug].astro`.
  const parts = trimmed.split('/')
  if (parts.length < 2) return undefined
  const dir = `src/pages/${parts.slice(0, -1).join('/')}`
  if (!existsSync(join(root, dir))) return undefined
  const dynamic = readdirSync(join(root, dir)).find((name) => /^\[[^\]]+\]\.astro$/.test(name))
  return dynamic ? `${dir}/${dynamic}` : undefined
}

/** Every source file whose history dates a route, relative to the root. */
export function sourcesFor(pathname, root = DEFAULT_ROOT) {
  const files = new Set()
  const page = pageFileFor(pathname, root)
  if (page) files.add(page)
  for (const file of DATA_SOURCES[pathname] ?? []) files.add(file)
  const section = pathname.replace(/^\//, '').split('/')[0]
  if (page?.includes('[') && section in DYNAMIC_SOURCES) {
    for (const file of DYNAMIC_SOURCES[section]) files.add(file)
  }
  return [...files].filter((file) => existsSync(join(root, file))).sort()
}

/**
 * The newest commit date touching any of `files`, or undefined.
 *
 * Failure (no git, not a repository, a shallow clone without the file) gives
 * undefined, never the current time.
 */
export function gitDate(files, root = DEFAULT_ROOT) {
  if (files.length === 0) return undefined
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', ...files], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    return out ? toUtc(out) : undefined
  } catch {
    return undefined
  }
}

/**
 * Paths in `git status --porcelain` output: modified, added, deleted or
 * untracked, staged or not. A rename reports its new path.
 */
export function parsePorcelain(out) {
  return out
    .split('\n')
    .filter((line) => line.length > 3)
    .map((line) => {
      const path = line.slice(3)
      const arrow = path.indexOf(' -> ')
      return (arrow === -1 ? path : path.slice(arrow + 4)).replace(/^"|"$/g, '')
    })
}

/**
 * Whether a route's sources are committed as they are.
 *
 *   - `clean`: tracked and unmodified, so the commit date is the content's date.
 *   - `dirty`: at least one is untracked or has uncommitted changes, so no
 *     commit date describes what is being built.
 *   - `unknown`: git could not say (no repository, no git binary).
 *   - `none`: the route has no source files at all.
 */
export function sourceStatus(files, root = DEFAULT_ROOT) {
  if (files.length === 0) return 'none'
  try {
    const out = execFileSync(
      'git',
      ['status', '--porcelain', '--untracked-files=all', '--', ...files],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    )
    return parsePorcelain(out).length > 0 ? 'dirty' : 'clean'
  } catch {
    return 'unknown'
  }
}

/**
 * What a sitemap URL's `<lastmod>` (or its absence) means for the build check.
 *
 * A missing date fails only where it should exist: every source tracked and
 * unmodified. The owner reviews an uncommitted build before anything is
 * committed, so a page whose sources are new or edited legitimately has no
 * date yet; that is a warning, and the post-commit build dates it.
 */
export function lastmodVerdict({ lastmod, status }) {
  if (lastmod) return 'ok'
  return status === 'dirty' || status === 'unknown' ? 'warn' : 'fail'
}

/**
 * A `lastmod` resolver bound to a root, memoised per route so the sitemap's
 * one call per URL runs one git command per distinct source set.
 *
 * A route whose sources are untracked or modified gets no date: the last
 * commit describes the old content, and a wrong `lastmod` is worse than none.
 *
 * `options.git` replaces `gitDate` and `options.status` replaces
 * `sourceStatus`, for tests. `lastmodFor.status(pathname)` reports the
 * route's source status, for the build check.
 */
export function createLastmod({ root = DEFAULT_ROOT, git = gitDate, status = sourceStatus } = {}) {
  const byFiles = new Map()
  const byStatus = new Map()
  const statusOf = (files) => {
    const key = files.join('\n')
    if (!byStatus.has(key)) byStatus.set(key, status(files, root))
    return byStatus.get(key)
  }
  const dated = (files) => {
    const key = files.join('\n')
    if (statusOf(files) !== 'clean') return undefined
    if (!byFiles.has(key)) byFiles.set(key, git(files, root))
    return byFiles.get(key)
  }

  const blogDir = join(root, 'src/content/blog')
  const postDates = (slug) => {
    const file = join(blogDir, `${slug}.md`)
    if (!existsSync(file)) return undefined
    return frontmatterDates(readFileSync(file, 'utf8'))
  }

  const newestPost = () => {
    if (!existsSync(blogDir)) return undefined
    return readdirSync(blogDir)
      .filter((name) => name.endsWith('.md'))
      .map((name) => postDates(name.slice(0, -3)))
      .filter((dates) => dates && !dates.draft)
      .reduce((max, dates) => latest(max, dates.updated ?? dates.published), undefined)
  }

  function lastmodFor(pathname) {
    const post = /^\/blog\/([^/]+)\/$/.exec(pathname)?.[1]
    if (post) {
      const dates = postDates(post)
      if (dates) return dates.updated ?? dates.published
    }
    const fromGit = dated(sourcesFor(pathname, root))
    // The notes index changes when a note does, whatever git says about the template.
    return pathname === '/blog/' ? latest(fromGit, newestPost()) : fromGit
  }
  lastmodFor.status = (pathname) => statusOf(sourcesFor(pathname, root))
  return lastmodFor
}
