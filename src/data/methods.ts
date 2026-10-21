/**
 * Learning methods — the orders people actually teach Morse in.
 *
 * There is no single right sequence, and the differences are not cosmetic: they
 * encode different theories of what makes a character hard. Offering the real
 * ones by name matters because a learner arriving from a club or a course will
 * look for the order they were told to use, and not finding it reads as the
 * site not knowing the field.
 */

import { ALL_LETTERS, ALL_DIGITS, LEARNING_ORDER, LEARNING_STAGES } from './morseAlphabet'

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
   * Characters to start with. Koch is famously two; the others start with
   * their first stage, which is also two.
   */
  startingCount: number
  /**
   * Accuracy at which more characters are added, 0..1, or null for a method
   * that never unlocks on score. Every built-in method uses Koch's 90%; what
   * differs is how much one unlock adds, which is what `stages` decides.
   */
  unlockAccuracy: number | null
  /**
   * Cumulative pool sizes, one per stage, from `startingCount` up to
   * `order.length`. An unlock jumps to the next boundary, so a learner always
   * holds whole stages.
   *
   * Absent for Koch, whose defining rule is one character at a time.
   */
  stages?: readonly number[]
}

/** `total` split into groups of `size`, the last holding whatever is left. */
function groupsOf(size: number, total: number): number[] {
  const groups: number[] = []
  for (let left = total; left > 0; left -= size) groups.push(Math.min(size, left))
  return groups
}

/** Running totals of group sizes: [2, 4, 8] becomes [2, 6, 14]. */
function cumulative(sizes: readonly number[]): number[] {
  let total = 0
  return sizes.map((size) => (total += size))
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
    unlockAccuracy: 0.9,
    // One layer of the tree per stage, exactly as the lesson teaches them, then
    // the digits as the five-element layer. Splitting a layer would undo the
    // point of the order: the learner would hold half a ring of the tree and be
    // drilled against neighbours they have not met yet.
    stages: cumulative([...LEARNING_STAGES.map((stage) => stage.length), ALL_DIGITS.length]),
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
    unlockAccuracy: 0.9,
    // Four letters at a time, then the digits in two halves. The alphabet has
    // no layers to follow, and a dozen unrelated letters at once (the size of
    // the Signal order's four-element stage) would be a wall here, because
    // these do not share a length the way a tree layer does.
    stages: cumulative([
      2,
      ...groupsOf(4, ALL_LETTERS.length - 2),
      ...groupsOf(Math.ceil(ALL_DIGITS.length / 2), ALL_DIGITS.length),
    ]),
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
 * The fewest answers a session needs before it can unlock anything. Every
 * place that states the rule interpolates this rather than retyping it.
 */
export const MIN_UNLOCK_ATTEMPTS = 25

/**
 * Whether the next unlock is earned: one character for Koch, the next whole
 * stage for the staged methods (see `nextUnlockCount`).
 *
 * A minimum number of attempts is required as well: 100% over three answers is
 * luck, and unlocking on it would hand someone the whole alphabet in a minute.
 */
export function shouldUnlock(
  method: LearningMethod,
  accuracy: number,
  attempts: number,
  minimumAttempts = MIN_UNLOCK_ATTEMPTS,
): boolean {
  if (method.unlockAccuracy === null) return false
  return attempts >= minimumAttempts && accuracy >= method.unlockAccuracy
}

/**
 * The `unlocked` count after one more unlock, never past the end of the order.
 *
 * Koch adds a character. A staged method moves to the next stage boundary. A
 * count that sits between boundaries (an old import, say) is rounded up to the
 * end of its own stage rather than past the next one, so nobody skips a stage
 * they were never given whole.
 */
export function nextUnlockCount(method: LearningMethod, unlocked: number): number {
  const limit = method.order.length - method.startingCount
  // NaN would fail open: every comparison with it is false, so a staged method
  // would find no boundary and unlock everything. Treat it as nothing earned.
  const safe = Number.isFinite(unlocked) ? unlocked : unlocked > 0 ? limit : 0
  const current = Math.min(Math.max(Math.floor(safe), 0), limit)
  if (current >= limit) return limit
  if (!method.stages) return current + 1

  const active = method.startingCount + current
  const boundary = method.stages.find((size) => size > active) ?? method.order.length
  return Math.min(boundary, method.order.length) - method.startingCount
}

/** Which stage, from 0, a pool of `unlocked` extra characters is in. */
export function stageIndex(method: LearningMethod, unlocked: number): number {
  const active = activeCharacters(method, unlocked).length
  if (!method.stages) return active - method.startingCount
  const index = method.stages.findIndex((size) => size >= active)
  return index === -1 ? method.stages.length - 1 : index
}
