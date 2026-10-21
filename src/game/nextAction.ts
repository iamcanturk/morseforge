/**
 * The one thing worth doing next (flow audit P5).
 *
 * A returning learner on the progress page used to get a wall of numbers and
 * no answer to the only question they arrived with: "what now?". This picks
 * one action, in a fixed order of what matters most:
 *
 *  1. the first signal, because nothing else means anything before it;
 *  2. the next lesson stage, because the course is the spine of the app;
 *  3. today's daily, if it is not done, because it is the habit;
 *  4. the weakest skill, if one is genuinely behind;
 *  5. the 60-second challenge, which is always worth another go.
 *
 * Pure: it takes every record and the clock as arguments, so the same inputs
 * always give the same answer and the order is pinned by tests rather than by
 * whichever screen happens to call it. Every figure in the copy is computed.
 */

import { LESSON_STAGES } from '../data/lessonStages'
import { ALL_LETTERS } from '../data/morseAlphabet'
import { joinList, numberWord, plural } from '../data/format'
import { type DailyRecord, dailyStreak, resultFor } from '../storage/daily'
import {
  type ProgressRecord,
  accuracyBySkill,
  stagesTaught,
  weakestSkill,
} from '../storage/progress'
import type { StatsRecord } from '../storage/stats'
import { LINES, dailyKey } from './dailyChallenge'
import { LEVEL_REQUIREMENTS, type Skill } from './mastery'
import { SIXTY_SECOND_CHALLENGE } from './session'

export type NextActionId = 'first-signal' | 'lesson' | 'daily' | 'weakest-skill' | 'challenge'

export interface NextAction {
  /** Which rule chose it. For tests and analytics labels, never shown. */
  id: NextActionId
  /** The button text. Short, imperative. */
  label: string
  /** A site path from the page registry. */
  href: string
  /** One or two sentences: why this, and why now. */
  reason: string
}

/**
 * A skill below this accuracy counts as "behind". It is the average a
 * character's three skills must reach to be Mastered, so a skill under it is
 * the one dragging that average down.
 */
export const WEAK_SKILL_ACCURACY = LEVEL_REQUIREMENTS[5].minScore

/**
 * The Mastered rule in words, exactly as `masteryLevel` applies it: a minimum
 * number of attempts in every skill, and the mean of the three accuracies at
 * or over the bar. Not "all three reach the bar", which is a different, and
 * stricter, rule than the code runs. Built from LEVEL_REQUIREMENTS, so a
 * change to the thresholds changes the sentence with them.
 */
export const MASTERY_RULE = (() => {
  const { minAttemptsPerSkill, minScore } = LEVEL_REQUIREMENTS[5]
  return `at least ${minAttemptsPerSkill} tries in each of the three skills and an average of ${Math.round(minScore * 100)}% across them`
})()

/** How each skill is named in a sentence, and in a button. */
const SKILL_WORDS: Record<Skill, { noun: string; verb: string }> = {
  recognition: { noun: 'reading', verb: 'Practise reading' },
  listening: { noun: 'listening', verb: 'Practise listening' },
  sending: { noun: 'sending', verb: 'Practise sending' },
}

const DAY_MS = 86_400_000

/**
 * The guided lesson's stages: the one canonical list (src/data/lessonStages.ts),
 * re-exported for the callers that already read it from here.
 */
export { LESSON_STAGES }

/**
 * Lesson stages finished, counting from the first. The single rule lives in
 * `progress.stagesTaught` (every character of a stage answered correctly at
 * least once), so this, the hero, the snapshot and the session result agree.
 */
export function lessonStagesDone(progress: ProgressRecord, now: number): number {
  return stagesTaught(progress, now)
}

/** Whether this profile has ever keyed an element. */
export function hasSentFirstSignal(stats: StatsRecord): boolean {
  return stats.firstSignalAt !== undefined || stats.elementsSent > 0
}

export function nextBestAction(
  progress: ProgressRecord,
  stats: StatsRecord,
  daily: DailyRecord,
  now: number,
): NextAction {
  const taught = lessonStagesDone(progress, now)
  const stages = LESSON_STAGES.length

  // 1. The first signal.
  if (!hasSentFirstSignal(stats)) {
    const first = LESSON_STAGES[0] ?? []
    if (taught === 0) {
      return {
        id: 'first-signal',
        label: 'Start lesson 1',
        href: '/learn/',
        reason: `Lesson 1 teaches ${joinList(first)}, the ${numberWord(first.length)} shortest characters in the code. Send one back and the first pad of your tree lights up.`,
      }
    }
    // Lessons can be passed by ear and by eye, so someone can be several
    // stages in without ever having keyed. Sending is the missing skill.
    return {
      id: 'first-signal',
      label: 'Send your first signal',
      href: '/telegraph/',
      reason:
        'You have learned characters by eye and by ear but never keyed one. Tap out any letter on the telegraph key; it takes a few seconds.',
    }
  }

  // 2. The next lesson stage.
  if (taught < stages) {
    const stage = LESSON_STAGES[taught] ?? []
    return {
      id: 'lesson',
      label: taught === 0 ? 'Finish stage 1' : `Continue to stage ${taught + 1}`,
      href: '/learn/',
      reason: `Stage ${taught + 1} of ${stages} teaches ${plural(stage.length, 'new character')}: ${joinList(stage)}. ${
        taught === 0 ? 'It picks up where you left off.' : `${plural(taught, 'stage')} done so far.`
      }`,
    }
  }

  // 3. Today's daily, when it has not been taken.
  const today = dailyKey(now)
  if (resultFor(daily, today) === null) {
    // Through yesterday: today's attempt is the one that would extend it.
    const running = dailyStreak(daily, dailyKey(now - DAY_MS))
    return {
      id: 'daily',
      label: "Take today's daily",
      href: '/daily/',
      reason: `${plural(LINES, 'line')}, the same for everyone today, and one attempt. ${
        running > 0
          ? `It keeps your ${running}-day daily streak going.`
          : 'Take it again tomorrow and you have a streak.'
      }`,
    }
  }

  // 4. The weakest skill, when it is genuinely behind.
  const weakest = weakestSkill(progress, ALL_LETTERS, now)
  const accuracy = weakest === null ? null : accuracyBySkill(progress, ALL_LETTERS, now)[weakest]
  if (weakest !== null && accuracy?.accuracy != null && accuracy.accuracy < WEAK_SKILL_ACCURACY) {
    const words = SKILL_WORDS[weakest]
    return {
      id: 'weakest-skill',
      label: words.verb,
      href: '/practice/',
      reason: `Your ${words.noun} accuracy is ${Math.round(accuracy.accuracy * 100)}%, the lowest of your three skills. A character counts as mastered with ${MASTERY_RULE}.`,
    }
  }

  // 5. Always something to do.
  const seconds = Math.round((SIXTY_SECOND_CHALLENGE.durationMs ?? 0) / 1000)
  return {
    id: 'challenge',
    label: `Take the ${seconds}-second challenge`,
    href: '/challenge/',
    reason: `Today's daily is done. See how many characters you can copy in ${seconds} seconds, then send the link to someone.`,
  }
}
