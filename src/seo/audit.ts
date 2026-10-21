/**
 * Read the SEO-relevant parts of built HTML, for `scripts/check-seo.mjs`.
 *
 * Deliberately dependency-free and regex-based: the input is Astro's own
 * output, whose shape is known, and the checks only need the head tags, the
 * `<h1>`s and the JSON-LD. Each helper is unit-tested on fixture HTML in
 * `audit.test.ts`, which is the part of the build check that can run without
 * a build.
 */

/** Decode the entities Astro emits in text and attribute values. */
export function decodeEntities(text: string): string {
  const named: Record<string, string> = {
    amp: '&',
    lt: '<',
    gt: '>',
    quot: '"',
    apos: "'",
    nbsp: ' ',
  }
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, entity: string) => {
    if (entity[0] === '#') {
      const code =
        entity[1] === 'x' || entity[1] === 'X'
          ? parseInt(entity.slice(2), 16)
          : parseInt(entity.slice(1), 10)
      return Number.isFinite(code) ? String.fromCodePoint(code) : match
    }
    return named[entity.toLowerCase()] ?? match
  })
}

/** Attributes of one start tag, lowercased names, decoded values. */
export function attributes(tag: string): Record<string, string> {
  const result: Record<string, string> = {}
  const body = tag.replace(/^<[a-z0-9-]+/i, '').replace(/\/?>$/, '')
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  for (const match of body.matchAll(pattern)) {
    const name = match[1]!.toLowerCase()
    result[name] = decodeEntities(match[2] ?? match[3] ?? match[4] ?? '')
  }
  return result
}

/** Every start tag of an element, e.g. all `<meta …>`. */
function startTags(html: string, name: string): string[] {
  return [...html.matchAll(new RegExp(`<${name}\\b[^>]*>`, 'gi'))].map((match) => match[0])
}

/** The `<head>`, or the whole document when there is no head element. */
export function headOf(html: string): string {
  const match = /<head\b[^>]*>([\s\S]*?)<\/head>/i.exec(html)
  return match ? match[1]! : html
}

/** The document without scripts, styles, templates and comments. */
export function withoutHiddenContent(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<(script|style|template|noscript)\b[\s\S]*?<\/\1>/gi, '')
}

export interface HeadInfo {
  title: string | null
  description: string | null
  canonical: string | null
  robots: string | null
  ogImages: string[]
  /** Raw text of each `application/ld+json` block. */
  jsonLd: string[]
  /** `href` of each `rel="alternate" type="text/markdown"` link. */
  markdown: string[]
}

