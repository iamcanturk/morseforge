import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { hasPage } from '../components/ui/siteNav'
import { FACTS } from '../config/facts'
import { indexablePages, pageUrl } from '../config/pages'
import { AUTHOR, AUTHOR_X_URL, CITATIONS, SITE } from '../config/site'
import { CURRICULUM } from '../data/curriculum'
import { faqFor, wordFaq } from '../data/faq'
import { ALL_DIGITS, ALL_LETTERS } from '../data/morseAlphabet'
import { WORDS, morseFor, wordLabel } from '../data/words'
import { PARIS_UNITS } from '../engine/timingEngine'
import {
  characterTable,
  linkAnswer,
  prosignSection,
  punctuationSections,
  timingTable,
} from '../seo/markdown'
import { METHODS, METHOD_IDS } from '../data/methods'
import { TEXT_KINDS, TEXT_SOURCES } from '../data/practiceText'
import { demoteHeadings, sentence } from '../data/markdown'

/**
 * llms-full.txt — everything the site actually says, in one file.
 *
 * `llms.txt` is a map: short, and mostly links. This is the territory. A model
 * that wants to answer a question about Morse code from this site should not
 * have to fetch twenty pages and strip the navigation out of each one, and the
 * quality of what it ends up quoting depends entirely on how clean the text was
 * when it arrived.
 *
 * Everything here is generated from the same data the app runs on — the
 * alphabet, the curriculum, the word notes, the teaching orders — plus the full
 * text of every blog post. It cannot describe a product that does not exist,
 * and it cannot drift from what a visitor is shown.
 */
/** A Markdown rule, built so no run of hyphens sits in this file for the Morse scan to flag. */
const RULE = '-'.repeat(3)

