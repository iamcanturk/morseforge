import type { AstroIntegration } from 'astro'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, relative, sep } from 'node:path'

/**
 * A minimal PWA integration: web app manifest plus a precaching service worker.
 *
 * Hand-rolled rather than using `@vite-pwa/astro`, which supports Astro 5 and
 * below. Downgrading Astro to keep a plugin is the wrong trade when the plugin
 * replaces about eighty lines: this app is fully static and local-first, so
 * "cache the build output" is the entire caching strategy.
 *
 * The service worker is generated at `astro:build:done`, when the final file
 * names — including their content hashes — are known. Writing it by hand would
 * mean a precache list that silently goes stale on the next build.
 */

export interface PwaOptions {
  name: string
  shortName: string
  description: string
  themeColor: string
  backgroundColor: string
  startUrl: string
}

/**
 * Files that must never be precached.
 *
 * `sw.js` caching itself would pin the current worker in place and make every
 * future release invisible. The text and XML endpoints are for crawlers, which
 * do not run service workers, so caching them only wastes a user's quota — and
 * a stale sitemap served from cache is worse than none.
 */
const EXCLUDED = new Set(['sw.js', 'robots.txt', 'llms.txt'])

const EXCLUDED_EXTENSIONS = ['.map', '.xml']

/** Whether a built file belongs in the precache. Pure, so it can be tested. */
export function shouldPrecache(path: string): boolean {
  if (EXCLUDED.has(path)) return false
  return !EXCLUDED_EXTENSIONS.some((extension) => path.endsWith(extension))
}

/**
 * The URL a built file is served at. `about/index.html` is fetched as `/about/`,
 * and precaching the `index.html` form instead would miss every real request.
 */
export function toUrl(path: string): string {
  return `/${path}`.replace(/\/index\.html$/, '/')
}

async function collectFiles(root: string, current = root): Promise<string[]> {
  const entries = await readdir(current, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const full = join(current, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await collectFiles(root, full)))
      continue
    }
    const path = relative(root, full).split(sep).join('/')
    if (shouldPrecache(path)) files.push(path)
  }

  return files
}

/**
 * The service worker source, as a string.
 *
 * It is a string rather than functions serialised with `toString()` because
 * what ships has to be exactly what is tested: coverage instrumentation or a
 * transpiler helper injected into a serialised function would break the worker
 * in production while every test still passed. The tests evaluate this string.
 */
export function serviceWorkerSource(version: string, precache: string[]): string {
  return `// Generated at build time by src/pwa/integration.ts — do not edit.
const CACHE = 'morseforge-${version}'
const PRECACHE = ${JSON.stringify([...new Set(precache)].sort(), null, 2)}

// A page is cached under its pathname alone. Challenge and message links carry
// their state in the query string or hash, and the page reads it on the client,
// so /challenge/?seed=k7f3 is the same document as /challenge/. Keying on the
// full URL would miss the precached copy offline and file every unique link as
// a new entry, growing the cache without limit.
function cacheKeyFor(url) {
  const parsed = new URL(url)
  return parsed.origin + parsed.pathname
}

// Matches ignore Vary. A host that sends "Vary: Origin" would otherwise make
// every module script and font miss offline: the precache stored them from
// requests without an Origin header, and the page asks for them with one.
// Every file here is one build's copy of our own file, so whatever the header
// names cannot change which response is right.
const MATCH = { ignoreVary: true }

// Only a real copy of our own file is worth keeping. A cached 404 or 500 would
// be served offline as if it were the page; an opaque response hides its status
// entirely. A redirected response cannot answer a navigation — the browser
// rejects it — so it would turn a working page into a network error.
function shouldCache(response) {
  return response.ok && response.type === 'basic' && !response.redirected
}

// Offline, try the page itself, then its directory form (/challenge/ for
// /challenge), and only then the home page, which is better than the browser's
// offline error.
function cachedPage(url) {
  const key = cacheKeyFor(url)
  return caches
    .match(key, MATCH)
    .then((hit) => hit || (key.endsWith('/') ? undefined : caches.match(key + '/', MATCH)))
    .then((hit) => hit || caches.match('/', MATCH))
}

// A failed write (storage quota, say) must not become an unhandled rejection:
// the response has already been served, and the next visit tries again.
function store(key, response) {
  return caches
    .open(CACHE)
    .then((cache) => cache.put(key, response))
    .catch(() => {})
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE)
      // addAll rejects the whole batch if one request fails, which would leave
      // the worker permanently uninstalled. Cache what we can.
      .then((cache) => Promise.allSettled(PRECACHE.map((url) => cache.add(url))))
      .then(() => self.skipWaiting()),
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  if (url.origin !== self.location.origin) return

  // Navigations are network-first: a returning visitor should get the current
  // build, and only fall back to the cached copy when genuinely offline.
  // Assets are hashed, so for those the cache can be trusted outright.
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (shouldCache(response)) store(cacheKeyFor(url), response.clone())
          return response
        })
        .catch(() => cachedPage(url)),
    )
    return
  }

  event.respondWith(
    caches.match(request, MATCH).then((hit) => {
      if (hit) return hit
      return fetch(request).then((response) => {
        // Every built file is already precached, so an asset with a query
        // string is never one of ours under a new name — caching it would only
        // add one entry per unique URL.
        if (shouldCache(response) && !url.search) store(request, response.clone())
        return response
      })
    }),
  )
})
`
}

