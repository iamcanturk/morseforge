/**
 * An achievement's title and line in the page's language. The rule that earns
 * it, its icon and its id stay in `src/game/achievements.ts`; the words come
 * from the catalog, with every threshold filled in from the same constants
 * the rule tests.
 */

import {
  CIRCUIT_STARTED_SEEN,
  FIRST_RING_STAGE,
  HALF_WAY_MASTERED,
  RADIO_OPERATOR_CPM,
  SIGNAL_MASTER_MASTERED,
  SPEED_DEMON_CPM,
  WEEK_ONE_DAYS,
  type Achievement,
} from '../../game/achievements'
import type { Translator } from '../../i18n/translator'

export interface AchievementCopy {
  title: string
  description: string
}

export function achievementCopy(
  t: Translator,
  achievement: Pick<Achievement, 'id' | 'title' | 'description'>,
): AchievementCopy {
  switch (achievement.id) {
    case 'first-signal':
      return {
        title: t('achievements.firstSignalTitle'),
        description: t('achievements.firstSignalDescription'),
      }
    case 'first-ring':
      return {
        title: t('achievements.firstRingTitle'),
        description: t('achievements.firstRingDescription', {
          characters: t.list(FIRST_RING_STAGE),
        }),
      }
    case 'circuit-started':
      return {
        title: t('achievements.circuitStartedTitle'),
        description: t('achievements.circuitStartedDescription', {
          number: t.numberWord(CIRCUIT_STARTED_SEEN),
        }),
      }
    case 'lightbulb':
      return {
        title: t('achievements.lightbulbTitle'),
        description: t('achievements.lightbulbDescription'),
      }
    case 'radio-operator':
      return {
        title: t('achievements.radioOperatorTitle'),
        description: t('achievements.radioOperatorDescription', { cpm: RADIO_OPERATOR_CPM }),
      }
    case 'speed-demon':
      return {
        title: t('achievements.speedDemonTitle'),
        description: t('achievements.speedDemonDescription', { cpm: SPEED_DEMON_CPM }),
      }
    case 'week-one':
      return {
        title: t('achievements.weekOneTitle'),
        description: t('achievements.weekOneDescription', { number: t.numberWord(WEEK_ONE_DAYS) }),
      }
    case 'cq-cq-cq':
      return { title: t('achievements.cqTitle'), description: t('achievements.cqDescription') }
    case 'half-way':
      return {
        title: t('achievements.halfWayTitle'),
        description: t('achievements.halfWayDescription', {
          number: t.numberWord(HALF_WAY_MASTERED),
        }),
      }
    case 'signal-master':
      return {
        title: t('achievements.signalMasterTitle'),
        description: t('achievements.signalMasterDescription', {
          number: t.numberWord(SIGNAL_MASTER_MASTERED),
        }),
      }
    default:
      // An achievement added to the game before its copy reached the catalog
      // keeps the English it was defined with.
      return { title: achievement.title, description: achievement.description }
  }
}
