/**
 * The landing hero's "first signal" (PROJECT.md §45, §57; flow audit P2).
 *
 * A stranger lands, presses one key, and has sent Morse code. Then a second
 * letter, then a third that is made of the first two. This file is the rule
 * book for those three steps, kept pure so it is tested without a DOM; the
 * instrument that drives it is `station.ts`.
 *
 * Two rules matter more than they look:
 *
 * - **Instant commit.** The key normally waits out a character gap (1.6 s on
 *   the default "Learning" preset) before it decides a character is finished.
 *   That pause is right for free sending and wrong here: the target is known,
 *   so the moment the pending code equals it, or can no longer become it, the
 *   answer is already decided. Waiting would put a second and a half of dead
 *   air between the press and the reward.
 * - **No penalty.** A wrong letter is named and explained ("That was T. E is
 *   one short tap.") and the step stays where it is.
 */

import { CODE_TO_CHARACTER, LEARNING_STAGES, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { capitalise, joinList, numberWord } from '../../data/format'
import {
  HEAR_FIRST_HASH,
  LESSON_ORDER,
  LESSON_STAGES,
  currentStageIndex,
  isCourseComplete,
  shouldHearFirst,
} from '../Lesson/lesson'
import type { ProgressRecord } from '../../storage/progress'
import type { StatsRecord } from '../../storage/stats'

/**
 * The three first signals: the two one-element letters the plan opens with,
 * then the letter their codes spell when sent back to back. E and T, then A.
 * Derived, so the steps cannot disagree with the alphabet or the plan.
 */
export function heroTargets(): readonly string[] {
  const [first, second] = LEARNING_STAGES[0] ?? []
  if (!first || !second) return []
  const joined = CODE_TO_CHARACTER.get(codeOf(first) + codeOf(second))
  return joined ? [first, second, joined] : [first, second]
}

export const HERO_TARGETS: readonly string[] = heroTargets()

/** The code for a character, or an empty string for one the alphabet lacks. */
export function codeOf(character: string): string {
  return MORSE_ALPHABET[character.toUpperCase()] ?? ''
}

export type HeroPhase = 'await' | 'detected' | 'wrong' | 'done'

export interface HeroAttempt {
  /** What was keyed, as dots and dashes. */
  code: string
  /** What it decodes to, or null if it is not a character. */
  character: string | null
}

export interface HeroState {
  /** Index into the targets of the step being asked for. */
  step: number
  phase: HeroPhase
  /** The characters sent correctly so far, in order. */
  sent: string
  /** The last committed signal, right or wrong. */
  attempt: HeroAttempt | null
}

export function initialHero(): HeroState {
  return { step: 0, phase: 'await', sent: '', attempt: null }
}

/** The character the current step asks for, or null once every step is done. */
export function targetOf(state: HeroState, targets: readonly string[] = HERO_TARGETS) {
  return state.phase === 'done' ? null : (targets[state.step] ?? null)
}

/**
 * The instant-commit rule: whether the pending code is already decided.
 *
 * True when it equals the target's code (right) or is no longer a prefix of
 * it (wrong, and no further element can fix that). False while it could still
 * become the target — a single dot on the way to A — and always false without
 * a target, where only the ordinary gap may end a character.
 */
export function shouldCommit(pending: string, target: string | null): boolean {
  if (!pending || !target) return false
  const code = codeOf(target)
  if (!code) return false
  return pending === code || !code.startsWith(pending)
}

/** Apply a committed signal to the step machine. Pure; returns a new state. */
export function commitSignal(
  state: HeroState,
  code: string,
  targets: readonly string[] = HERO_TARGETS,
): HeroState {
  const target = targetOf(state, targets)
  if (!target || !code) return state

  const attempt: HeroAttempt = { code, character: CODE_TO_CHARACTER.get(code) ?? null }
  if (code === codeOf(target)) {
    return { ...state, phase: 'detected', sent: state.sent + target, attempt }
  }
  return { ...state, phase: 'wrong', attempt }
}

/**
 * Leave the moment that just happened: after a detection, on to the next step
 * (or to done after the last); after a miss, back to waiting on the same one.
 */
export function advance(state: HeroState, targets: readonly string[] = HERO_TARGETS): HeroState {
  if (state.phase === 'detected') {
    const step = state.step + 1
    return step >= targets.length
      ? { ...state, step: targets.length, phase: 'done' }
      : { ...state, step, phase: 'await' }
  }
  if (state.phase === 'wrong') return { ...state, phase: 'await' }
  return state
}

/** Whether the current step has anything left to ask. */
export function isFinished(state: HeroState): boolean {
  return state.phase === 'done'
}

const ELEMENT_WORDS = { '.': 'short tap', '-': 'long press' } as const

/**
 * A code in the words a first-timer can act on: "one short tap", "one long
 * press", "a short tap, then a long press".
 */
export function describeCode(code: string): string {
  const words = [...code].map((element) => ELEMENT_WORDS[element as '.' | '-'] ?? element)
  if (words.length === 0) return ''
  if (words.length === 1) return `one ${words[0]}`
  return `a ${words.join(', then a ')}`
}

/** The engraved instruction under the screen: "TAP THE KEY ONCE". */
export function instructionFor(character: string): string {
  const code = codeOf(character)
  if (code === '.') return 'Tap the key once'
  if (code === '-') return 'Hold the key down'
  return [...code].map((element) => (element === '.' ? 'tap' : 'hold')).join(', then ')
}

/** "That was T. E is one short tap." — what a miss says. No score, no penalty. */
export function wrongMessage(attempt: HeroAttempt, target: string): string {
  const was = attempt.character ? `That was ${attempt.character}.` : 'That was not a letter yet.'
  return `${was} ${target} is ${describeCode(codeOf(target))}.`
}

/** "Three letters sent" — the headline of the finished drill. */
export function doneHeadline(sent: string): string {
  const count = [...sent].length
  return `${capitalise(numberWord(count))} ${count === 1 ? 'letter' : 'letters'} sent`
}

/** Whether this profile has keyed before, here or anywhere else on the site. */
export function hasSentBefore(stats: Pick<StatsRecord, 'firstSignalAt' | 'elementsSent'>): boolean {
  return stats.firstSignalAt !== undefined || stats.elementsSent > 0
}

/** The lesson link's label for anyone already under way: the welcome view's default. */
export const CONTINUE_LABEL = 'Continue the lesson'

export interface NextStop {
  href: string
  /** The link's label. */
  label: string
  /** One line about where the link leads. */
  detail: string
}

/**
 * Where a returning visitor should go next, from their own progress: the
 * lesson's next stage while there is one, then practice. The same rule the
 * lesson uses to pick its stage, and the same stage list (`LESSON_STAGES`, the
 * plan's days), so the hero and /learn/ never disagree. It used to index the
 * tree's four letter layers with the lesson's stage number, and told someone
 * on stage 5 of 7 that the course was done.
 */
export function nextStop(progress: ProgressRecord, now: number): NextStop {
  const stage = currentStageIndex(progress, now)
  const characters = LESSON_STAGES[stage]
  if (isCourseComplete(stage) || !characters) {
    return {
      href: '/practice/',
      label: 'Keep it sharp in practice',
      detail: `Every lesson stage is done: all ${numberWord(LESSON_ORDER.length)} characters introduced.`,
    }
  }
  return {
    href: '/learn/',
    label: stage === 0 ? 'Start the lesson' : CONTINUE_LABEL,
    detail: `Stage ${stage + 1} of ${LESSON_STAGES.length}: ${joinList([...characters])}.`,
  }
}

/**
 * Where the finished drill sends the visitor (DEC-044): to *hear* the letters
 * they just sent, at stage 1's "Hear it" step, while stage 1 is still unheard.
 *
 * `nextStop` alone would say stage 2, because a send already introduces a
 * character: the learner would skip hearing E and T, skip their drill, and be
 * offered the A they had just keyed. Anyone who has heard stage 1, or is past
 * stage 2, gets `nextStop` as before.
 */
export function doneStop(progress: ProgressRecord, now: number): NextStop {
  const first = LESSON_STAGES[0]
  if (!first || !shouldHearFirst(progress, now)) return nextStop(progress, now)
  return {
    href: `/learn/${HEAR_FIRST_HASH}`,
    label: `Hear ${joinList([...first])}`,
    detail: `Stage 1 of ${LESSON_STAGES.length}, by ear.`,
  }
}

/**
 * How much of the station must be on screen before Space typed at the page
 * keys it. The same share as `IN_VIEW_THRESHOLD` (MorseKey/useInView.ts),
 * restated here because that module imports React and the landing ships none;
 * hero.test.ts keeps the two equal.
 */
export const HERO_IN_VIEW_THRESHOLD = 0.25

/** The parts of a keydown the page-level Space rule reads. */
export interface PageKeyEvent {
  key: string
  repeat: boolean
  altKey: boolean
  ctrlKey: boolean
  metaKey: boolean
  shiftKey: boolean
  defaultPrevented: boolean
}

/**
 * Whether a key pressed at the page itself should key the station (J-03).
 *
 * The hint says "press Space", and on /telegraph/ and /learn/ Space keys
 * whenever the instrument is in view. Here it used to scroll the page 860 px
 * away unless the station had been clicked first. True only for a keying key,
 * typed with nothing focused (`focusOnPage`: the active element is the body or
 * the root), the station at least `HERO_IN_VIEW_THRESHOLD` on screen, and no
 * modifier held (Shift+Space still scrolls up). Out of view, Space scrolls.
 */
export function keysFromPage(
  event: PageKeyEvent,
  keys: readonly string[],
  { focusOnPage, inView }: { focusOnPage: boolean; inView: boolean },
): boolean {
  if (!focusOnPage || !inView || event.repeat || event.defaultPrevented) return false
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return false
  return keys.includes(event.key)
}
