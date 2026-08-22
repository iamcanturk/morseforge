/**
 * Grading a copied line of text (PROJECT.md §13).
 *
 * Copying a word is not the same exercise as naming a character, and it cannot
 * be graded the same way. Two things make it different:
 *
 * 1. **Partial credit is the whole point.** Getting four of five characters is
 *    real progress, and a right/wrong verdict would throw that away — which is
 *    also what makes a session unreadable as feedback.
 *
 * 2. **A dropped character shifts everything after it.** Comparing index by
 *    index would mark `HELO` against `HELLO` as three wrong out of five, when
 *    the learner actually missed exactly one. So the two strings are aligned
 *    first, by edit distance, and then compared position by position.
 *
 * Spacing is not graded. Word gaps are a separate skill with their own timing,
 * and someone who copied every character of `CQ CQ` but typed it closed up has
 * not made a copying mistake.
 */

import { MORSE_ALPHABET } from '../data/morseAlphabet'

export type CopyMark =
  /** Copied correctly. */
  | 'hit'
  /** Sent but not copied. */
  | 'miss'
  /** Copied as something else. */
  | 'wrong'
  /** Copied but never sent. */
  | 'extra'

export interface CopySlot {
  expected: string | null
  given: string | null
  mark: CopyMark
}

export interface CopyGrade {
  /** Aligned, in sending order. Long enough to render as the answer key. */
  slots: readonly CopySlot[]
  hits: number
  /** Characters actually sent. The denominator. */
  total: number
  /** 0..1. An empty answer is 0, not perfect. */
  accuracy: number
  perfect: boolean
  /** Sent characters that were not copied correctly, in sending order. */
  missed: readonly string[]
}

/** Sendable characters only, uppercased, spaces dropped. */
function normalize(text: string): string[] {
  return [...text.toUpperCase()].filter(
    (character) => character !== ' ' && MORSE_ALPHABET[character] !== undefined,
  )
}

/**
 * Align two sequences by edit distance, then read the alignment back.
 *
 * Substitution is deliberately cheaper than a deletion plus an insertion, so a
 * mistyped character is reported as one wrong answer rather than as a miss and
 * an extra — which is both truer and shorter to read.
 */
function align(expected: readonly string[], given: readonly string[]): CopySlot[] {
  const rows = expected.length
  const columns = given.length

  const cost: number[][] = Array.from({ length: rows + 1 }, () =>
    new Array<number>(columns + 1).fill(0),
  )
  for (let i = 0; i <= rows; i++) cost[i]![0] = i
  for (let j = 0; j <= columns; j++) cost[0]![j] = j

  for (let i = 1; i <= rows; i++) {
    for (let j = 1; j <= columns; j++) {
      const same = expected[i - 1] === given[j - 1]
      cost[i]![j] = Math.min(
        cost[i - 1]![j]! + 1, // sent but not copied
        cost[i]![j - 1]! + 1, // copied but not sent
        cost[i - 1]![j - 1]! + (same ? 0 : 1),
      )
    }
  }

  const slots: CopySlot[] = []
  let i = rows
  let j = columns

  while (i > 0 || j > 0) {
    const diagonal = i > 0 && j > 0 ? cost[i - 1]![j - 1]! : Infinity
    const up = i > 0 ? cost[i - 1]![j]! : Infinity
    const same = i > 0 && j > 0 && expected[i - 1] === given[j - 1]

    // Diagonal first: preferring it keeps a mistype as a single substitution.
    if (i > 0 && j > 0 && cost[i]![j] === diagonal + (same ? 0 : 1)) {
      slots.push({
        expected: expected[i - 1]!,
        given: given[j - 1]!,
        mark: same ? 'hit' : 'wrong',
      })
      i--
      j--
    } else if (i > 0 && cost[i]![j] === up + 1) {
      slots.push({ expected: expected[i - 1]!, given: null, mark: 'miss' })
      i--
    } else {
      slots.push({ expected: null, given: given[j - 1]!, mark: 'extra' })
      j--
    }
  }

  return slots.reverse()
}

export function gradeCopy(expected: string, given: string): CopyGrade {
  const sent = normalize(expected)
  const copied = normalize(given)
  const slots = align(sent, copied)

  const hits = slots.filter((slot) => slot.mark === 'hit').length
  const total = sent.length

  return {
    slots,
    hits,
    total,
    accuracy: total === 0 ? 0 : hits / total,
    // An answer padded with characters that were never sent is not a perfect
    // copy, however many of the real ones it happens to contain.
    perfect: total > 0 && hits === total && copied.length === total,
    missed: slots
      .filter((slot) => slot.mark !== 'hit' && slot.expected !== null)
      .map((slot) => slot.expected!),
  }
}

/**
 * Whether a copy counts as a pass.
 *
 * A whole-line threshold rather than per character, because copying is judged
 * as a line on the air: 90% of a callsign is a wrong callsign.
 */
export const COPY_PASS_MARK = 0.9

export function isPass(grade: CopyGrade): boolean {
  return grade.total > 0 && grade.accuracy >= COPY_PASS_MARK
}
