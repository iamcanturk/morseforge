/**
 * Learning methods — the orders people actually teach Morse in.
 *
 * There is no single right sequence, and the differences are not cosmetic: they
 * encode different theories of what makes a character hard. Offering the real
 * ones by name matters because a learner arriving from a club or a course will
 * look for the order they were told to use, and not finding it reads as the
 * site not knowing the field.
 */

import { ALL_LETTERS, ALL_DIGITS, LEARNING_ORDER } from './morseAlphabet'

export type MethodId = 'signal' | 'koch' | 'alphabetical'

export interface LearningMethod {
  id: MethodId
  name: string
  /** One line, shown next to the name when choosing. */
  summary: string
  /** Why it is ordered this way — the part that makes the choice meaningful. */
  rationale: string
  /** Characters in teaching order. */
  order: readonly string[]
  /**
   * Characters to start with. Koch is famously two; the others build up from
   * one layer of the tree.
   */
  startingCount: number
  /**
   * Accuracy at which the next character is added, 0..1. Koch's defining rule
   * is 90%; the others unlock by stage rather than by score.
   */
  unlockAccuracy: number | null
}

/**
 * The Koch order, as published by Ludwig Koch and used by LCWO and most CW
 * courses since.
 *
 * It is deliberately *not* easiest-first. Koch's finding was that starting with
 * hard, dissimilar characters at full speed produces faster learners than
 * starting with easy ones and speeding up — K and M are four and two elements
 * and sound nothing like each other, which is exactly the point.
 */
const KOCH_ORDER = [
  'K',
  'M',
  'R',
  'S',
  'U',
  'A',
  'P',
  'T',
  'L',
  'O',
  'W',
  'I',
  'N',
  'J',
  'E',
  'F',
  '0',
  'Y',
  'V',
  'G',
  '5',
  'Q',
  '9',
  'Z',
  'H',
  '3',
  '8',
  'B',
  '4',
  '2',
  '7',
  'C',
  '1',
  'D',
  '6',
  'X',
] as const

export const METHODS: Record<MethodId, LearningMethod> = {
  signal: {
    id: 'signal',
    name: 'Signal Tree',
    summary: 'Shortest characters first, one layer of the tree per stage',
    rationale:
      'Follows the structure of the code itself: E and T, then every two-element character, then every three. You finish each stage having completed a whole layer of the Morse tree, which is why the tree lights up in rings rather than at random. Best if you want the alphabet to make sense rather than just be memorised.',
    order: [...LEARNING_ORDER, ...ALL_DIGITS],
    startingCount: 2,
    unlockAccuracy: null,
  },
  koch: {
    id: 'koch',
    name: 'Koch',
    summary: 'Two characters at full speed, add one at 90% accuracy',
    rationale:
      'Ludwig Koch’s method, and what most clubs and courses teach. It starts at your target speed with just K and M — hard, dissimilar characters — and adds one more only once you are hitting 90%. Nothing ever slows down, so you never learn to count elements. Harder at the start and faster overall.',
    order: KOCH_ORDER,
    startingCount: 2,
    unlockAccuracy: 0.9,
  },
  alphabetical: {
    id: 'alphabetical',
    name: 'Alphabetical',
    summary: 'A to Z, then 0 to 9',
    rationale:
      'The order you already know, which makes it easy to track what you have covered. It is the weakest of the three for actually learning: A, B and C sound nothing alike in difficulty, so the load jumps around unpredictably. Included because people ask for it.',
    order: [...ALL_LETTERS, ...ALL_DIGITS],
    startingCount: 2,
    unlockAccuracy: null,
  },
}

export const METHOD_IDS = Object.keys(METHODS) as MethodId[]

/** The default. The tree order is what the rest of the product is built around. */
export const DEFAULT_METHOD: MethodId = 'signal'

/**
 * The characters unlocked at a given point in a method.
 *
 * `unlocked` counts how many the learner has earned beyond the starting set, so
 * a caller only has to track one number rather than a set.
 */
export function activeCharacters(method: LearningMethod, unlocked: number): string[] {
  const count = Math.min(
    Math.max(method.startingCount + unlocked, method.startingCount),
    method.order.length,
  )
  return method.order.slice(0, count)
}

/**
 * Whether the next character should be unlocked.
 *
 * Only meaningful for methods with an accuracy rule. A minimum number of
 * attempts is required as well: 100% over three answers is luck, and unlocking
 * on it would hand someone the whole alphabet in a minute.
 */
export function shouldUnlock(
  method: LearningMethod,
  accuracy: number,
  attempts: number,
  minimumAttempts = 25,
): boolean {
  if (method.unlockAccuracy === null) return false
  return attempts >= minimumAttempts && accuracy >= method.unlockAccuracy
}
