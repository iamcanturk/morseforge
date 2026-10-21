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
  /**
   * Used verbatim as the default meta description, the og:description and the
   * schema.org description. Kept to 155 characters, the most a results page
   * shows before cutting it off; `site.test.ts` enforces that.
   */
  description:
    'Learn Morse code by sound with a free trainer: real CW audio, a keyboard telegraph key and a Signal Tree that fills in as you go. No account, no ads.',
  locale: 'en',
  repo: 'https://github.com/iamcanturk/morseforge',
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

/**
 * The entity every page is about, for schema.org `about` and `sameAs`.
 *
 * Linking the site to Wikidata is what tells a search engine or an LLM that
 * "Morse code" here means the encoding and not a person called Morse, and it
 * costs one constant. `name` is the form copy uses in running text.
 */
export const MORSE_CODE_ENTITY = {
  name: 'Morse code',
  wikipedia: 'https://en.wikipedia.org/wiki/Morse_code',
  wikidata: 'https://www.wikidata.org/wiki/Q79897',
} as const

/** The entity as a schema.org `Thing`, ready to drop into an `about` field. */
export const MORSE_CODE_ABOUT = {
  '@type': 'Thing',
  name: MORSE_CODE_ENTITY.name,
  sameAs: [MORSE_CODE_ENTITY.wikipedia, MORSE_CODE_ENTITY.wikidata],
} as const

/**
 * The two sources the site's claims rest on.
 *
 * Pages cite these by importing them, so a link that moves is fixed once. The
 * ITU URL is the recommendation itself rather than the series index, which is
 * what an assistant needs in order to attribute a fact to it.
 */
export const CITATIONS = {
  itu: {
    /** What copy calls it in running text. */
    short: 'ITU-R M.1677-1',
    name: 'ITU-R M.1677-1: International Morse code',
    publisher: 'International Telecommunication Union',
    url: 'https://www.itu.int/rec/R-REC-M.1677-1-200910-I/en',
  },
  arrl: {
    short: 'ARRL',
    name: 'A Standard for Morse Timing Using the Farnsworth Technique',
    publisher: 'American Radio Relay League',
    url: 'https://www.arrl.org/files/file/Technology/x9004008.pdf',
  },
} as const
