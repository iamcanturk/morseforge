import { describe, expect, it } from 'vitest'
import {
  attributes,
  brokenJsonLd,
  decodeEntities,
  indexablePageProblems,
  isNoindex,
  looksLikeMarkdown,
  noindexPageProblems,
  readHead,
  robotsProblems,
  sitemapEntries,
  visibleH1s,
} from './audit'

const URL_ = 'https://morse.iamcanturk.dev/morse-code-alphabet/'
const LIMITS = { title: 60, description: 155 }

/** A page shaped like Astro's output for BaseLayout. */
function page({
  title = 'The Morse Code Alphabet | MorseForge',
  description = 'Every letter, digit and mark, playable.',
  canonical = URL_ as string | null,
  robots = null as string | null,
  body = '<h1 class="font-display">The Morse code alphabet</h1>',
  jsonLd = ['{"@context":"https://schema.org","@type":"WebPage"}'],
  extraHead = '',
} = {}) {
  return [
    '<!DOCTYPE html><html lang="en"><head>',
    '<meta charset="utf-8">',
    `<title>${title}</title>`,
    `<meta name="description" content="${description}">`,
    robots ? `<meta name="robots" content="${robots}">` : '',
    canonical ? `<link rel="canonical" href="${canonical}">` : '',
    '<meta property="og:image" content="https://morse.iamcanturk.dev/og/default.png">',
    '<link rel="alternate" type="text/markdown" href="https://morse.iamcanturk.dev/morse-code-alphabet.md" title="Markdown">',
    ...jsonLd.map((block) => `<script type="application/ld+json">${block}</script>`),
    extraHead,
    '</head><body>',
    '<a href="#main" class="sr-only">Skip</a>',
    body,
    '</body></html>',
  ].join('')
}

describe('decodeEntities and attributes', () => {
  it('decodes named and numeric entities', () => {
    expect(decodeEntities('Tom &amp; Jerry &#39;n&#x27; &quot;co&quot; &lt;3&gt;')).toBe(
      `Tom & Jerry 'n' "co" <3>`,
    )
    expect(decodeEntities('&unknown;')).toBe('&unknown;')
  })

  it('reads quoted, unquoted and bare attributes', () => {
    expect(attributes('<link rel="canonical" href=\'/x/\' data-x=1 hidden>')).toEqual({
      rel: 'canonical',
      href: '/x/',
      'data-x': '1',
      hidden: '',
    })
  })
})

describe('readHead', () => {
  it('reads every tag the check uses', () => {
    const head = readHead(page({ title: 'Dots &amp; Dashes | MorseForge' }))
    expect(head.title).toBe('Dots & Dashes | MorseForge')
    expect(head.description).toBe('Every letter, digit and mark, playable.')
    expect(head.canonical).toBe(URL_)
    expect(head.robots).toBeNull()
    expect(head.ogImages).toEqual(['https://morse.iamcanturk.dev/og/default.png'])
    expect(head.markdown).toEqual(['https://morse.iamcanturk.dev/morse-code-alphabet.md'])
    expect(head.jsonLd).toHaveLength(1)
  })

  it('ignores a <title> inside an SVG in the body', () => {
    const html = page({ body: '<h1>A</h1><svg><title>MorseForge</title></svg>' })
    expect(readHead(html).title).toBe('The Morse Code Alphabet | MorseForge')
  })

  it('recognises noindex', () => {
    expect(isNoindex('noindex, follow')).toBe(true)
    expect(isNoindex('index, follow')).toBe(false)
    expect(isNoindex(null)).toBe(false)
  })
})

describe('visibleH1s', () => {
  it('counts a visible h1 and strips its markup', () => {
    expect(visibleH1s(page({ body: '<h1>Learn <em>Morse</em>\n code</h1>' }))).toEqual([
      'Learn Morse code',
    ])
  })

  it('does not count sr-only, hidden or aria-hidden headings', () => {
    const body = [
      '<h1 class="sr-only">Hidden brand</h1>',
      '<h1 hidden>Not shown</h1>',
      '<h1 aria-hidden="true">Decoration</h1>',
      '<h1 class="mf-hero">The real one</h1>',
    ].join('')
    expect(visibleH1s(page({ body }))).toEqual(['The real one'])
  })

  it('does not count h1 markup inside scripts, templates or comments', () => {
    const body =
      '<h1>One</h1><script>const x = "<h1>two</h1>"</script><template><h1>three</h1></template><!-- <h1>four</h1> -->'
    expect(visibleH1s(page({ body }))).toEqual(['One'])
  })
})

describe('brokenJsonLd', () => {
  it('reports blocks that do not parse, by position', () => {
    const problems = brokenJsonLd(['{"a":1}', '{"a":', '[]'])
    expect(problems).toHaveLength(1)
    expect(problems[0]).toMatch(/^block 2: /)
  })
})

