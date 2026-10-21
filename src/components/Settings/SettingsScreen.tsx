import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog, KeyCapture, Panel, Row, Slider, Switch, keyName } from './controls'
import {
  SECTION_HINTS,
  SECTION_LABELS,
  backupFileName,
  importSummary,
  isAppleMobile,
  previewBackup,
  resetConsequence,
  sectionOutcomes,
  takeInventory,
  type BackupPreview,
  type SectionOutcome,
} from './data'
import { REFERENCE_WORD, TimingPreview } from './TimingPreview'
import { track } from '../../analytics/track'
import { METHODS, METHOD_IDS, type MethodId, activeCharacters } from '../../data/methods'
import { capitalise, formatSeconds, joinList, plural } from '../../data/format'
import { AudioEngine } from '../../engine/audioEngine'
import { DEFAULT_KEY_BINDINGS, type KeyBindings } from '../../engine/keyEngine'
import { encode } from '../../engine/morseEncoder'
import { resolveTiming } from '../../engine/timingEngine'
import { resolveMotion } from '../../hooks/useReducedMotion'
import {
  BACKUP_SECTIONS,
  type BackupSection,
  type ImportResult,
  exportAll,
  importAll,
  resetAll,
} from '../../storage/backup'
import { type DailyRecord, createDailyStore, emptyDaily } from '../../storage/daily'
import {
  type ProgressRecord,
  createProgressStore,
  emptyProgress,
  setMethod,
} from '../../storage/progress'
import {
  FREQUENCY_PRESETS,
  KEYER_PRESETS,
  LIMITS,
  SIGNAL_LABELS,
  SIGNAL_MODES,
  type KeyerPreset,
  type MotionPreference,
  type SettingsRecord,
  type SignalMode,
  WPM_PRESETS,
  WPM_RANGE,
  createSettingsStore,
  defaultSettings,
  hasLamp,
  hasSound,
  matchKeyerPreset,
  timingOptions,
  withSignal,
} from '../../storage/settings'
import { type StatsRecord, createStatsStore, defaultStats } from '../../storage/stats'
import { useInstallPrompt } from '../ui/install'
import { Lamp } from '../ui/Lamp'
import { OptionGroup } from '../ui/OptionGroup'
import { Segmented } from '../ui/Segmented'
import { useTransmitter } from '../ui/transmitter'

/**
 * Settings (PROJECT.md §10, §22, §27, §28): the station's control panel.
 *
 * Every change writes immediately. There is no Save button, because there is
 * no server to fail and nothing to lose by applying it. Signal and speed
 * preview themselves, since "600 Hz" or "15/8 WPM" means nothing until you
 * hear it, or see it.
 */

const SECTIONS = [
  { id: 'signal', title: 'Signal', rail: 'Signal' },
  { id: 'timing', title: 'Timing', rail: 'Timing' },
  { id: 'key', title: 'Key', rail: 'Key' },
  { id: 'course', title: 'Teaching order', rail: 'Teaching' },
  { id: 'display', title: 'Display & motion', rail: 'Display' },
  { id: 'data', title: 'Data', rail: 'Data' },
] as const

type SectionId = (typeof SECTIONS)[number]['id']

const indexOf = (id: SectionId) => SECTIONS.findIndex((section) => section.id === id) + 1

/** The traditional CW test transmission, sent at the user's own settings. */
const TEST_SIGNAL = 'VVV'

/** The Signal panel's status plate. */
const SIGNAL_STATE: Readonly<Record<SignalMode, string>> = {
  sound: 'Sound on',
  lamp: 'Silent, by lamp',
  both: 'Sound and lamp',
}

/** Why the tone rows cannot be changed while Signal is Lamp. */
const NO_TONE = 'Signal is set to Lamp, so no tone is played. Choose Sound or Both to change it.'

const KEY_ACTIONS: readonly { key: keyof KeyBindings; label: string }[] = [
  { key: 'key', label: 'Morse key' },
  { key: 'alternative', label: 'Second key' },
  { key: 'submit', label: 'Finish character' },
  { key: 'cancel', label: 'Cancel' },
]

const MOTION_OPTIONS: readonly { value: MotionPreference; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'full', label: 'Full' },
  { value: 'reduce', label: 'Reduced' },
]

