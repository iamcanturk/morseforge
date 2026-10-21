import { describe, expect, it } from 'vitest'
import { BACKUP_FORMAT, createBackupStores, exportAll, importAll, resetAll } from './backup'
import { DAILY_KEY, emptyDaily, recordDaily } from './daily'
import { PROGRESS_KEY, answer, emptyProgress, setMethod } from './progress'
import { SETTINGS_KEY, defaultSettings } from './settings'
import { STATS_KEY, awardFirstSignal, defaultStats } from './stats'
import { type StorageDriver, createMemoryDriver } from './store'
import { MAX_XP, dayKey, levelFromXp } from '../game/progression'

const T0 = Date.UTC(2026, 7, 22, 12)

/** A profile with something real in every store. */
function populated() {
  const stores = createBackupStores(createMemoryDriver())
  stores.progress.write(answer(setMethod(emptyProgress(), 'koch'), 'K', 'listening', true, T0))
  const settings = defaultSettings()
  stores.settings.write({ ...settings, timing: { ...settings.timing, wpm: 25 } })
  stores.stats.write({ ...awardFirstSignal(defaultStats(), T0), sessions: 12 })
  stores.daily.write(
    recordDaily(emptyDaily(), { date: '2026-08-22', accuracy: 0.9, score: 300, passed: true }),
  )
  return stores
}

/** A complete stats section, as any real export contains. */
const wholeStats = (patch: Record<string, unknown>) => ({ ...defaultStats(), ...patch })

/** What a store holds, compared as plain data. */
const contents = (stores: ReturnType<typeof createBackupStores>) => ({
  progress: stores.progress.read(),
  settings: stores.settings.read(),
  stats: stores.stats.read(),
  daily: stores.daily.read(),
})

describe('exportAll', () => {
  it('covers all four stores, with versions', () => {
    const file = exportAll(populated(), T0)
    expect(file.app).toBe('morseforge')
    expect(file.format).toBe(BACKUP_FORMAT)
    expect(file.exported).toBe(new Date(T0).toISOString())
    expect(Object.keys(file.versions).sort()).toEqual(['daily', 'progress', 'settings', 'stats'])
    expect(file[PROGRESS_KEY].method).toBe('koch')
    expect(file[SETTINGS_KEY].timing.wpm).toBe(25)
    expect(file[STATS_KEY].sessions).toBe(12)
    expect(file[DAILY_KEY].results).toHaveLength(1)
  })
})

