/**
 * Pure builders for the SEO-D reference pages: the character pages, the
 * numbers page, the speed page and the how-to hub.
 *
 * Every sentence and every table cell these pages show is computed here from
 * the alphabet, the curriculum, the learning methods and the timing engine, so
 * the pages hold no figures and no Morse of their own. Keeping it out of the
 * `.astro` templates also means each rule (the six-fact floor, the PARIS sum,
 * the speed range) is unit-tested rather than eyeballed in a screenshot.
 */

import { FACTS, MASTERY_RULE } from '../../config/facts'
import { CHARACTERS, PAGE_CHARACTERS, characterSlug, distinctFacts } from '../../data/characters'
import type { CharacterFacts } from '../../data/characters'
import { CURRICULUM } from '../../data/curriculum'
import { describeElements, joinList, numberWord, plural } from '../../data/format'
import { METHODS } from '../../data/methods'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { encode, prettify } from '../../engine/morseEncoder'
import {
  PARIS_UNITS,
  buildTimeline,
  dotDuration,
  resolveTiming,
  type ResolvedTiming,
} from '../../engine/timingEngine'
import { WPM_PRESETS, WPM_RANGE } from '../../storage/settings'

// ===========================================================================
// Links
// ===========================================================================

export interface TextLink {
  /** Exact text as it appears in the sentence. The first occurrence is linked. */
  text: string
  href: string
}

export interface TextPart {
  text: string
  href?: string
}

/**
 * Split a sentence so the first occurrence of each phrase becomes a link.
 * Works on plain strings, so the copy is never parsed as HTML. A phrase that
 * does not occur is skipped (the tests check that none is).
 */
export function linkParts(text: string, links: readonly TextLink[] = []): TextPart[] {
  let parts: TextPart[] = [{ text }]
  for (const link of links) {
    const next: TextPart[] = []
    let done = false
    for (const part of parts) {
      const at = done || part.href ? -1 : part.text.indexOf(link.text)
      if (at < 0) {
        next.push(part)
        continue
      }
      done = true
      if (at > 0) next.push({ text: part.text.slice(0, at) })
      next.push({ text: link.text, href: link.href })
      const rest = part.text.slice(at + link.text.length)
      if (rest) next.push({ text: rest })
    }
    parts = next
  }
  return parts
}

/** The path of a character's page, or null when it has none. */
export function characterHref(character: string): string | null {
  const slug = characterSlug(character)
  return slug ? `/morse-code-alphabet/${slug}/` : null
}

// ===========================================================================
// Character pages
// ===========================================================================

/** Below this a character page is a doorway page, and it is not built. */
export const MIN_FACTS = 6

/**
 * The characters that get a page, in alphabet order: letters, then digits.
 * Only those with at least `MIN_FACTS` distinct computed facts; today that is
 * every letter and digit and no punctuation mark (they have five at most).
 */
export function characterPages(): CharacterFacts[] {
  return PAGE_CHARACTERS.map((character) => CHARACTERS[character]!).filter(
    (facts) => distinctFacts(facts).length >= MIN_FACTS,
  )
}

/** "dash-dot", the spelled form as one word, for running text. */
const hyphenated = (facts: CharacterFacts): string => facts.spelled.replaceAll(' ', '-')

const step = (count: number): string => (count === 1 ? 'step' : 'steps')

/** Letters of the same length as this one, for "one of the 4 two-element letters". */
function sameLengthLetters(facts: CharacterFacts): string[] {
  return [...(FACTS.lettersByLength[facts.elements] ?? [])]
}

/**
 * The answer-first paragraph (audit §3 template): the code and its sound, where
 * it sits, its mirror, and the plan day. 30 to 75 words for every character.
 */
/**
 * The elements in the order they are sent, the way a person says them:
 * "a single dot", "one dot followed by one dash", "one dash followed by three
 * dots", and for codes that alternate more than once, "dash, dot, dash, dot".
 */
export function elementsInOrder(code: string): string {
  const name = (element: string, count: number) =>
    element === '.' ? (count === 1 ? 'dot' : 'dots') : count === 1 ? 'dash' : 'dashes'
  const runs = (code.match(/\.+|-+/g) ?? []).map((run) => ({ element: run[0]!, count: run.length }))
  if (code.length === 1) return `a single ${name(code, 1)}`
  if (runs.length === 1) return `${numberWord(code.length)} ${name(code[0]!, code.length)}`
  if (runs.length === 2) {
    return runs
      .map((run) => `${numberWord(run.count)} ${name(run.element, run.count)}`)
      .join(' followed by ')
  }
  return joinList([...code].map((element) => name(element, 1)))
}

