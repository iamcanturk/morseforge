import type { APIRoute } from 'astro'
import { alphabetMarkdown, markdownResponse } from '../seo/markdown'

/**
 * `/morse-code-alphabet.md`: the alphabet page as plain Markdown, with ASCII
 * codes, both punctuation groups, the prosigns, the timing and the FAQ.
 * Generated from the data in `src/seo/markdown.ts`; the page links here with
 * `rel="alternate"` through the registry's `markdown` field.
 */
export const GET: APIRoute = () => markdownResponse(alphabetMarkdown())
