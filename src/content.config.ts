import { defineCollection, z } from 'astro:content'
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
    /** Used as the meta description and the og:description. */
    description: z
      .string()
      .min(70, 'Too short to be a useful search snippet')
      .max(165, 'Over 165 characters gets truncated in search results'),
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