export function characterIntro(facts: CharacterFacts): string {
  const sentences = [
    `${facts.character} in Morse code is "${facts.code}": ${elementsInOrder(facts.code)}, spoken "${facts.spoken}".`,
  ]

  const mirror = facts.mirror ? CHARACTERS[facts.mirror] : undefined
  const mirrorClause = mirror
    ? `, and it is the mirror image of ${mirror.character}, which is ${hyphenated(mirror)}`
    : ''

  if (facts.kind === 'letter' && facts.tree) {
    const peers = sameLengthLetters(facts)
    sentences.push(
      `It is one of the ${peers.length} ${numberWord(facts.elements)}-element letters, so it sits ${numberWord(facts.tree.steps)} ${step(facts.tree.steps)} from the root of the Morse code tree${mirrorClause}.`,
    )
  } else if (facts.kind === 'digit') {
    sentences.push(
      `It is one of the ${FACTS.digitCount} digits, all exactly ${numberWord(FACTS.digitElements)} elements long${mirrorClause}.`,
    )
  }

  if (facts.planDay !== null) {
    sentences.push(
      `The ${FACTS.planDays}-day plan teaches ${facts.character} on day ${facts.planDay}.`,
    )
  }

  sentences.push(
    `At ${FACTS.exampleWpm} words per minute it takes ${facts.durationMs.wpm20} milliseconds to send.`,
  )

  return sentences.join(' ').replace(/ {2,}/g, ' ')
}

export interface FactRow {
  /** The engraved label: "Mirror image". */
  label: string
  /** The value as plain text: what a screen reader and a quote get. */
  value: string
  /** Codes shown next to the value, in ASCII; the page renders them in mono. */
  code?: string
  /** Characters inside the value that link to their own pages. */
  links?: readonly { character: string; href: string }[]
}

/** Characters as links, skipping any without a page. */
function linked(characters: readonly string[]): { character: string; href: string }[] {
  return characters.flatMap((character) => {
    const href = characterHref(character)
    return href ? [{ character, href }] : []
  })
}

/**
 * The specification plate: one row per fact the character actually has. A row
 * whose value would be empty ("mirror image: none") is left out rather than
 * shown, so the count of rows is also the count of real facts.
 */
export function characterFactRows(facts: CharacterFacts): FactRow[] {
  const rows: FactRow[] = [
    { label: 'Morse code', value: facts.code, code: facts.code },
    { label: 'Spoken', value: facts.spoken },
    {
      label: 'Elements',
      value: `${facts.elements}: ${describeElements(facts.code)}`,
    },
    {
      label: `At ${FACTS.exampleWpm} WPM`,
      value: `${facts.durationMs.wpm20} ms`,
    },
    {
      label: `At ${FACTS.wpmMin} WPM`,
      value: `${facts.durationMs.wpm5} ms`,
    },
  ]

  if (facts.tree) {
    rows.push({
      label: 'Morse tree',
      value: `${plural(facts.tree.steps, 'step')} from the root${facts.tree.parent ? `, below ${facts.tree.parent}` : ''}`,
      links: facts.tree.parent ? linked([facts.tree.parent]) : [],
    })
  }
  if (facts.mirror) {
    rows.push({
      label: 'Mirror image',
      value: facts.mirror,
      code: MORSE_ALPHABET[facts.mirror],
      links: linked([facts.mirror]),
    })
  }
  if (facts.reverse) {
    rows.push({
      label: 'Read backwards',
      value: facts.reverse,
      code: MORSE_ALPHABET[facts.reverse],
      links: linked([facts.reverse]),
    })
  }
  if (facts.neighbours.length > 0) {
    rows.push({
      label: 'One element away',
      value: joinList(facts.neighbours),
      links: linked(facts.neighbours),
    })
  }
  if (facts.planDay !== null) {
    rows.push({
      label: `${FACTS.planDays}-day plan`,
      value:
        facts.companions.length > 0
          ? `Day ${facts.planDay}, with ${joinList(facts.companions)}`
          : `Day ${facts.planDay}`,
    })
  }
  if (facts.kochPosition !== null) {
    rows.push({
      label: 'Koch order',
      value: `${facts.kochPosition} of ${METHODS.koch.order.length}`,
    })
  }
  return rows
}

