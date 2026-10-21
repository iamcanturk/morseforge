import { Script, runInNewContext } from 'node:vm'
import { describe, expect, it } from 'vitest'
import { cacheVersion, serviceWorkerSource, shouldPrecache, toUrl } from './integration'

describe('shouldPrecache', () => {
  it('includes the app itself', () => {
    expect(shouldPrecache('index.html')).toBe(true)
    expect(shouldPrecache('words/sos/index.html')).toBe(true)
    expect(shouldPrecache('_astro/client.abc123.js')).toBe(true)
    expect(shouldPrecache('_astro/index.abc123.css')).toBe(true)
    expect(shouldPrecache('icons/icon-512.png')).toBe(true)
    expect(shouldPrecache('favicon.svg')).toBe(true)
  })

  it('never precaches the service worker itself', () => {
    // A worker that caches itself pins the current version in place and makes
    // every future release invisible.
    expect(shouldPrecache('sw.js')).toBe(false)
  })

  it('leaves crawler endpoints alone', () => {
    // Crawlers do not run service workers, so caching these only spends the
    // user's storage — and a sitemap served stale from cache is worse than one
    // fetched fresh.
    expect(shouldPrecache('robots.txt')).toBe(false)
    expect(shouldPrecache('llms.txt')).toBe(false)
    expect(shouldPrecache('sitemap-index.xml')).toBe(false)
    expect(shouldPrecache('sitemap-0.xml')).toBe(false)
  })

  it('skips source maps, which no user ever requests', () => {
    expect(shouldPrecache('_astro/client.abc123.js.map')).toBe(false)
  })

  it('only excludes the top-level sw.js, not a page that happens to be named it', () => {
    expect(shouldPrecache('blog/sw.js')).toBe(true)
  })
})

describe('toUrl', () => {
  it('maps a directory index to the URL it is actually served at', () => {
    // The site uses directory URLs, so `words/sos/index.html` is fetched as
    // `/words/sos/`. Precaching the index.html form would miss every request.
    expect(toUrl('index.html')).toBe('/')
    expect(toUrl('words/sos/index.html')).toBe('/words/sos/')
    expect(toUrl('learn-morse-code-in-7-days/index.html')).toBe('/learn-morse-code-in-7-days/')
  })

  it('leaves assets as plain paths', () => {
    expect(toUrl('_astro/client.abc123.js')).toBe('/_astro/client.abc123.js')
    expect(toUrl('icons/icon-512.png')).toBe('/icons/icon-512.png')
  })

  it('does not rewrite an html file that is not a directory index', () => {
    expect(toUrl('404.html')).toBe('/404.html')
  })
})

/*
 * The service worker is generated as a string, so these tests run that exact
 * string in a sandbox against a small in-memory Cache API and a scripted
 * network. Testing a copy of the logic instead would let the shipped worker and
 * the tested one drift apart.
 */

const ORIGIN = 'https://morse.example'

interface FakeResponse {
  url: string
  ok: boolean
  status: number
  type: 'basic' | 'opaque' | 'cors'
  redirected: boolean
  /** The response's Vary header, if the host sent one. */
  vary?: string
  clone: () => FakeResponse
}

interface MatchOptions {
  ignoreSearch?: boolean
  ignoreVary?: boolean
}

interface FakeRequest {
  url: string
  method: string
  mode: string
}

function page(path: string, init: Partial<FakeResponse> = {}): FakeResponse {
  const status = init.status ?? 200
  const response: FakeResponse = {
    url: new URL(path, ORIGIN).href,
    ok: status >= 200 && status < 300,
    status,
    type: 'basic',
    redirected: false,
    clone: () => response,
    ...init,
  }
  return response
}

// The Cache API never matches on the fragment, and only on the query string
// when asked not to — which is the behaviour the worker has to cope with.
function keyOf(input: string | FakeRequest, ignoreSearch = false): string {
  const url = new URL(typeof input === 'string' ? input : input.url, ORIGIN)
  url.hash = ''
  if (ignoreSearch) url.search = ''
  return url.href
}

// A stored response whose Vary names a header beyond Accept-Encoding only
// matches a request that sent the same value. The precache stores files from
// plain requests, and a page asks for module scripts and fonts with an Origin
// header, so here such a response simply misses unless Vary is ignored.
function varyMisses(response: FakeResponse | undefined, options: MatchOptions = {}): boolean {
  if (!response?.vary || options.ignoreVary) return false
  return response.vary
    .split(',')
    .map((name) => name.trim().toLowerCase())
    .some((name) => name !== '' && name !== 'accept-encoding')
}

