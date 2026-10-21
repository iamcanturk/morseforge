import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import { spokenCode } from '../../engine/spokenCode'
import type { SignalMode } from '../../storage/settings'
import type { PoolChoice } from './PracticeSetup'

/**
 * The practice screen's pure parts, kept out of the component so they can be
 * tested without a browser.
 */

/** What the learner just answered, as the screen holds it while it is up. */
export interface AnswerFeedback {
  correct: boolean
  expected: string
  /** What they gave, upper-cased. Empty when nothing was given. */
  given: string
}

/**
 * The sentence the polite live region reads after an answer (A-02, A-11).
 *
 * In words, never in glyphs: a screen reader says "middle dot" or "minus" for
 * the display marks, or nothing. A miss always says what the character was
 * and how it sounds, in every mode, because being told is the point of a
 * miss; listening mode used to say only "You said Q".
 */
export function feedbackSpeech(feedback: AnswerFeedback): string {
  if (feedback.correct) return `${feedback.expected}, correct.`
  const said = feedback.given ? `You said ${feedback.given}.` : 'Missed.'
  const code = spokenCode(MORSE_ALPHABET[feedback.expected] ?? '')
  return `${said} It was ${feedback.expected}${code ? `, ${code}` : ''}.`
}

/** Whether two pools hold the same characters, in any order. */
function sameCharacters(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  const set = new Set(a)
  return b.every((character) => set.has(character))
}

/**
 * The fixed pools worth offering beside "My method" (J-24).
 *
 * A fixed pool holding exactly the characters the learner's method has
 * unlocked is the same choice under a second name ("My method (6)" and
 * "First 6"), so it is left out. Nothing is relabelled.
 */
export function distinctPools<Id extends string>(
  fixed: readonly PoolChoice<Id>[],
  method: readonly string[],
): PoolChoice<Id>[] {
  return fixed.filter((pool) => !sameCharacters(pool.characters, method))
}

/** The RX header's verb for a listening prompt: you watch a lamp and listen to a tone. */
export function receiveLabel(signal: SignalMode): string {
  return signal === 'lamp' ? 'RX · watch' : 'RX · listen'
}

/**
 * The note under a listening set-up, or null when the signal is the plain
 * tone and there is nothing to say (A-03).
 */
export function signalNote(signal: SignalMode, what: string): string | null {
  if (signal === 'lamp') return `Signal is set to Lamp: each ${what} flashes instead of sounding.`
  if (signal === 'both') return `Signal is set to Both: each ${what} sounds and flashes.`
  return null
}
