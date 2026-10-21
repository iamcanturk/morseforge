/**
 * One way in for everything that counts as having practised (PROJECT.md §19,
 * §49, §57).
 *
 * Before this existed only the practice and copy screens wrote to stats, so a
 * week of lessons, telegraph keying or games read as streak 0, level 1, and
 * badges like First Signal could never be earned by the thing they describe.
 * Every screen banking through the same function is what makes the streak, the
 * XP and the achievements agree with each other.
 *
 * `applyActivity` is the pure rule; `bankActivity` reads the stores, applies
 * it, writes, and reports what was newly earned.
 */

import { type Achievement, type AchievementSnapshot, newlyEarned } from '../game/achievements'
import { recordActivity } from '../game/progression'
import { createProgressStore, type ProgressRecord } from './progress'
import { achievementSnapshot } from './snapshot'
import {
  type StatsRecord,
  awardFirstSignal,
  createStatsStore,
  recordKeying,
  recordMessage,
} from './stats'
import type { Store } from './store'

export interface ActivityInput {
  /** XP earned by the activity itself, before any one-time bonus. */
  xp?: number
  /** Elements keyed. The first ever also pays `XP.firstSignal`, once. */
  elements?: number
  /**
   * A real message was sent rather than a drilled character (§49). Counts
   * toward CQ CQ CQ; on its own it does not mark the streak day.
   */
  message?: boolean
  /**
   * Prompts answered. Counts as activity on its own; it is added to the
   * lifetime answer totals only when `correct` comes with it, because adding
   * answers without their hits would quietly lower lifetime accuracy.
   */
  answers?: number
  /** Of `answers`, how many were right. Clamped to `answers`. */
  correct?: number
  /** Epoch ms. Injected so tests never depend on the real clock. */
  now?: number
  /**
   * An achievement snapshot taken when the activity began. Pass it when the
   * activity also changed progress (a lesson, a game), so badges earned by
   * those answers are reported too, not only those earned by the stats.
   */
  since?: AchievementSnapshot
}

export interface ActivityResult {
  /** Achievements earned by this call, in display order. */
  earned: Achievement[]
  /** The stats record as written (or as it stood, if nothing was banked). */
  stats: StatsRecord
  /** XP actually added, including the first-signal bonus. */
  xp: number
  /** True when this call paid the one-time first-signal XP. */
  firstSignal: boolean
  /** False when the input carried nothing and the store was left alone. */
  banked: boolean
}

/** A non-negative whole number from untrusted input; anything else is 0. */
const whole = (value: number | undefined): number =>
  typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0

/**
 * Apply one activity to a stats record. Pure.
 *
 * Returns the record itself, untouched, for an activity that carries nothing:
 * a session ended with zero answers, or a key pressed for zero elements, is not
 * practice and must not keep a streak alive.
 */
export function applyActivity(
  stats: StatsRecord,
  input: ActivityInput,
  now: number,
): { stats: StatsRecord; xp: number; firstSignal: boolean; banked: boolean } {
  const xp = whole(input.xp === undefined ? undefined : Math.round(input.xp))
  const elements = whole(input.elements)
  const answers = whole(input.answers)
  const message = input.message === true

  if (xp === 0 && elements === 0 && answers === 0 && !message) {
    return { stats, xp: 0, firstSignal: false, banked: false }
  }

  let next = stats
  let firstSignal = false

  if (elements > 0) {
    next = recordKeying(next, elements, now)
    const paid = awardFirstSignal(next, now)
    firstSignal = paid !== next
    next = paid
  }

  if (message) next = recordMessage(next)

  if (answers > 0 && input.correct !== undefined) {
    next = {
      ...next,
      totalAnswers: next.totalAnswers + answers,
      totalCorrect: next.totalCorrect + Math.min(whole(input.correct), answers),
    }
  }

  if (xp > 0) next = { ...next, xp: next.xp + xp }

  // A message on its own is not practice: typing "SOS" into the composer and
  // pressing Create once a day would otherwise keep the streak alive with no
  // Morse at all. It still counts toward CQ CQ CQ above. A message keyed on
  // the telegraph is practice, and its elements mark the day when they bank.
  // Idempotent within a local day, so the keying path above having already
  // marked the day costs nothing.
  if (xp > 0 || elements > 0 || answers > 0) {
    next = { ...next, streak: recordActivity(next.streak, now) }
  }

  return { stats: next, xp: next.xp - stats.xp, firstSignal, banked: true }
}

export interface ActivityStores {
  /**
   * Defaults to the page's shared instance, which every screen's
   * `createStatsStore()` also returns, so every holder sees this call's write
   * and subscribers are notified. Pass one only to bank into another driver,
   * as tests do.
   */
  stats?: Store<StatsRecord>
  progress?: Store<ProgressRecord>
}

/**
 * Bank an activity: read stats, apply it, write it, and report the
 * achievements this call newly earned.
 */
export function bankActivity(input: ActivityInput, stores: ActivityStores = {}): ActivityResult {
  const now = input.now ?? Date.now()
  const statsStore = stores.stats ?? createStatsStore()
  const before = statsStore.read()

  const applied = applyActivity(before, input, now)
  if (!applied.banked) {
    return { earned: [], stats: before, xp: 0, firstSignal: false, banked: false }
  }

  statsStore.write(applied.stats)

  // Progress is only read: this call changes stats, but achievements are
  // judged on both, and a snapshot built from one half would award nothing
  // that depends on the other.
  const progress = (stores.progress ?? createProgressStore()).read()
  const from = input.since ?? achievementSnapshot(progress, before, now)
  const to = achievementSnapshot(progress, applied.stats, now)

  return {
    earned: newlyEarned(from, to),
    stats: applied.stats,
    xp: applied.xp,
    firstSignal: applied.firstSignal,
    banked: true,
  }
}
