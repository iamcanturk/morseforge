/**
 * What happens to a finished run: banking it, keeping the personal best, and
 * the words it is shared with.
 *
 * Kept out of the screens and free of React so the rules can be tested against
 * an in-memory store, and so both games bank by exactly the same rule. A game
 * is a measurement, so it counts the way practice counts — the same XP per
 * character, the same streak day, the same lifetime totals — and a run the
 * player did nothing in counts for nothing.
 */

import type { Achievement, AchievementSnapshot } from '../../game/achievements'
import { percent } from '../../game/dailyShare'
import { currentStreak } from '../../game/progression'
import { clipboardText, type ShareMessage } from '../../game/share'
import { bankActivity } from '../../storage/activity'
import type { ProgressRecord } from '../../storage/progress'
import {
  createStatsStore,
  recordGameBest,
  type GameId,
  type StatsRecord,
} from '../../storage/stats'
import type { Store } from '../../storage/store'
import type { Translator } from '../../i18n/translator'

/** Where each game lives. The page passes the registry's name and URL in as props. */
export const GAME_PATHS: Readonly<Record<GameId, string>> = {
  defender: '/games/signal-defender/',
  runner: '/games/morse-runner/',
}

/**
 * The name and address a game shares under. Read from the page registry by
 * the Astro page at build time and handed to the island, so the copy is never
 * retyped and the registry's copy never ships in the game's bundle.
 */
export interface GameIdentity {
  game: GameId
  name: string
  url: string
}

export interface RunSummary {
  game: GameId
  score: number
  /** Signals or gates resolved, right or wrong: what the lifetime totals count. */
  answers: number
  /** Of `answers`, how many were right. */
  correct: number
  /**
   * Characters the player entered. Zero means they started a run and watched
   * it end, which is not practice and must not keep a streak alive.
   */
  inputs: number
  xp: number
  /** Elements keyed, for the sending game. */
  elements?: number
  /** Taken when the run started, so badges earned by its answers are reported. */
  since?: AchievementSnapshot
  now?: number
}

export interface RunReport {
  /** False when the run carried nothing and the stores were left alone. */
  banked: boolean
  xp: number
  earned: Achievement[]
  /** The best before this run, or null if there was none. */
  previousBest: number | null
  /** True when this run set the best (including the first scored run). */
  isNewBest: boolean
  /** Days in the activity streak after this run. */
  streak: number
}

export interface RunStores {
  stats?: Store<StatsRecord>
  progress?: Store<ProgressRecord>
}

/**
 * Bank a finished run once: XP, streak and totals through `bankActivity`, then
 * the personal best. The caller guards against calling it twice for one run.
 */
export function bankRun(run: RunSummary, stores: RunStores = {}): RunReport {
  const stats = stores.stats ?? createStatsStore()
  const previousBest = stats.read().gameBests?.[run.game] ?? null
  const elements = run.elements ?? 0
  const now = run.now ?? Date.now()

  if (run.inputs <= 0 && elements <= 0) {
    const streak = currentStreak(stats.read().streak, now)
    return { banked: false, xp: 0, earned: [], previousBest, isNewBest: false, streak }
  }

  const activity = bankActivity(
    {
      xp: run.xp,
      answers: run.answers,
      correct: run.correct,
      elements,
      since: run.since,
      now,
    },
    { stats, progress: stores.progress },
  )

  const before = stats.read()
  const after = recordGameBest(before, run.game, run.score)
  if (after !== before) stats.write(after)

  return {
    banked: activity.banked,
    xp: activity.xp,
    earned: activity.earned,
    previousBest,
    isNewBest: after !== before,
    streak: currentStreak(after.streak, now),
  }
}

/**
 * The whole percent cleared, rounded down like the daily's: 199 of 200 is 99%,
 * never "100% cleared" beside a signal that landed. `cleared` is 0..1.
 */
export function clearedPercent(cleared: number): number {
  return percent(cleared)
}

/** "Signal Defender: 1,240, 91% cleared". `cleared` is 0..1. */
export function shareLine(t: Translator, name: string, score: number, cleared: number): string {
  const points = Number.isFinite(score) ? Math.max(0, Math.round(score)) : 0
  return t('games.shareLine', {
    name,
    score: points.toLocaleString(t.locale.lang === 'en' ? 'en' : t.locale.lang),
    percent: clearedPercent(cleared),
  })
}

/**
 * The run as a share (DEC-035): the line as text, the game's page as url. A
 * share sheet gets the link once, as `url`; the clipboard gets `shareText`.
 */
export function gameShare(
  t: Translator,
  identity: GameIdentity,
  score: number,
  cleared: number,
): ShareMessage {
  return {
    title: identity.name,
    text: shareLine(t, identity.name, score, cleared),
    url: identity.url,
  }
}

/** The line plus the game's URL on its own line: what is copied. */
export function shareText(
  t: Translator,
  identity: GameIdentity,
  score: number,
  cleared: number,
): string {
  return clipboardText(gameShare(t, identity, score, cleared), '\n')
}