describe('importAll', () => {
  it('round-trips every store through JSON text', () => {
    const source = populated()
    const text = JSON.stringify(exportAll(source, T0))

    const target = createBackupStores(createMemoryDriver())
    const result = importAll(text, target)

    expect(result.restored.sort()).toEqual(['daily', 'progress', 'settings', 'stats'])
    expect(result.rejected).toEqual([])
    expect(result.recognised).toBe(true)
    expect(contents(target).stats).toEqual(contents(source).stats)
    expect(contents(target).daily).toEqual(contents(source).daily)
    expect(contents(target).settings).toEqual(contents(source).settings)
    expect(contents(target).progress.method).toBe('koch')
    expect(contents(target).progress.characters['K']?.skills.listening.correct).toBe(1)
  })

  it('restores nothing from {} and leaves every store alone', () => {
    const stores = populated()
    const before = contents(stores)
    expect(importAll({}, stores)).toEqual({
      restored: [],
      rejected: [],
      unsaved: [],
      recognised: false,
    })
    expect(contents(stores)).toEqual(before)
  })

  it('restores nothing from input that is not a backup at all', () => {
    const stores = populated()
    const before = contents(stores)
    for (const input of ['not json', '[]', 'null', 42, null, [1, 2]]) {
      const result = importAll(input, stores)
      expect(result.restored, String(input)).toEqual([])
      expect(result.recognised).toBe(false)
    }
    expect(contents(stores)).toEqual(before)
  })

  it('rejects an invalid section instead of writing a default over it', () => {
    // The old import ran this through validateOrDefault and wrote the result,
    // replacing real progress with an empty record and reporting success.
    const stores = populated()
    const before = contents(stores)
    const result = importAll(
      {
        [PROGRESS_KEY]: 'garbage',
        [STATS_KEY]: { nothing: 'known' },
        [DAILY_KEY]: [1, 2, 3],
        [SETTINGS_KEY]: {},
      },
      stores,
    )
    expect(result.restored).toEqual([])
    expect(result.rejected.sort()).toEqual(['daily', 'progress', 'settings', 'stats'])
    expect(contents(stores)).toEqual(before)
  })

  it('restores the good sections of a file with one bad one', () => {
    const stores = populated()
    const progressBefore = stores.progress.read()
    const result = importAll({ [PROGRESS_KEY]: 7, [STATS_KEY]: wholeStats({ xp: 500 }) }, stores)

    expect(result).toEqual({
      restored: ['stats'],
      rejected: ['progress'],
      unsaved: [],
      recognised: true,
    })
    expect(stores.stats.read().xp).toBe(500)
    expect(stores.progress.read()).toBe(progressBefore)
  })

  describe('rejects a partial section instead of merging or defaulting it', () => {
    // Each of these once came back "restored" with the gaps filled by
    // defaults: empty characters, an empty history, and stats reset to zero
    // with the first-signal award unpaid and so payable again.
    const cases: Array<[string, Record<string, unknown>, 'progress' | 'daily' | 'stats']> = [
      ['progress with only a method', { [PROGRESS_KEY]: { method: 'signal' } }, 'progress'],
      [
        'progress with a wrong-typed method',
        { [PROGRESS_KEY]: { characters: {}, method: 7 } },
        'progress',
      ],
      ['daily whose results are not a list', { [DAILY_KEY]: { results: 'oops' } }, 'daily'],
      ['daily with a malformed entry', { [DAILY_KEY]: { results: [{ date: 'x' }] } }, 'daily'],
      ['stats with only xp', { [STATS_KEY]: { xp: 500 } }, 'stats'],
      ['stats with xp as a string', { [STATS_KEY]: wholeStats({ xp: '5000' }) }, 'stats'],
      ['stats without a streak', { [STATS_KEY]: wholeStats({ streak: null }) }, 'stats'],
    ]

    for (const [name, file, section] of cases) {
      it(name, () => {
        const stores = populated()
        const before = JSON.stringify(contents(stores))
        const result = importAll(file, stores)
        expect(result.rejected).toEqual([section])
        expect(result.restored).toEqual([])
        expect(JSON.stringify(contents(stores))).toBe(before)
      })
    }

    it('settings without its groups', () => {
      const stores = populated()
      const before = stores.settings.read()
      expect(importAll({ [SETTINGS_KEY]: { motion: 'reduce' } }, stores).rejected).toEqual([
        'settings',
      ])
      expect(stores.settings.read()).toBe(before)
    })
  })

  it('caps an absurd XP so the level maths stays finite', () => {
    // 1e40 XP once froze /stats/ in a level calculation that never ended.
    const stores = createBackupStores(createMemoryDriver())
    expect(importAll({ [STATS_KEY]: wholeStats({ xp: 1e40 }) }, stores).restored).toEqual(['stats'])
    expect(stores.stats.read().xp).toBe(MAX_XP)
    expect(levelFromXp(stores.stats.read().xp)).toBeGreaterThan(1)
  })

  it('settles an imported streak day in the future to today, keeping the streak', () => {
    // recordActivity waits out a later last day, so an import claiming 2099
    // would freeze the streak for good. Dropping the day would lose it instead.
    const stores = createBackupStores(createMemoryDriver())
    const streak = { current: 5, longest: 9, lastActiveDay: '2099-01-01' }
    importAll({ [STATS_KEY]: wholeStats({ streak }) }, stores, T0)
    expect(stores.stats.read().streak).toEqual({
      current: 5,
      longest: 9,
      lastActiveDay: dayKey(T0),
    })
  })

  it('rejects a character entry that is not a record', () => {
    const stores = populated()
    const before = stores.progress.read()
    const result = importAll({ [PROGRESS_KEY]: { characters: { E: 'garbage' } } }, stores)
    expect(result.rejected).toEqual(['progress'])
    expect(stores.progress.read()).toBe(before)
  })

  it('rejects settings groups that hold no known setting', () => {
    const stores = populated()
    const before = stores.settings.read()
    const result = importAll({ [SETTINGS_KEY]: { audio: {}, timing: {}, keys: {} } }, stores)
    expect(result.rejected).toEqual(['settings'])
    expect(stores.settings.read()).toBe(before)
  })

  it('leaves a missing section alone rather than resetting it', () => {
    const stores = populated()
    const dailyBefore = stores.daily.read()
    importAll({ [STATS_KEY]: wholeStats({ xp: 1 }) }, stores)
    expect(stores.daily.read()).toBe(dailyBefore)
  })

  it('accepts the old progress-and-settings export', () => {
    // Exactly the shape the first Settings screen downloaded.
    const old = {
      exported: '2026-05-01T10:00:00.000Z',
      app: 'morseforge',
      [PROGRESS_KEY]: { characters: {}, method: 'alphabetical', unlocked: 3 },
      [SETTINGS_KEY]: { ...defaultSettings(), counters: false },
    }
    const stores = populated()
    const statsBefore = stores.stats.read()

    const result = importAll(JSON.stringify(old), stores)
    expect(result.restored.sort()).toEqual(['progress', 'settings'])
    expect(result.rejected).toEqual([])
    expect(stores.progress.read().method).toBe('alphabetical')
    expect(stores.settings.read().counters).toBe(false)
    // Stats were not in the old file, so they are not touched.
    expect(stores.stats.read()).toBe(statsBefore)
  })

  it('rejects a section from a newer schema than this build knows', () => {
    const stores = populated()
    const file = { versions: { stats: 999 }, [STATS_KEY]: wholeStats({ xp: 1 }) }
    expect(importAll(file, stores).rejected).toEqual(['stats'])
    expect(stores.stats.read().sessions).toBe(12)
  })

  it('still clamps hand-edited numbers on the way in', () => {
    const stores = createBackupStores(createMemoryDriver())
    importAll({ [STATS_KEY]: wholeStats({ totalAnswers: 3, totalCorrect: 900 }) }, stores)
    expect(stores.stats.read().totalCorrect).toBe(3)
  })
})

