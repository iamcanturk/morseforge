/**
 * Plain-Markdown copies of the reference pages, generated from the data.
 *
 * An assistant that fetches `/morse-code-alphabet/` gets a document built for
 * a browser: a header, a theme script, an island, a footer, and the chart
 * somewhere inside, drawn with typographic dots that it then quotes
 * inconsistently. The `.md` alternate is the same content as clean text, with
 * ASCII codes, linked from the page with `rel="alternate"`.
 *
 * Nothing here is written twice. Titles, intros and FAQs come from the
 * registry and `faq.ts`, codes and counts from the alphabet and `FACTS`, so a
 * Markdown copy cannot say something its page does not. Table rules and the
 * header rule are built with `repeat()` so this file holds no run of dots or
 * hyphens for the hand-typed-Morse scan to trip on.
 */

import { findPage, getPage, pageUrl, wordPage } from '../config/pages'
import { FACTS, prosignNote } from '../config/facts'
import { AUTHOR, CITATIONS, SITE } from '../config/site'
import { CHARACTERS, type CharacterFacts } from '../data/characters'
import { CURRICULUM, type CurriculumDay } from '../data/curriculum'
import { faqFor, wordFaq, type FaqItem } from '../data/faq'
import { joinList } from '../data/format'
import {
  ALL_DIGITS,
  ALL_LETTERS,
  ITU_PUNCTUATION,
  NON_ITU_PUNCTUATION,
  PROSIGNS,
  PROSIGN_MEANINGS,
} from '../data/morseAlphabet'
import {
  WORD_CATEGORIES,
  WORDS,
  breakdown,
  findWord,
  wordLabel,
  type MorseWord,
} from '../data/words'

/** The horizontal rule, and a table's header separator cell. */
const RULE = '-'.repeat(3)

const WORD_PAGE = /^\/words\/([^/]+)\/$/

/**
 * The Markdown alternate for a page path, or null when it has none.
 *
 * Fixed pages declare theirs in the registry; word pages all have one. Blog
 * posts pass theirs to the layout themselves, because only the collection
 * knows which posts are drafts.
 */
export function markdownPathFor(path: string): string | null {
  const registered = findPage(path)
  if (registered) return registered.markdown
  const slug = WORD_PAGE.exec(path)?.[1]
  if (slug && findWord(slug)) return wordMarkdownPath(slug)
  return null
}

/** `/words/sos.md` for the slug `sos`. */
export function wordMarkdownPath(slug: string): string {
  return `/words/${slug}.md`
}

// ---------------------------------------------------------------------------
// Building blocks
// ---------------------------------------------------------------------------

/** Make a value safe inside a table cell: a pipe would end the cell. */
export function cell(value: string | number): string {
  return String(value).replace(/\|/g, '\\|').replace(/\n/g, ' ')
}

/** Inline code. Every character in the alphabet is safe inside one backtick pair. */
export function code(value: string): string {
  return `\`${value}\``
}

/** A GitHub-flavoured Markdown table. */
export function table(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const line = (cells: readonly string[]) => `| ${cells.map(cell).join(' | ')} |`
  return [line(headers), line(headers.map(() => RULE)), ...rows.map(line)].join('\n')
}

/** An absolute URL for a site path, and absolute URLs left alone. */
function absolute(href: string): string {
  return new URL(href, SITE.url).href
}

/** A Markdown link. */
export function link(text: string, href: string): string {
  return `[${text}](${absolute(href)})`
}

/**
 * Drop sentences that only make sense next to the page's controls ("Press any
 * character below to hear it"). The rest of an intro is written to be quoted
 * on its own, which is exactly what a Markdown copy is for.
 */
export function quotable(text: string): string {
  return text
    .split(/(?<=[.!?])\s+/)
    .filter((sentence) => !/^(Press|Tap|Click|Hold)\b/.test(sentence))
    .join(' ')
}

/** Turn an FAQ answer's declared link phrases into Markdown links, first occurrence each. */
export function linkAnswer(item: FaqItem): string {
  let answer = item.answer
  for (const { text, href } of item.links ?? []) {
    const at = answer.indexOf(text)
    if (at === -1) continue
    answer = `${answer.slice(0, at)}${link(text, href)}${answer.slice(at + text.length)}`
  }
  return answer
}

/** An FAQ section: one `###` per question. Empty when there are no items. */
export function faqSection(items: readonly FaqItem[]): string {
  if (items.length === 0) return ''
  return [
    '## Frequently asked questions',
    ...items.flatMap((item) => ['', `### ${item.question}`, '', linkAnswer(item)]),
  ].join('\n')
}

export interface MarkdownDocument {
  /** The H1: the page's own heading. */
  title: string
  /** The page the copy belongs to, as a site path. */
  path: string
  /** The answer-first paragraph, printed in bold under the title. */
  answer: string
  /** Sections in order. Empty ones are dropped. */
  sections: readonly string[]
}

