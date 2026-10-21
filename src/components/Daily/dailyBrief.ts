import { ALL_DIGITS, ALL_LETTERS } from '../../data/morseAlphabet'
import { type DailyChallenge, dailyAlphabet } from '../../game/dailyChallenge'
import { masteryLevel } from '../../game/mastery'
import { type ProgressRecord, getCharacter } from '../../storage/progress'

/**
 * What the daily wire asks of you, said before the one attempt is spent
 * (J-06, DEC-044).
 *
 * The wire is the same for everyone, so a learner in week one meets code
 * groups of every letter and digit at 15 WPM or faster. That stays (one
 * wire), but the page now says so: which characters, how fast, and how many
 * of them this learner has met, so a low score is expected rather than a
 * surprise.
 *
 * The character set comes from `dailyAlphabet`, the same rule that picks the
 * day's characters, and every count is computed, never typed.
 */

/**
 * The mastery level at which a character counts as learned: answered right
 * at least once ("Learning"). The lesson calls the same threshold
 * "introduced", so the two never disagree about what you have learned.
 */
export const LEARNED_LEVEL = 2

/** How many of `alphabet` this learner has learned. */
export function learnedCount(
  progress: ProgressRecord,
  alphabet: readonly string[],
  now: number,
): number {
  return alphabet.filter((character) => {
    const entry = getCharacter(progress, character, now)
    return masteryLevel(entry.skills, entry.seen) >= LEARNED_LEVEL
  }).length
}

export interface DailyBrief {
  /** "Uses all 26 letters and 10 digits at 15 WPM, spaced out to 7 WPM." */
  set: string
  /** "You have learned 6 of 36 so far; expect to miss most of it." */
  readiness: string
  /** The streak rule, said here because it is what makes trying worth it. */
  streak: string
}

export function dailyBrief(
  challenge: Pick<DailyChallenge, 'kind' | 'wpm' | 'farnsworthWpm'>,
  learned: number,
): DailyBrief {
  const alphabet = dailyAlphabet(challenge.kind)
  const total = alphabet.length
  const digits = alphabet.some((character) => ALL_DIGITS.includes(character as never))
  const characters = digits
    ? `all ${ALL_LETTERS.length} letters and ${ALL_DIGITS.length} digits`
    : `the ${ALL_LETTERS.length} letters, no digits,`
  const spacing =
    challenge.farnsworthWpm < challenge.wpm ? `, spaced out to ${challenge.farnsworthWpm} WPM` : ''

  const known = Math.max(0, Math.min(learned, total))
  const readiness =
    known >= total
      ? `You have learned all ${total} of them.`
      : `You have learned ${known} of ${total} so far; expect to miss ${
          known * 2 >= total ? 'some' : 'most'
        } of it.`

  return {
    set: `Uses ${characters} at ${challenge.wpm} WPM${spacing}.`,
    readiness,
    streak: 'The streak counts showing up, not passing.',
  }
}
