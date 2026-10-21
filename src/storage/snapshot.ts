/**
 * The achievement snapshot, read from stored progress and stats.
 *
 * `achievements.ts` is deliberately pure — it takes a plain object of numbers
 * and knows nothing about storage. Something still has to build that object,
 * and building it in three places would mean three chances for the stats
 * dashboard and the result screen to disagree about whether you earned
 * something.
 */

import { ALL_LETTERS } from '../data/morseAlphabet'
import type { AchievementSnapshot } from '../game/achievements'
import { masteryLevel } from '../game/mastery'
import { getCharacter, masteredCharacters, stagesTaught, type ProgressRecord } from './progress'
import type { StatsRecord } from './stats'

export function achievementSnapshot(
  progress: ProgressRecord,
  stats: StatsRecord,
  now = Date.now(),
): AchievementSnapshot {
  return {
    elementsSent: stats.elementsSent,
    mastered: masteredCharacters(progress, ALL_LETTERS, now).length,
    // "Seen" is level 1 and above: met the character at all, whether or not it
    // has been answered correctly since.
    seen: ALL_LETTERS.filter((character) => {
      const entry = getCharacter(progress, character, now)
      return masteryLevel(entry.skills, entry.seen) >= 1
    }).length,
    stagesTaught: stagesTaught(progress, now),
    bestWpm: stats.bestWpm,
    longestStreak: stats.streak.longest,
    sessions: stats.sessions,
    totalCorrect: stats.totalCorrect,
    messagesSent: stats.messagesSent,
  }
}
