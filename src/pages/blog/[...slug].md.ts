import type { APIRoute, GetStaticPaths } from 'astro'
import { getCollection } from 'astro:content'
import { AUTHOR, SITE } from '../../config/site'

/**
 * Every post, also served as plain Markdown.
 *
 * An assistant fetching an article gets a page built for a browser: navigation,
 * a theme script, a footer, structured data, and the text somewhere inside it.
 * All of that has to be stripped before the content is usable, and stripping is
 * where quotes get mangled and headings get lost.
 *
 * So the same post is available at `.md`, exactly as written. It is not a
 * second copy — it is the source the HTML is rendered from, so the two cannot
 * disagree. The HTML page points at it with a `rel="alternate"` link, which is
 * how a crawler is supposed to find it.
 */
export const getStaticPaths = (async () => {
  const posts = await getCollection('blog', ({ data }) => !data.draft)
  return posts.map((post) => ({ params: { slug: post.id }, props: { post } }))
}) satisfies GetStaticPaths

export const GET: APIRoute = ({ props }) => {
  const { post } = props as { post: Awaited<ReturnType<typeof getCollection<'blog'>>>[number] }
  const url = `${SITE.url}/blog/${post.id}/`

  const header = [
    `# ${post.data.title}`,
    '',
    // The answer first, because that is what a reader — human or otherwise —
    // came for, and because a summariser that reads nothing else still gets it
    // right.
    `**${post.data.answer}**`,
    '',
    `*Published ${post.data.published.toISOString().slice(0, 10)}` +
      (post.data.updated ? `, updated ${post.data.updated.toISOString().slice(0, 10)}` : '') +
      `. By ${AUTHOR.name} (${AUTHOR.url}).*`,
    '',
    `*Source: ${url}*`,
    '',
    '---',
    '',
    '',
  ].join('\n')

  return new Response(header + (post.body ?? '').trimStart(), {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      // Named so a browser shows it rather than downloading it.
      'Content-Disposition': 'inline',
    },
  })
}
