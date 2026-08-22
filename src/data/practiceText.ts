/**
 * Text to practise on (PROJECT.md §13).
 *
 * Single characters teach the alphabet; they do not teach reading. Between
 * knowing every letter and copying a sentence sits the skill nobody drills —
 * holding a few characters in your head while the next ones arrive. These are
 * the standard exercises for it, and each targets a different failure.
 */

import { ALL_LETTERS, ALL_DIGITS, MORSE_ALPHABET } from './morseAlphabet'
import { createRandom } from '../game/random'

export type TextKind = 'groups' | 'words' | 'phrases' | 'callsigns'

export interface TextSource {
  id: TextKind
  name: string
  summary: string
  /** What this one is actually training. */
  rationale: string
}

export const TEXT_SOURCES: Record<TextKind, TextSource> = {
  groups: {
    id: 'groups',
    name: 'Code groups',
    summary: 'Random five-character groups',
    rationale:
      'The standard exercise, and the honest one. Random groups cannot be guessed from context, so they measure what you can actually copy rather than what you can infer. Every proficiency test uses them for exactly that reason.',
  },
  words: {
    id: 'words',
    name: 'Common words',
    summary: 'Short real words',
    rationale:
      'Real words let you start recognising whole shapes instead of assembling letters, which is the jump from copying to reading. Easier than groups, and the easiness is the point — it is where speed comes from.',
  },
  phrases: {
    id: 'phrases',
    name: 'On-air phrases',
    summary: 'What operators actually send',
    rationale:
      'CQ, RST reports, sign-offs. Almost every real contact is built from a small set of stock phrases, so knowing them by ear turns an unreadable exchange into a mostly-predictable one.',
  },
  callsigns: {
    id: 'callsigns',
    name: 'Callsigns',
    summary: 'Letter and digit mixtures',
    rationale:
      'The hardest thing to copy, because letters and digits mix unpredictably and there is no context to fall back on. Also the thing you most need at speed, since a missed callsign means a missed contact.',
  },
}

export const TEXT_KINDS = Object.keys(TEXT_SOURCES) as TextKind[]

/** Short words that use only common letters. Ordered roughly by difficulty. */
export const COMMON_WORDS: readonly string[] = [
  'THE',
  'AND',
  'YOU',
  'ARE',
  'FOR',
  'NOT',
  'BUT',
  'ALL',
  'CAN',
  'HAD',
  'HER',
  'WAS',
  'ONE',
  'OUR',
  'OUT',
  'DAY',
  'GET',
  'HAS',
  'HIM',
  'HOW',
  'MAN',
  'NEW',
  'NOW',
  'OLD',
  'SEE',
  'TWO',
  'WAY',
  'WHO',
  'BOY',
  'DID',
  'HELLO',
  'WORLD',
  'RADIO',
  'SIGNAL',
  'MORSE',
  'CODE',
  'WATER',
  'NIGHT',
  'SOUND',
  'LIGHT',
  'POWER',
  'NORTH',
  'SOUTH',
  'STORM',
  'RIVER',
]

/** What operators actually send. Kept short — these are heard, not read. */
export const ON_AIR_PHRASES: readonly string[] = [
  'CQ CQ',
  'CQ CQ CQ',
  'DE',
  'QTH',
  'RST 599',
  'RST 579',
  'TU 73',
  'GM OM',
  'GE OM',
  'FB OM',
  'HW CPY',
  'PSE RPT',
  'AGN PSE',
  'TNX FER QSO',
  '73 SK',
]

/** Prefixes real callsigns start with, so the generated ones look plausible. */
const CALLSIGN_PREFIXES = ['TA', 'G', 'DL', 'F', 'W', 'K', 'VK', 'JA', 'EA', 'SP', 'OH', 'LA']

export interface GenerateOptions {
  /** Characters allowed. Anything outside is not produced. */
  alphabet?: readonly string[]
  /** 0..1 source, injected so a session can be reproduced. */
  random?: () => number
}

const pick = <T>(items: readonly T[], random: () => number): T =>
  items[Math.floor(random() * items.length)]!

/**
 * A group of `size` random characters.
 *
 * Five is the convention, and it is not arbitrary: five characters is about the
 * most a learner can hold before the next group starts, so it measures working
 * memory rather than reaction time.
 */
export function codeGroup(
  size = 5,
  { alphabet, random = Math.random }: GenerateOptions = {},
): string {
  const pool = alphabet && alphabet.length > 0 ? alphabet : [...ALL_LETTERS, ...ALL_DIGITS]
  return Array.from({ length: size }, () => pick(pool, random)).join('')
}

/** A plausible callsign: prefix, digit, one to three letters. */
export function callsign({ random = Math.random }: GenerateOptions = {}): string {
  const suffixLength = 1 + Math.floor(random() * 3)
  const suffix = Array.from({ length: suffixLength }, () => pick(ALL_LETTERS, random)).join('')
  return `${pick(CALLSIGN_PREFIXES, random)}${pick(ALL_DIGITS, random)}${suffix}`
}

/**
 * Words that can be spelled with the given alphabet.
 *
 * Filtered rather than substituted: offering a learner who knows six characters
 * a word containing a seventh teaches them that the app does not track what it
 * taught them.
 */
export function wordsFor(alphabet: readonly string[], source: readonly string[]): string[] {
  const known = new Set(alphabet)
  return source.filter((word) => [...word].every((c) => c === ' ' || known.has(c)))
}

/**
 * Produce one prompt of the requested kind.
 *
 * Returns null when the alphabet is too small to produce anything — with four
 * characters unlocked there is no real word to offer, and inventing one would
 * be worse than saying so.
 */
export function generateText(kind: TextKind, options: GenerateOptions = {}): string | null {
  const { alphabet, random = Math.random } = options
  const pool = alphabet && alphabet.length > 0 ? alphabet : [...ALL_LETTERS, ...ALL_DIGITS]

  switch (kind) {
    case 'groups':
      return codeGroup(5, { alphabet: pool, random })

    case 'callsigns': {
      // Callsigns need digits and a decent spread of letters to look real.
      const hasDigits = pool.some((c) => ALL_DIGITS.includes(c as never))
      if (!hasDigits || pool.length < 10) return null
      return callsign({ random })
    }

    case 'words': {
      const candidates = wordsFor(pool, COMMON_WORDS)
      return candidates.length === 0 ? null : pick(candidates, random)
    }

    case 'phrases': {
      const candidates = wordsFor(pool, ON_AIR_PHRASES)
      return candidates.length === 0 ? null : pick(candidates, random)
    }
  }
}

/** Whether a kind can produce anything from this alphabet. */
export function isAvailable(kind: TextKind, alphabet: readonly string[]): boolean {
  // Sampled with a fixed source so the answer does not flicker between renders.
  return generateText(kind, { alphabet, random: createRandom(1) }) !== null
}

/** Every character a piece of text needs, for recording per-character results. */
export function charactersIn(text: string): string[] {
  return [...text].filter((c) => c !== ' ' && MORSE_ALPHABET[c] !== undefined)
}
