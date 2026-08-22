/**
 * Every internal link must go somewhere.
 *
 * A broken internal link is invisible in development — you wrote it, so you
 * know where it was meant to go — and it is the single most common way a
 * static site rots. It also costs real SEO: a crawler that follows a link to a
 * 404 learns the site is unmaintained.
 *
 * Reads the built output rather than the source, because that is what a
 * visitor gets: an `href` written in a component, in Markdown, or in a JSON-LD
 * block all end up here the same way.
 *
 *   node scripts/check-links.mjs [dist]
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

const DIST = resolve(process.argv[2] ?? 'dist')

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) walk(full, files)
    else files.push(full)
  }
  return files
}

const all = walk(DIST)
const pages = all.filter((file) => file.endsWith('.html'))

/** Everything the build actually produced, as site-absolute paths. */
const present = new Set()
for (const file of all) {
  const path = '/' + relative(DIST, file).split('\\').join('/')
  present.add(path)
  // A directory index is reachable as the directory itself.
  if (path.endsWith('/index.html')) {
    present.add(path.slice(0, -'index.html'.length))
    present.add(path.slice(0, -'/index.html'.length))
  }
}

const exists = (path) => {
  if (present.has(path)) return true
  // Trailing-slash tolerance: the site is configured for it, so both spellings
  // resolve at the origin.
  if (path.endsWith('/')) return present.has(path.slice(0, -1))
  return present.has(`${path}/`)
}

const HREF = /(?:href|src)="([^"]+)"/g

const broken = []
let checked = 0

for (const page of pages) {
  const html = readFileSync(page, 'utf8')
  const from = '/' + relative(DIST, page).replace(/index\.html$/, '')

  for (const match of html.matchAll(HREF)) {
    const raw = match[1]

    // Off-site, in-page, and non-HTTP schemes are not this script's business.
    if (!raw.startsWith('/')) continue
    if (raw.startsWith('//')) continue

    const path = raw.split('#')[0].split('?')[0]
    if (path === '') continue

    checked++
    if (!exists(path)) broken.push({ from, to: raw })
  }
}

if (broken.length > 0) {
  console.error(`${broken.length} broken internal link(s):\n`)
  for (const { from, to } of broken) console.error(`  ${from}  ->  ${to}`)
  process.exit(1)
}

console.log(`Links: ${checked} internal references across ${pages.length} pages, all resolve.`)
