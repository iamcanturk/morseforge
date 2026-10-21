import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine, type Playback } from '../../engine/audioEngine'
import { type TimedElement, buildTimeline, timelineDuration } from '../../engine/timingEngine'
import {
  type SettingsRecord,
  type SignalMode,
  audioOptions,
  hasLamp,
  hasSound,
} from '../../storage/settings'

/**
 * One transmitter for every listening prompt (DEC-045).
 *
 * Sends a code as sound, as light, or both, from the learner's Signal
 * setting. One timeline drives both channels, so what the lamp shows is
 * exactly what the tone would have sounded: the same elements, the same
 * lengths, the same gaps. With Signal = Lamp no AudioContext is ever created,
 * so nothing can make a noise.
 *
 * Extracted from the Signal Tree's own hook, which did this first.
 */

export interface TransmitTiming {
  wpm: number
  farnsworthWpm: number
}

export interface Transmitter {
  /** From the call until the last element finishes or stop() is called. */
  busy: boolean
  /** True while an "on" element is being sent AND hasLamp(settings). Always false in 'sound' mode. */
  lit: boolean
  /**
   * Send `morse` as encode() writes it ('.', '-', ' ', '/'). One timeline drives both channels.
   * Restarts any transmission in progress. Sound only if settings.audio.enabled (the AudioContext is
   * created on the first call, which must be inside a user gesture). Lamp only if hasLamp(settings).
   * Resolves when finished or stopped; never rejects.
   */
  transmit(morse: string, timing: TransmitTiming): Promise<void>
  stop(): void
}

/**
 * How far ahead `AudioEngine.playTimeline` schedules its first tone, in ms.
 *
 * The engine starts 60 ms after the call so the first edge is never clipped.
 * When the tone plays too, the lamp waits the same 60 ms, or in Both mode it
 * would light visibly before the sound.
 */
export const AUDIO_LEAD_MS = 60

/** One change of the lamp, `at` ms after the call. */
export interface LampFlip {
  at: number
  on: boolean
}

export interface TransmissionPlan {
  sound: boolean
  lamp: boolean
  /** The lamp's on and off edges, two per element, empty when there is no lamp. */
  flips: LampFlip[]
  /** When the last element has finished, ms after the call. */
  endsAt: number
}

/** Light edges for a timeline: on at each element's start, off at its end. */
export function lampFlips(timeline: readonly TimedElement[], offsetMs = 0): LampFlip[] {
  const flips: LampFlip[] = []
  let at = offsetMs
  for (const element of timeline) {
    if (element.on) flips.push({ at, on: true }, { at: at + element.duration, on: false })
    at += element.duration
  }
  return flips
}

/**
 * What a transmission does on each channel, and when. Pure, so the schedule
 * can be tested without a browser; the hook below only carries it out.
 */
export function planTransmission(
  timeline: readonly TimedElement[],
  signal: SignalMode,
): TransmissionPlan {
  const sound = hasSound({ signal })
  const lamp = hasLamp({ signal })
  const lead = sound ? AUDIO_LEAD_MS : 0
  return {
    sound,
    lamp,
    flips: lamp ? lampFlips(timeline, lead) : [],
    endsAt: timeline.length === 0 ? 0 : lead + timelineDuration(timeline),
  }
}

export function useTransmitter(settings: SettingsRecord): Transmitter {
  const engine = useRef<AudioEngine | null>(null)
  const playback = useRef<Playback | null>(null)
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  /** Resolves the transmission in progress; called on finish, restart and stop. */
  const settle = useRef<(() => void) | null>(null)
  /** Which transmission is live. Audio that starts after a restart checks it. */
  const run = useRef(0)
  // Read at call time, so `transmit` keeps one identity across setting
  // changes and a consumer's effects do not re-run when the tone changes.
  const latest = useRef(settings)
  latest.current = settings
  const [lit, setLit] = useState(false)
  const [busy, setBusy] = useState(false)

  /** End whatever is in progress, resolving its promise. Leaves `busy` alone. */
  const halt = useCallback(() => {
    run.current += 1
    for (const timer of timers.current) clearTimeout(timer)
    timers.current = []
    playback.current?.stop()
    playback.current = null
    setLit(false)
    const resolve = settle.current
    settle.current = null
    resolve?.()
  }, [])

  // A setting changed mid-visit applies to the next tone.
  useEffect(() => {
    engine.current?.update(audioOptions(settings))
  }, [settings])

  useEffect(
    () => () => {
      halt()
      const disposing = engine.current
      engine.current = null
      void disposing?.dispose()
    },
    [halt],
  )

  const stop = useCallback(() => {
    halt()
    setBusy(false)
  }, [halt])

  const transmit = useCallback(
    (morse: string, timing: TransmitTiming): Promise<void> => {
      halt()
      const id = run.current
      const current = latest.current
      const timeline = buildTimeline(morse, timing)
      const plan = planTransmission(timeline, current.signal)
      if (timeline.length === 0) {
        setBusy(false)
        return Promise.resolve()
      }
      setBusy(true)

      for (const flip of plan.flips) {
        timers.current.push(setTimeout(() => setLit(flip.on), flip.at))
      }
      const done = new Promise<void>((resolve) => {
        settle.current = resolve
        timers.current.push(
          setTimeout(() => {
            if (run.current !== id) return
            settle.current = null
            timers.current = []
            // `playback` is kept: if the AudioContext started late, its last
            // tone may still be ringing, and the next transmit() stops it.
            setLit(false)
            setBusy(false)
            resolve()
          }, plan.endsAt),
        )
      })

      // `audio.enabled` and `hasSound` are the same truth (the validator keeps
      // them equal); this reads the switch too, so a record written by hand
      // that left them apart still honours the mute.
      if (plan.sound && current.audio.enabled) {
        // Created inside the gesture: browsers only start audio from one.
        // Not awaited: if the browser holds the AudioContext suspended, the
        // light still runs and the transmission still ends on time.
        engine.current ??= new AudioEngine(audioOptions(current))
        engine.current
          .playTimeline(timeline)
          .then((started) => {
            if (run.current === id) playback.current = started
            else started.stop()
          })
          .catch(() => undefined)
      }
      return done
    },
    [halt],
  )

  return useMemo(() => ({ busy, lit, transmit, stop }), [busy, lit, transmit, stop])
}