type Playing = 'test' | 'paris' | null
type Platform = 'apple' | 'standalone' | 'other'

export interface SettingsScreenProps {
  /** The site's theme switch, rendered by the page (ThemeToggle.astro). */
  theme?: ReactNode
}

export function SettingsScreen({ theme }: SettingsScreenProps) {
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const progressStore = useMemo(() => createProgressStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])
  const dailyStore = useMemo(() => createDailyStore(), [])

  // Defaults until mounted: the page is prerendered, where there is no
  // storage, and rendering stored values on the server would tear hydration.
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  const [progress, setProgress] = useState<ProgressRecord>(emptyProgress)
  const [stats, setStats] = useState<StatsRecord>(defaultStats)
  const [daily, setDaily] = useState<DailyRecord>(emptyDaily)
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    setSettings(settingsStore.read())
    setProgress(progressStore.read())
    setStats(statsStore.read())
    setDaily(dailyStore.read())
    setLoaded(true)
    const unsubscribe = [
      settingsStore.subscribe(setSettings),
      progressStore.subscribe(setProgress),
      statsStore.subscribe(setStats),
      dailyStore.subscribe(setDaily),
    ]
    return () => unsubscribe.forEach((stop) => stop())
  }, [settingsStore, progressStore, statsStore, dailyStore])

  const update = useCallback(
    (patch: (current: SettingsRecord) => SettingsRecord) => settingsStore.update(patch),
    [settingsStore],
  )

  /* ---- Motion reaches CSS at once ------------------------------------- */

  const { audio: audioSettings, timing, keys, motion } = settings
  const [systemReduce, setSystemReduce] = useState(false)

  useEffect(() => {
    const query = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setSystemReduce(query.matches)
    sync()
    query.addEventListener('change', sync)
    return () => query.removeEventListener('change', sync)
  }, [])

  // BaseLayout sets `html[data-motion]` before first paint; this keeps it in
  // step with every later change, including one made by an import or a reset.
  useEffect(() => {
    if (loaded) document.documentElement.dataset.motion = motion
  }, [loaded, motion])

  /* ---- Signal ---------------------------------------------------------- */

  const sound = hasSound(settings)
  const lamp = hasLamp(settings)
  // VVV and PARIS go out the way every listening prompt does: tone, lamp or
  // both, from one timeline (DEC-045).
  const transmitter = useTransmitter(settings)
  const audio = useRef<AudioEngine | null>(null)
  const previewTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [playing, setPlaying] = useState<Playing>(null)

  useEffect(
    () => () => {
      if (previewTimer.current) clearTimeout(previewTimer.current)
      void audio.current?.dispose()
    },
    [],
  )

  /**
   * The engine, created and resumed inside the user's gesture: browsers only
   * let a page start sound from one, so this is never deferred to a timer.
   */
  const engine = useCallback((options: { frequency: number; volume: number }) => {
    audio.current ??= new AudioEngine()
    audio.current.update(options)
    void audio.current.resume()
    return audio.current
  }, [])

  /**
   * One short dit so a tone or volume change is audible. Debounced, or
   * dragging the volume fires a tone per pixel and the result is a siren.
   */
  const preview = useCallback(
    (options: { frequency: number; volume: number }) => {
      if (!audioSettings.enabled) return
      const ready = engine(options)
      if (previewTimer.current) clearTimeout(previewTimer.current)
      previewTimer.current = setTimeout(() => void ready.play(encode('E'), { wpm: 8 }), 180)
    },
    [audioSettings.enabled, engine],
  )

  const { transmit, stop: stopSending } = transmitter
  const play = useCallback(
    (which: Exclude<Playing, null>) => {
      if (playing === which) {
        stopSending()
        setPlaying(null)
        return
      }
      const text = which === 'test' ? TEST_SIGNAL : REFERENCE_WORD
      setPlaying(which)
      // Pressing the other button restarts the transmitter, which settles
      // this promise early: only clear the state if it is still ours.
      void transmit(encode(text), timingOptions(settings)).then(() =>
        setPlaying((current) => (current === which ? null : current)),
      )
    },
    [playing, settings, stopSending, transmit],
  )

  /** The lamp in a send button: lit per element when the signal has a lamp, else while sending. */
  const buttonLamp = (which: Exclude<Playing, null>) =>
    playing === which && (lamp ? transmitter.lit : transmitter.busy)

  /* ---- Install --------------------------------------------------------- */

  const install = useInstallPrompt()
  const [platform, setPlatform] = useState<Platform | null>(null)
  const [installNote, setInstallNote] = useState<string | null>(null)

  useEffect(() => {
    const standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
    setPlatform(
      standalone
        ? 'standalone'
        : isAppleMobile(navigator.userAgent, navigator.platform, navigator.maxTouchPoints)
          ? 'apple'
          : 'other',
    )
  }, [])

  const offerInstall = useCallback(async () => {
    if (!install) return
    // The layout counts the outcome (install_prompt); this only reports it.
    const outcome = await install.prompt()
    setInstallNote(
      outcome === 'accepted'
        ? 'Installed. MorseForge now opens from your apps, and works offline.'
        : outcome === 'dismissed'
          ? 'Not installed. The button stays here if you change your mind.'
          : 'This browser is not offering installation right now.',
    )
  }, [install])

  /* ---- Data ------------------------------------------------------------ */

  const fileInput = useRef<HTMLInputElement>(null)
  const [notice, setNotice] = useState('')
  const [outcomes, setOutcomes] = useState<Record<BackupSection, SectionOutcome> | null>(null)
  const [pendingImport, setPendingImport] = useState<{
    text: string
    preview: BackupPreview
  } | null>(null)
  const [confirmReset, setConfirmReset] = useState(false)
  const [lastExport, setLastExport] = useState<string | null>(null)

  const inventory = takeInventory(progress, stats, daily, Date.now())
  const customised = loaded && JSON.stringify(settings) !== JSON.stringify(defaultSettings())

  const holdings: Record<BackupSection, { value: string; lit: boolean }> = {
    progress: {
      value: inventory.characters > 0 ? plural(inventory.characters, 'character') : 'Nothing yet',
      lit: inventory.characters > 0,
    },
    settings: { value: customised ? 'Changed' : 'Defaults', lit: customised },
    stats: {
      value:
        inventory.xp > 0 || inventory.sessions > 0
          ? `Level ${inventory.level} · ${inventory.xp.toLocaleString('en')} XP`
          : 'Nothing yet',
      lit: inventory.xp > 0 || inventory.sessions > 0,
    },
    daily: {
      value: inventory.dailies > 0 ? plural(inventory.dailies, 'result') : 'Nothing yet',
      lit: inventory.dailies > 0,
    },
  }

  const exportBackup = useCallback(() => {
    const name = backupFileName(new Date())
    const blob = new Blob([JSON.stringify(exportAll(), null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = name
    document.body.append(link)
    link.click()
    link.remove()
    // Revoked a beat later: Safari starts the download asynchronously and
    // fails it if the URL is already gone.
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    setOutcomes(null)
    setLastExport(name)
    setNotice(
      `Saved ${name}, with your ${joinList(BACKUP_SECTIONS.map((section) => SECTION_LABELS[section]))}.`,
    )
  }, [])

  const report = useCallback((result: ImportResult) => {
    setOutcomes(sectionOutcomes(result))
    setNotice(importSummary(result))
  }, [])

  const chooseFile = useCallback(
    async (file: File) => {
      let text: string
      try {
        text = await file.text()
      } catch {
        setOutcomes(null)
        setNotice('That file could not be opened, so nothing was changed.')
        return
      }
      const preview = previewBackup(text)
      // Nothing of ours in it means nothing would be overwritten, so there is
      // nothing to confirm: say so straight away.
      if (preview.sections.length === 0) report(importAll(text))
      else setPendingImport({ text, preview })
    },
    [report],
  )

  const confirmImport = useCallback(() => {
    if (!pendingImport) return
    report(importAll(pendingImport.text))
    setPendingImport(null)
  }, [pendingImport, report])

  const eraseEverything = useCallback(() => {
    stopSending()
    setPlaying(null)
    // resetAll keeps the anonymous-counts choice: erasing data is not a
    // reason to switch them back on for someone who turned them off.
    resetAll()
    const kept = settingsStore.read()
    setConfirmReset(false)
    setOutcomes(null)
    setNotice(
      `Erased. This browser holds no progress now, and every setting is back to its default except anonymous usage counts, which stay ${kept.counters ? 'on' : 'off'}, as you had them.`,
    )
  }, [settingsStore, stopSending])

  /* ---- Section rail ---------------------------------------------------- */

  const [current, setCurrent] = useState<SectionId>('signal')

  // Scroll spy: the current section is the last one whose top has passed
  // under the sticky header, or the last section once the page bottoms out.
  useEffect(() => {
    let frame = 0
    const measure = () => {
      frame = 0
      let next: SectionId = SECTIONS[0].id
      for (const { id } of SECTIONS) {
        const top = document.getElementById(id)?.getBoundingClientRect().top
        if (top !== undefined && top <= 240) next = id
      }
      const atBottom =
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4
      setCurrent(atBottom ? 'data' : next)
    }
    const onScroll = () => {
      frame ||= requestAnimationFrame(measure)
    }
    measure()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  /* ---- Derived --------------------------------------------------------- */

  const activePreset = matchKeyerPreset(timing)
  const resolved = resolveTiming(timingOptions(settings))
  const motionReduced = resolveMotion(motion, systemReduce)
  const method = METHODS[progress.method]
  const characters = activeCharacters(method, progress.unlocked)

  const bindingCounts = new Map<string, number>()
  for (const { key } of KEY_ACTIONS) {
    const bound = keys[key]
    if (bound) bindingCounts.set(bound, (bindingCounts.get(bound) ?? 0) + 1)
  }
  const conflicts = KEY_ACTIONS.filter(({ key }) => (bindingCounts.get(keys[key] ?? '') ?? 0) > 1)
  const keysAreDefault = KEY_ACTIONS.every(({ key }) => keys[key] === DEFAULT_KEY_BINDINGS[key])

  const setSpeed = (wpm: number) =>
    update((c) => ({
      ...c,
      // Farnsworth above the character speed is meaningless, and the store
      // would clamp it anyway. Doing it here keeps the slider from appearing
      // to accept a value it will not hold.
      timing: { ...c.timing, wpm, farnsworthWpm: Math.min(c.timing.farnsworthWpm, wpm) },
    }))

  return (
    <div className="lg:grid lg:grid-cols-[12rem_minmax(0,1fr)] lg:gap-10">
      <nav aria-label="Settings sections" className="hidden lg:block">
        <ul className="sticky top-24 space-y-1">
          {SECTIONS.map(({ id, rail }, index) => (
            <li key={id}>
              <a
                href={`#${id}`}
                className="pj-rail-link"
                aria-current={current === id ? 'true' : undefined}
              >
                <span className={current === id ? 'text-signal' : 'text-muted'} aria-hidden="true">
                  {String(index + 1).padStart(2, '0')}
                </span>
                {rail}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-8">
        {/* Six panels make a long page on a phone (J-26): an index under the
            title, where the rail is on a desktop. */}
        <nav aria-label="Settings sections" className="lg:hidden">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map(({ id, rail }, index) => (
              <li key={id}>
                <a href={`#${id}`} className="mf-chip-link">
                  <span className="text-muted" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {rail}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* ---- 01 Signal ----------------------------------------------- */}
        <Panel
          id="signal"
          index={indexOf('signal')}
          title="Signal"
          intro="How every Morse signal on the site reaches you: as a tone, as a light, or both."
          lamp={{ on: true, label: SIGNAL_STATE[settings.signal] }}
        >
          <Row
            label="Signal"
            labelId="setting-signal"
            hint="Sound plays the tone. Lamp flashes a light with the same timing and stays silent. Both does both. Listening practice works in every mode."
          >
            <Segmented
              label="Signal"
              labelledBy="setting-signal"
              size="sm"
              block
              value={settings.signal}
              options={SIGNAL_MODES.map((mode) => ({ value: mode, label: SIGNAL_LABELS[mode] }))}
              onChange={(signal) => {
                // Whatever was sending was sent the old way; stop it.
                stopSending()
                setPlaying(null)
                update((c) => withSignal(c, signal))
              }}
            />
          </Row>

          <Row
            label="Tone"
            labelId="setting-tone"
            hint={
              sound
                ? `The pitch of the sidetone, in hertz. Pick whatever sits most clearly against your own hearing. Now ${audioSettings.frequency} Hz.`
                : NO_TONE
            }
          >
            <Segmented
              label="Tone frequency"
              labelledBy="setting-tone"
              size="sm"
              block
              value={audioSettings.frequency}
              options={FREQUENCY_PRESETS.map((hz) => ({
                value: hz,
                label: String(hz),
                ariaLabel: `${hz} hertz`,
                disabled: !sound,
              }))}
              onChange={(frequency) => {
                update((c) => ({ ...c, audio: { ...c.audio, frequency } }))
                preview({ frequency, volume: audioSettings.volume })
              }}
            />
          </Row>

          <Row label="Volume" htmlFor="setting-volume" hint={sound ? undefined : NO_TONE}>
            <Slider
              id="setting-volume"
              label="Volume"
              value={audioSettings.volume}
              min={0}
              max={LIMITS.volume.max}
              step={0.01}
              disabled={!sound}
              format={(v) => `${Math.round(v * 100)}%`}
              onChange={(volume) => {
                update((c) => ({ ...c, audio: { ...c.audio, volume } }))
                preview({ frequency: audioSettings.frequency, volume })
              }}
            />
          </Row>

          <Row
            label="Test signal"
            hint={
              !sound
                ? `Flashes ${TEST_SIGNAL}, the operator's traditional test signal, on the lamp in the button, at your speed.`
                : lamp
                  ? `Sends ${TEST_SIGNAL}, the operator's traditional test signal, as a tone and on the lamp in the button, at your tone, volume and speed.`
                  : `Sends ${TEST_SIGNAL}, the operator's traditional test signal, at your tone, volume and speed.`
            }
          >
            <div className="flex sm:justify-end">
              <button
                type="button"
                className="mf-btn mf-btn-audio pj-described"
                onClick={() => play('test')}
              >
                <Lamp on={buttonLamp('test')} tone="cyan" size={lamp ? 'lg' : 'md'} />
                {playing === 'test' ? 'Stop' : `Send ${TEST_SIGNAL}`}
              </button>
            </div>
          </Row>

          {sound && (
            <p className="flex gap-3 border-t border-line py-5 text-sm text-muted">
              <svg
                className="mt-0.5 shrink-0 text-amber"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                aria-hidden="true"
              >
                <rect x="6" y="2" width="12" height="20" rx="2.5" />
                <path d="M18 7h2" />
              </svg>
              <span>
                <strong className="font-semibold text-ink">On an iPhone,</strong> the ring/silent
                switch on the side also mutes sound from web pages. If the test signal is silent,
                check that switch first.
              </span>
            </p>
          )}
        </Panel>

        {/* ---- 02 Timing ----------------------------------------------- */}
        <Panel
          id="timing"
          index={indexOf('timing')}
          title="Timing"
          intro="How fast Morse is played to you. Character speed shapes each letter; effective speed sets the space around it."
        >
          <Row label="Preset" labelId="setting-preset">
            <Segmented
              label="Speed preset"
              labelledBy="setting-preset"
              size="sm"
              block
              className="grid grid-cols-2"
              value={timing.wpm}
              options={Object.entries(WPM_PRESETS).map(([name, wpm]) => ({
                value: wpm,
                label: capitalise(name),
                ariaLabel: `${capitalise(name)}, ${wpm} words per minute`,
              }))}
              onChange={setSpeed}
            />
          </Row>

          <Row
            label="Character speed"
            htmlFor="setting-wpm"
            hint="How fast the dots and dashes themselves are sent. Keep this high, even as a beginner."
          >
            <Slider
              id="setting-wpm"
              label="Character speed in words per minute"
              value={timing.wpm}
              min={WPM_RANGE.min}
              max={WPM_RANGE.max}
              format={(v) => `${v} WPM`}
              onChange={setSpeed}
            />
          </Row>

          <Row
            label="Effective speed"
            htmlFor="setting-farnsworth"
            hint="Farnsworth spacing. Below the character speed, it stretches the gaps between letters, which is what stops you learning to count beeps."
          >
            <Slider
              id="setting-farnsworth"
              label="Effective speed in words per minute"
              value={timing.farnsworthWpm}
              min={LIMITS.farnsworthWpm.min}
              max={timing.wpm}
              format={(v) => (v >= timing.wpm ? 'Off' : `${v} WPM`)}
              onChange={(farnsworthWpm) =>
                update((c) => ({ ...c, timing: { ...c.timing, farnsworthWpm } }))
              }
            />
          </Row>

          <div className="border-t border-line py-5">
            <TimingPreview timing={timingOptions(settings)} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-[46ch] text-sm text-muted">
                {REFERENCE_WORD} is the standard word that words-per-minute is measured with.
              </p>
              <button type="button" className="mf-btn mf-btn-audio" onClick={() => play('paris')}>
                <Lamp on={buttonLamp('paris')} tone="cyan" size={lamp ? 'lg' : 'md'} />
                {playing === 'paris' ? 'Stop' : `Play ${REFERENCE_WORD}`}
              </button>
            </div>
          </div>
        </Panel>

        {/* ---- 03 Key -------------------------------------------------- */}
        <Panel
          id="key"
          index={indexOf('key')}
          title="Key"
          intro="How your keying is read on the telegraph, in lessons and in practice."
        >
          <Row
            label="Dot or dash"
            htmlFor="setting-threshold"
            hint={`Hold longer than this and the key sends a dash. For reference, at ${timing.wpm} WPM a dot lasts ${Math.round(resolved.dot)} ms and a dash ${Math.round(resolved.dash)} ms.`}
          >
            <Slider
              id="setting-threshold"
              label="Dot or dash threshold in milliseconds"
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
            labelId="setting-patience"
            wide
            hint={
              activePreset === null
                ? 'Your current timing was set by hand or by an import. Pick one to return to a preset.'
                : 'How long you may pause mid-character before it counts as finished. This is thinking time, not speed.'
            }
          >
            <OptionGroup
              label="Time to finish a character"
              labelledBy="setting-patience"
              columns={2}
              value={activePreset}
              options={(Object.keys(KEYER_PRESETS) as KeyerPreset[]).map((name) => {
                const preset = KEYER_PRESETS[name]
                return {
                  value: name,
                  title: preset.label,
                  hint: preset.autoCommit
                    ? `Finishes a character after ${formatSeconds(preset.characterGapMs)} s of quiet, a word after ${formatSeconds(preset.wordGapMs)} s.`
                    : `Never finishes on its own: you press ${keyName(keys.submit ?? DEFAULT_KEY_BINDINGS.submit ?? '')} to finish each character.`,
                }
              })}
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

          <Row
            label="Keys"
            wide
            hint="Select a key, then press the one you want. Escape keeps the old one."
          >
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {KEY_ACTIONS.map(({ key, label }) => (
                <div key={key}>
                  <p className="mf-engraved mb-2" aria-hidden="true">
                    {label}
                  </p>
                  <KeyCapture
                    label={label}
                    value={keys[key] ?? DEFAULT_KEY_BINDINGS[key] ?? ''}
                    conflict={conflicts.some((conflict) => conflict.key === key)}
                    takenBy={(candidate) =>
                      KEY_ACTIONS.find(
                        (other) => other.key !== key && keys[other.key] === candidate,
                      )?.label ?? null
                    }
                    onChange={(next) => update((c) => ({ ...c, keys: { ...c.keys, [key]: next } }))}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {/* Always mounted, so the warning is announced when it appears. */}
              <p className="text-sm text-danger" role="status">
                {conflicts.length > 0
                  ? `${joinList(conflicts.map((c) => c.label))} share a key, so only one of them will work.`
                  : ''}
              </p>
              {!keysAreDefault && (
                <button
                  type="button"
                  className="mf-btn mf-btn-ghost mf-btn-sm"
                  onClick={() => update((c) => ({ ...c, keys: { ...DEFAULT_KEY_BINDINGS } }))}
                >
                  Restore default keys
                </button>
              )}
            </div>
          </Row>
        </Panel>

        {/* ---- 04 Teaching order --------------------------------------- */}
        <Panel
          id="course"
          index={indexOf('course')}
          title="Teaching order"
          intro="Which order new characters arrive in. The practice screen has the same choice; this is the place to set it once."
        >
          <Row label="Order" labelId="setting-method" wide>
            <OptionGroup
              label="Teaching order"
              labelledBy="setting-method"
              columns={3}
              value={progress.method}
              options={METHOD_IDS.map((id) => ({
                value: id,
                title: METHODS[id].name,
                hint: METHODS[id].summary,
              }))}
              onChange={(next: MethodId) => {
                progressStore.update((c) => setMethod(c, next))
                track('method_change', next)
              }}
            />
            <p className="mt-4 max-w-[68ch] text-sm text-muted">{method.rationale}</p>
          </Row>

          <Row
            label="Your set now"
            wide
            hint={
              method.unlockAccuracy === null
                ? `${plural(characters.length, 'character')}. This order does not unlock on score.`
                : `${plural(characters.length, 'character')}. More arrive when a practice session long enough to count scores ${Math.round(method.unlockAccuracy * 100)}% or better.`
            }
          >
            <p
              className="mf-tape text-lg break-words"
              aria-label={`Current set: ${characters.join(', ')}`}
            >
              {characters.join(' ')}
            </p>
          </Row>
        </Panel>

        {/* ---- 05 Display & motion ------------------------------------- */}
        <Panel id="display" index={indexOf('display')} title="Display & motion">
          {theme && (
            <Row
              label="Theme"
              hint="Dark is the station at night; light is the telegram form. The same switch sits in the header."
            >
              <div className="flex sm:justify-end">{theme}</div>
            </Row>
          )}
          <Row
            label="Animation"
            labelId="setting-motion"
            hint={
              <>
                Following the system is usually right. The overrides exist because the system
                setting is all or nothing.{' '}
                <span className="text-ink">
                  {loaded
                    ? motionReduced
                      ? `Motion is reduced${motion === 'system' ? ', as your system asks' : ''}.`
                      : `Motion is on${motion === 'system' ? ', as your system allows' : ''}.`
                    : ''}
                </span>
              </>
            }
          >
            <Segmented
              label="Animation"
              labelledBy="setting-motion"
              block
              value={motion}
              options={MOTION_OPTIONS}
              onChange={(next) => update((c) => ({ ...c, motion: next }))}
            />
          </Row>
        </Panel>

        {/* ---- 06 Data ------------------------------------------------- */}
        <Panel
          id="data"
          index={indexOf('data')}
          title="Data"
          intro="Everything lives in this browser and nowhere else. Clearing your browser data erases it, so keep a backup if it matters to you."
        >
          <div className="py-5">
            <p className="mf-engraved">In this browser</p>
            <ul className="mt-3 divide-y divide-line rounded-panel border border-line-strong bg-void">
              {BACKUP_SECTIONS.map((section) => (
                <li
                  key={section}
                  className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-1 px-4 py-3 sm:grid-cols-[auto_minmax(0,1fr)_auto]"
                >
                  {/* A plain dot, not a lamp: four glowing lamps in one list
                      would spend the whole glow budget on an inventory. */}
                  <span
                    aria-hidden="true"
                    className={[
                      'size-2 self-start rounded-full mt-2',
                      holdings[section].lit ? 'bg-signal' : 'bg-line-strong',
                    ].join(' ')}
                  />
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">
                      {capitalise(SECTION_LABELS[section])}
                    </span>
                    <span className="block text-sm text-muted">{SECTION_HINTS[section]}</span>
                  </span>
                  <span className="col-start-2 flex flex-wrap items-baseline gap-x-3 sm:col-start-3 sm:block sm:text-right">
                    <span className="block font-mono text-control text-ink tabular-nums">
                      {loaded ? holdings[section].value : ''}
                    </span>
                    {outcomes && (
                      <span
                        // pkg-j.css tints the other states; a failed save is a
                        // failure, so it reads in the danger colour too.
                        className={`pj-outcome block${outcomes[section] === 'unsaved' ? ' text-danger' : ''}`}
                        data-state={outcomes[section]}
                      >
                        {outcomes[section] === 'restored'
                          ? 'Restored'
                          : outcomes[section] === 'rejected'
                            ? 'Rejected'
                            : outcomes[section] === 'unsaved'
                              ? 'Not saved'
                              : 'Not in file'}
                      </span>
                    )}
                  </span>
                </li>
              ))}
            </ul>

            {/* Always mounted, empty until there is something to say. A live
                region created with its content is usually not registered in
                time, and the announcement is dropped. */}
            <p
              role="status"
              className={notice ? 'mt-4 flex items-start gap-3 text-sm text-ink' : 'sr-only'}
            >
              {notice}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button type="button" className="mf-btn mf-btn-primary" onClick={exportBackup}>
                Export backup
              </button>
              <button
                type="button"
                className="mf-btn mf-btn-secondary"
                onClick={() => fileInput.current?.click()}
              >
                Import backup
              </button>
              <input
                ref={fileInput}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void chooseFile(file)
                  // Reset so choosing the same file again fires change again.
                  event.target.value = ''
                }}
              />
            </div>
          </div>

          <Row
            label="Anonymous usage counts"
            htmlFor="setting-counters"
            hint="A tally of which screens get used: no identifier, no progress, nothing you typed. Never sent if your browser asks not to be tracked."
          >
            <Switch
              id="setting-counters"
              checked={settings.counters}
              label="Anonymous usage counts"
              onChange={(counters) => update((c) => ({ ...c, counters }))}
            />
          </Row>

          {(install || platform === 'apple' || platform === 'standalone' || installNote) && (
            <Row
              label="Install"
              hint={
                installNote ??
                (platform === 'standalone'
                  ? 'You are using the installed app. It works offline.'
                  : install
                    ? 'Add MorseForge to your apps. It opens in its own window and works offline.'
                    : 'On iPhone and iPad: Share → Add to Home Screen.')
              }
            >
              {install && (
                <div className="flex sm:justify-end">
                  <button
                    type="button"
                    className="mf-btn mf-btn-secondary"
                    onClick={() => void offerInstall()}
                  >
                    Install MorseForge
                  </button>
                </div>
              )}
            </Row>
          )}

          <Row
            label="Erase everything"
            hint="Removes progress, stats, daily results and settings from this browser. You will be asked first."
          >
            <div className="flex sm:justify-end">
              <button
                type="button"
                className="mf-btn mf-btn-secondary pj-btn-erase"
                onClick={() => {
                  setLastExport(null)
                  setConfirmReset(true)
                }}
              >
                Erase everything
              </button>
            </div>
          </Row>
        </Panel>
      </div>

      <ConfirmDialog
        open={pendingImport !== null}
        title="Restore from this backup?"
        onClose={() => setPendingImport(null)}
        actions={
          <>
            <button
              type="button"
              className="mf-btn mf-btn-ghost"
              onClick={() => setPendingImport(null)}
            >
              Cancel
            </button>
            <button type="button" className="mf-btn mf-btn-primary" onClick={confirmImport}>
              Restore
            </button>
          </>
        }
      >
        {pendingImport && (
          <>
            <p>
              This file
              {pendingImport.preview.exported
                ? `, exported ${pendingImport.preview.exported.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' })},`
                : ''}{' '}
              holds your{' '}
              {joinList(pendingImport.preview.sections.map((section) => SECTION_LABELS[section]))}.
            </p>
            <p className="mt-3 text-muted">
              Restoring replaces those in this browser. A section that fails validation is skipped,
              and what you have now is kept for it.
            </p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmReset}
        title="Erase everything in this browser?"
        tone="danger"
        onClose={() => setConfirmReset(false)}
        actions={
          <>
            <button type="button" className="mf-btn mf-btn-ghost sm:mr-auto" onClick={exportBackup}>
              Export a backup first
            </button>
            <button
              type="button"
              className="mf-btn mf-btn-secondary"
              onClick={() => setConfirmReset(false)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="mf-btn mf-btn-secondary pj-btn-erase"
              onClick={eraseEverything}
            >
              Erase everything
            </button>
          </>
        }
      >
        <p>{resetConsequence(inventory)}</p>
        <p className="mt-3 text-muted">
          Your theme stays, and so does your choice about anonymous usage counts (now{' '}
          {settings.counters ? 'on' : 'off'}).
        </p>
        {lastExport && (
          <p className="mt-3 font-mono text-control text-signal">Saved {lastExport}</p>
        )}
      </ConfirmDialog>
    </div>
  )
}