/** The plan day's anchor on the 7-day page, or null. */
export function planDayHref(facts: CharacterFacts): string | null {
  return facts.planDay === null ? null : `/learn-morse-code-in-7-days/#day-${facts.planDay}`
}

/** Previous and next page in alphabet order, wrapping at the ends. */
export function characterSiblings(facts: CharacterFacts): {
  previous: CharacterFacts
  next: CharacterFacts
} {
  const pages = characterPages()
  const index = pages.findIndex((page) => page.character === facts.character)
  if (index === -1) throw new RangeError(`${facts.character} has no page`)
  return {
    previous: pages[(index - 1 + pages.length) % pages.length]!,
    next: pages[(index + 1) % pages.length]!,
  }
}

// ===========================================================================
// The mini tree path
// ===========================================================================

export interface PathNode {
  x: number
  y: number
  /** The prefix this node stands for. */
  code: string
  /** The character there, if any. */
  character: string | null
  /** On the way to the target. */
  taken: boolean
  target: boolean
  /** The element that leads here from the parent; null at the root. */
  element: '.' | '-' | null
  href: string | null
}

export interface PathEdge {
  x1: number
  y1: number
  x2: number
  y2: number
  taken: boolean
  /** The glyph drawn beside the edge: the typographic dot or dash. */
  glyph: string
}

export interface TreePathLayout {
  nodes: PathNode[]
  edges: PathEdge[]
  width: number
  height: number
  /** One sentence describing the path, for the SVG's title. */
  description: string
}

/** Letters and digits: what a node may be labelled with. */
const LABELLED: ReadonlyMap<string, string> = new Map(
  PAGE_CHARACTERS.map((character) => [MORSE_ALPHABET[character]!, character]),
)

/**
 * The walk from the root of the Morse tree to a code. At every step both
 * branches are drawn, the taken one lit and the other dim, so the sibling at
 * the last step (a one-element neighbour) is visible too.
 */
export function treePath(
  code: string,
  options: { dx?: number; dy?: number; pad?: number } = {},
): TreePathLayout {
  const { dx = 46, dy = 58, pad = 26 } = options
  const nodes: PathNode[] = []
  const edges: PathEdge[] = []
  let x = 0
  let y = 0
  nodes.push({
    x,
    y,
    code: '',
    character: null,
    taken: true,
    target: code.length === 0,
    element: null,
    href: null,
  })

  for (const [index, element] of [...code].entries()) {
    const prefix = code.slice(0, index)
    const childY = y + dy
    let nextX = x
    for (const branch of ['.', '-'] as const) {
      const childCode = prefix + branch
      const childX = branch === '.' ? x - dx : x + dx
      const taken = branch === element
      const character = LABELLED.get(childCode) ?? null
      const target = taken && index === code.length - 1
      nodes.push({
        x: childX,
        y: childY,
        code: childCode,
        character,
        taken,
        target,
        element: branch,
        href: character && !target ? characterHref(character) : null,
      })
      edges.push({ x1: x, y1: y, x2: childX, y2: childY, taken, glyph: prettify(branch) })
      if (taken) nextX = childX
    }
    x = nextX
    y = childY
  }

  const xs = nodes.map((node) => node.x)
  const minX = Math.min(...xs) - pad
  const maxX = Math.max(...xs) + pad
  for (const node of nodes) {
    node.x -= minX
    node.y += pad
  }
  for (const edge of edges) {
    edge.x1 -= minX
    edge.x2 -= minX
    edge.y1 += pad
    edge.y2 += pad
  }

  const target = LABELLED.get(code) ?? code
  const steps = [...code].map((element, index) => {
    const at = LABELLED.get(code.slice(0, index + 1))
    const move = element === '.' ? 'a dot' : 'a dash'
    return at ? `${move} to ${at}` : move
  })

  return {
    nodes,
    edges,
    width: maxX - minX,
    height: y + pad * 2,
    description: `The path through the Morse code tree to ${target}: from the root, ${joinList(steps, 'then')}.`,
  }
}

// ===========================================================================
// The numbers page
// ===========================================================================

/** The digits, in counting order 1 to 9 then 0, the order the rule runs in. */
export function digitsInRuleOrder(): CharacterFacts[] {
  const digits = characterPages().filter((facts) => facts.kind === 'digit')
  return [
    ...digits.filter((facts) => facts.character !== '0'),
    ...digits.filter((f) => f.character === '0'),
  ]
}

