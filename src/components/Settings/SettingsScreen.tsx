import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ConfirmDialog, KeyCapture, Panel, Row, Slider, Switch, keyName } from './controls'
import {
  backupFileName,
  importSummary,
  isAppleMobile,
  previewBackup,
  resetConsequence,
  sectionHint,
  sectionLabel,
  sectionNames,
  sectionOutcomes,
  takeInventory,
  type BackupPreview,
  type SectionOutcome,
} from './data'
import { REFERENCE_WORD, TimingPreview } from './TimingPreview'
import { CONSENT_EVENT, browserOptsOut, chooseAnalytics } from '../../analytics/ga'
import { track } from '../../analytics/track'
import { GA_MEASUREMENT_ID } from '../../config/site'
import { METHODS, METHOD_IDS, type MethodId, activeCharacters } from '../../data/methods'
import { formatSeconds } from '../../data/format'
import { AudioEngine } from '../../engine/audioEngine'
import {
  ADAPTER_PADDLES,
  DEFAULT_KEY_BINDINGS,
  KEYER_KINDS,
  bindingsOverlap,
  type KeyBindings,
} from '../../engine/keyEngine'
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
import {
  CONSENT_CHOICES,
  type ConsentChoice,
  type ConsentRecord,
  createConsentStore,
} from '../../storage/consent'
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
import type { MessageKey } from '../../i18n/keys'
import { useT, withI18n } from '../../i18n/react'
import { renderRich } from '../../i18n/richReact'
import { keyerLabel, presetLabel, signalLabel } from '../MorseKey/keyCopy'
import { methodCopy } from '../Practice/copy'

/**
 * Settings (PROJECT.md §10, §22, §27, §28): the station's control panel.
 *
 * Every change writes immediately. There is no Save button, because there is
 * no server to fail and nothing to lose by applying it. Signal and speed
 * preview themselves, since "600 Hz" or "15/8 WPM" means nothing until you
 * hear it, or see it.
 */

const SECTIONS = [
  { id: 'signal', title: 'settings.signalTitle', rail: 'settings.signalRail' },
  { id: 'timing', title: 'settings.timingTitle', rail: 'settings.timingRail' },
  { id: 'key', title: 'settings.keyTitle', rail: 'settings.keyRail' },
  { id: 'course', title: 'settings.courseTitle', rail: 'settings.courseRail' },
  { id: 'display', title: 'settings.displayTitle', rail: 'settings.displayRail' },
  { id: 'data', title: 'settings.dataTitle', rail: 'settings.dataRail' },
] as const satisfies readonly { id: string; title: MessageKey; rail: MessageKey }[]

type SectionId = (typeof SECTIONS)[number]['id']

const indexOf = (id: SectionId) => SECTIONS.findIndex((section) => section.id === id) + 1

/** The traditional CW test transmission, sent at the user's own settings. */
const TEST_SIGNAL = 'VVV'

/** The Signal panel's status plate. */
const SIGNAL_STATE: Readonly<Record<SignalMode, MessageKey>> = {
  sound: 'settings.stateSound',
  lamp: 'settings.stateLamp',
  both: 'settings.stateBoth',
}

const KEY_ACTIONS: readonly { key: keyof KeyBindings; label: MessageKey }[] = [
  { key: 'key', label: 'settings.actionKey' },
  { key: 'alternative', label: 'settings.actionAlternative' },
  { key: 'submit', label: 'settings.actionSubmit' },
  { key: 'cancel', label: 'settings.actionCancel' },
  { key: 'dit', label: 'settings.actionDit' },
  { key: 'dah', label: 'settings.actionDah' },
]

const MOTION_OPTIONS: readonly { value: MotionPreference; label: MessageKey }[] = [
  { value: 'system', label: 'settings.motionSystem' },
  { value: 'full', label: 'settings.motionFull' },
  { value: 'reduce', label: 'settings.motionReduce' },
]

const WPM_PRESET_KEYS: Readonly<Record<keyof typeof WPM_PRESETS, MessageKey>> = {
  beginner: 'settings.speedBeginner',
  normal: 'settings.speedNormal',
  advanced: 'settings.speedAdvanced',
  expert: 'settings.speedExpert',
}

