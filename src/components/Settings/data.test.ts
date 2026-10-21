import { describe, expect, it } from 'vitest'
import {
  SECTION_KEYS,
  sectionLabel,
  backupFileName,
  importSummary,
  isAppleMobile,
  isEmptyInventory,
  previewBackup,
  resetConsequence,
  sectionOutcomes,
  takeInventory,
} from './data'
import { BACKUP_SECTIONS, createBackupStores, exportAll, importAll } from '../../storage/backup'
import { emptyDaily, recordDaily } from '../../storage/daily'
import { answer, emptyProgress } from '../../storage/progress'
import { defaultStats } from '../../storage/stats'
import { createMemoryDriver } from '../../storage/store'
import { dayKey, levelFromXp } from '../../game/progression'
import { translatorFor } from '../../i18n/server'

const t = translatorFor('en')

const T0 = Date.UTC(2026, 9, 21, 12)

function populated() {
  const stores = createBackupStores(createMemoryDriver())
  let progress = answer(emptyProgress(), 'E', 'listening', true, T0)
  progress = answer(progress, 'T', 'listening', false, T0)
  stores.progress.write(progress)
  stores.stats.write({
    ...defaultStats(),
    xp: 1240,
    sessions: 9,
    streak: { current: 5, longest: 7, lastActiveDay: dayKey(T0) },
  })
  stores.daily.write(
    recordDaily(emptyDaily(), { date: '2026-10-21', accuracy: 0.9, score: 300, passed: true }),
  )
  return stores
}

describe('SECTION_KEYS', () => {
  it('matches the keys a real export files each section under', () => {
    const file = exportAll(populated(), T0) as unknown as Record<string, unknown>
    for (const section of BACKUP_SECTIONS) {
      expect(Object.hasOwn(file, SECTION_KEYS[section])).toBe(true)
    }
  })

  it('labels every section', () => {
    for (const section of BACKUP_SECTIONS) expect(sectionLabel(t, section)).toBeTruthy()
  })
})

describe('previewBackup', () => {
  it('lists every section of a real export and its date', () => {
    const preview = previewBackup(JSON.stringify(exportAll(populated(), T0)))
    expect(preview.sections).toEqual([...BACKUP_SECTIONS])
    expect(preview.exported?.getTime()).toBe(T0)
  })

  it('finds nothing in {}, an array, or text that is not JSON', () => {
    for (const text of ['{}', '[]', 'not json', 'null', '42']) {
      expect(previewBackup(text)).toEqual({ sections: [], exported: null })
    }
  })

  it('ignores an unreadable export date', () => {
    const preview = previewBackup(JSON.stringify({ [SECTION_KEYS.settings]: {}, exported: 'soon' }))
    expect(preview.sections).toEqual(['settings'])
    expect(preview.exported).toBeNull()
  })
})

