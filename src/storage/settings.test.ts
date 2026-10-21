import { describe, expect, it } from 'vitest'
import { createBackupStores, exportAll, importAll } from './backup'
import {
  SETTINGS_KEY,
  SETTINGS_VERSION,
  KEYER_LABELS,
  SIGNAL_LABELS,
  SIGNAL_MODES,
  type SettingsRecord,
  type SignalMode,
  createSettingsStore,
  defaultSettings,
  hasLamp,
  hasSound,
  withSignal,
} from './settings'
import { createMemoryDriver } from './store'
import { DEFAULT_KEY_BINDINGS, KEYER_KINDS } from '../engine/keyEngine'

/** A store over a driver that already holds `data`, as an older build left it. */
function storeHolding(data: unknown) {
  const driver = createMemoryDriver()
  driver.setItem(SETTINGS_KEY, JSON.stringify({ version: SETTINGS_VERSION, data }))
  return createSettingsStore(driver)
}

/**
 * The record exactly as it was stored before the Signal setting existed,
 * which was also before the key type and the paddle keys.
 */
function legacyRecord(enabled: boolean): Record<string, unknown> {
  const { signal: _signal, keyer: _keyer, ...rest } = defaultSettings()
  const { dit: _dit, dah: _dah, ...keys } = rest.keys
  return { ...rest, keys, audio: { ...rest.audio, enabled } }
}

describe('Signal setting', () => {
  it('names every mode once, in the order the settings control shows them', () => {
    expect(SIGNAL_MODES).toEqual(['sound', 'lamp', 'both'])
    expect(Object.keys(SIGNAL_LABELS)).toEqual([...SIGNAL_MODES])
    expect(SIGNAL_LABELS).toEqual({ sound: 'Sound', lamp: 'Lamp', both: 'Both' })
  })

  it('defaults to sound, with the tone on', () => {
    const settings = defaultSettings()
    expect(settings.signal).toBe('sound')
    expect(settings.audio.enabled).toBe(true)
  })

  it('reads the default it would store', () => {
    expect(createSettingsStore(createMemoryDriver()).read()).toEqual(defaultSettings())
  })

  it('says what each mode does', () => {
    const table = SIGNAL_MODES.map((signal) => [signal, hasSound({ signal }), hasLamp({ signal })])
    expect(table).toEqual([
      ['sound', true, false],
      ['lamp', false, true],
      ['both', true, true],
    ])
  })

  it('changes signal and the sound switch together', () => {
    for (const signal of SIGNAL_MODES) {
      const next = withSignal(defaultSettings(), signal)
      expect(next.signal).toBe(signal)
      expect(next.audio.enabled).toBe(signal !== 'lamp')
    }
  })

  it('leaves every other setting alone when it changes the signal', () => {
    const before: SettingsRecord = {
      ...defaultSettings(),
      audio: { ...defaultSettings().audio, frequency: 750, volume: 0.4, uiSounds: false },
      motion: 'reduce',
      counters: false,
    }
    const after = withSignal(before, 'lamp')
    expect({ ...after, signal: before.signal, audio: { ...after.audio, enabled: true } }).toEqual(
      before,
    )
    // A copy: the record in the store's cache is never mutated.
    expect(before.signal).toBe('sound')
    expect(before.audio.enabled).toBe(true)
  })
})

