/**
 * User settings (PROJECT.md §7, §9, §10, §27, §28).
 *
 * Every value here is something §27 says the user must be able to change. They
 * live in one record because the practice screens need timing and audio
 * together on every keystroke, and two stores would mean two reads.
 */

import { DEFAULT_AUDIO_SETTINGS } from '../engine/audioEngine'
import { DEFAULT_KEY_BINDINGS, type KeyBindings } from '../engine/keyEngine'
import {
  type Store,
  type StorageDriver,
  sharedStore,
  bool,
  isRecord,
  num,
  oneOf,
  str,
} from './store'

export const SETTINGS_KEY = 'morseforge_settings'
export const SETTINGS_VERSION = 1

/** PROJECT.md §7 difficulty tiers, offered as presets in the UI. */
export const WPM_PRESETS = {
  beginner: 8,
  normal: 15,
  advanced: 25,
  expert: 35,
} as const

export const FREQUENCY_PRESETS = [400, 500, 600, 700, 800] as const

/**
 * The speed range the playback sliders and the translator offer, in WPM.
 *
 * Deliberately narrower than `LIMITS.wpm`: that is what a stored value is
 * clamped to, while this is what the interface lets someone pick and what the
 * page copy quotes ("from 5 to 40 WPM"). Copy and sliders read this one
 * constant, so they cannot disagree.
 */
export const WPM_RANGE = { min: 5, max: 40 } as const

/** Bounds every setting is clamped to, on write and on read. */
export const LIMITS = {
  wpm: { min: 5, max: 60 },
  farnsworthWpm: { min: 3, max: 60 },
  frequency: { min: 300, max: 1000 },
  volume: { min: 0, max: 1 },
  dotDashThresholdMs: { min: 60, max: 600 },
  characterGapMs: { min: 120, max: 5000 },
  wordGapMs: { min: 300, max: 12_000 },
} as const

/**
 * How patient the decoder is while the user is keying.
 *
 * This is deliberately separate from WPM. How fast someone *sends* and how
 * long they need to *think* are unrelated: at 15 WPM a character ends after
 * 240ms of silence, which is right for a competent operator and hopeless for
 * a beginner, who means to send S and — three seconds of hesitation later —
 * has sent E E E. Nothing about that is a speed problem, so nothing about the
 * fix belongs in the speed setting.
 */
export const KEYER_PRESETS = {
  learning: { label: 'Learning', characterGapMs: 1600, wordGapMs: 3500, autoCommit: true },
  relaxed: { label: 'Relaxed', characterGapMs: 900, wordGapMs: 2200, autoCommit: true },
  standard: { label: 'Standard', characterGapMs: 240, wordGapMs: 560, autoCommit: true },
  manual: { label: 'Manual', characterGapMs: 1600, wordGapMs: 3500, autoCommit: false },
} as const

export type KeyerPreset = keyof typeof KEYER_PRESETS

/** Which preset the current values correspond to, or null if hand-tuned. */
export function matchKeyerPreset(timing: SettingsRecord['timing']): KeyerPreset | null {
  for (const [name, preset] of Object.entries(KEYER_PRESETS)) {
    if (
      preset.characterGapMs === timing.characterGapMs &&
      preset.wordGapMs === timing.wordGapMs &&
      preset.autoCommit === timing.autoCommit
    ) {
      return name as KeyerPreset
    }
  }
  return null
}

export type MotionPreference = 'system' | 'reduce' | 'full'

/**
 * How a listening signal reaches the learner (DEC-045).
 *
 * - `sound`: the CW tone only, as the site always did.
 * - `lamp`: a lamp flashes each element with the tone's exact timing, in
 *   silence. For deaf and hard-of-hearing learners, a library, a classroom, or
 *   anyone training to read signal lamps.
 * - `both`: tone and lamp together, from one timeline.
 *
 * Reading Morse by light is the same decoding task at the same speed, so a
 * lamp answer counts as the listening skill.
 */
export type SignalMode = 'sound' | 'lamp' | 'both'

