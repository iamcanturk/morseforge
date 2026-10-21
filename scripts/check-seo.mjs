/**
 * SEO and GEO assertions over the build output.
 *
 * Unit tests check the copy and the builders; this checks what actually
 * ships, because that is where a page loses its H1 to a restyle, a noindexed
 * page sneaks back into the sitemap, or a Markdown alternate starts returning
 * the 404 page. For every page in `dist/`:
 *
 *   - an indexable page has exactly one visible <h1>, a title of at most
 *     TITLE_MAX characters, a description of at most DESCRIPTION_MAX, a self
 *     canonical with a trailing slash, and JSON-LD that parses;
 *   - a page the registry marks `indexable: false` says noindex, declares no
 *     canonical, and is absent from the sitemap;
 *   - every og:image is a file in dist;
 *   - every rel="alternate" Markdown link resolves to Markdown.
 *
 * Then the sitemap (every URL dated, every indexable page listed), robots.txt
 * (every AI crawler allowed), llms.txt (every indexable page linked) and
 * llms-full.txt (every page FAQ, the ITU split, the prosign meanings).
 *
 * The limits and the indexable flags come from the registry itself, and the
 * parsing helpers from `src/seo/audit.ts`, which `audit.test.ts` covers. A
 * page that is registered but not built yet (one another change is still
 * writing) is skipped, not failed.
 *
 * Usage: node scripts/check-seo.mjs [dist-dir]
 * Prints one line per problem and a summary as the last line; exits 1 on any
 * problem.
 */

import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { register } from 'node:module'
import { join, relative, resolve, sep } from 'node:path'
import { pathToFileURL } from 'node:url'

const ROOT = resolve(import.meta.dirname, '..')
register('./scripts/ts-resolve.mjs', pathToFileURL(`${ROOT}/`))

const audit = await import(pathToFileURL(join(ROOT, 'src/seo/audit.ts')).href)
const registry = await import(pathToFileURL(join(ROOT, 'src/config/pages.ts')).href)
const { SITE } = await import(pathToFileURL(join(ROOT, 'src/config/site.ts')).href)
const { faqFor } = await import(pathToFileURL(join(ROOT, 'src/data/faq.ts')).href)
const { PROSIGN_MEANINGS } = await import(
  pathToFileURL(join(ROOT, 'src/data/morseAlphabet.ts')).href
)

const { createLastmod, lastmodVerdict } = await import(
  pathToFileURL(join(ROOT, 'scripts/lastmod.mjs')).href
)
const lastmodFor = createLastmod({ root: ROOT })

const DIST = resolve(process.argv[2] ?? join(ROOT, 'dist'))
const LIMITS = { title: registry.TITLE_MAX, description: registry.DESCRIPTION_MAX }

/** The crawlers robots.txt must always allow, whatever else it lists. */
const REQUIRED_CRAWLERS = [
  'GPTBot',
  'OAI-SearchBot',
  'ChatGPT-User',
  'ClaudeBot',
  'PerplexityBot',
  'Google-Extended',
  'CCBot',
]

const problems = []
const warnings = []
const fail = (where, message) => problems.push(`FAIL  ${where}: ${message}`)
let okCount = 0
const ok = (message) => {
  okCount++
  console.log(`ok    ${message}`)
}

if (!existsSync(DIST)) {
  console.log(`FAIL  no ${DIST} directory; run the build first`)
  console.log('SEO check could not run')
  process.exit(1)
}

/* -------------------------------------------------------------------------- */
/* Pages                                                                      */
/* -------------------------------------------------------------------------- */

/** Every .html file under dist, as [file, site path]. */
function htmlPages(dir) {
  const out = []
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...htmlPages(full))
    else if (name.endsWith('.html')) {
      const rel = relative(DIST, full).split(sep).join('/')
      const path =
        rel === 'index.html'
          ? '/'
          : rel.endsWith('/index.html')
            ? `/${rel.slice(0, -'index.html'.length)}`
            : `/${rel.replace(/\.html$/, '')}/`
      out.push([full, path])
    }
  }
  return out
}

/** The dist file a same-site URL is served from, or null for another origin. */
function distFileFor(url) {
  const parsed = new URL(url, SITE.url)
  if (parsed.origin !== new URL(SITE.url).origin) return null
  const pathname = decodeURIComponent(parsed.pathname)
  return join(DIST, pathname.endsWith('/') ? `${pathname}index.html` : pathname)
}

const pages = htmlPages(DIST)
const indexable = new Set()
const noindexed = new Set()
const markdownLinks = new Map()

for (const [file, path] of pages) {
  const html = readFileSync(file, 'utf8')
  const head = audit.readHead(html)
  const entry = registry.findPage(path)
  const url = new URL(path, SITE.url).href
  const shouldIndex = entry ? entry.indexable : !audit.isNoindex(head.robots)

  const found = shouldIndex
    ? audit.indexablePageProblems({ html, url, limits: LIMITS })
    : audit.noindexPageProblems(html)
  for (const message of found) fail(path, message)
  ;(shouldIndex ? indexable : noindexed).add(url)

  for (const image of head.ogImages) {
    const target = distFileFor(image)
    if (target === null) fail(path, `og:image ${image} is not on this site`)
    else if (!existsSync(target)) fail(path, `og:image ${image} is not in dist`)
  }

  for (const href of head.markdown) markdownLinks.set(href, path)
  if (entry?.markdown && !head.markdown.includes(new URL(entry.markdown, SITE.url).href)) {
    fail(path, `does not link its Markdown copy ${entry.markdown}`)
  }
}
ok(`${pages.length} pages: ${indexable.size} indexable, ${noindexed.size} noindexed`)