describe('Signal migration from the old sound switch', () => {
  it('turns a record with sound off into the lamp, not silence', () => {
    const settings = storeHolding(legacyRecord(false)).read()
    expect(settings.signal).toBe('lamp')
    expect(settings.audio.enabled).toBe(false)
  })

  it('keeps a record with sound on as sound', () => {
    const settings = storeHolding(legacyRecord(true)).read()
    expect(settings.signal).toBe('sound')
    expect(settings.audio.enabled).toBe(true)
  })

  it('treats a record with no switch at all as sound', () => {
    const settings = storeHolding({ audio: {}, timing: {}, keys: {} }).read()
    expect(settings.signal).toBe('sound')
    expect(settings.audio.enabled).toBe(true)
  })

  it('loses nothing else the old record held', () => {
    const old = {
      ...legacyRecord(false),
      audio: { enabled: false, frequency: 720, volume: 0.35, uiSounds: false },
      timing: { ...defaultSettings().timing, wpm: 22, farnsworthWpm: 14 },
      keys: { key: 'KeyJ', alternative: 'KeyK', cancel: 'Escape', submit: 'Control' },
      motion: 'reduce',
      counters: false,
    }
    expect(storeHolding(old).read()).toEqual({
      ...old,
      signal: 'lamp',
      // The fields added since are filled with their defaults.
      keys: { ...old.keys, dit: DEFAULT_KEY_BINDINGS.dit, dah: DEFAULT_KEY_BINDINGS.dah },
      keyer: defaultSettings().keyer,
    })
  })

  it('lets a stored signal win over a switch that disagrees with it', () => {
    const cases: [SignalMode, boolean, boolean][] = [
      // [stored signal, stored switch, switch after reading]
      ['both', false, true],
      ['sound', false, true],
      ['lamp', true, false],
    ]
    for (const [signal, enabled, expected] of cases) {
      const settings = storeHolding({ ...legacyRecord(enabled), signal }).read()
      expect(settings.signal).toBe(signal)
      expect(settings.audio.enabled).toBe(expected)
    }
  })

  it('derives the signal from the switch when the stored one is garbage', () => {
    for (const garbage of ['loud', '', 7, null, true, { mode: 'lamp' }, ['lamp']]) {
      expect(storeHolding({ ...legacyRecord(false), signal: garbage }).read().signal).toBe('lamp')
      expect(storeHolding({ ...legacyRecord(true), signal: garbage }).read().signal).toBe('sound')
    }
  })

  it('reads a non-boolean switch as the default, which is sound', () => {
    const settings = storeHolding({ ...legacyRecord(true), audio: { enabled: 'no' } }).read()
    expect(settings.signal).toBe('sound')
    expect(settings.audio.enabled).toBe(true)
  })

  it('keeps the invariant for every stored combination', () => {
    const signals: unknown[] = [...SIGNAL_MODES, undefined, 'garbage']
    for (const signal of signals) {
      for (const enabled of [true, false, undefined]) {
        const audio = enabled === undefined ? {} : { enabled }
        const settings = storeHolding({ ...legacyRecord(true), audio, signal }).read()
        expect(settings.audio.enabled).toBe(settings.signal !== 'lamp')
      }
    }
  })

  it('persists what withSignal wrote, in this tab and in the next', () => {
    const driver = createMemoryDriver()
    const store = createSettingsStore(driver)
    store.update((current) => withSignal(current, 'both'))
    expect(store.read().signal).toBe('both')

    // Another tab, or the next visit: a fresh store parses the stored string.
    const raw = driver.getItem(SETTINGS_KEY)
    const next = createSettingsStore(createMemoryDriver(new Map([[SETTINGS_KEY, raw ?? '']])))
    expect(next.read().signal).toBe('both')
    expect(next.read().audio.enabled).toBe(true)
  })
})

describe('Signal in a backup', () => {
  it('round-trips through export and import', () => {
    for (const signal of SIGNAL_MODES) {
      const source = createBackupStores(createMemoryDriver())
      source.settings.update((current) => withSignal(current, signal))
      const target = createBackupStores(createMemoryDriver())
      const result = importAll(JSON.stringify(exportAll(source)), target)
      expect(result.restored).toContain('settings')
      expect(target.settings.read()).toEqual(source.settings.read())
      expect(target.settings.read().signal).toBe(signal)
    }
  })

  it('imports an export made before the Signal setting, sound off becoming the lamp', () => {
    const target = createBackupStores(createMemoryDriver())
    const result = importAll({ [SETTINGS_KEY]: legacyRecord(false) }, target)
    expect(result.restored).toEqual(['settings'])
    expect(target.settings.read().signal).toBe('lamp')
    expect(target.settings.read().audio.enabled).toBe(false)
  })
})

