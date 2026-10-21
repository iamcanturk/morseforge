/**
 * Per-character facts, computed.
 *
 * A page about "A in Morse code" is only worth indexing if it says something a
 * chart row does not. Everything here is derived from the alphabet, the tree,
 * the curriculum and the timing engine, so a character page can state a dozen
 * facts and none of them can be wrong in a way the rest of the app is not.
 * `distinctFacts` counts how many a given character actually has, and the test
 * insists on six for every page-worthy character: below that it is a doorway
 * page and does not get built.
 */

import { buildTimeline, timelineDuration } from '../engine/timingEngine'
import { prettify } from '../engine/morseEncoder'
import { CURRICULUM } from './curriculum'
import {
  ALL_DIGITS,
  ALL_LETTERS,
  DIGITS,
  ITU_PUNCTUATION,
  LETTERS,
  PUNCTUATION,
  PUNCTUATION_NAMES,
} from './morseAlphabet'
import { METHODS } from './methods'
import { findNode, pathTo } from './tree'
import { WORDS, wordLabel } from './words'

export type CharacterKind = 'letter' | 'digit' | 'punctuation'

export interface CharacterTreePosition {
  /** Steps from the root, which is also the number of elements. */
  steps: number
  /** The character one step closer to the root, or null for E and T. */
  parent: string | null
  /** The character a dot leads to from here, if any. */
  dot: string | null
  /** The character a dash leads to from here, if any. */
  dash: string | null
}

export interface CharacterFacts {
  character: string
  kind: CharacterKind
  /** Defined in ITU-R M.1677-1. Always true for letters and digits. */
  itu: boolean
  /** "A", "7", or "question mark". */
  name: string
  /** URL segment: "a", "7", "question-mark". */
  slug: string
  /** ASCII code: dots and hyphens. */
  code: string
  /** Typographic code, as the chart draws it. */
  display: string
  /** "di-dah": dots are di, the last dot is dit, dashes are dah. */
  spoken: string
  /** "dot dash": the elements in order, for alt text and prose. */
  spelled: string
  elements: number
  dots: number
  dashes: number
  /** Milliseconds to send it, gaps inside the character included. */
  durationMs: { wpm5: number; wpm20: number }
  /** Letters only: where it sits in the A–Z tree. */
  tree: CharacterTreePosition | null
  /** The character with dots and dashes swapped, if that is also a character. */
  mirror: string | null
  /** The character spelled backwards, if that is also a character. */
  reverse: string | null
  /** Characters that differ by exactly one element in the same position. */
  neighbours: readonly string[]
  /** The day of the 7-day plan that teaches it, if the plan does. */
  planDay: number | null
  /** What else that day teaches. */
  companions: readonly string[]
  /** One-based position in the Koch order, if Koch teaches it. */
  kochPosition: number | null
  /** Word pages whose text contains it. */
  words: readonly { slug: string; label: string }[]
}

/** Letters and digits: the characters that get a page and that every lesson teaches. */
export const PAGE_CHARACTERS: readonly string[] = [...ALL_LETTERS, ...ALL_DIGITS]

/** The set a mirror, reverse or neighbour has to land in to be worth mentioning. */
const CORE: Readonly<Record<string, string>> = { ...LETTERS, ...DIGITS }

const swap = (code: string): string =>
  [...code].map((element) => (element === '.' ? '-' : '.')).join('')

const reverseOf = (code: string): string => [...code].reverse().join('')

function characterWithCode(code: string, except: string): string | null {
  return (
    Object.entries(CORE).find(
      ([character, other]) => other === code && character !== except,
    )?.[0] ?? null
  )
}

function spokenForm(code: string): string {
  return [...code]
    .map((element, index) => (element === '-' ? 'dah' : index === code.length - 1 ? 'dit' : 'di'))
    .join('-')
}

function kindOf(character: string): CharacterKind {
  if (character in LETTERS) return 'letter'
  if (character in DIGITS) return 'digit'
  return 'punctuation'
}

function sendTime(code: string, wpm: number): number {
  return timelineDuration(buildTimeline(code, { wpm }))
}

function treePosition(character: string): CharacterTreePosition | null {
  if (!(character in LETTERS)) return null
  const path = pathTo(character)
  const node = findNode(character)
  if (!node) return null
  return {
    steps: node.depth,
    parent: path.at(-2)?.character ?? null,
    dot: node.dot?.character ?? null,
    dash: node.dash?.character ?? null,
  }
}