function fakeCaches() {
  const stores = new Map<string, Map<string, FakeResponse>>()

  const find = (
    store: Map<string, FakeResponse>,
    input: string | FakeRequest,
    options: MatchOptions = {},
  ) => {
    let hit: FakeResponse | undefined
    if (!options.ignoreSearch) hit = store.get(keyOf(input))
    else {
      const wanted = keyOf(input, true)
      for (const [key, value] of store) if (keyOf(key, true) === wanted) hit = value
    }
    return varyMisses(hit, options) ? undefined : hit
  }

  const open = async (name: string) => {
    if (!stores.has(name)) stores.set(name, new Map())
    const store = stores.get(name)!
    return {
      put: async (input: string | FakeRequest, response: FakeResponse) => {
        store.set(keyOf(input), response)
      },
      add: async (input: string) => {
        const response = await network(new URL(input, ORIGIN).href)
        if (!response.ok) throw new TypeError(`${input} failed`)
        store.set(keyOf(input), response)
      },
      match: async (input: string | FakeRequest, options?: MatchOptions) =>
        find(store, input, options),
    }
  }

  const api = {
    open,
    keys: async () => [...stores.keys()],
    delete: async (name: string) => stores.delete(name),
    match: async (input: string | FakeRequest, options?: MatchOptions) => {
      for (const store of stores.values()) {
        const hit = find(store, input, options)
        if (hit) return hit
      }
      return undefined
    },
  }

  return { api, stores }
}

// What the server would answer, by URL. Unknown paths are a 404, as on nginx.
let server: Record<string, FakeResponse> = {}
let online = true

async function network(url: string): Promise<FakeResponse> {
  if (!online) throw new TypeError('Failed to fetch')
  const key = keyOf(url, true)
  return server[key] ?? page(new URL(url).pathname, { status: 404 })
}

const PAGES = ['/', '/challenge/', '/message/', '/learn/', '/_astro/client.abc123.js']

async function installWorker(precache = PAGES, init: Partial<FakeResponse> = {}) {
  server = Object.fromEntries(PAGES.map((path) => [new URL(path, ORIGIN).href, page(path, init)]))
  online = true

  const { api, stores } = fakeCaches()
  const listeners = new Map<string, (event: unknown) => void>()
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (type: string, listener: (event: unknown) => void) =>
      listeners.set(type, listener),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  }

  const source = serviceWorkerSource('test', precache)
  runInNewContext(source, {
    self,
    caches: api,
    fetch: (request: string | FakeRequest) =>
      network(typeof request === 'string' ? request : request.url),
    URL,
    Promise,
  })

  const lifecycle = async (type: string) => {
    let done: Promise<unknown> = Promise.resolve()
    listeners.get(type)!({ waitUntil: (promise: Promise<unknown>) => (done = promise) })
    await done
  }

  await lifecycle('install')
  await lifecycle('activate')

  // Returns undefined when the worker lets the request through untouched.
  const request = async (path: string, mode = 'navigate') => {
    let answer: Promise<FakeResponse> | undefined
    listeners.get('fetch')!({
      request: { url: new URL(path, ORIGIN).href, method: 'GET', mode },
      respondWith: (promise: Promise<FakeResponse>) => (answer = promise),
      waitUntil: () => undefined,
    })
    const response = answer && (await answer)
    // Writes to the cache are not awaited by the worker, so let them land.
    await new Promise((resolve) => setTimeout(resolve, 0))
    return response
  }

  const cache = () => stores.get('morseforge-test')!

  return { request, cache, stores, lifecycle }
}

describe('serviceWorkerSource', () => {
  it('is a script that parses, with its version and precache list filled in', () => {
    const source = serviceWorkerSource('abc', ['/learn/', '/', '/learn/'])
    expect(() => new Script(source)).not.toThrow()
    expect(source).toContain("const CACHE = 'morseforge-abc'")
    // The list is de-duplicated and sorted, so the same build gives the same file.
    expect(source).toContain(JSON.stringify(['/', '/learn/'], null, 2))
  })
})

describe('service worker offline navigation', () => {
  it('serves a seeded challenge link from the cached challenge page, not the home page', async () => {
    const sw = await installWorker()
    online = false
    const response = await sw.request('/challenge/?seed=k7f3&beat=340')
    expect(response?.url).toBe(`${ORIGIN}/challenge/`)
  })

  it('serves a message link with its payload in the hash from the message page', async () => {
    const sw = await installWorker()
    online = false
    const response = await sw.request('/message/#abc')
    expect(response?.url).toBe(`${ORIGIN}/message/`)
  })

  it('finds the directory form of a path typed without its trailing slash', async () => {
    const sw = await installWorker()
    online = false
    expect((await sw.request('/challenge?seed=x'))?.url).toBe(`${ORIGIN}/challenge/`)
  })

  it('falls back to the home page only for a page it has never seen', async () => {
    const sw = await installWorker()
    online = false
    expect((await sw.request('/no-such-page/?a=1'))?.url).toBe(`${ORIGIN}/`)
  })
})

