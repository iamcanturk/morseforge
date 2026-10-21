import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import type { SignalMode } from '../../storage/settings'
import type { PoolChoice } from './PracticeSetup'
import type { Translator } from '../../i18n/translator'

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
export function feedbackSpeech(t: Translator, feedback: AnswerFeedback): string {
  if (feedback.correct) return t('practice.speechCorrect', { character: feedback.expected })
  const said = feedback.given
    ? t('practice.speechYouSaid', { given: feedback.given })
    : t('practice.speechMissed')
  const code = t.spokenCode(MORSE_ALPHABET[feedback.expected] ?? '')
  return code
    ? t('practice.speechItWasCode', { said, character: feedback.expected, code })
    : t('practice.speechItWas', { said, character: feedback.expected })
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
export function receiveLabel(t: Translator, signal: SignalMode): string {
  return signal === 'lamp' ? t('practice.rxWatch') : t('practice.rxListen')
}

/**
 * The note under a listening set-up, or null when the signal is the plain
 * tone and there is nothing to say (A-03).
 */
export function signalNote(t: Translator, signal: SignalMode): string | null {
  if (signal === 'lamp') return t('practice.signalLamp')
  if (signal === 'both') return t('practice.signalBoth')
  return null
}
