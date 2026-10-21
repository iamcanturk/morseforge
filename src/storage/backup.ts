/**
 * Export, import and reset of everything the app stores (PROJECT.md §22).
 *
 * There is no server copy, so this file is the user's only backup, and two
 * mistakes are expensive:
 *
 * 1. **Leaving a store out.** The first version covered progress and settings
 *    only, so restoring a backup lost level, streak and daily history, and a
 *    reset left "Level 7" beside "0 mastered".
 * 2. **Writing a default over real data.** Running an invalid section through
 *    `validateOrDefault` and writing the result replaces someone's progress
 *    with an empty record and reports success. Here a section is written only
 *    when it validates as itself; anything else is reported as rejected and
 *    the stored data is left alone.
 *
 * Sections are keyed by their storage keys, which is also what the first
 * export format used, so an old progress-and-settings file imports unchanged.
 */

import {
  DAILY_KEY,
  type DailyRecord,
  createDailyStore,
  isCompleteDaily,
  validateDaily,
} from './daily'
import {
  PROGRESS_KEY,
  type ProgressRecord,
  createProgressStore,
  isCompleteProgress,
  validateProgress,
} from './progress'
import { SETTINGS_KEY, type SettingsRecord, createSettingsStore, defaultSettings } from './settings'
import {
  STATS_KEY,
  type StatsRecord,
  createStatsStore,
  isCompleteStats,
  settleImportedStreak,
  validateStats,
} from './stats'
import { type StorageDriver, type Store, isRecord } from './store'

/** Version of the backup file itself, separate from each store's own. */
export const BACKUP_FORMAT = 2

export const BACKUP_SECTIONS = ['progress', 'settings', 'stats', 'daily'] as const
export type BackupSection = (typeof BACKUP_SECTIONS)[number]

export interface BackupStores {
  progress: Store<ProgressRecord>
  settings: Store<SettingsRecord>
  stats: Store<StatsRecord>
  daily: Store<DailyRecord>
}

/**
 * The four stores over one driver: the page's shared instances, so a restore
 * or a reset shows immediately on every screen subscribed to them.
 */
export function createBackupStores(driver?: StorageDriver): BackupStores {
  return {
    progress: createProgressStore(driver),
    settings: createSettingsStore(driver),
    stats: createStatsStore(driver),
    daily: createDailyStore(driver),
  }
}

const KEYS: Record<BackupSection, string> = {
  progress: PROGRESS_KEY,
  settings: SETTINGS_KEY,
  stats: STATS_KEY,
  daily: DAILY_KEY,
}

/**
 * Whether a settings section is whole: the three groups every settings record
 * has had since the first one. The rest (motion, counters) arrived later, so
 * old exports lack them and the validator's defaults are the right answer.
 */
function isCompleteSettings(value: unknown): boolean {
  if (!isRecord(value)) return false
  const defaults = defaultSettings()
  // Each group must hold at least one setting it knows, or `{ audio: {} }`
  // would "restore" every default over the real preferences.
  return (['audio', 'timing', 'keys'] as const).every((group) => {
    const raw = value[group]
    return isRecord(raw) && Object.keys(defaults[group]).some((key) => Object.hasOwn(raw, key))
  })
}

/**
 * Whether a section is a whole record of its store, not a fragment.
 *
 * Every validator accepts any object and fills the gaps with defaults, which
 * is right for a read and wrong for an import. A partial section is rejected,
 * not merged: `{ xp: 500 }` would otherwise reset sessions, the streak and the
 * paid first-signal award, and a merge would invent a record nobody had.
 */
const IS_COMPLETE: Record<BackupSection, (value: unknown) => boolean> = {
  progress: isCompleteProgress,
  settings: isCompleteSettings,
  stats: isCompleteStats,
  daily: isCompleteDaily,
}

export interface BackupFile {
  app: 'morseforge'
  format: typeof BACKUP_FORMAT
  /** ISO timestamp of the export. */
  exported: string
  /** Each store's schema version at export, so a newer file is recognised. */
  versions: Record<BackupSection, number>
  [PROGRESS_KEY]: ProgressRecord
  [SETTINGS_KEY]: SettingsRecord
  [STATS_KEY]: StatsRecord
  [DAILY_KEY]: DailyRecord
}

