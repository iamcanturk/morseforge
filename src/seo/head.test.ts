import { describe, expect, it } from 'vitest'
import { AUTHOR } from '../config/site'
import { DEFAULT_OG_IMAGE, OG_LOCALE, headMeta, jsonLd } from './head'

const SITE = 'https://morse.iamcanturk.dev'

describe('headMeta', () => {
  it('indexes a normal page with a self canonical', () => {
    const head = headMeta({ path: '/morse-code-alphabet/' }, SITE)
    expect(head.robots).toBeNull()
    expect(head.canonical).toBe(`${SITE}/morse-code-alphabet/`)
    expect(head.url).toBe(head.canonical)
    expect(head.structuredData).toBe(true)
    expect(head.ogType).toBe('website')
  })

  it('noindexes, keeps following links, drops the canonical and keeps JSON-LD', () => {
    const head = headMeta({ path: '/stats/', noindex: true }, SITE)
    expect(head.robots).toBe('noindex, follow')
    expect(head.canonical).toBeNull()
    expect(head.url).toBe(`${SITE}/stats/`)
    expect(head.structuredData).toBe(true)
  })

  it('lets private win over noindex and strips structured data', () => {
    const head = headMeta({ path: '/panel/', private: true, noindex: true }, SITE)
    expect(head.robots).toBe('noindex, nofollow, noarchive, nosnippet')
    expect(head.canonical).toBeNull()
    expect(head.structuredData).toBe(false)
  })

  it('uses the default share image with its size and alt text', () => {
    const { ogImage } = headMeta({ path: '/' }, SITE)
    expect(ogImage).toEqual({
      url: `${SITE}${DEFAULT_OG_IMAGE.path}`,
      alt: DEFAULT_OG_IMAGE.alt,
      width: DEFAULT_OG_IMAGE.width,
      height: DEFAULT_OG_IMAGE.height,
    })
  })

  it('takes a custom share image without claiming a size for it', () => {
    const { ogImage } = headMeta(
      { path: '/words/sos/', ogImage: '/og/words/sos.png', ogImageAlt: 'SOS' },
      SITE,
    )
    expect(ogImage).toEqual({
      url: `${SITE}/og/words/sos.png`,
      alt: 'SOS',
      width: null,
      height: null,
    })
  })

  it('passes through the size a page gives for its own share image', () => {
    const { ogImage } = headMeta(
      {
        path: '/words/sos/',
        ogImage: '/og/words/sos.png',
        ogImageAlt: 'SOS keyed on an oscilloscope',
        ogImageWidth: 1200,
        ogImageHeight: 630,
      },
      SITE,
    )
    expect(ogImage).toEqual({
      url: `${SITE}/og/words/sos.png`,
      alt: 'SOS keyed on an oscilloscope',
      width: 1200,
      height: 630,
    })
  })

  it('describes what the default card shows', () => {
    expect(DEFAULT_OG_IMAGE.alt).toBe(
      'The MorseForge logo, an oscilloscope trace keying M, and MORSEFORGE as a Morse square wave',
    )
    expect([DEFAULT_OG_IMAGE.width, DEFAULT_OG_IMAGE.height]).toEqual([1200, 630])
  })

  it('keeps an absolute share image URL as it is', () => {
    const { ogImage } = headMeta({ path: '/', ogImage: 'https://cdn.example/x.png' }, SITE)
    expect(ogImage.url).toBe('https://cdn.example/x.png')
  })

  it('makes an article an article, with its times and author', () => {
    const head = headMeta(
      {
        path: '/blog/x/',
        article: { published: new Date('2026-08-01'), modified: '2026-10-21' },
      },
      SITE,
    )
    expect(head.ogType).toBe('article')
    expect(head.articleMeta).toEqual([
      { property: 'article:published_time', content: '2026-08-01T00:00:00.000Z' },
      { property: 'article:modified_time', content: '2026-10-21T00:00:00.000Z' },
      { property: 'article:author', content: AUTHOR.url },
    ])
  })

  it('omits the modified time when there is none, and honours an explicit ogType', () => {
    const head = headMeta(
      { path: '/blog/x/', ogType: 'website', article: { published: '2026-08-01' } },
      SITE,
    )
    expect(head.ogType).toBe('website')
    expect(head.articleMeta.map((entry) => entry.property)).toEqual([
      'article:published_time',
      'article:author',
    ])
  })

  it('refuses an invalid date rather than printing one', () => {
    expect(() => headMeta({ path: '/', article: { published: 'soon' } }, SITE)).toThrow(RangeError)
  })

  it('says the copy is British English', () => {
    expect(OG_LOCALE).toBe('en_GB')
  })
})

describe('jsonLd', () => {
  it('cannot close its script element early, and still parses to the same value', () => {
    const value = { text: '</script><script>alert(1)</script>' }
    const out = jsonLd(value)
    expect(out).not.toContain('</script>')
    expect(JSON.parse(out)).toEqual(value)
  })
})