export const SIGNAL_MODES = ['sound', 'lamp', 'both'] as const satisfies readonly SignalMode[]

export const SIGNAL_LABELS: Readonly<Record<SignalMode, string>> = {
  sound: 'Sound',
  lamp: 'Lamp',
  both: 'Both',
}

export interface SettingsRecord {
  audio: {
    /**
     * Whether tones are audible at all. Always equal to `signal !== 'lamp'`:
     * the validator derives it, and `withSignal` sets both together. The
     * readers that predate `signal` keep working; new code asks
     * `hasSound` / `hasLamp` instead.
     */
    enabled: boolean
    frequency: number
    volume: number
    /** Interface feedback beeps, separate from the CW sidetone (§27). */
    uiSounds: boolean
  }
  timing: {
    /** Character speed — how fast the dots and dashes themselves are sent. */
    wpm: number
    /** Effective speed. Equal to `wpm` means standard timing. */
    farnsworthWpm: number
    /** Hold longer than this and the key sends a dash (§9). */
    dotDashThresholdMs: number
    /** Silence this long ends the character being keyed. */
    characterGapMs: number
    /** Silence this long ends the word. */
    wordGapMs: number
    /** When false, the user ends each character explicitly instead. */
    autoCommit: boolean
  }
  keys: KeyBindings
  /**
   * `system` follows prefers-reduced-motion. The explicit overrides exist
   * because the OS setting is all-or-nothing, and someone may want the signal
   * pulses here while suppressing motion elsewhere — or the reverse.
   */
  motion: MotionPreference
  /**
   * Anonymous usage counters (PROJECT.md §22).
   *
   * Counts which parts of the site get used — a tally per screen, nothing more.
   * No identifier, no progress, no text anyone typed, nothing that could be
   * tied back to a person. Progress genuinely never leaves the device, which is
   * the promise on the front page, and this does not change that.
   *
   * On by default, off in one press, and never sent at all when the browser
   * asks not to be tracked.
   */
  counters: boolean
  /** How a listening signal reaches the learner (DEC-045). Default 'sound'. */
  signal: SignalMode
}

/** Tones are audible. The same truth as `audio.enabled`. */
export const hasSound = (settings: Pick<SettingsRecord, 'signal'>): boolean =>
  settings.signal !== 'lamp'

/** Listening prompts also flash a lamp, element by element. */
export const hasLamp = (settings: Pick<SettingsRecord, 'signal'>): boolean =>
  settings.signal !== 'sound'

/**
 * The only way to change the signal: sets `signal` and `audio.enabled`
 * together, so the invariant the validator keeps also holds in the cache
 * between a write and the next read.
 */
export function withSignal(settings: SettingsRecord, signal: SignalMode): SettingsRecord {
  return { ...settings, signal, audio: { ...settings.audio, enabled: signal !== 'lamp' } }
}

export function defaultSettings(): SettingsRecord {
  return {
    audio: {
      enabled: true,
      frequency: DEFAULT_AUDIO_SETTINGS.frequency,
      volume: DEFAULT_AUDIO_SETTINGS.volume,
      uiSounds: true,
    },
    timing: {
      wpm: WPM_PRESETS.normal,
      // Farnsworth on by default: a beginner sending at 15 WPM character speed
      // needs the gaps stretched or they never get time to recall a character.
      farnsworthWpm: WPM_PRESETS.beginner,
      dotDashThresholdMs: 200,
      // Defaults to the most forgiving preset. A first-time user who finds
      // their character committed before they finished it does not conclude
      // "I should adjust the timing" — they conclude the app is broken.
      characterGapMs: KEYER_PRESETS.learning.characterGapMs,
      wordGapMs: KEYER_PRESETS.learning.wordGapMs,
      autoCommit: KEYER_PRESETS.learning.autoCommit,
    },
    keys: { ...DEFAULT_KEY_BINDINGS },
    motion: 'system',
    counters: true,
    signal: 'sound',
  }
}