describe('service worker runtime caching', () => {
  it('stores navigations under their pathname, so unique links do not grow the cache', async () => {
    const sw = await installWorker()
    const before = sw.cache().size

    for (const seed of ['a', 'b', 'c', 'd']) {
      const response = await sw.request(`/challenge/?seed=${seed}&beat=340#top`)
      expect(response?.ok).toBe(true)
    }

    expect(sw.cache().size).toBe(before)
    expect([...sw.cache().keys()].some((key) => key.includes('?'))).toBe(false)
  })

  it('refreshes the cached page from the network while online', async () => {
    const sw = await installWorker()
    const fresh = page('/learn/')
    server[`${ORIGIN}/learn/`] = fresh
    await sw.request('/learn/?from=home')
    expect(sw.cache().get(`${ORIGIN}/learn/`)).toBe(fresh)
  })

  it('never caches an error page, so offline it is not served as the real one', async () => {
    const sw = await installWorker()
    server[`${ORIGIN}/learn/`] = page('/learn/', { status: 500 })
    await sw.request('/learn/')
    await sw.request('/gone/')

    expect(sw.cache().get(`${ORIGIN}/learn/`)?.status).toBe(200)
    expect(sw.cache().has(`${ORIGIN}/gone/`)).toBe(false)

    online = false
    expect((await sw.request('/learn/'))?.status).toBe(200)
  })

  it('does not cache a redirected navigation, which a browser refuses to serve', async () => {
    const sw = await installWorker()
    server[`${ORIGIN}/old/`] = page('/learn/', { redirected: true })
    await sw.request('/old/')
    expect(sw.cache().has(`${ORIGIN}/old/`)).toBe(false)
  })

  it('does not cache opaque or error assets, nor assets with a query string', async () => {
    const sw = await installWorker()
    server[`${ORIGIN}/icons/x.png`] = page('/icons/x.png', { type: 'opaque' })
    server[`${ORIGIN}/icons/y.png`] = page('/icons/y.png')

    await sw.request('/icons/x.png', 'no-cors')
    await sw.request('/icons/missing.png', 'no-cors')
    await sw.request('/icons/y.png?v=2', 'no-cors')
    expect(sw.cache().has(`${ORIGIN}/icons/x.png`)).toBe(false)
    expect(sw.cache().has(`${ORIGIN}/icons/missing.png`)).toBe(false)
    expect([...sw.cache().keys()].some((key) => key.includes('y.png'))).toBe(false)

    await sw.request('/icons/y.png', 'no-cors')
    expect(sw.cache().has(`${ORIGIN}/icons/y.png`)).toBe(true)
  })

  it('serves hashed assets straight from the cache', async () => {
    const sw = await installWorker()
    online = false
    expect((await sw.request('/_astro/client.abc123.js', 'no-cors'))?.ok).toBe(true)
  })

  it('serves precached assets and pages offline even when the host sends Vary: Origin', async () => {
    const sw = await installWorker(PAGES, { vary: 'Origin' })
    online = false
    expect((await sw.request('/_astro/client.abc123.js', 'cors'))?.ok).toBe(true)
    expect((await sw.request('/challenge/?seed=x'))?.url).toBe(`${ORIGIN}/challenge/`)
  })

  it('leaves other origins and non-GET requests to the browser', async () => {
    const sw = await installWorker()
    expect(await sw.request('https://fonts.example/a.woff2', 'cors')).toBeUndefined()
  })

  it('deletes every other cache on activate', async () => {
    const sw = await installWorker()
    sw.stores.set('morseforge-old', new Map())
    await sw.lifecycle('activate')
    expect([...sw.stores.keys()]).toEqual(['morseforge-test'])
  })
})

describe('cacheVersion', () => {
  const bytes = (text: string) => new TextEncoder().encode(text)
  const build = (favicon: string) => [
    { path: 'index.html', bytes: bytes('<h1>MorseForge</h1>') },
    { path: 'favicon.svg', bytes: bytes(favicon) },
    { path: '_astro/client.abc123.js', bytes: bytes('export {}') },
  ]

  it('changes when only an unhashed file changes, with the same names', () => {
    // A new favicon, icon or share image keeps its name, so a hash of names
    // alone left sw.js byte-identical and the old files cached forever.
    expect(cacheVersion(build('<svg>new</svg>'), 'sw')).not.toBe(
      cacheVersion(build('<svg>old</svg>'), 'sw'),
    )
  })

  it('changes with the worker code, and with a renamed file', () => {
    const base = cacheVersion(build('x'), 'sw')
    expect(cacheVersion(build('x'), 'sw v2')).not.toBe(base)
    const renamed = build('x').map((entry, index) =>
      index === 0 ? { ...entry, path: 'home.html' } : entry,
    )
    expect(cacheVersion(renamed, 'sw')).not.toBe(base)
  })

  it('is stable for the same build, in any file order', () => {
    const entries = build('x')
    expect(cacheVersion([...entries].reverse(), 'sw')).toBe(cacheVersion(entries, 'sw'))
    expect(cacheVersion(entries, 'sw')).toMatch(/^[0-9a-f]{12}$/)
  })

  it('does not let a path and its contents run together into another file', () => {
    const a = [{ path: 'ab', bytes: bytes('c') }]
    const b = [{ path: 'a', bytes: bytes('bc') }]
    expect(cacheVersion(a, 'sw')).not.toBe(cacheVersion(b, 'sw'))
  })
})
