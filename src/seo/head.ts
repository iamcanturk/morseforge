/**
 * The decisions behind `BaseLayout`'s `<head>`, as plain functions.
 *
 * The layout used to make them inline, which is how `og:type` stayed `website`
 * on articles and the 404 ended up canonicalised. Here they can be tested
 * without rendering a page, and the layout only prints the result.
 */

import { AUTHOR, SITE } from '../config/site'

/**
 * `og:locale`. The copy is written in British English (DEC-012), so the share
 * card says so. `<html lang>` stays the plain `en` in `SITE.locale`.
 */
export const OG_LOCALE = 'en_GB'

/** The share image every page uses unless it brings its own. 1200 × 630. */
export const DEFAULT_OG_IMAGE = {
  path: '/og/default.png',
  width: 1200,
  height: 630,
  /** Describes what the card shows, not what the site is: it is read in place of the image. */
  alt: `The ${SITE.name} logo, an oscilloscope trace keying M, and ${SITE.name.toUpperCase()} as a Morse square wave`,
} as const

export interface HeadInput {
  /** Site path, e.g. "/morse-code-alphabet/". */
  path: string
  private?: boolean | undefined
  noindex?: boolean | undefined
  ogType?: 'website' | 'article' | undefined
  ogImage?: string | undefined
  ogImageAlt?: string | undefined
  /** Pixel size of a custom `ogImage`. Omitted from the head when not given. */
  ogImageWidth?: number | undefined
  ogImageHeight?: number | undefined
  article?: { published: Date | string; modified?: Date | string | undefined } | undefined
}

export interface HeadMeta {
  /** `<meta name="robots">` content, or null for none (the default, index-follow). */
  robots: string | null
  /** Absolute canonical URL, or null when the page must not declare one. */
  canonical: string | null
  /** The URL `og:url` reports. Always absolute; the canonical one where there is one. */
  url: string
  /** False on private pages: no identity graph, no page schema. */
  structuredData: boolean
  ogType: 'website' | 'article'
  ogImage: {
    url: string
    alt: string
    width: number | null
    height: number | null
  }
  /** `article:*` properties, in output order. Empty unless `article` was given. */
  articleMeta: { property: string; content: string }[]
}

/** Full ISO 8601 for a date or date string, as `article:*_time` expects. */
function isoDateTime(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) throw new RangeError(`Not a date: ${String(value)}`)
  return date.toISOString()
}

/**
 * Everything the head prints, from the layout's props.
 *
 * - `private` wins over `noindex`: it also strips the structured data and asks
 *   for nofollow, because the author tools have nothing to follow.
 * - `noindex` keeps the JSON-LD and lets links be followed, but drops the
 *   canonical: a canonical on a noindexed page is a contradictory signal.
 */
export function headMeta(input: HeadInput, site: string = SITE.url): HeadMeta {
  const self = new URL(input.path, site).href
  const isPrivate = input.private === true
  const noindex = !isPrivate && input.noindex === true

  const robots = isPrivate
    ? 'noindex, nofollow, noarchive, nosnippet'
    : noindex
      ? 'noindex, follow'
      : null

  const custom = input.ogImage !== undefined && input.ogImage !== DEFAULT_OG_IMAGE.path
  const ogImage = {
    url: new URL(input.ogImage ?? DEFAULT_OG_IMAGE.path, site).href,
    alt: input.ogImageAlt ?? DEFAULT_OG_IMAGE.alt,
    // The default's size is known here. A page that brings its own image passes
    // its own size and alt text; one that does not leaves the size out rather
    // than state a wrong one.
    width: custom ? (input.ogImageWidth ?? null) : DEFAULT_OG_IMAGE.width,
    height: custom ? (input.ogImageHeight ?? null) : DEFAULT_OG_IMAGE.height,
  }

  const articleMeta: HeadMeta['articleMeta'] = []
  if (input.article) {
    articleMeta.push({
      property: 'article:published_time',
      content: isoDateTime(input.article.published),
    })
    if (input.article.modified !== undefined) {
      articleMeta.push({
        property: 'article:modified_time',
        content: isoDateTime(input.article.modified),
      })
    }
    articleMeta.push({ property: 'article:author', content: AUTHOR.url })
  }

  return {
    robots,
    canonical: robots === null ? self : null,
    url: self,
    structuredData: !isPrivate,
    ogType: input.ogType ?? (input.article ? 'article' : 'website'),
    ogImage,
    articleMeta,
  }
}

/**
 * JSON for a `<script type="application/ld+json">` body.
 *
 * `set:html` writes the string as is, so a `</script>` inside any value would
 * end the element early. Escaping `<` as `\u003c` keeps the JSON identical once
 * parsed and makes that impossible.
 */
export function jsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c')
}