/* -------------------------------------------------------------------------- */
/* Markdown alternates                                                        */
/* -------------------------------------------------------------------------- */

let markdownOk = 0
for (const [href, from] of markdownLinks) {
  const target = distFileFor(href)
  if (target === null) {
    fail(from, `Markdown alternate ${href} is not on this site`)
  } else if (!existsSync(target)) {
    fail(from, `Markdown alternate ${href} was not generated`)
  } else if (!audit.looksLikeMarkdown(readFileSync(target, 'utf8'))) {
    fail(from, `Markdown alternate ${href} does not contain Markdown`)
  } else {
    markdownOk++
  }
}
ok(`${markdownOk} of ${markdownLinks.size} Markdown alternates resolve to Markdown`)

/* -------------------------------------------------------------------------- */
/* Sitemap                                                                    */
/* -------------------------------------------------------------------------- */

const indexFile = join(DIST, 'sitemap-index.xml')
if (!existsSync(indexFile)) {
  fail('sitemap', 'sitemap-index.xml missing')
} else {
  const listed = new Map()
  for (const { loc } of audit.sitemapEntries(readFileSync(indexFile, 'utf8'))) {
    const file = join(DIST, new URL(loc).pathname)
    if (!existsSync(file)) {
      fail('sitemap', `${loc} is listed in the index but missing`)
      continue
    }
    for (const entry of audit.sitemapEntries(readFileSync(file, 'utf8'))) {
      listed.set(entry.loc, entry.lastmod)
    }
  }
  for (const [loc, lastmod] of listed) {
    if (noindexed.has(loc)) fail('sitemap', `${loc} is noindexed but listed`)
    const verdict = lastmodVerdict({
      lastmod,
      status: lastmod ? 'clean' : lastmodFor.status(new URL(loc).pathname),
    })
    if (verdict === 'fail') fail('sitemap', `${loc} has no <lastmod>`)
    else if (verdict === 'warn') {
      warnings.push(`WARN  sitemap: ${loc} has no <lastmod>; its sources are uncommitted`)
    } else if (Number.isNaN(new Date(lastmod).getTime())) {
      fail('sitemap', `${loc} has an invalid <lastmod> "${lastmod}"`)
    }
    if (!loc.endsWith('/')) fail('sitemap', `${loc} has no trailing slash`)
  }
  for (const url of indexable) {
    if (!listed.has(url)) fail('sitemap', `${url} is indexable but not listed`)
  }
  ok(`sitemap: ${listed.size} URLs`)
}

/* -------------------------------------------------------------------------- */
/* robots.txt, llms.txt, llms-full.txt                                        */
/* -------------------------------------------------------------------------- */

const read = (name) => {
  const file = join(DIST, name)
  if (existsSync(file)) return readFileSync(file, 'utf8')
  fail(name, 'missing')
  return null
}

const robots = read('robots.txt')
if (robots !== null) {
  const named = [...robots.matchAll(/^user-agent:\s*(\S+)/gim)].map((match) => match[1])
  const crawlers = [...new Set([...REQUIRED_CRAWLERS, ...named])]
  for (const message of audit.robotsProblems(robots, crawlers)) fail('robots.txt', message)
  ok(`robots.txt: ${crawlers.length} user agents checked`)
}

const built = new Set(pages.map(([, path]) => path))
// A registered indexable page with no output is a page that failed to build or
// was deleted without leaving the registry, and either way it would drop out of
// the sitemap and llms.txt checks below without a word. That is a FAIL.
// SEO_ALLOW_UNBUILT=1 restores the old leniency for a deliberately partial build.
const allowUnbuilt = process.env.SEO_ALLOW_UNBUILT === '1'
const registered = registry.indexablePages().filter((page) => {
  if (built.has(page.path)) return true
  if (allowUnbuilt) warnings.push(`WARN  ${page.path}: registered as indexable but not built`)
  else fail(page.path, 'registered as indexable but not built')
  return false
})

const llms = read('llms.txt')
if (llms !== null) {
  for (const page of registered) {
    const url = registry.pageUrl(page.path)
    if (!llms.includes(`](${url})`)) fail('llms.txt', `does not link ${page.path}`)
  }
  ok(`llms.txt: checked ${registered.length} registry pages`)
}

const full = read('llms-full.txt')
if (full !== null) {
  for (const page of registered) {
    for (const item of faqFor(page.path)) {
      if (!full.includes(item.question)) {
        fail('llms-full.txt', `is missing the ${page.path} FAQ "${item.question}"`)
      }
    }
  }
  if (!/Punctuation in ITU-R M\.1677-1/.test(full) || !/Common punctuation not in/.test(full)) {
    fail('llms-full.txt', 'does not separate ITU and non-ITU punctuation')
  }
  for (const meaning of Object.values(PROSIGN_MEANINGS)) {
    if (!full.includes(meaning))
      fail('llms-full.txt', `is missing the prosign meaning "${meaning}"`)
  }
  ok('llms-full.txt: FAQs, punctuation split and prosigns')
}

/* -------------------------------------------------------------------------- */

for (const line of warnings) console.log(line)
for (const line of problems) console.log(line)
console.log(
  problems.length === 0
    ? `SEO: ${pages.length} pages, ${markdownOk} Markdown copies, all checks passed` +
        (warnings.length > 0 ? ` (${warnings.length} warning(s))` : '')
    : `SEO: ${problems.length} problem(s) across ${pages.length} pages`,
)
process.exit(problems.length === 0 ? 0 : 1)
