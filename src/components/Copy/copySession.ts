/**
 * The pure half of a copy session: what a graded line contributes, what a
 * session pays, and whether it ran to the end.
 *
 * Kept out of the hook so the rules can be tested without React, and so the
 * hook is left doing only what needs React: holding state and writing it.
 */

import { COPY_PASS_MARK, type CopyGrade } from '../../game/copy'
import type { LineTone } from '../../game/dailyShare'
import type { Attempt } from '../../game/session'
import { xpForAnswer } from '../../game/progression'

/**
 * The attempts one graded line adds to the session.
 *
 * Every character that was sent becomes one attempt, hit or miss. Characters
 * typed but never sent add nothing: they are not evidence about any character
 * that was heard. A line is heard as a whole, so the time is split evenly;
 * there is no honest per-character figure to report.
 */
export function attemptsForLine(grade: CopyGrade, elapsedMs: number): Attempt[] {
  const sent = grade.slots.filter((slot) => slot.expected !== null)
  const each = sent.length === 0 ? elapsedMs : elapsedMs / sent.length
  return sent.map((slot) => ({
    character: slot.expected!,
    answer: slot.given ?? '',
    correct: slot.mark === 'hit',
    elapsedMs: each,
  }))
}

/** XP for a session: the same per-answer rate single-character practice pays. */
export function sessionXp(attempts: readonly Attempt[]): number {
  return attempts
    .filter((attempt) => attempt.correct)
    .reduce((sum, attempt) => sum + xpForAnswer(attempt.character), 0)
}

/**
 * The 1-based line on screen: the next one while sending, the one just graded
 * while its answer key is up. Never past the last line.
 */
export function lineNumber(answered: number, reviewing: boolean, lines: number): number {
  return Math.max(1, Math.min(answered + (reviewing ? 0 : 1), lines))
}

/** Whether a session answered every line it set out to, rather than ending early. */
export function isComplete(answered: number, lines: number): boolean {
  return lines > 0 && answered >= lines
}

/**
 * A free-practice line's tone, against the line pass mark.
 *
 * Perfect means clean, as the copy report counts it: every character right
 * and nothing added. A line with every character plus an extra one is over
 * the bar, not clean.
 */
export function copyLineTone(grade: CopyGrade): LineTone {
  if (grade.perfect) return 'perfect'
  return grade.total > 0 && grade.accuracy >= COPY_PASS_MARK ? 'pass' : 'under'
}