function validateSettings(value: unknown): SettingsRecord | null {
  if (!isRecord(value)) return null
  const fallback = defaultSettings()

  const audio = isRecord(value['audio']) ? value['audio'] : {}
  const timing = isRecord(value['timing']) ? value['timing'] : {}
  const keys = isRecord(value['keys']) ? value['keys'] : {}

  const wpm = num(timing['wpm'], fallback.timing.wpm, LIMITS.wpm.min, LIMITS.wpm.max)

  // A record from before the Signal setting only had the sound switch. Off
  // meant "I cannot or will not hear this", so it becomes the lamp rather
  // than silence. Once `signal` is stored it wins, and the switch is derived
  // from it: no version bump, because nothing a record held is lost.
  const legacyEnabled = bool(audio['enabled'], fallback.audio.enabled)
  const signal = oneOf(value['signal'], SIGNAL_MODES, legacyEnabled ? 'sound' : 'lamp')

  return {
    audio: {
      enabled: signal !== 'lamp',
      frequency: num(
        audio['frequency'],
        fallback.audio.frequency,
        LIMITS.frequency.min,
        LIMITS.frequency.max,
      ),
      volume: num(audio['volume'], fallback.audio.volume, LIMITS.volume.min, LIMITS.volume.max),
      uiSounds: bool(audio['uiSounds'], fallback.audio.uiSounds),
    },
    timing: {
      wpm,
      // Farnsworth above the character speed is meaningless — it would mean
      // "send the gaps faster than the characters". Clamp rather than reject,
      // so raising WPM in the UI never strands the record in an invalid state.
      farnsworthWpm: Math.min(
        num(
          timing['farnsworthWpm'],
          fallback.timing.farnsworthWpm,
          LIMITS.farnsworthWpm.min,
          LIMITS.farnsworthWpm.max,
        ),
        wpm,
      ),
      dotDashThresholdMs: num(
        timing['dotDashThresholdMs'],
        fallback.timing.dotDashThresholdMs,
        LIMITS.dotDashThresholdMs.min,
        LIMITS.dotDashThresholdMs.max,
      ),
      characterGapMs: num(
        timing['characterGapMs'],
        fallback.timing.characterGapMs,
        LIMITS.characterGapMs.min,
        LIMITS.characterGapMs.max,
      ),
      // A word gap at or below the character gap would end every word the
      // instant it ended a character, so the text would be all single letters.
      wordGapMs: Math.max(
        num(
          timing['wordGapMs'],
          fallback.timing.wordGapMs,
          LIMITS.wordGapMs.min,
          LIMITS.wordGapMs.max,
        ),
        num(timing['characterGapMs'], fallback.timing.characterGapMs) * 1.5,
      ),
      autoCommit: bool(timing['autoCommit'], fallback.timing.autoCommit),
    },
    keys: {
      key: str(keys['key'], fallback.keys.key),
      alternative: str(keys['alternative'], fallback.keys.alternative ?? 'Enter'),
      cancel: str(keys['cancel'], fallback.keys.cancel ?? 'Escape'),
      submit: str(keys['submit'], fallback.keys.submit ?? 'Control'),
    },
    motion: oneOf(value['motion'], ['system', 'reduce', 'full'] as const, fallback.motion),
    counters: bool(value['counters'], fallback.counters),
    signal,
  }
}

export function createSettingsStore(driver?: StorageDriver): Store<SettingsRecord> {
  return sharedStore<SettingsRecord>(
    {
      key: SETTINGS_KEY,
      version: SETTINGS_VERSION,
      validate: validateSettings,
      createDefault: defaultSettings,
    },
    driver,
  )
}

/** Timing options in the shape the engines expect. */
export function timingOptions(settings: SettingsRecord) {
  return {
    wpm: settings.timing.wpm,
    farnsworthWpm: settings.timing.farnsworthWpm,
  }
}

/** Audio options in the shape `AudioEngine` expects, honouring the mute switch. */
export function audioOptions(settings: SettingsRecord) {
  return {
    frequency: settings.audio.frequency,
    volume: settings.audio.enabled ? settings.audio.volume : 0,
  }
}