/**
 * A whole Markdown document, with the same header shape as the blog's `.md`
 * copies (`src/pages/blog/[...slug].md.ts`): title, the answer in bold, the
 * author, the source URL, a rule, then the body.
 */
export function markdownDocument(doc: MarkdownDocument): string {
  const header = [
    `# ${doc.title}`,
    '',
    `**${doc.answer}**`,
    '',
    `*By ${AUTHOR.name} (${AUTHOR.url}), ${SITE.name}.*`,
    '',
    `*Source: ${pageUrl(doc.path)}*`,
    '',
    RULE,
  ]
  const body = doc.sections.map((section) => section.trim()).filter(Boolean)
  return `${[...header, ...body].join('\n\n').replace(/\n{3,}/g, '\n\n')}\n`
}

/** The response every `.md` endpoint returns. */
export function markdownResponse(body: string): Response {
  return new Response(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      // Named so a browser shows it rather than downloading it.
      'Content-Disposition': 'inline',
    },
  })
}

// ---------------------------------------------------------------------------
// Shared tables, also used by llms-full.txt
// ---------------------------------------------------------------------------

const facts = (character: string): CharacterFacts => {
  const found = CHARACTERS[character]
  if (!found) throw new Error(`No character facts for "${character}"`)
  return found
}

/** Character · Code · Spoken · Elements, for letters or digits. */
export function characterTable(characters: readonly string[], heading: string): string {
  return table(
    [heading, 'Code', 'Spoken', 'Elements'],
    characters.map((character) => {
      const entry = facts(character)
      return [entry.character, code(entry.code), entry.spoken, String(entry.elements)]
    }),
  )
}

/** Mark · Name · Code · Elements, for a punctuation group. */
export function punctuationTable(marks: Readonly<Record<string, string>>): string {
  return table(
    ['Mark', 'Name', 'Code', 'Elements'],
    Object.keys(marks).map((mark) => {
      const entry = facts(mark)
      return [code(entry.character), entry.name, code(entry.code), String(entry.elements)]
    }),
  )
}

/** Prosign · Code · Meaning. */
export function prosignTable(): string {
  return table(
    ['Prosign', 'Code', 'Meaning'],
    (Object.keys(PROSIGNS) as (keyof typeof PROSIGNS)[]).map((name) => [
      name,
      code(PROSIGNS[name]),
      PROSIGN_MEANINGS[name],
    ]),
  )
}

/** Element · Length, from the timing engine's units. */
export function timingTable(): string {
  const { DOT, DASH, ELEMENT_GAP, CHARACTER_GAP, WORD_GAP } = FACTS.units
  const units = (n: number) => `${n} ${n === 1 ? 'unit' : 'units'}`
  return table(
    ['Element', 'Length'],
    [
      ['Dot', units(DOT)],
      ['Dash', units(DASH)],
      ['Gap inside a character', units(ELEMENT_GAP)],
      ['Gap between characters', units(CHARACTER_GAP)],
      ['Gap between words', units(WORD_GAP)],
    ],
  )
}

const ITU = CITATIONS.itu.short

/** The ITU and non-ITU punctuation, each under its own heading. */
export function punctuationSections(level = 2): string {
  const hashes = '#'.repeat(level)
  return [
    `${hashes} Punctuation in ${ITU}`,
    '',
    `${ITU} defines these ${FACTS.ituPunctuationCount} marks.`,
    '',
    punctuationTable(ITU_PUNCTUATION),
    '',
    `${hashes} Common punctuation not in ${ITU}`,
    '',
    `These ${FACTS.nonItuPunctuationCount} marks are in common use and MorseForge can send them, but ${ITU} does not define them, so they are not part of International Morse code.`,
    '',
    punctuationTable(NON_ITU_PUNCTUATION),
  ].join('\n')
}

/** The prosign table with its explanation. */
export function prosignSection(level = 2): string {
  return [
    `${'#'.repeat(level)} Prosigns`,
    '',
    'A prosign is a procedural signal sent as one character, with no letter gap inside it, which is why print writes it with a bar over the letters. Prosigns are not part of the alphabet.',
    '',
    prosignTable(),
  ].join('\n')
}

// ---------------------------------------------------------------------------
// The documents
// ---------------------------------------------------------------------------

const ALPHABET_PATH = '/morse-code-alphabet/'
const PLAN_PATH = '/learn-morse-code-in-7-days/'

