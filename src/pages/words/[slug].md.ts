import type { APIRoute, GetStaticPaths } from 'astro'
import { WORDS, type MorseWord } from '../../data/words'
import { markdownResponse, wordMarkdown } from '../../seo/markdown'

/**
 * `/words/<slug>.md` for every word page: the answer, the note, the
 * letter-by-letter breakdown and the FAQ, as plain Markdown. The word page
 * links here with `rel="alternate"` without passing anything, because
 * `BaseLayout` resolves the path through `markdownPathFor`.
 */
export const getStaticPaths = (() =>
  WORDS.map((word) => ({ params: { slug: word.slug }, props: { word } }))) satisfies GetStaticPaths

export const GET: APIRoute = ({ props }) => {
  const { word } = props as { word: MorseWord }
  return markdownResponse(wordMarkdown(word))
}