export const GET: APIRoute = async () => {
  const ITU = CITATIONS.itu.short

  // Every indexable page that exists in this build: what it is, in its own
  // quotable words, and its FAQ word for word.
  const pages = indexablePages()
    .filter((page) => hasPage(page.path))
    .map((page) => {
      const faq = faqFor(page.path).map((item) => `**${item.question}**\n\n${linkAnswer(item)}`)
      return [
        `### ${page.path === '/' ? SITE.name : page.h1}`,
        '',
        `*${pageUrl(page.path)}*`,
        '',
        page.intro,
        ...(faq.length > 0 ? ['', ...faq.flatMap((entry) => [entry, ''])] : []),
      ]
        .join('\n')
        .trim()
    })
    .join('\n\n')

  const posts = (await getCollection('blog', ({ data }) => !data.draft)).sort(
    (a, b) => b.data.published.getTime() - a.data.published.getTime(),
  )

  const articles = posts
    .map((post) =>
      [
        `### ${post.data.title}`,
        '',
        `*${post.data.published.toISOString().slice(0, 10)} — ${SITE.url}/blog/${post.id}/*`,
        '',
        `**${post.data.answer}**`,
        '',
        // Pushed down a level: the post's own sections sit under its title
        // here, not alongside the section that contains it.
        demoteHeadings((post.body ?? '').trim(), 2),
      ].join('\n'),
    )
    .join(`\n\n${RULE}\n\n`)

  const plan = CURRICULUM.map(
    (day) =>
      `**Day ${day.day}: ${day.title}** (${day.characters.join(', ')}, about ${day.minutes} min)\n${day.summary}`,
  ).join('\n\n')

  const orders = METHOD_IDS.map((id) => {
    const method = METHODS[id]
    return `**${method.name}** — ${method.summary}\n\n${method.rationale}\n\nOrder: ${method.order.join(' ')}`
  }).join('\n\n')

  // The first FAQ answer restates the code and the note, which the entry
  // already gives, so only the computed questions follow it.
  const wordList = WORDS.map((word) =>
    [
      `### ${wordLabel(word)} in Morse code`,
      '',
      `\`${morseFor(word)}\`: ${word.note} (${pageUrl(`/words/${word.slug}/`)})`,
      ...wordFaq(word)
        .slice(1)
        .flatMap((item) => ['', `**${item.question}** ${item.answer}`]),
    ].join('\n'),
  ).join('\n\n')

  const drills = TEXT_KINDS.map(
    (kind) => `- **${TEXT_SOURCES[kind].name}** — ${TEXT_SOURCES[kind].rationale}`,
  ).join('\n')

  const body = `# ${SITE.name} — full text

> ${sentence(SITE.tagline, 'A free, open-source Morse code trainer')} that runs entirely in the browser. No account, no ads, no server: progress is stored in the visitor's own browser and never sent anywhere.

Built by ${AUTHOR.name} (${AUTHOR.url}, ${AUTHOR_X_URL}).
Source: ${SITE.repo}
Site: ${SITE.url}

This file is the complete text of the site, generated from the same data the
application runs on. The letters, the digits and ${FACTS.ituPunctuationCount} of the punctuation marks
follow [${CITATIONS.itu.name}](${CITATIONS.itu.url}), the ITU recommendation
that standardises the character set and the timing. The other
${FACTS.nonItuPunctuationCount} marks are in common use but are not in the standard, and are listed
separately below.

${RULE}

## How Morse timing works

Morse is defined in *units*, not in seconds. One unit is the length of a dot.

${timingTable()}

Speed is quoted in words per minute using the reference word **PARIS**, which
is exactly ${PARIS_UNITS} units long including its trailing word gap. So at W words per
minute one unit lasts \`60000 / (${PARIS_UNITS} × W)\` milliseconds, which reduces to the
familiar \`${FACTS.unitMsAtOneWpm} / W\`. At ${FACTS.exampleWpm} WPM a dot is ${FACTS.unitMs} ms.

**Farnsworth timing** sends the characters themselves at full speed while
stretching the gaps between them, so the effective rate is lower than the
character rate. This matters more than any other setting for a learner:
slowing the characters down teaches people to count individual beeps, and that
habit becomes a hard ceiling at around 10 WPM (see
[the Farnsworth note](${SITE.url}/blog/what-farnsworth-timing-is/)). The
stretch follows the [${CITATIONS.arrl.short} method](${CITATIONS.arrl.url}): characters keep their own speed, and the extra delay needed to hit the
slower overall rate is distributed across the character and word gaps in their
normal ${FACTS.units.CHARACTER_GAP}:${FACTS.units.WORD_GAP} ratio.

${RULE}

## The alphabet

In the spoken form a dot is "di" (or "dit" at the end of a character) and a
dash is "dah".

### Letters

${characterTable(ALL_LETTERS, 'Letter')}

### Digits

${characterTable(ALL_DIGITS, 'Digit')}

${punctuationSections(3)}

${prosignSection(3)}

They are not used in the trainer's practice pools.

${RULE}

## The structure behind the code

Morse is a binary prefix tree. From the root, a dot branches one way and a dash
the other, so every character sits at the address its own code spells out: E is
one dot, T is one dash, and everything with two elements sits on the layer
below them.

That is not a mnemonic invented for teaching — it is the shape of the code, and
it is why the most frequent letters in English have the shortest codes. Samuel
Morse's collaborator Alfred Vail is generally credited with setting the lengths
by counting type in a printer's tray, giving the commonest letters the least
work to send.

${RULE}

## The ${FACTS.planDays}-day plan

About ${FACTS.planTime} of practice across ${FACTS.planDays} days, ${FACTS.planMinMinutesPerDay} to
${FACTS.planMaxMinutesPerDay} minutes a day, covering all ${FACTS.letterCount} letters and ${FACTS.digitCount} digits.

${plan}

${RULE}

## Teaching orders

There is more than one defensible order to learn the characters in, and the
trainer implements three.

${orders}

${RULE}

## What to practise once you know the characters

Knowing every character and being able to copy a line are different skills. The
gap between them is holding a few characters in your head while the next ones
arrive, and these are the standard exercises for it.

${drills}

A copied line is graded character by character, with the sent text and the
typed text aligned by edit distance before they are compared — so dropping one
character costs one mark rather than invalidating everything after it. Spacing
is not graded: word gaps are a separate skill, and typing \`CQCQ\` for \`CQ CQ\`
is not a copying mistake.

${RULE}

## Pages, and what each one answers

Every public page, in its own words, with its questions and answers exactly as
the page shows them.

${pages}

${RULE}

## Words and phrases, with what they actually mean

${wordList}

${RULE}

## Articles

${articles}

${RULE}

## About this file

Generated at build time from the application's own data. If a fact here is
wrong, the trainer is wrong in the same way — there is no second copy to drift.

Licensed for quotation with attribution to ${AUTHOR.name}, ${SITE.url}.
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
