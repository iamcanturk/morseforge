import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine, type Playback } from '../../engine/audioEngine'
import { buildTimeline, timelineDuration, type TimingOptions } from '../../engine/timingEngine'
import { playheadAt } from '../MorsePlayer/player'
import { createSettingsStore, defaultSettings, type SettingsRecord } from '../../storage/settings'

/** The listener's settings, kept current, and the default until mounted. */
export function useSettings(): SettingsRecord {
  const [settings, setSettings] = useState<SettingsRecord>(defaultSettings)
  useEffect(() => {
    const store = createSettingsStore()
    setSettings(store.read())
    return store.subscribe(() => setSettings(store.read()))
  }, [])
  return settings
}

export interface WireState {
  /** Something is being sent right now. */
  playing: boolean
  /** The key is down at this instant: drives the lamp. */
  lit: boolean
  /** Index of the tape cell sounding, or -1. */
  cell: number
  /** The Web Audio context could not start (blocked, unsupported). */
  audioFailed: boolean
}

export interface Transmission {
  morse: string
  timing: TimingOptions
  /** Cell index per timeline element, from `cellOwners`, or a fixed cell. */
  owners: readonly number[] | number
}

/**
 * Sound and light from one clock.
 *
 * The same timeline schedules the tones on the AudioContext and drives the
 * lamp and the lit tape cell from `performance.now()`, the way the site's
 * player does, so what is seen and what is heard cannot drift apart. With
 * sound switched off in Settings the lamp still carries the whole message:
 * Morse was always a visual code too, and for a deaf reader it is the only
 * one.
 *
 * Nothing plays until `send` is called from a press. There is no autoplay.
 */
export function useWire(settings: SettingsRecord) {
  const [state, setState] = useState<WireState>({
    playing: false,
    lit: false,
    cell: -1,
    audioFailed: false,
  })
  const audio = useRef<AudioEngine | null>(null)
  const playback = useRef<Playback | null>(null)
  const frame = useRef<number | null>(null)
  const endTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const run = useRef(0)

  const halt = useCallback(() => {
    run.current += 1
    playback.current?.stop()
    playback.current = null
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    if (endTimer.current !== null) clearTimeout(endTimer.current)
    endTimer.current = null
    setState((s) => ({ ...s, playing: false, lit: false, cell: -1 }))
  }, [])

  useEffect(
    () => () => {
      run.current += 1
      playback.current?.stop()
      if (frame.current !== null) cancelAnimationFrame(frame.current)
      if (endTimer.current !== null) clearTimeout(endTimer.current)
      void audio.current?.dispose()
    },
    [],
  )

  const send = useCallback(
    async ({ morse, timing, owners }: Transmission) => {
      halt()
      const timeline = buildTimeline(morse, timing)
      if (timeline.length === 0) return
      const id = run.current
      const duration = timelineDuration(timeline)
      setState((s) => ({ ...s, playing: true }))

      let lead = 0
      if (settings.audio.enabled) {
        try {
          audio.current ??= new AudioEngine()
          audio.current.update({
            frequency: settings.audio.frequency,
            volume: settings.audio.volume,
          })
          playback.current = await audio.current.playTimeline(timeline)
          // The engine schedules the first tone a little ahead so nothing is
          // clipped; start the lamp on the same beat.
          lead = 60
          setState((s) => (s.audioFailed ? { ...s, audioFailed: false } : s))
        } catch {
          // No audio (blocked, or no Web Audio at all): the lamp still sends.
          setState((s) => ({ ...s, audioFailed: true }))
        }
      }
      if (run.current !== id) return

      const startedAt = performance.now() + lead
      let lastLit = false
      let lastCell = -1
      const tick = () => {
        if (run.current !== id) return
        const head = playheadAt(timeline, performance.now() - startedAt)
        const cell =
          head.index < 0
            ? lastCell
            : typeof owners === 'number'
              ? owners
              : (owners[head.index] ?? -1)
        if (head.on !== lastLit || cell !== lastCell) {
          lastLit = head.on
          lastCell = cell
          setState((s) => ({ ...s, lit: head.on, cell }))
        }
        frame.current = requestAnimationFrame(tick)
      }
      frame.current = requestAnimationFrame(tick)

      // Finished by a timer, not by the frame loop: a hidden tab stops
      // animation frames while the scheduled audio carries on.
      endTimer.current = setTimeout(() => {
        if (run.current !== id) return
        halt()
      }, duration + lead)
    },
    [halt, settings],
  )

  return { ...state, send, stop: halt }
}
