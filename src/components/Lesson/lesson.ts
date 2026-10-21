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

import { CURRICULUM } from '../../data/curriculum'
import { LESSON_STAGES } from '../../data/lessonStages'
import { MORSE_ALPHABET } from '../../data/morseAlphabet'
import type { SessionMode } from '../../game/session'
import { masteryLevel } from '../../game/mastery'
import { getCharacter, type ProgressRecord } from '../../storage/progress'

/**
 * The lesson's stages: one per day of the plan. Defined once, in the data
 * layer (`src/data/lessonStages.ts`), so storage, game logic and every screen
 * count stages over the same list; re-exported here for the lesson's callers.
 */
export { LESSON_STAGES }

/** Every character the lesson teaches, in teaching order. */
export const LESSON_ORDER: readonly string[] = LESSON_STAGES.flat()

/** The plan day behind a stage, for its title and its link on the plan page. */
export function stageDay(stageIndex: number) {
  return CURRICULUM[stageIndex] ?? null
}

/** The steps a single character is taught through, in order. */
export const TEACH_STEPS = ['see', 'hear', 'send'] as const
export type TeachStep = (typeof TEACH_STEPS)[number]

export const STEP_COPY: Record<TeachStep, { label: string; title: string; body: string }> = {
  see: {
    label: 'See',
    title: 'See it',
    body: 'This is the character and its code. Read the dots and dashes once, then stop reading them.',
  },
  hear: {
    label: 'Hear',
    title: 'Hear it',
    body: 'This is what it sounds like. Learn the rhythm, not the picture: the rhythm is what you will actually be reading.',
  },
  send: {
    label: 'Send',
    title: 'Send it',
    body: 'Now key it yourself. Sending builds a different memory from listening, and it is the fastest way to find out that your dashes are too short.',
  },
}

/** Where the lesson is: which stage, which character in it, which step. */
export interface LessonPosition {
  stage: number
  characterIndex: number
  step: TeachStep
}

export type LessonAdvance =
  { kind: 'position'; position: LessonPosition } | { kind: 'stage-done'; stage: number }

/**
 * The one move forward from a position. Pure.
 *
 * Next step, else the next character's first step, else the stage is done.
 * The screen applies this exactly once per accepted send; the old version ran
 * an index increment from a timer, so two quick sends advanced twice and
 * skipped a character.
 */
export function nextPosition(
  position: LessonPosition,
  stages: readonly (readonly string[])[] = LESSON_STAGES,
): LessonAdvance {
  const stepIndex = TEACH_STEPS.indexOf(position.step)
  if (stepIndex < TEACH_STEPS.length - 1) {
    return { kind: 'position', position: { ...position, step: TEACH_STEPS[stepIndex + 1]! } }
  }
  const length = stages[position.stage]?.length ?? 0
  if (position.characterIndex < length - 1) {
    return {
      kind: 'position',
      position: { stage: position.stage, characterIndex: position.characterIndex + 1, step: 'see' },
    }
  }
  return { kind: 'stage-done', stage: position.stage }
}

/** The start of a stage. */
export function stageStart(stage: number): LessonPosition {
  return { stage, characterIndex: 0, step: 'see' }
}

/**
 * The commit rule for the send step: commit the moment the answer is decided.
 *
 * The target is known, so the keyed elements decide it as soon as they spell
 * the target (right) or can no longer become it (wrong: no further element
 * fixes a dash sent for E). Waiting out the character gap in either case only
 * delays the verdict by more than a second on the learning preset, and a quick
 * retry inside that gap was glued onto the miss ("That was N"). A code that is
 * still on the way to the target (a dot, sending A) waits as before. The same
 * rule as the landing hero's `shouldCommit`.
 */
export function commitOnTarget(code: string): (pending: string) => boolean {
  return (pending) =>
    code !== '' && pending !== '' && (pending === code || !code.startsWith(pending))
}

/** The code the lesson expects for a character, or an empty string. */
export function targetCode(character: string): string {
  return MORSE_ALPHABET[character] ?? ''
}

/**
 * Fewest prompts a drill asks for.
 *
 * Two per character taught would make the first drill four prompts long,
 * which is over before a learner has settled into it. Ten is the plan's own
 * advice for day one ("send E and T twenty times each") scaled to a drill.
 */
export const DRILL_MIN_PROMPTS = 10

/**
 * How many prompts the drill after a stage asks for.
 *
 * Two per character the stage taught, and never fewer than
 * `DRILL_MIN_PROMPTS`, so every new character comes up more than once without
 * the drill outstaying the lesson that earned it.
 */
export function drillLength(stageIndex: number): number {
  const taught = LESSON_STAGES[stageIndex]?.length ?? 0
  if (taught === 0) return 0
  return Math.max(taught * 2, DRILL_MIN_PROMPTS)
}

/** Everything taught up to and including a stage — the drill's character pool. */
export function poolThroughStage(stageIndex: number): string[] {
  return LESSON_STAGES.slice(0, Math.max(stageIndex + 1, 0)).flatMap((stage) => [...stage])
}