/** Where the digits are taught, from the curriculum. */
export function digitsPlanDay(): number | null {
  return (
    CURRICULUM.find((day) => day.characters.every((character) => /^[0-9]$/.test(character)))?.day ??
    null
  )
}

// ===========================================================================
// The speed page
// ===========================================================================

export interface SpeedRow {
  wpm: number
  dot: number
  dash: number
  characterGap: number
  wordGap: number
  /** One PARIS, trailing word gap included. Always 60 000 ÷ WPM. */
  paris: number
}

/** Every whole speed the sliders offer, timed by the engine. */
export function speedRows(range: { min: number; max: number } = WPM_RANGE): SpeedRow[] {
  const rows: SpeedRow[] = []
  for (let wpm = range.min; wpm <= range.max; wpm += 1) {
    const timing = resolveTiming({ wpm })
    rows.push({
      wpm,
      dot: timing.dot,
      dash: timing.dash,
      characterGap: timing.characterGap,
      wordGap: timing.wordGap,
      paris: PARIS_UNITS * timing.dot,
    })
  }
  return rows
}

/** The speeds the speed table highlights: the presets and the example speed. */
export const HIGHLIGHTED_SPEEDS: ReadonlySet<number> = new Set([
  ...Object.values(WPM_PRESETS),
  FACTS.exampleWpm,
])

/** Milliseconds for a table cell: whole numbers stay whole, the rest get one decimal. */
export function formatMs(milliseconds: number): string {
  const rounded = Math.round(milliseconds * 10) / 10
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1)
}

export interface FarnsworthRow {
  /** The overall speed. */
  effective: number
  timing: ResolvedTiming
}

/**
 * Farnsworth examples at one character speed: the overall speeds the app
 * offers below it (the slowest slider speed and the presets), timed by the
 * engine's ARRL stretch. The last row is standard timing for comparison.
 */
export function farnsworthRows(characterWpm: number = FACTS.exampleWpm): FarnsworthRow[] {
  const speeds = [...new Set([WPM_RANGE.min, ...Object.values(WPM_PRESETS), characterWpm])]
    .filter((wpm) => wpm <= characterWpm)
    .sort((a, b) => a - b)
  return speeds.map((effective) => ({
    effective,
    timing: resolveTiming({ wpm: characterWpm, farnsworthWpm: effective }),
  }))
}

export interface ParisSegment {
  /** The letter of PARIS this belongs to. */
  letter: string
  kind: 'dot' | 'dash' | 'element-gap' | 'character-gap' | 'word-gap'
  units: number
}

/**
 * PARIS unit by unit, from the timing engine: each letter's timeline at one
 * word per minute, divided by the unit, then the gap after it. Sums to
 * `PARIS_UNITS`, which the test checks.
 */
export function parisSegments(): ParisSegment[] {
  const unit = dotDuration(1)
  const gaps = resolveTiming({ wpm: 1 })
  const letters = Array.from('PARIS')
  return letters.flatMap((letter, index) => {
    const timeline = buildTimeline(encode(letter), { wpm: 1 })
    const segments: ParisSegment[] = timeline.map((element) => ({
      letter,
      kind: element.type === 'gap' ? 'element-gap' : element.type,
      units: element.duration / unit,
    }))
    const last = index === letters.length - 1
    segments.push({
      letter,
      kind: last ? 'word-gap' : 'character-gap',
      units: (last ? gaps.wordGap : gaps.characterGap) / unit,
    })
    return segments
  })
}

// ===========================================================================
// The how-to hub
// ===========================================================================

/** Blog posts a step quotes. Their `answer` frontmatter is the step's body. */
export type StepPost =
  | 'why-a-morse-code-chart-does-not-work'
  | 'which-order-should-you-learn-morse-in'
  | 'what-farnsworth-timing-is'
  | 'how-long-does-it-take-to-learn-morse-code'

export interface HowToStep {
  /** Anchor on the page: `#step-by-sound`. */
  id: string
  title: string
  /** Either the post whose answer is the body, or computed text. */
  body: { post: StepPost } | { text: string }
  /** Where to go deeper. The first is the main one. */
  links: readonly { label: string; href: string }[]
}

const postHref = (slug: StepPost): string => `/blog/${slug}/`

