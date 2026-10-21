import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import '../../styles/pkg-i.css'
import { AudioEngine, type Playback } from '../../engine/audioEngine'
import {
  WPM_MAX,
  WPM_MIN,
  initialChannels,
  playGate,
  playheadAt,
  startGated,
  storedSettings,
} from './player'
import { buildTimeline, timelineDuration } from '../../engine/timingEngine'
import { prettify } from '../../engine/morseEncoder'
import { spokenCode } from '../../engine/spokenCode'
import { type SettingsRecord, audioOptions, createSettingsStore } from '../../storage/settings'
import { Lamp } from '../ui/Lamp'
import { canVibrate, stopVibration, vibrateTimeline } from '../../engine/vibrationEngine'

/**
 * Plays a Morse string as sound and as light.
 *
 * The lamp is not decoration. Morse has always been sent visually — signal
 * lamps, heliographs, an aldis light between ships — and a visual channel is
 * the only way a deaf or hard-of-hearing learner can use this app at all
 * (PROJECT.md §28). It is the same timeline driving both, so what you see is
 * exactly what you would hear.
 */

export interface MorsePlayerProps {
  /** Morse to play, in the encoder's format: ".- / -..." */
  morse: string
  /** Shown above the controls, e.g. the original text. */
  label?: string
  initialWpm?: number
  /** Start with the lamp on. */
  initialFlash?: boolean
  compact?: boolean
  /**
   * Play once as soon as it appears.
   *
   * For the lesson, where the whole step is "now receive it" and making the
   * learner press a button first would be a step backwards. Only ever fires
   * once per code — the AudioContext is already unlocked by then, since the
   * lesson only reaches this step from a press.
   */
  autoPlay?: boolean
  /**
   * Called when playback starts.
   *
   * The player is used on word pages, in lessons and in the translator, and
   * those are not the same event. Rather than have the player guess where it
   * is, the caller says what a play means to it.
   */
  onPlay?: () => void
  /**
   * `panel` (default): a CRT strip with the code and the lamp, controls below.
   * `deck`: one low strip of lamp and controls, for a caller that already
   * shows the code on its own screen (the translator).
   */
  layout?: 'panel' | 'deck'
}

/** Where the playhead is, and whether the key is down at that instant. */

/**
 * Resolve the timeline position at `elapsedMs`.
 *
 * Exported for tests: this is the one piece of the player with real logic, and
 * it is pure.
 */