describe('indexablePageProblems', () => {
  it('passes a correct page', () => {
    expect(indexablePageProblems({ html: page(), url: URL_, limits: LIMITS })).toEqual([])
  })

  it('reports every kind of problem at once', () => {
    const html = page({
      title: 'x'.repeat(61),
      description: 'y'.repeat(156),
      canonical: 'https://morse.iamcanturk.dev/other/',
      body: '<h1>One</h1><h1>Two</h1>',
      jsonLd: ['{broken'],
    })
    const problems = indexablePageProblems({ html, url: URL_, limits: LIMITS })
    expect(problems).toEqual([
      'has 2 visible <h1>: "One", "Two"',
      expect.stringMatching(/^title is 61 characters/),
      'description is 156 characters (max 155)',
      `canonical is https://morse.iamcanturk.dev/other/, not ${URL_}`,
      expect.stringMatching(/^JSON-LD block 1: /),
    ])
  })

  it('measures the decoded title, not the escaped one', () => {
    const title = `${'a'.repeat(54)} &amp; b` // 58 characters once decoded
    expect(indexablePageProblems({ html: page({ title }), url: URL_, limits: LIMITS })).toEqual([])
  })

  it('requires the canonical and flags a page with no h1', () => {
    const problems = indexablePageProblems({
      html: page({ canonical: null, body: '<p>No heading</p>' }),
      url: URL_,
      limits: LIMITS,
    })
    expect(problems).toContain('has 0 visible <h1>')
    expect(problems).toContain('has no canonical')
  })

  it('flags an indexable page that noindexes itself', () => {
    const problems = indexablePageProblems({
      html: page({ robots: 'noindex, follow' }),
      url: URL_,
      limits: LIMITS,
    })
    expect(problems).toContain('is indexable but says robots="noindex, follow"')
  })
})

describe('noindexPageProblems', () => {
  it('passes noindex, follow with no canonical', () => {
    expect(noindexPageProblems(page({ robots: 'noindex, follow', canonical: null }))).toEqual([])
  })

  it('flags a canonical, a missing noindex and broken JSON-LD', () => {
    expect(noindexPageProblems(page({ jsonLd: ['nope'] }))).toEqual([
      'is not noindexed',
      `is noindexed but declares canonical ${URL_}`,
      expect.stringMatching(/^JSON-LD block 1: /),
    ])
  })
})

describe('sitemapEntries', () => {
  it('reads loc and lastmod from a urlset and a sitemap index', () => {
    const urlset =
      '<?xml version="1.0"?><urlset><url><loc>https://a.dev/</loc><lastmod>2026-10-21T00:00:00.000Z</lastmod></url><url><loc>https://a.dev/x/?a=1&amp;b=2</loc></url></urlset>'
    expect(sitemapEntries(urlset)).toEqual([
      { loc: 'https://a.dev/', lastmod: '2026-10-21T00:00:00.000Z' },
      { loc: 'https://a.dev/x/?a=1&b=2', lastmod: null },
    ])
    const index =
      '<sitemapindex><sitemap><loc>https://a.dev/sitemap-0.xml</loc></sitemap></sitemapindex>'
    expect(sitemapEntries(index)).toEqual([{ loc: 'https://a.dev/sitemap-0.xml', lastmod: null }])
  })
})

describe('looksLikeMarkdown', () => {
  it('accepts a Markdown document and rejects an HTML page', () => {
    expect(looksLikeMarkdown('# The Morse code alphabet\n\n**Answer.**')).toBe(true)
    expect(looksLikeMarkdown('\n# Title')).toBe(true)
    expect(looksLikeMarkdown('<!DOCTYPE html><html>')).toBe(false)
    expect(looksLikeMarkdown('Just text')).toBe(false)
  })
})

describe('robotsProblems', () => {
  const robots = [
    'User-agent: *',
    'Content-Signal: search=yes, ai-input=yes, ai-train=yes',
    'Allow: /',
    'Disallow: /panel/',
    '',
    'User-agent: GPTBot',
    'User-agent: ClaudeBot',
    'Allow: /',
    'Disallow: /panel/',
    '',
    'User-agent: CCBot # Common Crawl',
    'Disallow: /studio/',
  ].join('\n')

  it('accepts crawlers that are allowed, including grouped agents', () => {
    expect(robotsProblems(robots, ['GPTBot', 'ClaudeBot', '*'])).toEqual([])
  })

  it('reports a crawler that is missing or not allowed', () => {
    expect(robotsProblems(robots, ['PerplexityBot', 'CCBot'])).toEqual([
      'PerplexityBot is not named',
      'CCBot has no "Allow: /"',
    ])
  })

  it('reports a group that blocks the whole site', () => {
    expect(robotsProblems('User-agent: Bytespider\nDisallow: /\n', [])).toEqual([
      'Bytespider is disallowed from the whole site',
    ])
  })
})
