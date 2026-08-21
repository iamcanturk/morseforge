import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine, type Playback } from '../../engine/audioEngine'
import { buildTimeline, timelineDuration, type TimedElement } from '../../engine/timingEngine'
import { prettify } from '../../engine/morseEncoder'
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
}

/** Where the playhead is, and whether the key is down at that instant. */
interface Playhead {
  on: boolean
  index: number
}

/**
 * Resolve the timeline position at `elapsedMs`.
 *
 * Exported for tests: this is the one piece of the player with real logic, and
 * it is pure.
 */
export function playheadAt(timeline: readonly TimedElement[], elapsedMs: number): Playhead {
  let offset = 0
  for (const [index, element] of timeline.entries()) {
    offset += element.duration
    if (elapsedMs < offset) return { on: element.on, index }
  }
  return { on: false, index: -1 }
}

const WPM_MIN = 5
const WPM_MAX = 40

export function MorsePlayer({
  morse,
  label,
  initialWpm = 12,
  initialFlash = false,
  compact = false,
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

  const timeline = useMemo(() => buildTimeline(morse, { wpm }), [morse, wpm])
  const durationMs = useMemo(() => timelineDuration(timeline), [timeline])

  const stopVisuals = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    setLit(false)
  }, [])

  const stop = useCallback(() => {
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

    setPlaying(true)

    // Audio and light run off the same wall clock rather than off each other,
    // so a muted player still lights up on exactly the right beats.
    const startedAt = performance.now()

    if (sound) {
      audio.current ??= new AudioEngine()
      playback.current = await audio.current.playTimeline(timeline)
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
  }, [playing, stop, sound, buzz, timeline, durationMs, stopVisuals])

  const seconds = (durationMs / 1000).toFixed(1)

  return (
    <div className="rounded-xl border border-line bg-panel p-5">
      {label && (
        <div className="mb-1 font-mono text-[10px] tracking-[0.18em] text-muted">{label}</div>
      )}

      <p className="font-mono text-lg break-all text-cyan" aria-label={`Morse code: ${morse}`}>
        {prettify(morse)}
      </p>

      {/* The lamp. `aria-hidden` because the Morse itself is already in the DOM
          above — a screen reader announcing every flash would be unusable. */}
      {flash && (
        <div
          aria-hidden="true"
          className="mt-4 h-24 rounded-lg border"
          style={{
            borderColor: lit ? 'var(--color-signal)' : 'var(--color-line)',
            background: lit ? 'var(--color-signal)' : 'var(--color-void)',
            boxShadow: lit
              ? '0 0 60px color-mix(in srgb, var(--color-signal) 60%, transparent)'
              : 'none',
            // No transition: a signal lamp is on or off. Easing it would blur
            // the dot/dash distinction the learner is meant to be reading.
          }}
        />
      )}

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => void play()}
          className="rounded-lg px-5 py-2.5 font-mono text-xs tracking-[0.14em]"
          style={{
            background: playing ? 'var(--color-line)' : 'var(--color-signal)',
            color: playing ? 'var(--color-ink)' : 'var(--color-void)',
          }}
        >
          {playing ? '■ STOP' : '▶ PLAY'}
        </button>

        <button
          type="button"
          aria-pressed={sound}
          onClick={() => setSound((on) => !on)}
          className="rounded-lg border px-3 py-2.5 font-mono text-xs tracking-[0.14em]"
          style={{
            borderColor: sound ? 'var(--color-signal)' : 'var(--color-line)',
            color: sound ? 'var(--color-signal)' : 'var(--color-muted)',
          }}
        >
          SOUND
        </button>

        {vibrationSupported && (
          <button
            type="button"
            aria-pressed={buzz}
            onClick={() => setBuzz((on) => !on)}
            className="rounded-lg border px-3 py-2.5 font-mono text-xs tracking-[0.14em]"
            style={{
              borderColor: buzz ? 'var(--color-amber)' : 'var(--color-line)',
              color: buzz ? 'var(--color-amber)' : 'var(--color-muted)',
            }}
          >
            BUZZ
          </button>
        )}

        <button
          type="button"
          aria-pressed={flash}
          onClick={() => setFlash((on) => !on)}
          className="rounded-lg border px-3 py-2.5 font-mono text-xs tracking-[0.14em]"
          style={{
            borderColor: flash ? 'var(--color-cyan)' : 'var(--color-line)',
            color: flash ? 'var(--color-cyan)' : 'var(--color-muted)',
          }}
        >
          LAMP
        </button>

        {!compact && (
          <span className="font-mono text-[11px] tracking-[0.12em] text-muted">~{seconds}s</span>
        )}
      </div>

      <label className="mt-4 flex items-center gap-3">
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted">SPEED</span>
        <input
          type="range"
          min={WPM_MIN}
          max={WPM_MAX}
          value={wpm}
          onChange={(event) => setWpm(Number(event.target.value))}
          className="flex-1 accent-[var(--color-signal)]"
          aria-label="Speed in words per minute"
        />
        <span className="w-16 text-right font-mono text-xs text-signal">{wpm} WPM</span>
      </label>
    </div>
  )
}
