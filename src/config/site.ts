/**
 * Single source of truth for identity, links and analytics.
 *
 * Everything that names the product or its author lives here rather than being
 * typed into templates: the same strings feed the page metadata, the JSON-LD
 * `sameAs` graph, the footer, the share cards and the README. Search engines
 * and LLMs both treat a mismatch between those as a weak identity signal, so
 * they have to come from one place.
 */

export const SITE = {
  name: 'MorseForge',
  tagline: 'Learn Morse. Build the Signal.',
  url: 'https://morse.iamcanturk.dev',
  /** Used verbatim as the default meta description and og:description. */
  description:
    'Learn Morse code for free with a real CW audio engine, a keyboard straight key, and a Signal Tree that lights up as you master each character. No account, no ads, works offline.',
  locale: 'en',
  repo: 'https://github.com/iamcanturk/morse',
} as const

export const AUTHOR = {
  name: 'Can Türk',
  url: 'https://iamcanturk.dev',
  /** Handle without the "@" — prefix it at the call site. */
  x: 'iamcanturk',
  github: 'iamcanturk',
} as const

export const AUTHOR_X_URL = `https://x.com/${AUTHOR.x}`
export const AUTHOR_GITHUB_URL = `https://github.com/${AUTHOR.github}`

/**
 * Every profile that is verifiably the same person, for schema.org `sameAs`.
 *
 * This is what lets a search engine or an LLM connect the site to a real author
 * with a track record, which is the E-E-A-T signal a brand-new domain has no
 * other way to earn.
 */
export const AUTHOR_SAME_AS: readonly string[] = [AUTHOR.url, AUTHOR_X_URL, AUTHOR_GITHUB_URL]

/**
 * Cloudflare Web Analytics beacon token.
 *
 * Null disables the beacon entirely — no request, no script tag. The token is
 * public by design (it ships in the HTML of every page), so committing it is
 * fine and there is nothing to rotate if it leaks.
 *
 * Deliberately the *manual* integration rather than Cloudflare's automatic
 * injection: automatic setup rewrites the HTML at the edge, which would make
 * the document the service worker cached differ from the one served live, and
 * the PWA would go inconsistent offline.
 *
 * Cookieless and anonymous, which is what PROJECT.md §41 and §42 require —
 * progress never leaves the device.
 */
export const CF_ANALYTICS_TOKEN: string | null = '43d4ce9b115249e0b6f2bb3234c3c499'
