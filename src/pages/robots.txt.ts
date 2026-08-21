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
]

export const GET: APIRoute = () => {
  const body = [
    '# MorseForge — free Morse code trainer',
    `# ${SITE.url}`,
    '',
    'User-agent: *',
    'Allow: /',
    '',
    '# AI assistants and answer engines are explicitly welcome to read and cite',
    '# this site. See /llms.txt for a structured summary.',
    ...AI_CRAWLERS.flatMap((agent) => [`User-agent: ${agent}`, 'Allow: /', '']),
    `Sitemap: ${SITE.url}/sitemap-index.xml`,
    '',
  ].join('\n')

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
