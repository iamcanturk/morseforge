/**
 * User settings (PROJECT.md §7, §9, §10, §27, §28).
 *
 * Every value here is something §27 says the user must be able to change. They
 * live in one record because the practice screens need timing and audio
 * together on every keystroke, and two stores would mean two reads.
 */

import { DEFAULT_AUDIO_SETTINGS } from '../engine/audioEngine'
import { DEFAULT_KEY_BINDINGS, type KeyBindings } from '../engine/keyEngine'
import { Store, type StorageDriver, bool, isRecord, num, oneOf, str } from './store'

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

export interface SettingsRecord {
  audio: {
    /** Master switch. Off means the app is fully usable in silence (§28). */
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
  }
}

function validateSettings(value: unknown): SettingsRecord | null {
  if (!isRecord(value)) return null
  const fallback = defaultSettings()

  const audio = isRecord(value['audio']) ? value['audio'] : {}
  const timing = isRecord(value['timing']) ? value['timing'] : {}
  const keys = isRecord(value['keys']) ? value['keys'] : {}

  const wpm = num(timing['wpm'], fallback.timing.wpm, LIMITS.wpm.min, LIMITS.wpm.max)

  return {
    audio: {
      enabled: bool(audio['enabled'], fallback.audio.enabled),
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
  }
}

export function createSettingsStore(driver?: StorageDriver): Store<SettingsRecord> {
  return new Store<SettingsRecord>(
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