function slugFor(character: string, kind: CharacterKind): string {
  if (kind === 'punctuation') {
    return PUNCTUATION_NAMES[character as keyof typeof PUNCTUATION_NAMES].replaceAll(' ', '-')
  }
  return character.toLowerCase()
}

function build(character: string, code: string): CharacterFacts {
  const kind = kindOf(character)
  const day = CURRICULUM.find((entry) => entry.characters.includes(character))
  const kochIndex = METHODS.koch.order.indexOf(character)
  const dots = [...code].filter((element) => element === '.').length

  return {
    character,
    kind,
    itu: kind !== 'punctuation' || character in ITU_PUNCTUATION,
    name:
      kind === 'punctuation'
        ? PUNCTUATION_NAMES[character as keyof typeof PUNCTUATION_NAMES]
        : character,
    slug: slugFor(character, kind),
    code,
    display: prettify(code),
    spoken: spokenForm(code),
    spelled: [...code].map((element) => (element === '.' ? 'dot' : 'dash')).join(' '),
    elements: code.length,
    dots,
    dashes: code.length - dots,
    durationMs: { wpm5: sendTime(code, 5), wpm20: sendTime(code, 20) },
    tree: treePosition(character),
    mirror: characterWithCode(swap(code), character),
    reverse: characterWithCode(reverseOf(code), character),
    neighbours: Object.entries(CORE)
      .filter(
        ([other, otherCode]) =>
          other !== character &&
          otherCode.length === code.length &&
          otherCode !== swap(code) &&
          [...otherCode].filter((element, index) => element !== code[index]).length === 1,
      )
      .map(([other]) => other),
    planDay: day?.day ?? null,
    companions: day ? day.characters.filter((other) => other !== character) : [],
    kochPosition: kochIndex === -1 ? null : kochIndex + 1,
    words: WORDS.filter((word) => word.text.includes(character)).map((word) => ({
      slug: word.slug,
      label: wordLabel(word),
    })),
  }
}

/** Every character MorseForge can send, keyed by the character. */
export const CHARACTERS: Readonly<Record<string, CharacterFacts>> = Object.freeze(
  Object.fromEntries(
    [...Object.entries(LETTERS), ...Object.entries(DIGITS), ...Object.entries(PUNCTUATION)].map(
      ([character, code]) => [character, build(character, code)],
    ),
  ),
)

/** Facts for one character, or undefined when MorseForge cannot send it. */
export function characterFacts(character: string): CharacterFacts | undefined {
  return CHARACTERS[character.toUpperCase()]
}

/** Find a character by its URL segment: "a", "7", "question-mark". */
export function characterBySlug(slug: string): CharacterFacts | undefined {
  return Object.values(CHARACTERS).find((facts) => facts.slug === slug)
}

/**
 * The URL segment of a character's own page under `/morse-code-alphabet/`, or
 * null when it has none.
 *
 * Only `PAGE_CHARACTERS` get a page; punctuation has too few facts of its own
 * (no tree position, plan day or Koch slot) to be more than a chart row. A
 * caller that links a character therefore links only when this is non-null,
 * and can never emit a link that 404s:
 *
 *   const slug = characterSlug('A')  // "a"
 *   if (slug) href = `/morse-code-alphabet/${slug}/`
 */
export function characterSlug(character: string): string | null {
  const facts = characterFacts(character)
  return facts && PAGE_CHARACTERS.includes(facts.character) ? facts.slug : null
}

/**
 * Names of the facts a character actually has, for the thin-page test.
 *
 * Counts only what a reader would see as a separate statement, so a mirror that
 * does not exist is not a fact and an empty word list is not either.
 */
export function distinctFacts(facts: CharacterFacts): string[] {
  const present: [string, boolean][] = [
    ['code', facts.code.length > 0],
    ['spoken form', facts.spoken.length > 0],
    ['element counts', facts.elements > 0],
    ['send time at 5 WPM', facts.durationMs.wpm5 > 0],
    ['send time at 20 WPM', facts.durationMs.wpm20 > 0],
    ['tree position', facts.tree !== null],
    ['mirror image', facts.mirror !== null],
    ['reversed', facts.reverse !== null],
    ['one-element neighbours', facts.neighbours.length > 0],
    ['plan day', facts.planDay !== null],
    ['plan companions', facts.companions.length > 0],
    ['Koch position', facts.kochPosition !== null],
    ['words containing it', facts.words.length > 0],
  ]
  return present.filter(([, has]) => has).map(([label]) => label)
}