export function MorsePlayer({
  morse,
  label,
  initialWpm = 12,
  initialFlash = false,
  autoPlay = false,
  onPlay,
  compact = false,
  layout = 'panel',
}: MorsePlayerProps) {
  const [wpm, setWpm] = useState(initialWpm)
  const [flash, setFlash] = useState(initialFlash)
  const [sound, setSound] = useState(true)
  const [buzz, setBuzz] = useState(false)
  const [vibrationSupported, setVibrationSupported] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [lit, setLit] = useState(false)

  const audio = useRef<AudioEngine | null>(null)
  const playback = useRef<Playback | null>(null)
  const frame = useRef<number | null>(null)
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  /** Which press of Play is live; see `playGate`. */
  const gate = useRef(playGate())
  /**
   * Sound as `play` must see it. A ref as well as state because the
   * lesson's autoplay fires in the same commit that reads the Signal
   * setting, before the state from that read has rendered: the ref is what
   * keeps a Lamp learner's first character silent.
   */
  const soundOn = useRef(sound)
  soundOn.current = sound
  const settings = useRef<SettingsRecord | null>(null)

  // Start where the learner set the site (A-18): Signal = Lamp means a
  // silent Play and the lamp on. Read after mount, since the page is
  // prerendered with no storage. A later change of the setting (in another
  // tab, say) applies too; the player's own toggles still win until then.
  useEffect(() => {
    const store = createSettingsStore()
    let applied: SettingsRecord['signal'] | null = null
    const apply = (next: SettingsRecord) => {
      settings.current = next
      audio.current?.update(audioOptions(next))
      if (next.signal === applied) return
      applied = next.signal
      const start = initialChannels(next, initialFlash)
      soundOn.current = start.sound
      setSound(start.sound)
      if (start.lamp) setFlash(true)
    }
    const stored = storedSettings()
    if (stored) apply(stored)
    return store.subscribe(apply)
  }, [initialFlash])

  const timeline = useMemo(() => buildTimeline(morse, { wpm }), [morse, wpm])
  const durationMs = useMemo(() => timelineDuration(timeline), [timeline])

  const stopVisuals = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    setLit(false)
  }, [])

  const stop = useCallback(() => {
    // A press still waiting for the audio to start is now stale.
    gate.current.cancel()
    stopVibration()
    playback.current?.stop()
    playback.current = null
    if (endTimer.current !== null) clearTimeout(endTimer.current)
    endTimer.current = null
    stopVisuals()
    setPlaying(false)
  }, [stopVisuals])

  useEffect(() => setVibrationSupported(canVibrate()), [])

  useEffect(() => {
    return () => {
      stopVibration()
      playback.current?.stop()
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      if (endTimer.current !== null) clearTimeout(endTimer.current)
      void audio.current?.dispose()
    }
  }, [])

  // Changing speed mid-playback would desync the lamp from the audio, which was
  // scheduled at the old timing. Stop instead of trying to re-sync.
  useEffect(() => {
    stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morse, wpm])

  const play = useCallback(async () => {
    if (playing) {
      stop()
      return
    }

    const ticket = gate.current.begin()
    setPlaying(true)
    onPlay?.()

    // Audio and light run off the same wall clock rather than off each other,
    // so a muted player still lights up on exactly the right beats.
    const startedAt = performance.now()

    if (soundOn.current) {
      // At the learner's own tone and volume, like every other tone here.
      const engine = (audio.current ??= new AudioEngine(
        settings.current ? audioOptions(settings.current) : {},
      ))
      const started = await startGated(ticket, () => engine.playTimeline(timeline))
      // Stopped during start-up: `stop()` already reset everything, and the
      // late playback has been silenced. Failed: reset, or it reads "Stop".
      if (!ticket.isCurrent()) return
      if (!started) {
        stop()
        return
      }
      playback.current = started
    }

    // Fired once for the whole message rather than per element: the API takes
    // the entire pattern and runs it on the device, which stays in step even
    // if the main thread stalls.
    if (buzz) vibrateTimeline(timeline)

    // Completion is driven by a timer, not by the animation frame loop.
    // requestAnimationFrame does not run at all in a hidden tab, so a listener
    // who switches away mid-playback would come back to a player stuck showing
    // STOP — while the audio, scheduled on the AudioContext, had long finished.
    endTimer.current = setTimeout(() => {
      endTimer.current = null
      stopVisuals()
      setPlaying(false)
      playback.current = null
    }, durationMs)

    // The frame loop only drives the lamp. It pausing while hidden is correct —
    // nobody is looking — and because each frame recomputes from `startedAt`
    // rather than accumulating, it re-syncs exactly on return.
    const tick = () => {
      const elapsed = performance.now() - startedAt
      if (elapsed >= durationMs) {
        stopVisuals()
        return
      }
      setLit(playheadAt(timeline, elapsed).on)
      frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [playing, stop, buzz, timeline, durationMs, stopVisuals, onPlay])

  // Keyed on the code, so moving to the next character in a lesson plays the
  // new one and nothing replays when a setting changes.
  const playRef = useRef(play)
  playRef.current = play
  useEffect(() => {
    if (!autoPlay) return
    void playRef.current()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [morse, autoPlay])

  const seconds = (durationMs / 1000).toFixed(1)

  // The lamp is aria-hidden: the Morse itself is already in the DOM, and a
  // screen reader announcing every flash would be unusable. On and off are
  // instant (no transition): easing would blur the dot/dash distinction the
  // learner is meant to be reading.
  const bulb = flash ? (
    <div
      aria-hidden="true"
      data-on={lit ? 'true' : 'false'}
      className={layout === 'deck' ? 'pi-bulb' : 'pi-bulb pi-bulb-lg'}
    />
  ) : null

  const controls = (
    <div className="flex flex-wrap items-center gap-2 sm:gap-3">
      <button type="button" onClick={() => void play()} className="mf-btn mf-btn-audio min-w-28">
        <Lamp on={playing} tone="cyan" />
        {playing ? 'Stop' : 'Play'}
      </button>

      <Toggle on={sound} onToggle={() => setSound((on) => !on)}>
        Sound
      </Toggle>

      {vibrationSupported && (
        <Toggle on={buzz} tone="amber" onToggle={() => setBuzz((on) => !on)}>
          Buzz
        </Toggle>
      )}

      <Toggle on={flash} tone="cyan" onToggle={() => setFlash((on) => !on)}>
        Lamp
      </Toggle>

      {!compact && (
        <span className="ml-auto font-mono text-control text-muted tabular-nums">
          <span className="sr-only">Length </span>~{seconds}s
        </span>
      )}
    </div>
  )

  const speed = (
    <label className="flex items-center gap-3">
      <span className="mf-engraved">Speed</span>
      <input
        type="range"
        min={WPM_MIN}
        max={WPM_MAX}
        value={wpm}
        onChange={(event) => setWpm(Number(event.target.value))}
        className="mf-range flex-1"
        aria-label="Speed in words per minute"
      />
      <span className="w-16 text-right font-mono text-control text-signal tabular-nums">
        {wpm} WPM
      </span>
    </label>
  )

  if (layout === 'deck') {
    return (
      <div className="mf-panel flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:gap-6 sm:p-5">
        <div className="flex items-center gap-4">
          <div className="mf-screen mf-screen-flush grid size-24 shrink-0 place-items-center">
            {bulb ?? <span className="mf-engraved">Off</span>}
          </div>
          {label && <span className="mf-engraved sm:hidden">{label}</span>}
        </div>
        <div className="flex min-w-0 flex-1 flex-col gap-4">
          {controls}
          {speed}
        </div>
      </div>
    )
  }

  return (
    <div className="mf-panel p-3 sm:p-4">
      <div className="mf-screen flex items-center gap-5 px-5 py-5 sm:px-6">
        <div className="relative min-w-0 flex-1">
          {label && <p className="mf-engraved">{label}</p>}
          <p className="pi-code mt-2 font-mono text-xl text-signal sm:text-2xl">
            <span className="sr-only">{spokenCode(morse)}</span>
            <span aria-hidden="true">{prettify(morse)}</span>
          </p>
        </div>
        {bulb}
      </div>
      <div className="mt-4 space-y-4 px-1">
        {controls}
        {speed}
      </div>
    </div>
  )
}

/** An on/off control: aria-pressed, with its own small lamp as the non-colour cue. */
function Toggle({
  on,
  tone,
  onToggle,
  children,
}: {
  on: boolean
  tone?: 'amber' | 'cyan'
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      className="mf-btn mf-btn-secondary mf-btn-sm pi-toggle"
    >
      <span
        className="mf-lamp"
        data-tone={tone}
        data-on={on ? 'true' : 'false'}
        aria-hidden="true"
      />
      {children}
    </button>
  )
}