/** What the lesson hands the practice screen for a stage's drill. */
export interface DrillPreset {
  mode: SessionMode
  characters: readonly string[]
  length: number
  autoStart?: boolean
}

/**
 * The drill after a stage: listening, over everything taught so far.
 *
 * Listening rather than sending because the stage has just had the learner
 * send each new character; what they have not yet done is pick it out of a
 * mix by ear, which is the skill the rest of the app is built on.
 */
export function drillPreset(stageIndex: number): DrillPreset {
  return {
    mode: 'listening',
    characters: poolThroughStage(stageIndex),
    length: drillLength(stageIndex),
    autoStart: true,
  }
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
  const stage = LESSON_STAGES[stageIndex]
  if (!stage) return false
  return stage.every((character) => isIntroduced(progress, character, now))
}

/**
 * The stage the learner should be on: the first incomplete one.
 *
 * Returns `LESSON_STAGES.length` once everything is done, so callers can
 * distinguish "finished the course" from "on the last stage". The screen used
 * to clamp that to the last stage, which re-taught Q to everyone who had
 * already finished.
 */
export function currentStageIndex(progress: ProgressRecord, now: number): number {
  for (let index = 0; index < LESSON_STAGES.length; index++) {
    if (!isStageComplete(progress, index, now)) return index
  }
  return LESSON_STAGES.length
}

/** Whether a stage index means "the course is finished". */
export function isCourseComplete(stageIndex: number): boolean {
  return stageIndex >= LESSON_STAGES.length
}

/**
 * Where a stage picks up: the first of its characters not yet introduced, at
 * its first step, or the stage's start when every one of them is.
 *
 * The page promises the lesson picks up exactly where the learner left off; a
 * day-three learner who already has S, U and R used to be shown S again.
 */
export function resumePosition(
  stage: number,
  progress: ProgressRecord,
  now: number,
): LessonPosition {
  const characters = LESSON_STAGES[stage] ?? []
  const index = characters.findIndex((character) => !isIntroduced(progress, character, now))
  return { stage, characterIndex: Math.max(index, 0), step: 'see' }
}

/**
 * The hash the landing hero's finished drill links with (DEC-044): "now hear
 * the letters you just sent".
 */
export const HEAR_FIRST_HASH = '#hear'

/** Whether every character of a stage has been answered by ear at least once. */
export function isStageHeard(progress: ProgressRecord, stageIndex: number, now: number): boolean {
  const stage = LESSON_STAGES[stageIndex]
  if (!stage) return false
  return stage.every(
    (character) => getCharacter(progress, character, now).skills.listening.attempts > 0,
  )
}

/**
 * Whether the lesson should open on hearing stage 1 rather than where progress
 * puts it.
 *
 * The hero's E, T and A are sends, and a send introduces a character, so after
 * the hero the plain rule would skip to stage 2: a learner who has never heard
 * E or T, never drilled them, and is offered the A they just sent. True only
 * while stage 1 is not yet heard and the learner is no further than stage 2;
 * anyone past that is never sent back.
 */
export function shouldHearFirst(progress: ProgressRecord, now: number): boolean {
  return currentStageIndex(progress, now) <= 1 && !isStageHeard(progress, 0, now)
}

/**
 * Where the lesson opens on arrival, or null when the course is finished.
 *
 * With the hero's hash and a learner who has not heard stage 1 yet: stage 1,
 * first character, at "Hear it" (they have seen it, and sent it, on the
 * landing). Otherwise the hash is ignored and the lesson resumes as usual.
 */
export function entryPosition(
  progress: ProgressRecord,
  now: number,
  hash = '',
): LessonPosition | null {
  if (hash === HEAR_FIRST_HASH && shouldHearFirst(progress, now)) {
    return { stage: 0, characterIndex: 0, step: 'hear' }
  }
  const stage = currentStageIndex(progress, now)
  return isCourseComplete(stage) ? null : resumePosition(stage, progress, now)
}

export type StageStatus = 'done' | 'current' | 'todo'

/**
 * The state of every stage, for the stage rail.
 *
 * `current` is the stage on screen, which can be a finished one being taught
 * again; `done` comes from progress, never from what this visit did, so the
 * rail and the tree always agree.
 */
export function stageStatuses(
  progress: ProgressRecord,
  active: number,
  now: number,
): StageStatus[] {
  return LESSON_STAGES.map((_, index) => {
    if (index === active) return 'current'
    return isStageComplete(progress, index, now) ? 'done' : 'todo'
  })
}

/** 0..1 through the whole course, by characters introduced. */
export function courseProgress(progress: ProgressRecord, now: number): number {
  if (LESSON_ORDER.length === 0) return 0
  const done = LESSON_ORDER.filter((character) => isIntroduced(progress, character, now)).length
  return done / LESSON_ORDER.length
}
