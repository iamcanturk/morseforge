import { defineCollection } from 'astro:content'
// `z` from 'astro:content' is deprecated and removed in Astro 7.
import { z } from 'astro/zod'
import { glob } from 'astro/loaders'

/**
 * The blog.
 *
 * Every field that ends up in structured data is required rather than optional.
 * An `Article` without a date or a description still renders fine, so the gap
 * only shows up weeks later as a search result with no date on it — which is
 * exactly the kind of failure a schema should catch at build time instead.
 */
const blog = defineCollection({
  loader: glob({ base: './src/content/blog', pattern: '**/*.md' }),
  schema: z.object({
    title: z.string().max(70, 'Titles over 70 characters get truncated in search results'),
    /**
     * The `<title>` when it should differ from the H1. The H1 stays in the
     * author's voice; this is the version written for a results page ("What Does
     * SOS Stand For? ..."). Without the " | MorseForge" suffix, which the
     * template appends only while the whole title stays within 60 characters.
     */
    seoTitle: z
      .string()
      .max(60, 'Titles over 60 characters get truncated in search results')
      .optional(),
    /** Used as the meta description and the og:description. */
    description: z
      .string()
      .min(70, 'Too short to be a useful search snippet')
      .max(155, 'Over 155 characters gets truncated in search results'),
    published: z.coerce.date(),
    updated: z.coerce.date().optional(),
    /**
     * The one-sentence answer to the post's own question, placed directly under
     * the heading. This is what a search snippet lifts and what an assistant
     * quotes, so it is required rather than left to the body.
     */
    answer: z.string().min(80).max(400),
    tags: z.array(z.string()).min(1),
    /** Hidden from the index and the sitemap while being written. */
    draft: z.boolean().default(false),
  }),
})

export const collections = { blog }