describe('importSummary', () => {
  const none = { restored: [], rejected: [], unsaved: [], recognised: true }

  it('never calls a section restored when the browser would not save it', () => {
    const result = { ...none, unsaved: ['stats' as const] }
    expect(sectionOutcomes(result).stats).toBe('unsaved')
    expect(importSummary(t, result)).toBe(
      'Nothing restored. Could not save stats in this browser, so what was here is unchanged.',
    )
    expect(importSummary(t, result)).not.toMatch(/The {2}|Restored/)
  })

  it('names saved, rejected and unsaved sections apart', () => {
    const result = {
      ...none,
      restored: ['progress' as const],
      rejected: ['daily' as const],
      unsaved: ['settings' as const, 'stats' as const],
    }
    expect(sectionOutcomes(result)).toEqual({
      progress: 'restored',
      settings: 'unsaved',
      stats: 'unsaved',
      daily: 'rejected',
    })
    expect(importSummary(t, result)).toBe(
      'Restored learning progress. Rejected daily results: incomplete or from a newer version, so the copy in this browser was kept. Could not save settings and stats in this browser, so what was here is unchanged.',
    )
  })

  it('does not claim nothing changed when a rejection sits beside a failed save', () => {
    const result = { ...none, rejected: ['daily' as const], unsaved: ['stats' as const] }
    expect(importSummary(t, result)).toBe(
      'Nothing restored. The daily results in this file did not pass validation. Could not save stats in this browser, so what was here is unchanged.',
    )
  })

  it('reports nothing restored for {}', () => {
    const result = importAll('{}', createBackupStores(createMemoryDriver()))
    expect(result.restored).toEqual([])
    expect(importSummary(t, result)).toMatch(
      /^Nothing restored\. This file is not a MorseForge backup/,
    )
    expect(Object.values(sectionOutcomes(result))).toEqual(['absent', 'absent', 'absent', 'absent'])
  })

  it('names every restored section after a full round trip', () => {
    const text = JSON.stringify(exportAll(populated(), T0))
    const result = importAll(text, createBackupStores(createMemoryDriver()), T0)
    expect(importSummary(t, result)).toBe(
      'Restored learning progress, settings, stats and daily results.',
    )
    expect(Object.values(sectionOutcomes(result))).toEqual([
      'restored',
      'restored',
      'restored',
      'restored',
    ])
  })

  it('names the rejected section and says it was left alone', () => {
    const file = exportAll(populated(), T0) as unknown as Record<string, unknown>
    const text = JSON.stringify({ ...file, [SECTION_KEYS.stats]: { xp: 500 } })
    const target = createBackupStores(createMemoryDriver())
    const before = target.stats.read()
    const result = importAll(text, target, T0)

    expect(target.stats.read()).toEqual(before)
    expect(sectionOutcomes(result).stats).toBe('rejected')
    expect(importSummary(t, result)).toMatch(
      /Rejected stats: .* the copy in this browser was kept\.$/,
    )
  })

  it('says nothing was restored when every present section is rejected', () => {
    const text = JSON.stringify({ [SECTION_KEYS.progress]: { characters: 'no' } })
    const result = importAll(text, createBackupStores(createMemoryDriver()))
    expect(result.recognised).toBe(true)
    expect(importSummary(t, result)).toMatch(
      /^Nothing restored\. The learning progress in this file/,
    )
    expect(sectionOutcomes(result)).toEqual({
      progress: 'rejected',
      settings: 'absent',
      stats: 'absent',
      daily: 'absent',
    })
  })
})

describe('takeInventory and resetConsequence', () => {
  it('counts what is stored', () => {
    const stores = populated()
    const inventory = takeInventory(
      stores.progress.read(),
      stores.stats.read(),
      stores.daily.read(),
      T0,
    )
    expect(inventory).toEqual({
      characters: 2,
      xp: 1240,
      level: levelFromXp(1240),
      streak: 5,
      sessions: 9,
      dailies: 1,
    })
    expect(isEmptyInventory(inventory)).toBe(false)
    expect(resetConsequence(t, inventory)).toBe(
      `This erases history for 2 characters, level ${levelFromXp(1240)} and 1,240 XP, a 5-day streak and 1 daily result, and every setting except the anonymous usage counts goes back to its default. There is no other copy, so it cannot be undone.`,
    )
  })

  it('says only the settings change on a fresh profile', () => {
    const inventory = takeInventory(emptyProgress(), defaultStats(), emptyDaily(), T0)
    expect(isEmptyInventory(inventory)).toBe(true)
    expect(resetConsequence(t, inventory)).toMatch(/^There is no progress stored yet/)
  })
})

describe('backupFileName', () => {
  it('dates the file in local time', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('morseforge-backup-2026-01-05.json')
  })
})

describe('isAppleMobile', () => {
  it('spots iPhone and iPadOS but not a Mac', () => {
    expect(
      isAppleMobile('Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)', 'iPhone', 5),
    ).toBe(true)
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 5)).toBe(
      true,
    )
    expect(isAppleMobile('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)', 'MacIntel', 0)).toBe(
      false,
    )
    expect(isAppleMobile('Mozilla/5.0 (Linux; Android 15)', 'Linux armv8l', 5)).toBe(false)
  })
})