describe('resetAll', () => {
  it('clears all four stores back to their defaults', () => {
    const stores = populated()
    resetAll(stores)

    expect(stores.progress.read()).toEqual(emptyProgress())
    expect(stores.settings.read()).toEqual(defaultSettings())
    expect(stores.stats.read()).toEqual(defaultStats())
    expect(stores.daily.read()).toEqual(emptyDaily())
  })

  it('removes the records from storage, not just from the cache', () => {
    const driver = createMemoryDriver()
    const stores = createBackupStores(driver)
    stores.stats.write({ ...defaultStats(), xp: 70 })
    stores.daily.write(
      recordDaily(emptyDaily(), { date: '2026-08-22', accuracy: 1, score: 1, passed: true }),
    )
    resetAll(stores)

    for (const key of [PROGRESS_KEY, SETTINGS_KEY, STATS_KEY, DAILY_KEY]) {
      expect(driver.getItem(key), key).toBeNull()
    }
  })
})

describe('importAll, when a write does not land', () => {
  const file = () => exportAll(populated(), T0)

  it('reports a section whose write threw as unsaved, never as restored', () => {
    const backing = new Map<string, string>()
    // Real writes for everything but stats, so the other sections still land.
    const full: StorageDriver = {
      ...createMemoryDriver(backing),
      setItem: (key, value) => {
        if (key === STATS_KEY) throw new DOMException('QuotaExceededError')
        backing.set(key, value)
      },
    }
    const stores = createBackupStores(full)
    const result = importAll(file(), stores, T0)

    expect(result.unsaved).toEqual(['stats'])
    expect(result.restored).not.toContain('stats')
    expect(result.restored.sort()).toEqual(['daily', 'progress', 'settings'])
    // The screens show what is really stored, not the restore that failed.
    expect(stores.stats.read()).toEqual(defaultStats())
  })

  it('reports a section over a newer-build record as unsaved and leaves that record alone', () => {
    const driver = createMemoryDriver()
    const future = JSON.stringify({ version: 99, data: { xp: 5 } })
    driver.setItem(STATS_KEY, future)
    const stores = createBackupStores(driver)

    const result = importAll(file(), stores, T0)
    expect(result.unsaved).toEqual(['stats'])
    expect(driver.getItem(STATS_KEY)).toBe(future)
  })
})

describe('resetAll and the counters choice', () => {
  it('keeps counters switched off, so erasing data never turns them back on', () => {
    const driver = createMemoryDriver()
    const stores = createBackupStores(driver)
    stores.settings.write({ ...defaultSettings(), counters: false, motion: 'reduce' })

    resetAll(stores)
    expect(stores.settings.read()).toEqual({ ...defaultSettings(), counters: false })
    // Kept in storage too, so it survives the reload after the reset.
    expect(JSON.parse(driver.getItem(SETTINGS_KEY)!).data.counters).toBe(false)
  })

  it('writes nothing for a counters choice that is already the default', () => {
    const driver = createMemoryDriver()
    const stores = createBackupStores(driver)
    stores.settings.write({ ...defaultSettings(), motion: 'reduce' })
    resetAll(stores)
    expect(driver.getItem(SETTINGS_KEY)).toBeNull()
  })
})