/** The head tags the SEO check cares about. */
export function readHead(html: string): HeadInfo {
  const head = headOf(html)
  const metas = startTags(head, 'meta').map(attributes)
  const links = startTags(head, 'link').map(attributes)
  const meta = (key: 'name' | 'property', value: string) =>
    metas.filter((entry) => entry[key]?.toLowerCase() === value).map((entry) => entry.content ?? '')
  const rel = (value: string) =>
    links.filter((entry) => (entry.rel ?? '').toLowerCase().split(/\s+/).includes(value))

  const title = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(head)?.[1]
  const jsonLd = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => /type\s*=\s*["']?application\/ld\+json/i.test(match[1]!))
    .map((match) => match[2]!)

  return {
    title: title === undefined ? null : decodeEntities(title.trim()),
    description: meta('name', 'description')[0] ?? null,
    canonical: rel('canonical')[0]?.href ?? null,
    robots: meta('name', 'robots')[0] ?? null,
    ogImages: meta('property', 'og:image'),
    jsonLd,
    markdown: rel('alternate')
      .filter((entry) => (entry.type ?? '').toLowerCase() === 'text/markdown')
      .map((entry) => entry.href ?? ''),
  }
}

/** True for a robots value that keeps the page out of the index. */
export function isNoindex(robots: string | null): boolean {
  return robots !== null && /\bnoindex\b/i.test(robots)
}

/**
 * The `<h1>`s a reader can see: not `sr-only`, not `hidden`, not
 * `aria-hidden`, and not inside a script, style or template. Returns each
 * one's text, so a failure can say which headings it found.
 */
export function visibleH1s(html: string): string[] {
  const body = withoutHiddenContent(html)
  return [...body.matchAll(/<h1\b([^>]*)>([\s\S]*?)<\/h1>/gi)]
    .filter((match) => {
      const attrs = attributes(`<h1${match[1]}>`)
      const classes = (attrs.class ?? '').split(/\s+/)
      return !classes.includes('sr-only') && !('hidden' in attrs) && attrs['aria-hidden'] !== 'true'
    })
    .map((match) =>
      decodeEntities(match[2]!.replace(/<[^>]*>/g, ''))
        .replace(/\s+/g, ' ')
        .trim(),
    )
}

/** JSON-LD blocks that do not parse, with the parser's message. */
export function brokenJsonLd(blocks: readonly string[]): string[] {
  return blocks.flatMap((block, index) => {
    try {
      JSON.parse(block)
      return []
    } catch (error) {
      return [`block ${index + 1}: ${(error as Error).message}`]
    }
  })
}

/** `<loc>` and `<lastmod>` of every `<url>` (or `<sitemap>`) entry. */
export function sitemapEntries(xml: string): { loc: string; lastmod: string | null }[] {
  return [...xml.matchAll(/<(url|sitemap)>([\s\S]*?)<\/\1>/g)].map((match) => {
    const inner = match[2]!
    return {
      loc: decodeEntities(/<loc>([\s\S]*?)<\/loc>/.exec(inner)?.[1]?.trim() ?? ''),
      lastmod: /<lastmod>([\s\S]*?)<\/lastmod>/.exec(inner)?.[1]?.trim() ?? null,
    }
  })
}

/** Whether a fetched body is Markdown rather than an HTML page served in its place. */
export function looksLikeMarkdown(text: string): boolean {
  const start = text.trimStart()
  return /^#\s+\S/.test(start) && !/^<(!doctype|html)/i.test(start)
}

/**
 * Problems with robots.txt: an AI crawler without `Allow: /`, or any group
 * that disallows the whole site.
 */
export function robotsProblems(robots: string, crawlers: readonly string[]): string[] {
  const groups = new Map<string, string[]>()
  let current: string[] = []
  let agents: string[] = []
  for (const raw of robots.split('\n')) {
    const line = raw.replace(/#.*/, '').trim()
    if (!line) continue
    const [field, ...rest] = line.split(':')
    const value = rest.join(':').trim()
    if (field!.toLowerCase() === 'user-agent') {
      if (current.length > 0) agents = []
      current = []
      agents.push(value)
      groups.set(value, current)
    } else {
      current.push(`${field!.toLowerCase()}: ${value}`)
      for (const agent of agents) groups.set(agent, current)
    }
  }
  const problems: string[] = []
  for (const crawler of crawlers) {
    const rules = groups.get(crawler)
    if (!rules) problems.push(`${crawler} is not named`)
    else if (!rules.includes('allow: /')) problems.push(`${crawler} has no "Allow: /"`)
  }
  for (const [agent, rules] of groups) {
    if (rules.includes('disallow: /')) problems.push(`${agent} is disallowed from the whole site`)
  }
  return problems
}

export interface PageAuditInput {
  html: string
  /** Absolute URL the page is served at, with its trailing slash. */
  url: string
  limits: { title: number; description: number }
}

/**
 * Every problem with one indexable page: the visible H1, title and
 * description lengths, a self canonical with a trailing slash, and JSON-LD
 * that parses. An empty list means it passes.
 */
export function indexablePageProblems({ html, url, limits }: PageAuditInput): string[] {
  const head = readHead(html)
  const problems: string[] = []

  const h1s = visibleH1s(html)
  if (h1s.length !== 1) {
    problems.push(
      `has ${h1s.length} visible <h1>${h1s.length === 0 ? '' : `: ${h1s.map((h) => `"${h}"`).join(', ')}`}`,
    )
  }

  if (!head.title) problems.push('has no <title>')
  else if (head.title.length > limits.title) {
    problems.push(`title is ${head.title.length} characters (max ${limits.title}): "${head.title}"`)
  }

  if (!head.description) problems.push('has no meta description')
  else if (head.description.length > limits.description) {
    problems.push(
      `description is ${head.description.length} characters (max ${limits.description})`,
    )
  }

  if (!head.canonical) problems.push('has no canonical')
  else if (head.canonical !== url) problems.push(`canonical is ${head.canonical}, not ${url}`)
  else if (!new URL(head.canonical).pathname.endsWith('/')) {
    problems.push('canonical has no trailing slash')
  }

  if (isNoindex(head.robots)) problems.push(`is indexable but says robots="${head.robots}"`)

  problems.push(...brokenJsonLd(head.jsonLd).map((message) => `JSON-LD ${message}`))
  return problems
}

/** Every problem with a noindexed page: it must not declare a canonical, and its JSON-LD must parse. */
export function noindexPageProblems(html: string): string[] {
  const head = readHead(html)
  const problems: string[] = []
  if (!isNoindex(head.robots)) problems.push('is not noindexed')
  if (head.canonical) problems.push(`is noindexed but declares canonical ${head.canonical}`)
  problems.push(...brokenJsonLd(head.jsonLd).map((message) => `JSON-LD ${message}`))
  return problems
}
