// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'

export const SITE_URL = 'https://morse.iamcanturk.dev'

export default defineConfig({
  site: SITE_URL,

  // Every route is prerendered to real HTML at build time. This is the whole
  // reason we're on Astro: LLM crawlers (GPTBot, ClaudeBot, PerplexityBot)
  // don't execute JavaScript, so a client-rendered SPA is invisible to them.
  output: 'static',

  // Directory format gives us /morse-code-alphabet/ instead of
  // /morse-code-alphabet.html — cleaner canonicals, and CloudPanel's default
  // `index index.html` serves it without any nginx rewrite.
  build: { format: 'directory' },

  trailingSlash: 'always',

  integrations: [react(), sitemap()],

  vite: {
    plugins: [tailwindcss()],
  },
})
