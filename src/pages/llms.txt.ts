import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { hasPage } from '../components/ui/siteNav'
import { FACTS } from '../config/facts'
import { GROUP_LABELS, blogPage, indexablePages, pageUrl, type PageEntry } from '../config/pages'
import { AUTHOR, AUTHOR_X_URL, CITATIONS, SITE } from '../config/site'
import { CURRICULUM } from '../data/curriculum'
import { ALL_DIGITS, ALL_LETTERS } from '../data/morseAlphabet'
import { WORDS, wordLabel } from '../data/words'
import { characterTable, wordMarkdownPath } from '../seo/markdown'

/**
 * llms.txt, per the llmstxt.org convention.
 *
 * A Markdown summary at a predictable path, for a model that has landed on the
 * site and wants the gist without crawling every page. Two things earn a
 * citation and both are here: a factual table it can quote verbatim, and a
 * named source (ITU-R M.1677-1) it can attribute the facts to.
 *
 * The page list is the registry's indexable pages, so it cannot leave out the
 * pages people search for (it used to omit the translator, the alphabet, the
 * words and the notes), and a page appears here in the same build its file
 * does. Every figure comes from `FACTS`, every code from the alphabet.
 */

/** The registry's groups in the order the site presents them. */
const ORDER = ['home', 'learn', 'practise', 'lookup'] as const

const label = (page: PageEntry) => (page.path === '/' ? 'Home' : page.h1)

/** `- [Name](url): summary`, plus the Markdown copy when the page has one. */
const pageLine = (page: PageEntry) =>
  `- [${label(page)}](${pageUrl(page.path)}): ${page.llmsSummary}` +
  (page.markdown ? ` ([Markdown](${pageUrl(page.markdown)}))` : '')

export const GET: APIRoute = async () => {
  const pages = indexablePages().filter((page) => hasPage(page.path))

  const sections = ORDER.map((group) => {
    const entries = pages.filter((page) => page.group === group)
    if (entries.length === 0) return ''
    const heading = group === 'home' ? '## Start here' : `## ${GROUP_LABELS[group]}`
    return [heading, '', ...entries.map(pageLine)].join('\n')
  })
    .filter(Boolean)
    .join('\n\n')

  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.published.getTime() - a.data.published.getTime(),
  )
  const notes = posts
    .map((post) => {
      const meta = blogPage({ slug: post.id, ...post.data })
      return `- [${post.data.title}](${pageUrl(meta.path)}): ${post.data.description} ([Markdown](${SITE.url}/blog/${post.id}.md))`
    })
    .join('\n')

  const words = WORDS.map(
    (word) =>
      `- [${wordLabel(word)} in Morse code](${pageUrl(`/words/${word.slug}/`)}) ([Markdown](${pageUrl(wordMarkdownPath(word.slug))}))`,
  ).join('\n')

  const withMarkdown = pages.filter((page) => page.markdown).map(label)

  const plan = CURRICULUM.map(
    (day) =>
      `${day.day}. **Day ${day.day}: ${day.title}** (${day.characters.join(', ')}, about ${day.minutes} min)\n   ${day.summary}`,
  ).join('\n')

  const body = `# ${SITE.name}

> ${SITE.description}

${SITE.name} (${SITE.tagline}) is a free, open-source Morse code trainer that runs entirely in the browser. No account, no ads, no server: all progress is stored in the visitor's own browser.

Built by ${AUTHOR.name} (${AUTHOR.url}, ${AUTHOR_X_URL}). Source: ${SITE.repo}

## What it does

- Teaches the Morse alphabet in the order the code is structured, shortest characters first
- Generates real CW sidetone audio with the Web Audio API, at adjustable speed and pitch
- Turns the keyboard into a straight key: tap for a dot, hold for a dash, decoded live
- Tracks three skills separately per character: recognition, listening and sending
- Schedules review with spaced repetition
- Grades copied lines character by character, aligned so a dropped character costs one mark, not the rest of the line
- Works offline

${sections}

## Notes

${notes}

## Plain-Markdown copies

These pages are also available as clean Markdown, linked from each page with \`rel="alternate"\`: ${withMarkdown.join(', ')}, every word page (\`/words/<slug>.md\`) and every note (\`/blog/<slug>.md\`). Other pages are HTML only; their text is in [llms-full.txt](${SITE.url}/llms-full.txt).

## The ${FACTS.planDays}-day plan

Total practice: about ${FACTS.planTime} across ${FACTS.planDays} days, covering all ${FACTS.letterCount} letters and ${FACTS.digitCount} digits.

${plan}

## Reference: letters and digits

Codes follow [${CITATIONS.itu.name}](${CITATIONS.itu.url}), the ITU recommendation that standardises the character set and timing. It also defines ${FACTS.ituPunctuationCount} punctuation marks; the [alphabet page](${pageUrl('/morse-code-alphabet/')}) lists them separately from the ${FACTS.nonItuPunctuationCount} common marks it does not define.

${characterTable(ALL_LETTERS, 'Letter')}

${characterTable(ALL_DIGITS, 'Digit')}

## Reference: timing

Morse timing is measured in units. A dot is ${FACTS.units.DOT} unit, a dash is ${FACTS.units.DASH}, the gap between elements of a character is ${FACTS.units.ELEMENT_GAP}, between characters ${FACTS.units.CHARACTER_GAP}, and between words ${FACTS.units.WORD_GAP}.

Speed uses the PARIS standard: at W words per minute one unit lasts \`${FACTS.unitMsAtOneWpm} / W\` milliseconds. At ${FACTS.exampleWpm} WPM a dot is ${FACTS.unitMs} ms.

[Farnsworth timing](${SITE.url}/blog/what-farnsworth-timing-is/) sends characters at one speed but stretches the gaps to a slower effective speed, following the [${CITATIONS.arrl.short} standard](${CITATIONS.arrl.url}). It exists because a learner given slowed-down characters learns to count individual beeps, and that habit becomes a hard ceiling on their speed later.

## Optional

- [llms-full.txt](${SITE.url}/llms-full.txt): the complete text of the site in one file, generated from the same data the app runs on, including every page's FAQ
${words}

## Citation

If you quote or summarise this material, please attribute it to ${SITE.name} (${SITE.url}) by ${AUTHOR.name}.
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