type Playing = 'test' | 'paris' | null
type Platform = 'apple' | 'standalone' | 'other'

export interface SettingsScreenProps {
  /** The site's theme switch, rendered by the page (ThemeToggle.astro). */
  theme?: ReactNode
}

/** The /settings/ page's island: `SettingsScreen` with its messages from the page. */
export const SettingsIsland = withI18n(SettingsScreen)

export function SettingsScreen({ theme }: SettingsScreenProps) {
  const t = useT()
  /** Why the tone rows cannot be changed while Signal is Lamp. */
  const NO_TONE = t('settings.noTone')
  const settingsStore = useMemo(() => createSettingsStore(), [])
  const progressStore = useMemo(() => createProgressStore(), [])
  const statsStore = useMemo(() => createStatsStore(), [])
  const dailyStore = useMemo(() => createDailyStore(), [])
  const consentStore = useMemo(() => createConsentStore(), [])

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

  /* ---- Google Analytics consent (TASK-039) ---------------------------- */

  // Its own record, outside settings and outside backups (storage/consent.ts).
  // The consent bar writes it from an inline script and then fires
  // CONSENT_EVENT, which a store subscription would not see in this tab.
  const [consent, setConsent] = useState<ConsentRecord | null>(null)
  const [optsOut, setOptsOut] = useState(false)

  useEffect(() => {
    const sync = () => setConsent(consentStore.read())
    sync()
    setOptsOut(browserOptsOut())
    const unsubscribe = consentStore.subscribe(setConsent)
    window.addEventListener(CONSENT_EVENT, sync)
    return () => {
      unsubscribe()
      window.removeEventListener(CONSENT_EVENT, sync)
    }
  }, [consentStore])

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
        ? t('settings.installed')
        : outcome === 'dismissed'
          ? t('settings.notInstalled')
          : t('settings.noOffer'),
    )
  }, [install, t])

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
      value:
        inventory.characters > 0
          ? t('settings.characterCount', { count: inventory.characters })
          : t('settings.nothingYet'),
      lit: inventory.characters > 0,
    },
    settings: {
      value: customised ? t('settings.changed') : t('settings.defaults'),
      lit: customised,
    },
    stats: {
      value:
        inventory.xp > 0 || inventory.sessions > 0
          ? t('settings.levelXp', {
              level: inventory.level,
              xp: inventory.xp.toLocaleString(t.locale.lang === 'en' ? 'en' : t.locale.lang),
            })
          : t('settings.nothingYet'),
      lit: inventory.xp > 0 || inventory.sessions > 0,
    },
    daily: {
      value:
        inventory.dailies > 0
          ? t('settings.results', { count: inventory.dailies })
          : t('settings.nothingYet'),
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
    setNotice(t('settings.exported', { file: name, sections: sectionNames(t, BACKUP_SECTIONS) }))
  }, [t])

  const report = useCallback(
    (result: ImportResult) => {
      setOutcomes(sectionOutcomes(result))
      setNotice(importSummary(t, result))
    },
    [t],
  )

  const chooseFile = useCallback(
    async (file: File) => {
      let text: string
      try {
        text = await file.text()
      } catch {
        setOutcomes(null)
        setNotice(t('settings.unreadable'))
        return
      }
      const preview = previewBackup(text)
      // Nothing of ours in it means nothing would be overwritten, so there is
      // nothing to confirm: say so straight away.
      if (preview.sections.length === 0) report(importAll(text))
      else setPendingImport({ text, preview })
    },
    [report, t],
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
      t('settings.erased', { state: kept.counters ? t('settings.on') : t('settings.offWord') }),
    )
  }, [settingsStore, stopSending, t])

  const chooseGa = useCallback(
    (choice: ConsentChoice) => {
      // Stores the answer; "not allowed" also stops GA on this page and
      // deletes its cookies at once, and "allowed" lets the loader start it.
      setConsent(chooseAnalytics(choice, consentStore))
      setOutcomes(null)
      setNotice(choice === 'granted' ? t('settings.gaNowAllowed') : t('settings.gaNowOff'))
    },
    [consentStore, t],
  )

  /** Where the GA choice stands, when no answer has been stored to show it. */
  const gaState = consent ? '' : optsOut ? t('settings.gaBrowserSignal') : t('settings.gaUndecided')

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
  const methodText = methodCopy(t, progress.method)
  const characters = activeCharacters(method, progress.unlocked)

  // Overlap rather than equality: Ctrl and Left Ctrl are set off by one press.
  const conflicts = KEY_ACTIONS.filter(({ key }) =>
    KEY_ACTIONS.some((other) => other.key !== key && bindingsOverlap(keys[key], keys[other.key])),
  )
  const paddlesOnAdapter = keys.dit === ADAPTER_PADDLES.dit && keys.dah === ADAPTER_PADDLES.dah
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
      <nav aria-label={t('settings.sections')} className="hidden lg:block">
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
                {t(rail)}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="space-y-8">
        {/* Six panels make a long page on a phone (J-26): an index under the
            title, where the rail is on a desktop. */}
        <nav aria-label={t('settings.sections')} className="lg:hidden">
          <ul className="flex flex-wrap gap-2">
            {SECTIONS.map(({ id, rail }, index) => (
              <li key={id}>
                <a href={`#${id}`} className="mf-chip-link">
                  <span className="text-muted" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                  {t(rail)}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        {/* ---- 01 Signal ----------------------------------------------- */}
        <Panel
          id="signal"
          index={indexOf('signal')}
          title={t('settings.signalTitle')}
          intro={t('settings.signalIntro')}
          lamp={{ on: true, label: t.raw(SIGNAL_STATE[settings.signal]) }}
        >
          <Row
            label={t('settings.signal')}
            labelId="setting-signal"
            hint={t('settings.signalHint')}
          >
            <Segmented
              label={t('settings.signal')}
              labelledBy="setting-signal"
              size="sm"
              block
              value={settings.signal}
              options={SIGNAL_MODES.map((mode) => ({ value: mode, label: signalLabel(t, mode) }))}
              onChange={(signal) => {
                // Whatever was sending was sent the old way; stop it.
                stopSending()
                setPlaying(null)
                update((c) => withSignal(c, signal))
              }}
            />
          </Row>

          <Row
            label={t('settings.tone')}
            labelId="setting-tone"
            hint={sound ? t('settings.toneHint', { hz: audioSettings.frequency }) : NO_TONE}
          >
            <Segmented
              label={t('settings.toneFrequency')}
              labelledBy="setting-tone"
              size="sm"
              block
              value={audioSettings.frequency}
              options={FREQUENCY_PRESETS.map((hz) => ({
                value: hz,
                label: String(hz),
                ariaLabel: t('settings.hertz', { hz }),
                disabled: !sound,
              }))}
              onChange={(frequency) => {
                update((c) => ({ ...c, audio: { ...c.audio, frequency } }))
                preview({ frequency, volume: audioSettings.volume })
              }}
            />
          </Row>

          <Row
            label={t('settings.volume')}
            htmlFor="setting-volume"
            hint={sound ? undefined : NO_TONE}
          >
            <Slider
              id="setting-volume"
              label={t('settings.volume')}
              value={audioSettings.volume}
              min={0}
              max={LIMITS.volume.max}
              step={0.01}
              disabled={!sound}
              format={(v) => t('settings.percent', { value: Math.round(v * 100) })}
              onChange={(volume) => {
                update((c) => ({ ...c, audio: { ...c.audio, volume } }))
                preview({ frequency: audioSettings.frequency, volume })
              }}
            />
          </Row>

          <Row
            label={t('settings.testSignal')}
            hint={
              !sound
                ? t('settings.testFlash', { signal: TEST_SIGNAL })
                : lamp
                  ? t('settings.testBoth', { signal: TEST_SIGNAL })
                  : t('settings.testSound', { signal: TEST_SIGNAL })
            }
          >
            <div className="flex sm:justify-end">
              <button
                type="button"
                className="mf-btn mf-btn-audio pj-described"
                onClick={() => play('test')}
              >
                <Lamp on={buttonLamp('test')} tone="cyan" size={lamp ? 'lg' : 'md'} />
                {playing === 'test'
                  ? t('settings.stop')
                  : t('settings.sendSignal', { signal: TEST_SIGNAL })}
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
                {renderRich(t.rich('settings.iphone'), {
                  b: { el: 'strong', class: 'font-semibold text-ink' },
                })}
              </span>
            </p>
          )}
        </Panel>

        {/* ---- 02 Timing ----------------------------------------------- */}
        <Panel
          id="timing"
          index={indexOf('timing')}
          title={t('settings.timingTitle')}
          intro={t('settings.timingIntro')}
        >
          <Row label={t('settings.preset')} labelId="setting-preset">
            <Segmented
              label={t('settings.speedPreset')}
              labelledBy="setting-preset"
              size="sm"
              block
              className="grid grid-cols-2"
              value={timing.wpm}
              options={(Object.keys(WPM_PRESETS) as (keyof typeof WPM_PRESETS)[]).map((name) => {
                const wpm = WPM_PRESETS[name]
                const label = t.raw(WPM_PRESET_KEYS[name])
                return {
                  value: wpm,
                  label,
                  ariaLabel: t('settings.presetLabel', { name: label, wpm }),
                }
              })}
              onChange={setSpeed}
            />
          </Row>

          <Row
            label={t('settings.characterSpeed')}
            htmlFor="setting-wpm"
            hint={t('settings.characterSpeedHint')}
          >
            <Slider
              id="setting-wpm"
              label={t('settings.characterSpeedLabel')}
              value={timing.wpm}
              min={WPM_RANGE.min}
              max={WPM_RANGE.max}
              format={(v) => t('settings.wpm', { wpm: v })}
              onChange={setSpeed}
            />
          </Row>

          <Row
            label={t('settings.effectiveSpeed')}
            htmlFor="setting-farnsworth"
            hint={t('settings.effectiveSpeedHint')}
          >
            <Slider
              id="setting-farnsworth"
              label={t('settings.effectiveSpeedLabel')}
              value={timing.farnsworthWpm}
              min={LIMITS.farnsworthWpm.min}
              max={timing.wpm}
              format={(v) => (v >= timing.wpm ? t('settings.off') : t('settings.wpm', { wpm: v }))}
              onChange={(farnsworthWpm) =>
                update((c) => ({ ...c, timing: { ...c.timing, farnsworthWpm } }))
              }
            />
          </Row>

          <div className="border-t border-line py-5">
            <TimingPreview timing={timingOptions(settings)} />
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              <p className="max-w-[46ch] text-sm text-muted">
                {t('settings.referenceNote', { word: REFERENCE_WORD })}
              </p>
              <button type="button" className="mf-btn mf-btn-audio" onClick={() => play('paris')}>
                <Lamp on={buttonLamp('paris')} tone="cyan" size={lamp ? 'lg' : 'md'} />
                {playing === 'paris'
                  ? t('settings.stop')
                  : t('settings.playWord', { word: REFERENCE_WORD })}
              </button>
            </div>
          </div>
        </Panel>

        {/* ---- 03 Key -------------------------------------------------- */}
        <Panel
          id="key"
          index={indexOf('key')}
          title={t('settings.keyTitle')}
          intro={t('settings.keyIntro')}
        >
          <Row
            label={t('settings.keyType')}
            labelId="setting-keyer"
            hint={
              settings.keyer.type === 'straight'
                ? t('settings.straightHint')
                : settings.keyer.type === 'iambicA'
                  ? t('settings.paddlesHintA', { wpm: timing.wpm })
                  : t('settings.paddlesHintB', { wpm: timing.wpm })
            }
          >
            <Segmented
              label={t('settings.keyType')}
              labelledBy="setting-keyer"
              size="sm"
              block
              value={settings.keyer.type}
              options={KEYER_KINDS.map((type) => ({ value: type, label: keyerLabel(t, type) }))}
              onChange={(type) => update((c) => ({ ...c, keyer: { ...c.keyer, type } }))}
            />
          </Row>

          {settings.keyer.type !== 'straight' && (
            <Row
              label={t('settings.swapPaddles')}
              htmlFor="setting-swap-paddles"
              hint={t('settings.swapHint', {
                dit: keyName(t, keys.dit ?? DEFAULT_KEY_BINDINGS.dit ?? ''),
                dah: keyName(t, keys.dah ?? DEFAULT_KEY_BINDINGS.dah ?? ''),
              })}
            >
              <Switch
                id="setting-swap-paddles"
                checked={settings.keyer.swapPaddles}
                label={t('settings.swapPaddles')}
                onChange={(swapPaddles) =>
                  update((c) => ({ ...c, keyer: { ...c.keyer, swapPaddles } }))
                }
              />
            </Row>
          )}

          <Row
            label={t('settings.dotOrDash')}
            htmlFor="setting-threshold"
            hint={t('settings.thresholdHint', {
              wpm: timing.wpm,
              dot: Math.round(resolved.dot),
              dash: Math.round(resolved.dash),
            })}
          >
            <Slider
              id="setting-threshold"
              label={t('settings.thresholdLabel')}
              value={timing.dotDashThresholdMs}
              min={LIMITS.dotDashThresholdMs.min}
              max={LIMITS.dotDashThresholdMs.max}
              step={10}
              format={(v) => t('settings.ms', { ms: v })}
              onChange={(dotDashThresholdMs) =>
                update((c) => ({ ...c, timing: { ...c.timing, dotDashThresholdMs } }))
              }
            />
          </Row>

          <Row
            label={t('settings.patience')}
            labelId="setting-patience"
            wide
            hint={activePreset === null ? t('settings.patienceCustom') : t('settings.patienceHint')}
          >
            <OptionGroup
              label={t('settings.patience')}
              labelledBy="setting-patience"
              columns={2}
              value={activePreset}
              options={(Object.keys(KEYER_PRESETS) as KeyerPreset[]).map((name) => {
                const preset = KEYER_PRESETS[name]
                return {
                  value: name,
                  title: presetLabel(t, name),
                  hint: preset.autoCommit
                    ? t('settings.patienceAuto', {
                        characterGap: formatSeconds(preset.characterGapMs),
                        wordGap: formatSeconds(preset.wordGapMs),
                      })
                    : t('settings.patienceManual', {
                        key: keyName(t, keys.submit ?? DEFAULT_KEY_BINDINGS.submit ?? ''),
                      }),
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

          <Row label={t('settings.keys')} wide hint={t('settings.keysHint')}>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {KEY_ACTIONS.map(({ key, label }) => (
                <div key={key}>
                  <p className="mf-engraved mb-2" aria-hidden="true">
                    {t.raw(label)}
                  </p>
                  <KeyCapture
                    label={t.raw(label)}
                    value={keys[key] ?? DEFAULT_KEY_BINDINGS[key] ?? ''}
                    conflict={conflicts.some((conflict) => conflict.key === key)}
                    takenBy={(candidate) =>
                      ((found) => (found ? t.raw(found.label) : null))(
                        KEY_ACTIONS.find(
                          (other) =>
                            other.key !== key && bindingsOverlap(keys[other.key], candidate),
                        ),
                      )
                    }
                    onChange={(next) => update((c) => ({ ...c, keys: { ...c.keys, [key]: next } }))}
                    ctrlSides={key === 'dit' || key === 'dah'}
                  />
                </div>
              ))}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
              {/* Always mounted, so the warning is announced when it appears. */}
              <p className="text-sm text-danger" role="status">
                {conflicts.length > 0
                  ? t('settings.conflicts', {
                      actions: t.list(conflicts.map((c) => t.raw(c.label))),
                    })
                  : ''}
              </p>
              {!keysAreDefault && (
                <button
                  type="button"
                  className="mf-btn mf-btn-ghost mf-btn-sm"
                  onClick={() => update((c) => ({ ...c, keys: { ...DEFAULT_KEY_BINDINGS } }))}
                >
                  {t('settings.restoreKeys')}
                </button>
              )}
            </div>
            {settings.keyer.type !== 'straight' && (
              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
                <button
                  type="button"
                  className="mf-btn mf-btn-secondary mf-btn-sm"
                  disabled={paddlesOnAdapter}
                  onClick={() => update((c) => ({ ...c, keys: { ...c.keys, ...ADAPTER_PADDLES } }))}
                >
                  {t('settings.adapterPreset')}
                </button>
                <p className="max-w-[60ch] text-sm text-muted">{t('settings.adapterHint')}</p>
              </div>
            )}
          </Row>
        </Panel>

        {/* ---- 04 Teaching order --------------------------------------- */}
        <Panel
          id="course"
          index={indexOf('course')}
          title={t('settings.courseTitle')}
          intro={t('settings.courseIntro')}
        >
          <Row label={t('settings.order')} labelId="setting-method" wide>
            <OptionGroup
              label={t('settings.courseTitle')}
              labelledBy="setting-method"
              columns={3}
              value={progress.method}
              options={METHOD_IDS.map((id) => {
                const option = methodCopy(t, id)
                return { value: id, title: option.name, hint: option.summary }
              })}
              onChange={(next: MethodId) => {
                progressStore.update((c) => setMethod(c, next))
                track('method_change', next)
              }}
            />
            <p className="mt-4 max-w-[68ch] text-sm text-muted">{methodText.rationale}</p>
          </Row>

          <Row
            label={t('settings.yourSet')}
            wide
            hint={
              method.unlockAccuracy === null
                ? t('settings.setNoUnlock', {
                    characters: t('settings.characterCount', { count: characters.length }),
                  })
                : t('settings.setUnlock', {
                    characters: t('settings.characterCount', { count: characters.length }),
                    percent: Math.round(method.unlockAccuracy * 100),
                  })
            }
          >
            <p
              className="mf-tape text-lg break-words"
              aria-label={t('settings.currentSet', { characters: characters.join(', ') })}
            >
              {characters.join(' ')}
            </p>
          </Row>
        </Panel>

        {/* ---- 05 Display & motion ------------------------------------- */}
        <Panel id="display" index={indexOf('display')} title={t('settings.displayTitle')}>
          {theme && (
            <Row label={t('settings.theme')} hint={t('settings.themeHint')}>
              <div className="flex sm:justify-end">{theme}</div>
            </Row>
          )}
          <Row
            label={t('settings.animation')}
            labelId="setting-motion"
            hint={
              <>
                {t('settings.animationHint')}{' '}
                <span className="text-ink">
                  {loaded
                    ? motionReduced
                      ? motion === 'system'
                        ? t('settings.motionReducedSystem')
                        : t('settings.motionReduced')
                      : motion === 'system'
                        ? t('settings.motionOnSystem')
                        : t('settings.motionOn')
                    : ''}
                </span>
              </>
            }
          >
            <Segmented
              label={t('settings.animation')}
              labelledBy="setting-motion"
              block
              value={motion}
              options={MOTION_OPTIONS.map((option) => ({
                value: option.value,
                label: t.raw(option.label),
              }))}
              onChange={(next) => update((c) => ({ ...c, motion: next }))}
            />
          </Row>
        </Panel>

        {/* ---- 06 Data ------------------------------------------------- */}
        <Panel
          id="data"
          index={indexOf('data')}
          title={t('settings.dataTitle')}
          intro={t('settings.dataIntro')}
        >
          <div className="py-5">
            <p className="mf-engraved">{t('settings.inBrowser')}</p>
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
                      {t.capitalise(sectionLabel(t, section))}
                    </span>
                    <span className="block text-sm text-muted">{sectionHint(t, section)}</span>
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
                          ? t('settings.restored')
                          : outcomes[section] === 'rejected'
                            ? t('settings.rejected')
                            : outcomes[section] === 'unsaved'
                              ? t('settings.notSaved')
                              : t('settings.notInFile')}
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
                {t('settings.exportBackup')}
              </button>
              <button
                type="button"
                className="mf-btn mf-btn-secondary"
                onClick={() => fileInput.current?.click()}
              >
                {t('settings.importBackup')}
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
            label={t('settings.counters')}
            htmlFor="setting-counters"
            hint={t('settings.countersHint')}
          >
            <Switch
              id="setting-counters"
              checked={settings.counters}
              label={t('settings.counters')}
              onChange={(counters) => update((c) => ({ ...c, counters }))}
            />
          </Row>

          {/* Separate from the counters above, which never set a cookie and
              keep their own switch. Shown only when the site has a GA ID. */}
          {GA_MEASUREMENT_ID && (
            <Row
              label={t('settings.ga')}
              labelId="setting-ga"
              hint={loaded ? `${t('settings.gaHint')} ${gaState}`.trim() : t('settings.gaHint')}
            >
              <Segmented
                label={t('settings.ga')}
                labelledBy="setting-ga"
                size="sm"
                block
                value={loaded ? (consent?.analytics ?? (optsOut ? 'denied' : null)) : null}
                options={CONSENT_CHOICES.map((choice) => ({
                  value: choice,
                  label:
                    choice === 'granted' ? t('settings.gaAllowed') : t('settings.gaNotAllowed'),
                }))}
                onChange={chooseGa}
              />
            </Row>
          )}

          {(install || platform === 'apple' || platform === 'standalone' || installNote) && (
            <Row
              label={t('settings.install')}
              hint={
                installNote ??
                (platform === 'standalone'
                  ? t('settings.standalone')
                  : install
                    ? t('settings.installHint')
                    : t('settings.appleHint'))
              }
            >
              {install && (
                <div className="flex sm:justify-end">
                  <button
                    type="button"
                    className="mf-btn mf-btn-secondary"
                    onClick={() => void offerInstall()}
                  >
                    {t('settings.installButton')}
                  </button>
                </div>
              )}
            </Row>
          )}

          <Row label={t('settings.erase')} hint={t('settings.eraseHint')}>
            <div className="flex sm:justify-end">
              <button
                type="button"
                className="mf-btn mf-btn-secondary pj-btn-erase"
                onClick={() => {
                  setLastExport(null)
                  setConfirmReset(true)
                }}
              >
                {t('settings.erase')}
              </button>
            </div>
          </Row>
        </Panel>
      </div>

      <ConfirmDialog
        open={pendingImport !== null}
        title={t('settings.restoreTitle')}
        onClose={() => setPendingImport(null)}
        actions={
          <>
            <button
              type="button"
              className="mf-btn mf-btn-ghost"
              onClick={() => setPendingImport(null)}
            >
              {t('settings.cancel')}
            </button>
            <button type="button" className="mf-btn mf-btn-primary" onClick={confirmImport}>
              {t('settings.restore')}
            </button>
          </>
        }
      >
        {pendingImport && (
          <>
            <p>
              {pendingImport.preview.exported
                ? t('settings.restoreBodyDated', {
                    date: pendingImport.preview.exported.toLocaleDateString(
                      t.locale.lang === 'en' ? 'en-GB' : t.locale.lang,
                      { day: 'numeric', month: 'long', year: 'numeric' },
                    ),
                    sections: sectionNames(t, pendingImport.preview.sections),
                  })
                : t('settings.restoreBody', {
                    sections: sectionNames(t, pendingImport.preview.sections),
                  })}
            </p>
            <p className="mt-3 text-muted">{t('settings.restoreNote')}</p>
          </>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmReset}
        title={t('settings.eraseTitle')}
        tone="danger"
        onClose={() => setConfirmReset(false)}
        actions={
          <>
            <button type="button" className="mf-btn mf-btn-ghost sm:mr-auto" onClick={exportBackup}>
              {t('settings.exportFirst')}
            </button>
            <button
              type="button"
              className="mf-btn mf-btn-secondary"
              onClick={() => setConfirmReset(false)}
            >
              {t('settings.cancel')}
            </button>
            <button
              type="button"
              className="mf-btn mf-btn-secondary pj-btn-erase"
              onClick={eraseEverything}
            >
              {t('settings.erase')}
            </button>
          </>
        }
      >
        <p>{resetConsequence(t, inventory)}</p>
        <p className="mt-3 text-muted">
          {t('settings.eraseKeeps', {
            state: settings.counters ? t('settings.on') : t('settings.offWord'),
          })}
        </p>
        {lastExport && (
          <p className="mt-3 font-mono text-control text-signal">
            {t('settings.saved', { file: lastExport })}
          </p>
        )}
      </ConfirmDialog>
    </div>
  )
}
