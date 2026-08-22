import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Choice, KeyCapture, Row, Slider, Toggle } from './controls'
import { AudioEngine } from '../../engine/audioEngine'
import {
  FREQUENCY_PRESETS,
  KEYER_PRESETS,
  LIMITS,
  type KeyerPreset,
  type SettingsRecord,
  WPM_PRESETS,
  createSettingsStore,
  defaultSettings,
  matchKeyerPreset,
} from '../../storage/settings'
import {
  PROGRESS_KEY,
  createProgressStore,
  emptyProgress,
  setMethod,
  type ProgressRecord,
} from '../../storage/progress'
import { MethodPicker } from '../Practice/MethodPicker'
import type { MethodId } from '../../data/methods'
import { SETTINGS_KEY } from '../../storage/settings'

/**
 * Settings (PROJECT.md §10, §22, §27, §28).
 *
 * Every change writes immediately — there is no Save button, because there is
 * no server to fail and nothing to lose by applying it. Audio changes preview
 * themselves as you drag, since "600 Hz" means nothing until you hear it.
 */
export function SettingsScreen() {
  const store = useMemo(() => createSettingsStore(), [])
  const progressStore = useMemo(() => createProgressStore(), [])

  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)
  const [notice, setNotice] = useState<string | null>(null)
  const audio = useRef<AudioEngine | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    setSettings(store.read())
    return store.subscribe(setSettings)
  }, [store])

  useEffect(() => {
    setProgress(progressStore.read())
    return progressStore.subscribe(setProgress)
  }, [progressStore])

  useEffect(
    () => () => {
      if (previewTimer.current) clearTimeout(previewTimer.current)
      void audio.current?.dispose()
    },
    [],
  )

  const update = useCallback(
    (patch: (current: SettingsRecord) => SettingsRecord) => {
      store.update(patch)
    },
    [store],
  )

  /**
   * Play a short tone so a frequency or volume change is audible.
   *
   * Debounced, or dragging a slider fires a tone per pixel and the result is a
   * siren rather than a preview.
   */
  const preview = useCallback((frequency: number, volume: number) => {
    if (previewTimer.current) clearTimeout(previewTimer.current)
    previewTimer.current = setTimeout(() => {
      audio.current ??= new AudioEngine()
      audio.current.update({ frequency, volume })
      void audio.current.play('.', { wpm: 8 })
    }, 180)
  }, [])

  const flash = useCallback((message: string) => {
    setNotice(message)
    setTimeout(() => setNotice(null), 2600)
  }, [])

  /** PROJECT.md §22 — everything the user has, in one file they own. */
  const exportProgress = useCallback(() => {
    const payload = {
      exported: new Date().toISOString(),
      app: 'morseforge',
      [PROGRESS_KEY]: progressStore.read(),
      [SETTINGS_KEY]: store.read(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'morseforge-progress.json'
    link.click()
    URL.revokeObjectURL(url)
    flash('Downloaded morseforge-progress.json')
  }, [progressStore, store, flash])

  const importProgress = useCallback(
    async (file: File) => {
      try {
        const parsed: unknown = JSON.parse(await file.text())
        if (typeof parsed !== 'object' || parsed === null) throw new Error('not an object')
        const record = parsed as Record<string, unknown>

        // Written through the stores rather than into localStorage directly, so
        // the same validation that guards a normal read guards an import. A
        // hand-edited file cannot smuggle past it.
        if (record[PROGRESS_KEY]) {
          progressStore.write(progressStore.validateOrDefault(record[PROGRESS_KEY]))
        }
        if (record[SETTINGS_KEY]) {
          store.write(store.validateOrDefault(record[SETTINGS_KEY]))
        }
        flash('Progress restored')
      } catch {
        flash('That file could not be read as MorseForge progress')
      }
    },
    [progressStore, store, flash],
  )

  const reset = useCallback(() => {
    // A confirm() is crude, but this is genuinely unrecoverable — there is no
    // server copy to restore from.
    if (!window.confirm('Erase all progress and settings? This cannot be undone.')) return
    progressStore.clear()
    store.clear()
    flash('Everything reset')
  }, [progressStore, store, flash])

  const { audio: audioSettings, timing, keys, motion } = settings
  const activePreset = matchKeyerPreset(timing)

  return (
    <div className="space-y-12">
      {/* Always mounted, empty until there is something to say. A live region
          created at the same moment as its content is usually not registered
          in time, and the announcement is dropped — which is every message
          this screen has: imported, reset, or failed to read. */}
      <p
        role="status"
        className={
          notice
            ? 'rounded-lg border border-signal/40 bg-panel px-4 py-3 font-mono text-xs tracking-[0.12em] text-signal'
            : 'sr-only'
        }
      >
        {notice ?? ''}
      </p>

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight">How you learn</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Which order characters are introduced in. The same picker is on the practice screen — this
          is here because it is a preference you set once, not a per-session choice.
        </p>
        <div className="mt-5">
          <MethodPicker
            method={progress.method}
            unlocked={progress.unlocked}
            onChange={(next: MethodId) =>
              progressStore.update((current) => setMethod(current, next))
            }
          />
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight">Sound</h2>
        <div className="mt-2">
          <Row label="Sound" hint="Everything here works in silence if you turn this off.">
            <Toggle
              checked={audioSettings.enabled}
              label="Sound on"
              onChange={(enabled) => update((c) => ({ ...c, audio: { ...c.audio, enabled } }))}
            />
          </Row>

          <Row
            label="Tone"
            hint="The pitch of the CW sidetone. Pick whatever sits most clearly against your own hearing."
          >
            <Choice
              label="Tone frequency"
              value={audioSettings.frequency}
              options={FREQUENCY_PRESETS.map((hz) => ({ value: hz, label: `${hz}` }))}
              onChange={(frequency) => {
                update((c) => ({ ...c, audio: { ...c.audio, frequency } }))
                preview(frequency, audioSettings.volume)
              }}
            />
          </Row>

          <Row label="Volume">
            <Slider
              label="Volume"
              value={audioSettings.volume}
              min={0}
              max={LIMITS.volume.max}
              step={0.01}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(volume) => {
                update((c) => ({ ...c, audio: { ...c.audio, volume } }))
                preview(audioSettings.frequency, volume)
              }}
            />
          </Row>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight">Speed</h2>
        <div className="mt-2">
          <Row
            label="Character speed"
            hint="How fast the dots and dashes themselves are sent. Keep this high even as a beginner."
          >
            <Slider
              label="Character speed in words per minute"
              value={timing.wpm}
              min={LIMITS.wpm.min}
              max={40}
              format={(v) => `${v} WPM`}
              onChange={(wpm) =>
                update((c) => ({
                  ...c,
                  // Farnsworth above the character speed is meaningless, and
                  // the store would clamp it anyway — doing it here keeps the
                  // slider from appearing to accept a value it will not hold.
                  timing: {
                    ...c.timing,
                    wpm,
                    farnsworthWpm: Math.min(c.timing.farnsworthWpm, wpm),
                  },
                }))
              }
            />
          </Row>

          <Row
            label="Effective speed"
            hint="Farnsworth spacing. Lower than the character speed stretches the gaps between characters, which is what stops you learning to count beeps."
          >
            <Slider
              label="Effective speed in words per minute"
              value={timing.farnsworthWpm}
              min={LIMITS.farnsworthWpm.min}
              max={timing.wpm}
              format={(v) => (v >= timing.wpm ? 'off' : `${v} WPM`)}
              onChange={(farnsworthWpm) =>
                update((c) => ({ ...c, timing: { ...c.timing, farnsworthWpm } }))
              }
            />
          </Row>

          <Row label="Preset">
            <Choice
              label="Speed preset"
              value={timing.wpm}
              options={Object.entries(WPM_PRESETS).map(([name, wpm]) => ({
                value: wpm,
                label: name.toUpperCase(),
              }))}
              onChange={(wpm) =>
                update((c) => ({
                  ...c,
                  timing: {
                    ...c.timing,
                    wpm,
                    farnsworthWpm: Math.min(c.timing.farnsworthWpm, wpm),
                  },
                }))
              }
            />
          </Row>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight">The key</h2>
        <div className="mt-2">
          <Row label="Dot / dash threshold" hint="Hold longer than this and the key sends a dash.">
            <Slider
              label="Dot dash threshold in milliseconds"
              value={timing.dotDashThresholdMs}
              min={LIMITS.dotDashThresholdMs.min}
              max={LIMITS.dotDashThresholdMs.max}
              step={10}
              format={(v) => `${v} ms`}
              onChange={(dotDashThresholdMs) =>
                update((c) => ({ ...c, timing: { ...c.timing, dotDashThresholdMs } }))
              }
            />
          </Row>

          <Row
            label="Time to finish a character"
            hint="How long you may pause mid-character before it is treated as finished. Nothing to do with speed — this is thinking time."
          >
            <Choice
              label="Keyer patience"
              value={activePreset ?? ('' as KeyerPreset)}
              options={(Object.keys(KEYER_PRESETS) as KeyerPreset[]).map((name) => ({
                value: name,
                label: KEYER_PRESETS[name].label.toUpperCase(),
              }))}
              onChange={(name) => {
                const preset = KEYER_PRESETS[name]
                update((c) => ({
                  ...c,
                  timing: {
                    ...c.timing,
                    characterGapMs: preset.characterGapMs,
                    wordGapMs: preset.wordGapMs,
                    autoCommit: preset.autoCommit,
                  },
                }))
              }}
            />
          </Row>

          <Row label="Morse key" hint="The key you hold to send.">
            <KeyCapture
              label="Morse key"
              value={keys.key}
              onChange={(key) => update((c) => ({ ...c, keys: { ...c.keys, key } }))}
            />
          </Row>

          <Row label="Alternative key">
            <KeyCapture
              label="Alternative key"
              value={keys.alternative ?? 'Enter'}
              onChange={(alternative) =>
                update((c) => ({ ...c, keys: { ...c.keys, alternative } }))
              }
            />
          </Row>

          <Row label="Finish character" hint="Used when the timer is switched off.">
            <KeyCapture
              label="Finish character key"
              value={keys.submit ?? 'Control'}
              onChange={(submit) => update((c) => ({ ...c, keys: { ...c.keys, submit } }))}
            />
          </Row>

          <Row label="Cancel">
            <KeyCapture
              label="Cancel key"
              value={keys.cancel ?? 'Escape'}
              onChange={(cancel) => update((c) => ({ ...c, keys: { ...c.keys, cancel } }))}
            />
          </Row>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight">Motion</h2>
        <div className="mt-2">
          <Row
            label="Animation"
            hint="Following the system is usually right. The overrides exist because the system setting is all or nothing, and you may want the signal pulses here while suppressing motion elsewhere."
          >
            <Choice
              label="Motion preference"
              value={motion}
              options={[
                { value: 'system', label: 'SYSTEM' },
                { value: 'full', label: 'FULL' },
                { value: 'reduce', label: 'REDUCED' },
              ]}
              onChange={(next) => update((c) => ({ ...c, motion: next }))}
            />
          </Row>
        </div>
      </section>

      <section>
        <h2 className="font-display text-xl font-bold tracking-tight">Your data</h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Everything you do here is stored in this browser and nowhere else. That also means
          clearing your browser data erases it, so export a copy if you care about it.
        </p>

        <div className="mt-5">
          <Row
            label="Anonymous usage counts"
            hint="A tally of which screens get used — no identifier, no progress, nothing you typed. Never sent if your browser asks not to be tracked."
          >
            <Toggle
              checked={settings.counters}
              label="Anonymous usage counts"
              onChange={(counters) => store.update((current) => ({ ...current, counters }))}
            />
          </Row>
        </div>

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportProgress}
            className="rounded-lg border border-line px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-signal hover:text-signal"
          >
            EXPORT
          </button>

          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="rounded-lg border border-line px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-signal hover:text-signal"
          >
            IMPORT
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importProgress(file)
              // Reset so re-picking the same file fires change again.
              event.target.value = ''
            }}
          />

          <button
            type="button"
            onClick={reset}
            className="rounded-lg border border-line px-5 py-2.5 font-mono text-xs tracking-[0.14em] text-muted transition-colors hover:border-danger hover:text-danger"
          >
            RESET EVERYTHING
          </button>
        </div>
      </section>
    </div>
  )
}