/** Everything stored, as one object ready for `JSON.stringify`. */
export function exportAll(
  stores: BackupStores = createBackupStores(),
  now: number = Date.now(),
): BackupFile {
  return {
    app: 'morseforge',
    format: BACKUP_FORMAT,
    exported: new Date(now).toISOString(),
    versions: {
      progress: stores.progress.version,
      settings: stores.settings.version,
      stats: stores.stats.version,
      daily: stores.daily.version,
    },
    [PROGRESS_KEY]: stores.progress.read(),
    [SETTINGS_KEY]: stores.settings.read(),
    [STATS_KEY]: stores.stats.read(),
    [DAILY_KEY]: stores.daily.read(),
  }
}

export interface ImportResult {
  /** Sections written to storage, and confirmed saved. */
  restored: BackupSection[]
  /** Sections present in the file but not trusted, and so not written. */
  rejected: BackupSection[]
  /**
   * Sections that validated but could not be saved in this browser: storage
   * full, private mode, or a record from a newer build already there. What
   * was stored before is still what this browser holds.
   */
  unsaved: BackupSection[]
  /**
   * Whether the input looked like a MorseForge backup at all: an object with
   * at least one known section. False for `{}`, an array, or unreadable JSON.
   */
  recognised: boolean
}

function parse(input: unknown): unknown {
  if (typeof input !== 'string') return input
  try {
    return JSON.parse(input)
  } catch {
    return null
  }
}

/**
 * A deferred write of a validated record, or null when there is none. The
 * write reports whether it was saved. One that was not is undone in the
 * cache too, so the screens go on showing what this browser really holds
 * rather than a restore that will vanish on reload.
 */
function writer<T>(store: Store<T>, record: T | null): (() => boolean) | null {
  if (record === null) return null
  return () => {
    if (store.write(record)) return true
    store.reload()
    return false
  }
}

/**
 * Validate one section and return the write that would restore it, or null if
 * the section is not to be trusted.
 */
function prepareSection(
  section: BackupSection,
  value: unknown,
  stores: BackupStores,
  now: number,
): (() => boolean) | null {
  if (!isRecord(value)) return null
  if (!IS_COMPLETE[section](value)) return null
  switch (section) {
    case 'progress':
      return writer(stores.progress, validateProgress(value))
    case 'stats': {
      const stats = validateStats(value)
      return writer(stores.stats, stats && settleImportedStreak(stats, now))
    }
    case 'daily':
      return writer(stores.daily, validateDaily(value))
    case 'settings':
      // The settings validator rejects only non-objects, which is checked
      // above, so going through the store's own door is equivalent here.
      return writer(stores.settings, stores.settings.validateOrDefault(value))
  }
}

/**
 * Restore from a backup, given as parsed JSON or as the file's text.
 *
 * Every section is validated before anything is written, so a file with one
 * bad section restores the good ones and leaves the bad one's store exactly as
 * it was. A section from a newer schema than this build knows is rejected
 * rather than guessed at, for the same reason the stores refuse to downgrade.
 */
export function importAll(
  input: unknown,
  stores: BackupStores = createBackupStores(),
  now: number = Date.now(),
): ImportResult {
  const file = parse(input)
  const result: ImportResult = { restored: [], rejected: [], unsaved: [], recognised: false }
  if (!isRecord(file)) return result

  const versions = isRecord(file['versions']) ? file['versions'] : {}
  const accepted: Array<{ section: BackupSection; write: () => boolean }> = []

  for (const section of BACKUP_SECTIONS) {
    if (!Object.hasOwn(file, KEYS[section])) continue
    result.recognised = true

    const version = versions[section]
    const tooNew = typeof version === 'number' && version > stores[section].version
    const write = tooNew ? null : prepareSection(section, file[KEYS[section]], stores, now)

    if (write === null) {
      result.rejected.push(section)
      continue
    }
    accepted.push({ section, write })
  }

  // "Restored" only once the write is known to have landed.
  for (const { section, write } of accepted) {
    if (write()) result.restored.push(section)
    else result.unsaved.push(section)
  }
  return result
}

/**
 * Erase all four stores and return each to its defaults, with one exception:
 * the anonymous-counters choice is kept.
 *
 * "Erase everything" is a privacy action. Someone who switched the counters
 * off and then erased their data would otherwise find them silently back on,
 * because the default is on, which is the opposite of what they asked for.
 * The choice holds no data about them, so keeping it erases nothing. (The
 * theme is kept too; it lives outside these stores.)
 */
export function resetAll(stores: BackupStores = createBackupStores()): void {
  const { counters } = stores.settings.read()
  for (const section of BACKUP_SECTIONS) stores[section].clear()
  const defaults = defaultSettings()
  // Equal to the default: nothing to keep, and no record is written at all.
  if (counters !== defaults.counters) stores.settings.write({ ...defaults, counters })
}
