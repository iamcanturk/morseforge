/**
 * What the telegraph hears in the decoded stream (PROJECT.md §49, §50).
 *
 * Pure functions over the text the live decoder has produced, so the screen
 * only has to call them when a character or a word commits. Three readings:
 *
 * - **Easter eggs** (§50): SOS, CQ, 73 and 88 each get a small answer from the
 *   instrument. The words come from `WORDS` and the prosign code from
 *   `PROSIGNS`, never typed here, so a change to the data cannot leave a dead
 *   egg behind.
 * - **Messages** (§49): whether a finished word counts as someone sending a
 *   real message rather than testing the key, which is what banks "CQ CQ CQ".
 * - **Targets**: the optional "send this" prompt, checked as you key.
 */

import { PROSIGNS } from '../data/morseAlphabet'
import { findWord } from '../data/words'
import { encodeCharacter } from '../engine/morseEncoder'
import { UNKNOWN_CHARACTER } from '../engine/morseDecoder'

/* -------------------------------------------------------------------------- */
/* Easter eggs                                                                 */
/* -------------------------------------------------------------------------- */

export type EasterEggId = 'sos' | 'cq' | '73' | '88'

/** Which lamp colour the instrument answers in. Never the only cue: there is text. */
export type EggTone = 'danger' | 'cyan' | 'signal' | 'amber'

export interface EasterEgg {
  id: EasterEggId
  /** The word that triggers it, read from `WORDS`. */
  word: string
  /** The rubber stamp that lands on the tape. Short: it is set in display type. */
  stamp: string
  /** One sentence printed under the tape, in the operator's own terms. */
  reply: string
  tone: EggTone
  /** The `/words/` page that explains the word properly. */
  href: string
}

/** A word's text from the data, failing loudly at import if the entry is gone. */
function wordText(slug: string): string {
  const word = findWord(slug)
  if (!word) throw new Error(`easterEggs: no "${slug}" entry in WORDS`)
  return word.text
}

export const EASTER_EGGS: readonly EasterEgg[] = [
  {
    id: 'sos',
    word: wordText('sos'),
    stamp: 'Priority',
    reply: 'Distress heard. On the air, an SOS outranks every other signal.',
    tone: 'danger',
    href: '/words/sos/',
  },
  {
    id: 'cq',
    word: wordText('cq'),
    stamp: 'Calling',
    reply: 'CQ: calling any station. Whoever is listening is invited to answer.',
    tone: 'cyan',
    href: '/words/cq/',
  },
  {
    id: '73',
    word: wordText('73'),
    stamp: 'Best regards',
    reply: '73 means best regards, the way operators sign off. Never "73s".',
    tone: 'signal',
    href: '/words/73/',
  },
  {
    id: '88',
    word: wordText('88'),
    stamp: 'Love & kisses',
    reply: '88 means love and kisses. By custom it goes to someone close, not a stranger.',
    tone: 'amber',
    href: '/words/88/',
  },
]

/**
 * Said instead of the SOS reply when it was keyed the proper way: as one
 * unbroken character with no letter gaps, which the decoder cannot read as
 * letters and prints as an unknown mark.
 */
export const SOS_PROSIGN_REPLY =
  'Sent as one unbroken character, with no gaps between the letters: SOS keyed the proper way.'

export interface EggHit {
  egg: EasterEgg
  /** `prosign` when SOS arrived as one continuous character. */
  form: 'letters' | 'prosign'
  reply: string
}

export function findEgg(id: EasterEggId): EasterEgg {
  const egg = EASTER_EGGS.find((candidate) => candidate.id === id)
  if (!egg) throw new Error(`easterEggs: unknown egg "${id}"`)
  return egg
}

/** The word being sent: everything after the last space, upper-cased. */
export function lastWord(text: string): string {
  const trimmed = text.trimEnd()
  return trimmed.slice(trimmed.lastIndexOf(' ') + 1).toUpperCase()
}

/**
 * Check the stream the moment a character commits.
 *
 * Call it once per committed character, with the decoded text *including* that
 * character and the raw elements it was keyed as. Because it only ever looks
 * at the word that character just finished, it cannot fire twice for one
 * sending, and "SOS" inside "XSOS" is not an SOS.
 */
export function detectEasterEgg(committed: { text: string; code: string }): EggHit | null {
  if (committed.code === PROSIGNS.SOS) {
    return { egg: findEgg('sos'), form: 'prosign', reply: SOS_PROSIGN_REPLY }
  }
  const word = lastWord(committed.text)
  if (!word) return null
  const egg = EASTER_EGGS.find((candidate) => candidate.word === word)
  return egg ? { egg, form: 'letters', reply: egg.reply } : null
}

/* -------------------------------------------------------------------------- */
/* Messages                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * Whether a finished word reads as a message rather than someone trying the
 * key out.
 *
 * Deliberately generous: there is no dictionary to check against, and a
 * learner's first "HI" is exactly the moment §49 is about. What it rules out is
 * the noise of learning to time the key — a single character, a run of one
 * character ("EEEE" is a too-slow S), anything holding an unreadable mark — so
 * the achievement means something was actually said.
 */
export function isMessageWord(word: string): boolean {
  const characters = [...word.trim().toUpperCase()]
  if (characters.length < 2) return false
  if (characters.some((c) => c === UNKNOWN_CHARACTER || encodeCharacter(c) === null)) return false
  if (EASTER_EGGS.some((egg) => egg.word === characters.join(''))) return true
  return new Set(characters).size > 1
}

/* -------------------------------------------------------------------------- */
/* Targets                                                                     */
/* -------------------------------------------------------------------------- */

/** The longest name the "send your name" target accepts. */
export const NAME_MAX = 16

/**
 * Clean whatever was typed into the name field into something the key can
 * send: upper case, encodable characters only, single spaces, capped.
 */
export function sendable(input: string): string {
  const kept = [...input.toUpperCase()]
    .map((c) => (/\s/.test(c) ? ' ' : c))
    .filter((c) => c === ' ' || encodeCharacter(c) !== null)
    .join('')
  return kept.replace(/ {2,}/g, ' ').trimStart().slice(0, NAME_MAX)
}

export interface TargetCheck {
  /** How many characters of the target are done, spaces excluded. */
  matched: number
  /** The characters still to send, spaces excluded. */
  total: number
  /** The character to send next, or null once done. */
  next: string | null
  /** Characters sent that were not the one asked for. */
  slips: number
  /** The last thing sent, when it was a slip: what to tell the learner. */
  lastSlip: string | null
  done: boolean
}

/**
 * Check what has been sent against a target, as a typing tutor would.
 *
 * A wrong character is counted as a slip and the target waits for the right
 * one, instead of throwing away the progress before it: a beginner who sends
 * "SO" and then fumbles should carry on from the last S, not start over.
 * Spaces are ignored on both sides, because whether a pause read as a word gap
 * is a timing accident, not a spelling mistake.
 */
export function checkTarget(target: string, sent: string): TargetCheck {
  const want = [...target.toUpperCase()].filter((c) => c !== ' ')
  const got = [...sent.toUpperCase()].filter((c) => c !== ' ')
  let matched = 0
  let slips = 0
  let lastSlip: string | null = null

  for (const character of got) {
    if (matched >= want.length) break
    if (character === want[matched]) {
      matched += 1
      lastSlip = null
    } else {
      slips += 1
      lastSlip = character
    }
  }

  const done = want.length > 0 && matched === want.length
  return {
    matched,
    total: want.length,
    next: done ? null : (want[matched] ?? null),
    slips,
    lastSlip,
    done,
  }
}
