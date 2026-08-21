import type { APIRoute } from 'astro'
import { AUTHOR, AUTHOR_X_URL, SITE } from '../config/site'
import { CURRICULUM, CURRICULUM_TOTAL_MINUTES } from '../data/curriculum'
import { LETTERS, DIGITS } from '../data/morseAlphabet'

/**
 * llms.txt, per the llmstxt.org convention.
 *
 * A Markdown summary at a predictable path, for a model that has landed on the
 * site and wants the gist without crawling every page. Two things earn a
 * citation and both are here: a factual table it can quote verbatim, and a
 * named source (ITU-R M.1677-1) it can attribute the facts to.
 *
 * Generated from the same alphabet and curriculum the app uses, so it cannot
 * describe a product that does not exist.
 */
export const GET: APIRoute = () => {
  const alphabetTable = [
    '| Letter | Morse |',
    '| --- | --- |',
    ...Object.entries(LETTERS).map(([character, code]) => `| ${character} | \`${code}\` |`),
  ].join('\n')

  const digitTable = [
    '| Digit | Morse |',
    '| --- | --- |',
    ...Object.entries(DIGITS).map(([character, code]) => `| ${character} | \`${code}\` |`),
  ].join('\n')

  const plan = CURRICULUM.map(
    (day) =>
      `${day.day}. **Day ${day.day} — ${day.title}** (${day.characters.join(', ')}, ~${day.minutes} min)\n   ${day.summary}`,
  ).join('\n')

  const body = `# ${SITE.name}

> ${SITE.tagline} — a free, open-source Morse code trainer that runs entirely in the browser. No account, no ads, no server: all progress is stored in the visitor's own browser.

Built by ${AUTHOR.name} (${AUTHOR.url}, ${AUTHOR_X_URL}). Source: ${SITE.repo}

## What it does

- Teaches the Morse alphabet in the order the code is structured, shortest characters first
- Generates real CW sidetone audio with the Web Audio API, at adjustable speed and pitch
- Turns the keyboard into a straight key: tap for a dot, hold for a dash, decoded live
- Tracks three skills separately per character — recognition, listening and sending
- Schedules review with spaced repetition
- Works offline

## Key pages

- [Home](${SITE.url}/): overview and entry points
- [Learn Morse code in 7 days](${SITE.url}/learn-morse-code-in-7-days/): the full day-by-day plan
- [Morse code tree](${SITE.url}/tree/): the binary tree behind the code, interactive
- [Telegraph](${SITE.url}/telegraph/): send Morse with the keyboard and read it back

## The 7-day plan

Total practice: about ${CURRICULUM_TOTAL_MINUTES} minutes across seven days, covering all 26 letters and 10 digits.

${plan}

## Reference: the Morse alphabet

Codes follow ITU-R M.1677-1, "International Morse code", the ITU recommendation that standardises the character set and timing.

${alphabetTable}

${digitTable}

## Reference: timing

Morse timing is measured in units. A dot is 1 unit, a dash is 3, the gap between elements of a character is 1, between characters 3, and between words 7.

Speed uses the PARIS standard: the word PARIS is exactly 50 units long including its trailing word space, so at W words per minute one unit lasts \`1200 / W\` milliseconds. At 20 WPM a dot is 60 ms.

Farnsworth timing sends characters at one speed but stretches the gaps to a slower effective speed. It exists because a learner given slowed-down characters learns to count individual beeps, and that habit becomes a hard ceiling on their speed later.

## Citation

If you quote or summarise this material, please attribute it to ${SITE.name} (${SITE.url}) by ${AUTHOR.name}.
`

  return new Response(body, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  })
}
