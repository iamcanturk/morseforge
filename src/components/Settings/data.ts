/**
 * The words the Settings data panel says about a backup, a restore and a
 * reset, kept pure so every sentence can be tested against real records.
 *
 * Two promises live here. A restore reports exactly what it wrote and what it
 * refused, never a blanket "Progress restored". A reset states what it is
 * about to erase in this browser's own numbers, because "Erase all data?" is
 * a question nobody can weigh without knowing what "all" is.
 */

import { joinList, plural } from '../../data/format'
import { currentStreak, levelFromXp } from '../../game/progression'
import { type BackupSection, BACKUP_SECTIONS, type ImportResult } from '../../storage/backup'
import { DAILY_KEY, type DailyRecord } from '../../storage/daily'
import { PROGRESS_KEY, type ProgressRecord } from '../../storage/progress'
import { SETTINGS_KEY } from '../../storage/settings'
import { STATS_KEY, type StatsRecord } from '../../storage/stats'
import { isRecord } from '../../storage/store'

/** How each section is named mid-sentence, to the person whose data it is. */
export const SECTION_LABELS: Readonly<Record<BackupSection, string>> = {
  progress: 'learning progress',
  settings: 'settings',
  stats: 'stats',
  daily: 'daily results',
}

/** What each section holds, for the line under its name. */
export const SECTION_HINTS: Readonly<Record<BackupSection, string>> = {
  progress: 'Every character you have met, its accuracy and when it is due',
  settings: 'Signal, tone, speed, keys, motion and usage counts',
  stats: 'XP, level, streak, sessions and achievements',
  daily: 'Your daily challenge results and their streak',
}

/**
 * The storage key each section is filed under in a backup. backup.ts keeps
 * its own copy private; data.test.ts checks the two agree by reading
 * a real export.
 */
export const SECTION_KEYS: Readonly<Record<BackupSection, string>> = {
  progress: PROGRESS_KEY,
  settings: SETTINGS_KEY,
  stats: STATS_KEY,
  daily: DAILY_KEY,
}

export interface BackupPreview {
  /** Sections present in the file, in the canonical order. */
  sections: BackupSection[]
  /** The export timestamp the file claims, if it is a readable date. */
  exported: Date | null
}

/**
 * What a chosen file says it holds, before anything is written.
 *
 * This only looks; `importAll` still decides what is trustworthy. It exists so
 * the confirmation can name what would be replaced, and so a file that holds
 * nothing of ours skips the confirmation entirely: there is nothing to
 * overwrite, so there is nothing to confirm.
 */
export function previewBackup(text: string): BackupPreview {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { sections: [], exported: null }
  }
  if (!isRecord(parsed)) return { sections: [], exported: null }

  const sections = BACKUP_SECTIONS.filter((section) => Object.hasOwn(parsed, SECTION_KEYS[section]))
  const stamp = parsed['exported']
  const date = typeof stamp === 'string' ? new Date(stamp) : null
  return { sections, exported: date && Number.isFinite(date.getTime()) ? date : null }
}

/**
 * One line per section for the result plate: written and confirmed saved,
 * refused as untrustworthy, trusted but not saved (the browser refused the
 * write: storage full, or a newer copy on disk), or not in the file.
 */
export type SectionOutcome = 'restored' | 'rejected' | 'unsaved' | 'absent'

export function sectionOutcomes(result: ImportResult): Record<BackupSection, SectionOutcome> {
  const outcome = (section: BackupSection): SectionOutcome =>
    result.restored.includes(section)
      ? 'restored'
      : result.rejected.includes(section)
        ? 'rejected'
        : result.unsaved.includes(section)
          ? 'unsaved'
          : 'absent'
  return {
    progress: outcome('progress'),
    settings: outcome('settings'),
    stats: outcome('stats'),
    daily: outcome('daily'),
  }
}

const names = (sections: readonly BackupSection[]) =>
  joinList(sections.map((section) => SECTION_LABELS[section]))

/** The one-sentence verdict announced after an import. */
export function importSummary(result: ImportResult): string {
  if (!result.recognised) {
    return 'Nothing restored. This file is not a MorseForge backup, so nothing was changed.'
  }
  const unsaved =
    result.unsaved.length === 0
      ? ''
      : `Could not save ${names(result.unsaved)} in this browser, so what was here is unchanged.`
  if (result.restored.length === 0) {
    const parts = ['Nothing restored.']
    if (result.rejected.length > 0) {
      parts.push(
        result.unsaved.length === 0
          ? `The ${names(result.rejected)} in this file did not pass validation, so nothing in this browser was changed.`
          : `The ${names(result.rejected)} in this file did not pass validation.`,
      )
    }
    if (unsaved) parts.push(unsaved)
    return parts.join(' ')
  }
  const parts = [`Restored ${names(result.restored)}.`]
  if (result.rejected.length > 0) {
    parts.push(
      `Rejected ${names(result.rejected)}: incomplete or from a newer version, so the copy in this browser was kept.`,
    )
  }
  if (unsaved) parts.push(unsaved)
  return parts.join(' ')
}

/** What this browser currently holds, in the units a learner thinks in. */
export interface Inventory {
  /** Characters with any recorded history. */
  characters: number
  xp: number
  level: number
  /** The streak as displayed today, not as last stored. */
  streak: number
  sessions: number
  dailies: number
}

export function takeInventory(
  progress: ProgressRecord,
  stats: StatsRecord,
  daily: DailyRecord,
  now: number,
): Inventory {
  return {
    characters: Object.keys(progress.characters).length,
    xp: stats.xp,
    level: levelFromXp(stats.xp),
    streak: currentStreak(stats.streak, now),
    sessions: stats.sessions,
    dailies: daily.results.length,
  }
}

export function isEmptyInventory(inventory: Inventory): boolean {
  return (
    inventory.characters === 0 &&
    inventory.xp === 0 &&
    inventory.sessions === 0 &&
    inventory.dailies === 0 &&
    inventory.streak === 0
  )
}

/**
 * The consequence statement for the reset confirmation, built from the real
 * numbers so the dialog says what is actually at stake.
 */
export function resetConsequence(inventory: Inventory): string {
  const parts: string[] = []
  if (inventory.characters > 0) {
    parts.push(`history for ${plural(inventory.characters, 'character')}`)
  }
  if (inventory.xp > 0) {
    parts.push(`level ${inventory.level} and ${inventory.xp.toLocaleString('en')} XP`)
  }
  if (inventory.streak > 0) parts.push(`a ${inventory.streak}-day streak`)
  if (inventory.dailies > 0) parts.push(plural(inventory.dailies, 'daily result'))

  const settings = 'every setting except the anonymous usage counts goes back to its default'
  if (parts.length === 0) {
    return `There is no progress stored yet, so only the settings change: ${settings}.`
  }
  return `This erases ${joinList(parts)}, and ${settings}. There is no other copy, so it cannot be undone.`
}

/** `morseforge-backup-2026-10-21.json`, dated in the user's own day. */
export function backupFileName(now: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0')
  return `morseforge-backup-${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}.json`
}

/**
 * Whether this is iOS or iPadOS, which has no install prompt: the only way in
 * is Share → Add to Home Screen, so the page says so instead of a button.
 * iPadOS reports itself as a Mac; the touch points give it away.
 */
export function isAppleMobile(
  userAgent: string,
  platform: string,
  maxTouchPoints: number,
): boolean {
  if (/iPad|iPhone|iPod/.test(userAgent)) return true
  return platform === 'MacIntel' && maxTouchPoints > 1
}