/** One precached file, as the cache version sees it. */
export interface PrecacheEntry {
  /** Path relative to the build output. */
  path: string
  bytes: Uint8Array
}

/**
 * The cache name for a build: a hash of every precached file's path *and
 * contents*, plus the worker's own code.
 *
 * A new name means a new cache, and the old one is deleted on activate.
 * Without it the worker would serve last week's app forever. Names alone are
 * not enough: `_astro/` files carry a content hash in their names, but the
 * favicon, the icons, the share images and the manifest do not, and a release
 * that changed only those left `sw.js` byte-identical, so returning visitors
 * were served the old files from the cache indefinitely. The worker's code is
 * in the hash too: a release that changes only how pages are cached must still
 * retire whatever the previous worker stored under its rules.
 *
 * Pure, so it can be tested without a build. Order-independent.
 */
export function cacheVersion(entries: readonly PrecacheEntry[], workerSource: string): string {
  const hash = createHash('sha256')
  for (const entry of [...entries].sort((a, b) =>
    a.path < b.path ? -1 : a.path > b.path ? 1 : 0,
  )) {
    // Length-prefixed, so no path and contents can run together into another.
    hash.update(`${entry.path}\n${entry.bytes.byteLength}\n`)
    hash.update(entry.bytes)
    hash.update('\n')
  }
  hash.update(workerSource)
  return hash.digest('hex').slice(0, 12)
}

export function pwa(options: PwaOptions): AstroIntegration {
  return {
    name: 'morseforge:pwa',
    hooks: {
      'astro:build:done': async ({ dir, logger }) => {
        const outDir = dir.pathname

        const manifest = {
          name: options.name,
          short_name: options.shortName,
          description: options.description,
          start_url: options.startUrl,
          scope: '/',
          display: 'standalone',
          orientation: 'any',
          theme_color: options.themeColor,
          background_color: options.backgroundColor,
          icons: [
            { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
            {
              src: '/icons/icon-maskable-512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
            { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
          ],
        }

        await writeFile(join(outDir, 'manifest.webmanifest'), JSON.stringify(manifest, null, 2))

        const files = await collectFiles(outDir)
        const precache = files.map(toUrl)

        const entries = await Promise.all(
          [...files].sort().map(async (path) => ({
            path,
            bytes: await readFile(join(outDir, path)),
          })),
        )
        const version = cacheVersion(entries, serviceWorkerSource('', precache))

        const sw = serviceWorkerSource(version, precache)

        await writeFile(join(outDir, 'sw.js'), sw)
        logger.info(`manifest + service worker written, precaching ${precache.length} files`)
      },
    },
  }
}

/** Read a generated file back, for build-time assertions in tests. */
export async function readGenerated(outDir: string, name: string): Promise<string> {
  return readFile(join(outDir, name), 'utf8')
}