/** The six steps, each ending in the deep page that owns its topic. */
export function howToSteps(): HowToStep[] {
  return [
    {
      id: 'by-sound',
      title: 'Learn each character as a sound',
      body: { post: 'why-a-morse-code-chart-does-not-work' },
      links: [
        {
          label: 'Why a chart does not work',
          href: postHref('why-a-morse-code-chart-does-not-work'),
        },
        { label: 'Hear every character', href: '/morse-code-alphabet/' },
      ],
    },
    {
      id: 'shortest-first',
      title: 'Start with the shortest codes',
      body: { post: 'which-order-should-you-learn-morse-in' },
      links: [
        {
          label: 'Which order to learn in',
          href: postHref('which-order-should-you-learn-morse-in'),
        },
        { label: 'See the Morse code tree', href: '/tree/' },
      ],
    },
    {
      id: 'farnsworth',
      title: 'Keep the characters fast and the gaps long',
      body: { post: 'what-farnsworth-timing-is' },
      links: [
        { label: 'What Farnsworth timing is', href: postHref('what-farnsworth-timing-is') },
        { label: 'Speed and timing tables', href: '/morse-code-speed/' },
      ],
    },
    {
      id: 'send',
      title: 'Send as well as listen',
      body: {
        text: `Hearing a character and sending it are separate skills, so key every new character back as soon as you can hear it. On a straight key you tap for a dot and hold for a dash, and the rhythm you send is the rhythm you learn. Practice drills hearing, reading and sending, and counts a character as mastered only with ${MASTERY_RULE}.`,
      },
      links: [
        { label: 'Open the telegraph key', href: '/telegraph/' },
        { label: 'Practise all three skills', href: '/practice/' },
      ],
    },
    {
      id: 'daily',
      title: 'Practise a little every day',
      body: {
        text: `Follow a plan in short daily sessions rather than cramming. The ${FACTS.planDays}-day plan teaches all ${FACTS.letterCount} letters and ${FACTS.digitCount} digits one layer of the Morse tree at a time, in sessions of ${FACTS.planMinMinutesPerDay} to ${FACTS.planMaxMinutesPerDay} minutes, about ${FACTS.planTime} in total. The guided lessons follow the same order and pick up exactly where you stopped.`,
      },
      links: [
        { label: `The ${FACTS.planDays}-day plan`, href: '/learn-morse-code-in-7-days/' },
        { label: 'Start the first lesson', href: '/learn/' },
      ],
    },
    {
      id: 'speed',
      title: 'Then build speed by copying',
      body: { post: 'how-long-does-it-take-to-learn-morse-code' },
      links: [
        {
          label: 'How long it really takes',
          href: postHref('how-long-does-it-take-to-learn-morse-code'),
        },
        { label: 'Copy whole lines', href: '/copy/' },
        { label: 'Take the daily challenge', href: '/daily/' },
      ],
    },
  ]
}

/** Phrases in the how-to intro that link to the page owning each claim. */
export const HOW_TO_INTRO_LINKS: readonly TextLink[] = [
  {
    text: 'a sound rather than a pattern on a chart',
    href: postHref('why-a-morse-code-chart-does-not-work'),
  },
  {
    text: 'starting with the shortest codes',
    href: postHref('which-order-should-you-learn-morse-in'),
  },
  { text: 'Farnsworth timing', href: postHref('what-farnsworth-timing-is') },
  { text: 'send as well as listen', href: '/telegraph/' },
  {
    text: 'copying at speed takes months',
    href: postHref('how-long-does-it-take-to-learn-morse-code'),
  },
]

/** Phrases in the speed intro worth linking. */
export const SPEED_INTRO_LINKS: readonly TextLink[] = [
  { text: 'the reference word PARIS', href: '#paris' },
  { text: `${FACTS.unitMsAtOneWpm} ÷ W milliseconds`, href: '#speeds' },
]

/** A step with its body resolved to text, ready for the page and the schema. */
export interface ResolvedStep {
  id: string
  title: string
  text: string
}

/** HowTo JSON-LD for the hub, from the same resolved steps the page shows. */
export function howToSchema(input: {
  url: string
  name: string
  description: string
  steps: readonly ResolvedStep[]
}) {
  return {
    '@context': 'https://schema.org',
    '@type': 'HowTo',
    name: input.name,
    description: input.description,
    step: input.steps.map((resolved, index) => ({
      '@type': 'HowToStep',
      position: index + 1,
      name: resolved.title,
      text: resolved.text,
      url: `${input.url}#step-${resolved.id}`,
    })),
  }
}
