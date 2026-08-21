/**
 * Morse timing (PROJECT.md §8, §33).
 *
 * Everything is expressed in "units". The standard word PARIS is exactly 50
 * units long, so at W words per minute one unit lasts 60_000 / (50 * W) ms,
 * which reduces to the familiar 1200 / W.
 *
 *   dot            1 unit
 *   dash           3 units
 *   intra-char gap 1 unit   (between the elements of one character)
 *   char gap       3 units  (between characters of one word)
 *   word gap       7 units  (between words)
 */

import { MORSE_ALPHABET } from '../data/morseAlphabet'

export const UNITS = {
  DOT: 1,
  DASH: 3,
  ELEMENT_GAP: 1,
  CHARACTER_GAP: 3,
  WORD_GAP: 7,
} as const

/** Length of the reference word PARIS, in units, including its trailing word gap. */
export const PARIS_UNITS = 50

/** Of those 50 units, how many are the dots, dashes and intra-character gaps. */
export const PARIS_KEYING_UNITS = 31

/** And how many are the character gaps and the word gap: 4 * 3 + 7. */
export const PARIS_SPACING_UNITS = 19

export interface TimingOptions {
  /** Character speed — how fast the dots and dashes themselves are sent. */
  wpm: number
  /**
   * Farnsworth speed: the *effective* overall speed. When lower than `wpm`, the
   * gaps between characters and words stretch while the characters stay fast.
   *
   * This is the single most important setting for learning. It stops the learner
   * memorising a slowed-down character as a sequence of countable beeps — at
   * 18/5 they hear the real rhythm of a character but get time to recall it.
   * Omit (or set equal to `wpm`) for standard timing.
   */
  farnsworthWpm?: number
}

/** Milliseconds per unit at a given character speed. */
export function dotDuration(wpm: number): number {
  if (!Number.isFinite(wpm) || wpm <= 0) {
    throw new RangeError(`wpm must be a positive finite number, got ${wpm}`)
  }
  return 1200 / wpm
}

export function dashDuration(wpm: number): number {
  return dotDuration(wpm) * UNITS.DASH
}

export interface ResolvedTiming {
  /** ms for a single dot / for the gap between elements of one character. */
  dot: number
  dash: number
  elementGap: number
  /** ms between two characters — stretched under Farnsworth. */
  characterGap: number
  /** ms between two words — stretched under Farnsworth. */
  wordGap: number
}

/**
 * Resolve a full timing table.
 *
 * The Farnsworth stretch follows the ARRL method: characters keep their
 * `wpm` timing, and the *extra* delay needed to hit the slower effective speed
 * is distributed over the character and word gaps in their normal 3:7 ratio.
 *
 * A Farnsworth speed at or above `wpm` is not an error — it just means standard
 * timing, which is what a learner gets once they stop needing the crutch.
 */
export function resolveTiming({ wpm, farnsworthWpm }: TimingOptions): ResolvedTiming {
  const dot = dotDuration(wpm)
  const standard: ResolvedTiming = {
    dot,
    dash: dot * UNITS.DASH,
    elementGap: dot * UNITS.ELEMENT_GAP,
    characterGap: dot * UNITS.CHARACTER_GAP,
    wordGap: dot * UNITS.WORD_GAP,
  }

  if (farnsworthWpm === undefined || farnsworthWpm >= wpm) return standard

  if (!Number.isFinite(farnsworthWpm) || farnsworthWpm <= 0) {
    throw new RangeError(`farnsworthWpm must be a positive finite number, got ${farnsworthWpm}`)
  }

  // ARRL "A Standard for Morse Timing Using the Farnsworth Technique":
  // PARIS's 50 units split into 31 units of actual keying and 19 units of
  // spacing (four 3-unit character gaps + one 7-unit word gap). Send the 31 at
  // the character speed, then spread whatever time is left over the 19.
  const totalMs = 60_000 / farnsworthWpm
  const charactersMs = PARIS_KEYING_UNITS * dot
  const unitDelay = (totalMs - charactersMs) / PARIS_SPACING_UNITS

  // At a high character speed and a barely-lower Farnsworth speed the leftover
  // can come out under standard spacing; never compress below standard timing.
  if (unitDelay <= dot) return standard

  return {
    ...standard,
    characterGap: unitDelay * 3,
    wordGap: unitDelay * 7,
  }
}

/** One audible tone, or one silence, on the timeline. */
export interface TimedElement {
  type: 'dot' | 'dash' | 'gap'
  /** Duration in milliseconds. */
  duration: number
  /** True when the oscillator should be sounding. */
  on: boolean
}

/**
 * Expand a Morse string (e.g. `".- -..."`) into a flat timeline of tones and
 * silences. Words are separated by `/` or by multiple spaces.
 *
 * The timeline never begins or ends with a gap, so callers can concatenate
 * without accumulating silence.
 */
export function buildTimeline(morse: string, options: TimingOptions): TimedElement[] {
  const t = resolveTiming(options)
  const timeline: TimedElement[] = []

  const words = morse
    .trim()
    .split(/\s*\/\s*|\s{2,}/)
    .map((w) => w.trim())
    .filter(Boolean)

  words.forEach((word, wordIndex) => {
    if (wordIndex > 0) timeline.push({ type: 'gap', duration: t.wordGap, on: false })

    const characters = word.split(/\s+/).filter(Boolean)
    characters.forEach((code, charIndex) => {
      if (charIndex > 0) timeline.push({ type: 'gap', duration: t.characterGap, on: false })

      for (const [elementIndex, element] of [...code].entries()) {
        if (elementIndex > 0) {
          timeline.push({ type: 'gap', duration: t.elementGap, on: false })
        }
        timeline.push(
          element === '-'
            ? { type: 'dash', duration: t.dash, on: true }
            : { type: 'dot', duration: t.dot, on: true },
        )
      }
    })
  })

  return timeline
}

/** Total wall-clock duration of a timeline, in milliseconds. */
export function timelineDuration(timeline: readonly TimedElement[]): number {
  return timeline.reduce((sum, element) => sum + element.duration, 0)
}

/**
 * How long plain text takes to send, in milliseconds. Powers the "this run will
 * take ~40s" copy on challenge screens.
 */
export function estimateDuration(text: string, options: TimingOptions): number {
  const t = resolveTiming(options)
  let ms = 0
  let previous: 'none' | 'character' | 'word' = 'none'

  for (const raw of text.toUpperCase()) {
    if (raw === ' ') {
      if (previous !== 'none') previous = 'word'
      continue
    }
    const code = MORSE_ALPHABET[raw]
    if (!code) continue

    if (previous === 'character') ms += t.characterGap
    else if (previous === 'word') ms += t.wordGap

    ms += [...code].reduce(
      (sum, element, i) => sum + (i > 0 ? t.elementGap : 0) + (element === '-' ? t.dash : t.dot),
      0,
    )
    previous = 'character'
  }

  return ms
}

/**
 * Effective WPM actually achieved, from a character count and elapsed time.
 * Uses the standard 5-characters-per-word convention.
 */
export function measureWpm(characterCount: number, elapsedMs: number): number {
  if (elapsedMs <= 0 || characterCount <= 0) return 0
  return characterCount / 5 / (elapsedMs / 60_000)
}
