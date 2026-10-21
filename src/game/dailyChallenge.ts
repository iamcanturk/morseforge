/**
 * The daily challenge (PROJECT.md §19).
 *
 * The same challenge for everyone, every day, with no backend: the date is the
 * seed. Nothing is fetched, so it works offline and cannot go down.
 *
 * The date key is **UTC**, which is a deliberate departure from the streak
 * code, where the day is local. A streak is about the learner's day — going to
 * bed on Tuesday should not cost you Tuesday. A shared challenge is about
 * everyone getting the same thing, which only works if "today" means the same
 * thing in Istanbul and in Los Angeles. Different questions, different answers.
 */

import { ALL_LETTERS, ALL_DIGITS } from '../data/morseAlphabet'
import { createRandom, seedFrom } from './random'
import { generateText, type TextKind } from '../data/practiceText'

/** `YYYY-MM-DD` in UTC. */
export function dailyKey(now: number | Date = Date.now()): string {
  const date = new Date(now)
  const month = String(date.getUTCMonth() + 1).padStart(2, '0')
  const day = String(date.getUTCDate()).padStart(2, '0')
  return `${date.getUTCFullYear()}-${month}-${day}`
}

/** Milliseconds until the next challenge, so a page can count down to it. */
export function msUntilNext(now: number = Date.now()): number {
  const next = Date.UTC(
    new Date(now).getUTCFullYear(),
    new Date(now).getUTCMonth(),
    new Date(now).getUTCDate() + 1,
  )
  return next - now
}

export interface DailyChallenge {
  /** The UTC date this challenge belongs to. */
  date: string
  /** The prompts, in order. Everyone gets these, in this order. */
  prompts: readonly string[]
  /** What kind of text it is, for the heading. */
  kind: TextKind
  /** Character speed for the day. */
  wpm: number
  /** Effective speed — the gaps are stretched to this. */
  farnsworthWpm: number
  /** Fraction of characters needed to pass. */
  passMark: number
}

/**
 * Lines in one day's challenge. Exported so the page copy ("eight lines") reads
 * the number instead of typing it.
 */
export const LINES = 8

/**
 * Speeds the challenge rotates through.
 *
 * Deliberately narrow. A daily challenge that could land on 35 WPM would be
 * unattemptable for most people on that day, and one that could land on 5 would
 * teach counting beeps. Everything here is a speed a learner can be stretched
 * by without being locked out.
 */
const SPEEDS = [
  { wpm: 15, farnsworthWpm: 7 },
  { wpm: 18, farnsworthWpm: 9 },
  { wpm: 18, farnsworthWpm: 12 },
  { wpm: 20, farnsworthWpm: 12 },
  { wpm: 20, farnsworthWpm: 15 },
] as const

/** The kinds a day can draw, weighted by repetition rather than by a table. */
const KINDS: readonly TextKind[] = ['groups', 'groups', 'words', 'phrases', 'callsigns']

/**
 * The characters a day of this kind is drawn from.
 *
 * Callsigns and code groups need digits; words and phrases are letters only,
 * and offering a digit-bearing alphabet there would change nothing except
 * making the fallback worse. Exported so the daily page says which characters
 * the wire uses from the same rule that picks them.
 */
export function dailyAlphabet(kind: TextKind): string[] {
  return kind === 'words' || kind === 'phrases' ? [...ALL_LETTERS] : [...ALL_LETTERS, ...ALL_DIGITS]
}

/**
 * Build the challenge for a date.
 *
 * Pure and total: the same key always produces the same challenge, on any
 * device, in any timezone, with no network.
 */
export function dailyChallenge(date: string = dailyKey()): DailyChallenge {
  const random = createRandom(seedFrom(date))

  const kind = KINDS[Math.floor(random() * KINDS.length)]!
  const speed = SPEEDS[Math.floor(random() * SPEEDS.length)]!

  const alphabet = dailyAlphabet(kind)

  const prompts: string[] = []
  let guard = 0
  while (prompts.length < LINES && guard < LINES * 20) {
    guard++
    const text = generateText(kind, { alphabet, random })
    if (text === null) continue
    // Two identical lines in eight would look like a bug, and for the short
    // word and phrase lists it is likely enough to happen.
    if (prompts.includes(text)) continue
    prompts.push(text)
  }

  // Only reachable if a list is smaller than LINES — pad with code groups
  // rather than shipping a short challenge, since groups can always be made.
  while (prompts.length < LINES) {
    prompts.push(generateText('groups', { alphabet, random }) ?? 'ETETE')
  }

  return {
    date,
    prompts,
    kind,
    wpm: speed.wpm,
    farnsworthWpm: speed.farnsworthWpm,
    // 80% rather than the 90% a single line is judged at. This is eight lines
    // at a speed most people have not chosen for themselves; a pass mark
    // nobody reaches is a pass mark nobody attempts.
    passMark: 0.8,
  }
}