/** `/morse-code-alphabet.md`: every table, the timing, the source and the FAQ. */
export function alphabetMarkdown(): string {
  const page = getPage(ALPHABET_PATH)
  return markdownDocument({
    title: page.h1,
    path: page.path,
    answer: quotable(page.intro),
    sections: [
      [
        '## Letters',
        '',
        `In the spoken form a dot is "di" (or "dit" at the end) and a dash is "dah". Letters run from ${FACTS.letterMinElements} to ${FACTS.letterMaxElements} elements.`,
        '',
        characterTable(ALL_LETTERS, 'Letter'),
      ].join('\n'),
      [
        '## Numbers',
        '',
        `Every digit is exactly ${FACTS.digitElements} elements long.`,
        '',
        characterTable(ALL_DIGITS, 'Digit'),
      ].join('\n'),
      punctuationSections(2),
      prosignSection(2),
      [
        '## Timing',
        '',
        `Morse timing is measured in units, and one unit is the length of a dot. At ${FACTS.exampleWpm} words per minute a unit lasts ${FACTS.unitMs} milliseconds.`,
        '',
        timingTable(),
      ].join('\n'),
      [
        '## Source',
        '',
        `${link(CITATIONS.itu.name, CITATIONS.itu.url)}, ${CITATIONS.itu.publisher}.`,
        '',
        `Hear every character on the ${link('interactive alphabet chart', ALPHABET_PATH)}, or translate your own text with the ${link('Morse code translator', '/morse-code-translator/')}.`,
      ].join('\n'),
      faqSection(faqFor(ALPHABET_PATH)),
    ],
  })
}

function daySection(day: CurriculumDay): string {
  const codes = day.characters.map((character) => {
    const entry = facts(character)
    return `- ${entry.character}: ${code(entry.code)} (${entry.spoken})`
  })
  return [
    `## Day ${day.day}: ${day.title}`,
    '',
    `*${day.minutes} minutes. New: ${joinList([...day.characters])}.*`,
    '',
    day.summary,
    '',
    ...codes,
    '',
    `**Why these characters.** ${day.rationale}`,
    '',
    `**Drill.** ${day.drill}`,
    '',
    `**Words you can now spell:** ${day.words.join(', ')}.`,
  ].join('\n')
}

/** `/learn-morse-code-in-7-days.md`: the plan at a glance, every day, and the FAQ. */
export function planMarkdown(): string {
  const page = getPage(PLAN_PATH)
  return markdownDocument({
    title: page.h1,
    path: page.path,
    answer: quotable(page.intro),
    sections: [
      [
        '## The plan at a glance',
        '',
        table(
          ['Day', 'Focus', 'New characters', 'Minutes'],
          CURRICULUM.map((day) => [
            String(day.day),
            day.title,
            day.characters.join(' '),
            String(day.minutes),
          ]),
        ),
        '',
        `In total: ${FACTS.planTime} over ${FACTS.planDays} days, ${FACTS.planMinMinutesPerDay} to ${FACTS.planMaxMinutesPerDay} minutes a day.`,
      ].join('\n'),
      ...CURRICULUM.map(daySection),
      [
        '## Practise each day',
        '',
        `Do each day's characters in the ${link('guided lessons', '/learn/')}, then drill them in ${link('Morse code practice', '/practice/')}. Every code is on the ${link('Morse code alphabet', ALPHABET_PATH)} chart.`,
      ].join('\n'),
      faqSection(faqFor(PLAN_PATH)),
    ],
  })
}

function relatedWords(word: MorseWord): string {
  const others = WORDS.filter(
    (other) => other.category === word.category && other.slug !== word.slug,
  )
  if (others.length === 0) return ''
  return [
    `## Related words: ${WORD_CATEGORIES[word.category].label}`,
    '',
    ...others.map((other) => `- ${link(wordLabel(other), `/words/${other.slug}/`)}`),
  ].join('\n')
}

/** `/words/<slug>.md`: the answer, the note, the breakdown and the FAQ. */
export function wordMarkdown(word: MorseWord): string {
  const meta = wordPage(word)
  const rows = breakdown(word).map(({ character, code: morse }) => {
    const entry = CHARACTERS[character]
    return [character, code(morse), entry?.spoken ?? '']
  })
  return markdownDocument({
    title: meta.h1,
    path: meta.path,
    answer: `${meta.answer.label} in Morse code is "${meta.answer.morse}". ${meta.answer.detail}`,
    sections: [
      ['## What it means', '', [word.note, prosignNote(word)].filter(Boolean).join(' ')].join('\n'),
      [
        '## Letter by letter',
        '',
        table(['Character', 'Code', 'Spoken'], rows),
        '',
        'A space separates letters and a slash separates words.',
      ].join('\n'),
      faqSection(wordFaq(word)),
      relatedWords(word),
      [
        '## More',
        '',
        `- ${link('Every word in Morse code', '/words/')}`,
        `- ${link('The Morse code alphabet', ALPHABET_PATH)}`,
        `- ${link('Translate your own text', '/morse-code-translator/')}`,
      ].join('\n'),
    ],
  })
}
