/**
 * The guided lesson (PROJECT.md §4.1, §45, §46, §48).
 *
 * §46 sets the shape: show, try, fail, try again, master. §48 sets the order
 * within a character: see it, hear it, send it — because a character learned
 * only by sight is one you cannot use at speed.
 *
 * The learner's position is *derived* from their progress rather than stored as
 * a cursor. A stored cursor and the progress record can disagree — after an
 * import, or after a reset that misses one of them — and then the lesson either
 * re-teaches what someone knows or skips what they do not.
 */

import { LEARNING_STAGES } from '../../data/morseAlphabet'
import { masteryLevel } from '../../game/mastery'
import { getCharacter, type ProgressRecord } from '../../storage/progress'

/** The steps a single character is taught through, in order. */
export const TEACH_STEPS = ['see', 'hear', 'send'] as const
export type TeachStep = (typeof TEACH_STEPS)[number]

export const STEP_COPY: Record<TeachStep, { title: string; body: string }> = {
  see: {
    title: 'See it',
    body: 'This is the character and its code. Read the dots and dashes once — then stop reading them.',
  },
  hear: {
    title: 'Hear it',
    body: 'This is what it sounds like. Learn the rhythm, not the picture. The rhythm is what you will actually be reading.',
  },
  send: {
    title: 'Send it',
    body: 'Now key it yourself. Sending builds a different memory from listening, and it is the fastest way to find out that your dashes are too short.',
  },
}

/**
 * How many prompts the drill after a stage asks for.
 *
 * Two per character taught, so every character comes up at least once without
 * the drill outstaying the lesson that earned it.
 */
export function drillLength(stageIndex: number): number {
  return (LEARNING_STAGES[stageIndex]?.length ?? 0) * 2
}

/** Whether a character has been answered correctly at least once. */
export function isIntroduced(progress: ProgressRecord, character: string, now: number): boolean {
  const entry = getCharacter(progress, character, now)
  return masteryLevel(entry.skills, entry.seen) >= 2
}

/** Whether every character in a stage has been introduced. */
export function isStageComplete(
  progress: ProgressRecord,
  stageIndex: number,
  now: number,
): boolean {
  const stage = LEARNING_STAGES[stageIndex]
  if (!stage) return false
  return stage.every((character) => isIntroduced(progress, character, now))
}

/**
 * The stage the learner should be on: the first incomplete one.
 *
 * Returns `LEARNING_STAGES.length` once everything is done, so callers can
 * distinguish "finished the course" from "on the last stage".
 */
export function currentStageIndex(progress: ProgressRecord, now: number): number {
  for (let index = 0; index < LEARNING_STAGES.length; index++) {
    if (!isStageComplete(progress, index, now)) return index
  }
  return LEARNING_STAGES.length
}

/** Everything taught up to and including a stage — the drill's character pool. */
export function poolThroughStage(stageIndex: number): string[] {
  return LEARNING_STAGES.slice(0, stageIndex + 1).flatMap((stage) => [...stage])
}

/** 0..1 through the whole course, by characters introduced. */
export function courseProgress(progress: ProgressRecord, now: number): number {
  const all = LEARNING_STAGES.flat()
  if (all.length === 0) return 0
  const done = all.filter((character) => isIntroduced(progress, character, now)).length
  return done / all.length
}
