import type { APIRoute } from 'astro'
import { markdownResponse, planMarkdown } from '../seo/markdown'

/**
 * `/learn-morse-code-in-7-days.md`: the plan as plain Markdown, every day with
 * its codes, drill and words, plus the FAQ. Generated from the curriculum in
 * `src/seo/markdown.ts`; linked from the page through the registry.
 */
export const GET: APIRoute = () => markdownResponse(planMarkdown())
