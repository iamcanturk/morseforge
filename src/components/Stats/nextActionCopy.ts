/**
 * The next step's button and reason, in the page's language. Which step it is
 * and the figures it quotes come from `nextBestAction` in
 * `src/game/nextAction.ts`; only the words are here.
 */

import { LEVEL_REQUIREMENTS, type Skill } from '../../game/mastery'
import type { NextAction } from '../../game/nextAction'
import type { MessageKey } from '../../i18n/keys'
import type { Translator } from '../../i18n/translator'

const SKILL_KEYS = {
  recognition: { verb: 'nextAction.practiseRecognition', noun: 'nextAction.nounRecognition' },
  listening: { verb: 'nextAction.practiseListening', noun: 'nextAction.nounListening' },
  sending: { verb: 'nextAction.practiseSending', noun: 'nextAction.nounSending' },
} as const satisfies Record<Skill, { verb: MessageKey; noun: MessageKey }>

/** The Mastered rule in the next step's words, from the same thresholds the grader uses. */
export function nextActionRule(t: Translator): string {
  const { minAttemptsPerSkill, minScore } = LEVEL_REQUIREMENTS[5]
  return t('nextAction.rule', {
    attempts: minAttemptsPerSkill,
    percent: Math.round(minScore * 100),
  })
}

export function nextActionCopy(
  t: Translator,
  action: NextAction,
): { label: string; reason: string; href: string } {
  const { facts } = action
  const href = t.href(action.href)
  switch (action.id) {
    case 'first-signal':
      return facts.taught === 0
        ? {
            href,
            label: t('nextAction.startLesson'),
            reason: t('nextAction.startLessonReason', {
              characters: t.list(facts.characters),
              number: t.numberWord(facts.characters.length),
            }),
          }
        : {
            href,
            label: t('nextAction.firstSignal'),
            reason: t('nextAction.firstSignalReason'),
          }
    case 'lesson':
      return {
        href,
        label:
          facts.taught === 0
            ? t('nextAction.finishStage')
            : t('nextAction.continueStage', { stage: facts.taught + 1 }),
        reason: t('nextAction.stageReason', {
          stage: facts.taught + 1,
          stages: facts.stages,
          newCharacters: t('nextAction.newCharacters', { count: facts.characters.length }),
          characters: t.list(facts.characters),
          progress:
            facts.taught === 0
              ? t('nextAction.pickUp')
              : t('nextAction.stagesDone', { count: facts.taught }),
        }),
      }
    case 'daily':
      return {
        href,
        label: t('nextAction.daily'),
        reason: t('nextAction.dailyReason', {
          lines: t('nextAction.dailyLines', { count: facts.lines }),
          streak:
            facts.running > 0
              ? t('nextAction.dailyKeeps', { days: facts.running })
              : t('nextAction.dailyStart'),
        }),
      }
    case 'weakest-skill': {
      const keys = SKILL_KEYS[facts.skill ?? 'listening']
      return {
        href,
        label: t(keys.verb),
        reason: t('nextAction.weakestReason', {
          skill: t(keys.noun),
          percent: facts.percent ?? 0,
          rule: nextActionRule(t),
        }),
      }
    }
    case 'challenge':
      return {
        href,
        label: t('nextAction.challenge', { seconds: facts.seconds }),
        reason: t('nextAction.challengeReason', { seconds: facts.seconds }),
      }
  }
}
