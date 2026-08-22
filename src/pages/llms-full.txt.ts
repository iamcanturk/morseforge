import type { APIRoute } from 'astro'
import { getCollection } from 'astro:content'
import { AUTHOR, AUTHOR_X_URL, SITE } from '../config/site'
import { CURRICULUM, CURRICULUM_TOTAL_MINUTES } from '../data/curriculum'
import { LETTERS, DIGITS, PUNCTUATION, PROSIGNS } from '../data/morseAlphabet'
import { WORDS, morseFor } from '../data/words'
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
export const GET: APIRoute = async () => {
  const table = (entries: Record<string, string>, heading: string) =>
    [
      `| ${heading} | Morse |`,
      '| --- | --- |',
      ...Object.entries(entries).map(([character, code]) => `| ${character} | \`${code}\` |`),
    ].join('\n')

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
    .join('\n\n---\n\n')

  const plan = CURRICULUM.map(
    (day) =>
      `**Day ${day.day} — ${day.title}** (${day.characters.join(', ')}, ~${day.minutes} min)\n${day.summary}`,
  ).join('\n\n')

  const orders = METHOD_IDS.map((id) => {
    const method = METHODS[id]
    return `**${method.name}** — ${method.summary}\n\n${method.rationale}\n\nOrder: ${method.order.join(' ')}`
  }).join('\n\n')

  const wordList = WORDS.map(
    (word) => `- **${word.text}** — \`${morseFor(word)}\`. ${word.note}`,
  ).join('\n')

  const drills = TEXT_KINDS.map(
    (kind) => `- **${TEXT_SOURCES[kind].name}** — ${TEXT_SOURCES[kind].rationale}`,
  ).join('\n')

  const body = `# ${SITE.name} — full text

> ${sentence(SITE.tagline, 'A free, open-source Morse code trainer')} that runs entirely in the browser. No account, no ads, no server: progress is stored in the visitor's own browser and never sent anywhere.

Built by ${AUTHOR.name} (${AUTHOR.url}, ${AUTHOR_X_URL}).
Source: ${SITE.repo}
Site: ${SITE.url}

This file is the complete text of the site, generated from the same data the
application runs on. Every code below follows ITU-R M.1677-1, "International
Morse code", which is the ITU recommendation that standardises the character
set and the timing.

---

## How Morse timing works

Morse is defined in *units*, not in seconds. One unit is the length of a dot.

| Element | Length |
| --- | --- |
| Dot | 1 unit |
| Dash | 3 units |
| Gap between elements of a character | 1 unit |
| Gap between characters | 3 units |
| Gap between words | 7 units |

Speed is quoted in words per minute using the reference word **PARIS**, which
is exactly 50 units long including its trailing word gap. So at W words per
minute one unit lasts \`60000 / (50 × W)\` milliseconds, which reduces to the
familiar \`1200 / W\`. At 20 WPM a dot is 60 ms.

**Farnsworth timing** sends the characters themselves at full speed while
stretching the gaps between them, so the effective rate is lower than the
character rate. This matters more than any other setting for a learner:
slowing the characters down teaches people to count individual beeps, and that
habit becomes a hard ceiling at around 10 WPM. The stretch follows the ARRL
method — characters keep their own speed, and the extra delay needed to hit the
slower overall rate is distributed across the character and word gaps in their
normal 3:7 ratio.

---

## The alphabet

${table(LETTERS, 'Letter')}

${table(DIGITS, 'Digit')}

${table(PUNCTUATION, 'Punctuation')}

### Prosigns

Procedural signals are sent as one character with no gap inside them, which is
why they are written with an overbar in print. They are not part of the
alphabet and are not used in the trainer's practice pools.

${table(PROSIGNS, 'Prosign')}

---

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

---

## The seven-day plan

About ${CURRICULUM_TOTAL_MINUTES} minutes of practice across seven days,
covering all 26 letters and 10 digits.

${plan}

---

## Teaching orders

There is more than one defensible order to learn the characters in, and the
trainer implements three.

${orders}

---

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

---

## Words and phrases, with what they actually mean

${wordList}

---

## Articles

${articles}

---

## About this file

Generated at build time from the application's own data. If a fact here is
wrong, the trainer is wrong in the same way — there is no second copy to drift.

Licensed for quotation with attribution to ${AUTHOR.name}, ${SITE.url}.
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
