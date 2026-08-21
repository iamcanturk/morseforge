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

        // The cache name is derived from the file list, so any change to the
        // build produces a new cache and the old one is deleted on activate.
        // Without this the service worker would serve last week's app forever.
        const version = createHash('sha256')
          .update(files.sort().join('\n'))
          .digest('hex')
          .slice(0, 12)

        const sw = `// Generated at build time by src/pwa/integration.ts — do not edit.
const CACHE = 'morseforge-${version}'
const PRECACHE = ${JSON.stringify([...new Set(precache)].sort(), null, 2)}

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
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
          return response
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match('/'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((hit) => {
      if (hit) return hit
      return fetch(request).then((response) => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone()
          caches.open(CACHE).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
`

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
