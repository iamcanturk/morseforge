/**
 * The words the Settings data panel says about a backup, a restore and a
 * reset, kept pure so every sentence can be tested against real records.
 *
 * Two promises live here. A restore reports exactly what it wrote and what it
 * refused, never a blanket "Progress restored". A reset states what it is
 * about to erase in this browser's own numbers, because "Erase all data?" is
 * a question nobody can weigh without knowing what "all" is.
 */

import type { MessageKey } from '../../i18n/keys'
import type { Translator } from '../../i18n/translator'
import { currentStreak, levelFromXp } from '../../game/progression'
import { type BackupSection, BACKUP_SECTIONS, type ImportResult } from '../../storage/backup'
import { DAILY_KEY, type DailyRecord } from '../../storage/daily'
import { PROGRESS_KEY, type ProgressRecord } from '../../storage/progress'
import { SETTINGS_KEY } from '../../storage/settings'
import { STATS_KEY, type StatsRecord } from '../../storage/stats'
import { isRecord } from '../../storage/store'

/** How each section is named mid-sentence, to the person whose data it is. */
const SECTION_LABEL_KEYS: Readonly<Record<BackupSection, MessageKey>> = {
  progress: 'settings.sectionProgress',
  settings: 'settings.sectionSettings',
  stats: 'settings.sectionStats',
  daily: 'settings.sectionDaily',
}

const SECTION_HINT_KEYS: Readonly<Record<BackupSection, MessageKey>> = {
  progress: 'settings.sectionProgressHint',
  settings: 'settings.sectionSettingsHint',
  stats: 'settings.sectionStatsHint',
  daily: 'settings.sectionDailyHint',
}

/** What a backup section is called in a sentence: "learning progress". */
export const sectionLabel = (t: Translator, section: BackupSection): string =>
  t.raw(SECTION_LABEL_KEYS[section])

/** One line under a section's name, saying what it holds. */
export const sectionHint = (t: Translator, section: BackupSection): string =>
  t.raw(SECTION_HINT_KEYS[section])

/** What each section holds, for the line under its name. */

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

/** "learning progress and stats". */
export const sectionNames = (t: Translator, sections: readonly BackupSection[]): string =>
  t.list(sections.map((section) => sectionLabel(t, section)))

/** The one-sentence verdict announced after an import. */
export function importSummary(t: Translator, result: ImportResult): string {
  if (!result.recognised) return t('settings.notBackup')
  const names = (sections: readonly BackupSection[]) => sectionNames(t, sections)
  const unsaved =
    result.unsaved.length === 0
      ? ''
      : t('settings.couldNotSave', { sections: names(result.unsaved) })
  if (result.restored.length === 0) {
    const parts = [t('settings.nothingRestored')]
    if (result.rejected.length > 0) {
      parts.push(
        result.unsaved.length === 0
          ? t('settings.failedValidationKept', { sections: names(result.rejected) })
          : t('settings.failedValidation', { sections: names(result.rejected) }),
      )
    }
    if (unsaved) parts.push(unsaved)
    return parts.join(' ')
  }
  const parts = [t('settings.restoredSections', { sections: names(result.restored) })]
  if (result.rejected.length > 0) {
    parts.push(t('settings.rejectedSections', { sections: names(result.rejected) }))
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
export function resetConsequence(t: Translator, inventory: Inventory): string {
  const parts: string[] = []
  if (inventory.characters > 0) {
    parts.push(t('settings.historyFor', { count: inventory.characters }))
  }
  if (inventory.xp > 0) {
    parts.push(
      t('settings.levelAndXp', {
        level: inventory.level,
        xp: inventory.xp.toLocaleString(t.locale.lang === 'en' ? 'en' : t.locale.lang),
      }),
    )
  }
  if (inventory.streak > 0) parts.push(t('settings.streakDays', { days: inventory.streak }))
  if (inventory.dailies > 0) parts.push(t('settings.dailyResults', { count: inventory.dailies }))

  const settings = t('settings.resetSettings')
  if (parts.length === 0) return t('settings.resetNothing', { settings })
  return t('settings.resetErases', { parts: t.list(parts), settings })
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
