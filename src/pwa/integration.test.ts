import { describe, expect, it } from 'vitest'
import { shouldPrecache, toUrl } from './integration'

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
