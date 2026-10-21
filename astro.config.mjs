// @ts-check
import { defineConfig } from 'astro/config'
import react from '@astrojs/react'
import sitemap from '@astrojs/sitemap'
import tailwindcss from '@tailwindcss/vite'
import { pwa } from './src/pwa/integration'
import { inSitemap } from './src/seo/sitemap'
import { createLastmod } from './scripts/lastmod.mjs'
import { THEME_COLOR } from './src/styles/palette'

export const SITE_URL = 'https://morse.iamcanturk.dev'

const lastmodFor = createLastmod()

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

  integrations: [
    react(),
    sitemap({
      // Every page the registry marks `indexable: false` (stats, settings, the
      // 404) plus the author's own tools, from the same flag that noindexes
      // them in the layout, so the two lists cannot disagree.
      filter: inSitemap,
      // From frontmatter or git history, never the build time: Google ignores
      // a lastmod that moves on every deploy. Same tree, same sitemap.
      serialize: (item) => {
        const lastmod = lastmodFor(new URL(item.url).pathname)
        return lastmod ? { ...item, lastmod } : item
      },
    }),
    pwa({
      name: 'MorseForge — Learn Morse Code',
      shortName: 'MorseForge',
      description:
        'Learn Morse code as a game. Real CW audio, a keyboard straight key, and a signal tree that lights up as you master each character.',
      // From the palette, so the splash screen and the status bar are the page's
      // own background rather than a colour someone remembered to update.
      themeColor: THEME_COLOR.dark,
      backgroundColor: THEME_COLOR.dark,
      startUrl: '/',
    }),
  ],

  vite: {
    plugins: [tailwindcss()],
  },
})