describe('Key type and paddles (issue #43)', () => {
  it('names every key type once, in the order the settings control shows them', () => {
    expect(Object.keys(KEYER_LABELS)).toEqual([...KEYER_KINDS])
    expect(KEYER_LABELS).toEqual({ straight: 'Straight', iambicA: 'Iambic A', iambicB: 'Iambic B' })
  })

  it('defaults to the straight key, paddles unswapped, on [ and ]', () => {
    const settings = defaultSettings()
    expect(settings.keyer).toEqual({ type: 'straight', swapPaddles: false })
    expect(settings.keys.dit).toBe('[')
    expect(settings.keys.dah).toBe(']')
  })

  it('reads a record from before the key type as the straight key it always was', () => {
    const settings = storeHolding(legacyRecord(true)).read()
    expect(settings.keyer).toEqual({ type: 'straight', swapPaddles: false })
    expect(settings.keys).toEqual(DEFAULT_KEY_BINDINGS)
  })

  it("keeps an old record's own keys when it fills in the paddle keys", () => {
    const old = {
      ...legacyRecord(true),
      keys: { key: 'k', alternative: 'l', cancel: 'q', submit: 'Enter' },
    }
    expect(storeHolding(old).read().keys).toEqual({ ...old.keys, dit: '[', dah: ']' })
  })

  it('keeps every valid key type and swap, and stored paddle keys', () => {
    for (const type of KEYER_KINDS) {
      for (const swapPaddles of [true, false]) {
        const settings = storeHolding({
          ...defaultSettings(),
          keyer: { type, swapPaddles },
          keys: { ...DEFAULT_KEY_BINDINGS, dit: 'z', dah: 'x' },
        }).read()
        expect(settings.keyer).toEqual({ type, swapPaddles })
        expect(settings.keys.dit).toBe('z')
        expect(settings.keys.dah).toBe('x')
      }
    }
  })

  it('falls back field by field on garbage, never dropping the rest of the record', () => {
    const garbage: unknown[] = ['iambic', 'Straight', 7, null, 'yes', ['iambicA'], { type: 'x' }]
    for (const value of garbage) {
      const settings = storeHolding({
        ...defaultSettings(),
        counters: false,
        keyer: { type: value, swapPaddles: value },
        // Any string is a key name, as for the other bindings; anything else is not.
        keys: {
          ...DEFAULT_KEY_BINDINGS,
          ...(typeof value === 'string' ? {} : { dit: value, dah: value }),
        },
      }).read()
      expect(settings.keyer).toEqual({ type: 'straight', swapPaddles: false })
      expect(settings.keys.dit).toBe('[')
      expect(settings.keys.dah).toBe(']')
      expect(settings.counters).toBe(false)
    }
    for (const keyer of ['iambicA', 3, null, []]) {
      expect(storeHolding({ ...defaultSettings(), keyer }).read().keyer.type).toBe('straight')
    }
  })

  it('round-trips through export and import, and imports an older export', () => {
    const source = createBackupStores(createMemoryDriver())
    source.settings.update((current) => ({
      ...current,
      keyer: { type: 'iambicB', swapPaddles: true },
    }))
    const target = createBackupStores(createMemoryDriver())
    importAll(JSON.stringify(exportAll(source)), target)
    expect(target.settings.read().keyer).toEqual({ type: 'iambicB', swapPaddles: true })

    const older = createBackupStores(createMemoryDriver())
    expect(importAll({ [SETTINGS_KEY]: legacyRecord(true) }, older).restored).toEqual(['settings'])
    expect(older.settings.read().keyer.type).toBe('straight')
  })
})
