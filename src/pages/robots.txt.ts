import type { APIRoute } from 'astro'
import { SITE } from '../config/site'

/**
 * robots.txt, generated so the sitemap URL can never drift from the site config.
 *
 * The AI crawlers are listed explicitly rather than left to the wildcard. A
 * bare `User-agent: *` does permit them, but several of these bots are widely
 * blocked, and an explicit Allow is the only unambiguous signal that this site
 * wants to be read and cited. That is the entire GEO bet: being quotable is
 * worth more here than protecting content that is deliberately free anyway.
 */
const AI_CRAWLERS = [
  'GPTBot', // OpenAI training
  'OAI-SearchBot', // ChatGPT search
  'ChatGPT-User', // ChatGPT browsing on a user's behalf
  'ClaudeBot', // Anthropic
  'Claude-User',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended', // Gemini grounding
  'Applebot-Extended',
  'CCBot', // Common Crawl, which seeds many models
  'meta-externalagent',
  'Bytespider',
  'Amazonbot', // Alexa and Amazon answers
  'DuckAssistBot', // DuckDuckGo's answer engine
  'MistralAI-User', // Le Chat browsing
  'GoogleOther',
] as const

/**
 * The same stance in machine-readable form, per Cloudflare's Content Signals
 * proposal: search, answers and training are all welcome. Crawlers that do not
 * know the line ignore it.
 */
const CONTENT_SIGNAL = 'Content-Signal: search=yes, ai-input=yes, ai-train=yes'

/**
 * Never crawled. Noindexed pages (stats, settings, the 404) are deliberately
 * NOT here: a crawler has to fetch a page to see its noindex.
 */
const DISALLOWED = ['/panel/', '/studio/'] as const

export const GET: APIRoute = () => {
  const body = [
    '# MorseForge — free Morse code trainer',
    `# ${SITE.url}`,
    '',
    'User-agent: *',
    CONTENT_SIGNAL,
    'Allow: /',
    // The author's own tools. Password-protected at the origin; this is the
    // part that keeps them out of a search result in the first place.
    ...DISALLOWED.map((path) => `Disallow: ${path}`),
    '',
    '# AI assistants and answer engines are explicitly welcome to read and cite',
    '# this site. See /llms.txt for a structured summary.',
    ...AI_CRAWLERS.flatMap((agent) => [
      `User-agent: ${agent}`,
      // A named group replaces the wildcard one rather than inheriting from it,
      // so the signal is repeated here or these bots never see it.
      CONTENT_SIGNAL,
      'Allow: /',
      ...DISALLOWED.map((path) => `Disallow: ${path}`),
      '',
    ]),
    `Sitemap: ${SITE.url}/sitemap-index.xml`,
    '',
    '# A structured summary for assistants, and the complete text of the site.',
    `# ${SITE.url}/llms.txt`,
    `# ${SITE.url}/llms-full.txt`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
