/**
 * CW tone generation with the Web Audio API (PROJECT.md §8, §27).
 *
 * Two things make this sound like a radio rather than a browser beeping:
 *
 * 1. **Envelope shaping.** Switching a gain node straight from 0 to 1 produces
 *    a broadband click ("key clicks" — the thing operators get told off for on
 *    the air). Every edge is ramped over `riseTime`, which is why the tone
 *    sounds soft rather than digital.
 * 2. **Sample-clock scheduling.** Elements are scheduled ahead of time against
 *    `AudioContext.currentTime`, not fired from `setTimeout`. Timer jitter at
 *    35 WPM (a 34 ms dot) would be plainly audible as a wobbly fist.
 */

import { type TimedElement, buildTimeline, type TimingOptions } from './timingEngine'

export interface AudioSettings {
  /** Sidetone pitch in Hz. 600 is the §8 default; 400–800 is the useful range. */
  frequency: number
  /** 0..1. Default 0.15 per §8 — a CW sidetone should sit under speech level. */
  volume: number
  /**
   * Rise/fall time of each element edge, in seconds. Below ~2 ms you hear
   * clicks; above ~10 ms short dots at high speed start to sound mushy.
   */
  riseTime: number
}

export const DEFAULT_AUDIO_SETTINGS: AudioSettings = {
  frequency: 600,
  volume: 0.15,
  riseTime: 0.005,
}

/** A scheduled tone: when it starts and how long it sounds, in seconds. */
export interface ScheduledTone {
  startAt: number
  duration: number
  element: TimedElement
}

/**
 * Turn a timeline into absolute tone start times, relative to 0.
 *
 * Pure and exported so the scheduling can be unit-tested without a browser —
 * `AudioContext` is the part we cannot exercise in CI.
 */
export function scheduleTimeline(timeline: readonly TimedElement[]): {
  tones: ScheduledTone[]
  totalDuration: number
} {
  const tones: ScheduledTone[] = []
  let offset = 0

  for (const element of timeline) {
    if (element.on) {
      tones.push({ startAt: offset / 1000, duration: element.duration / 1000, element })
    }
    offset += element.duration
  }

  return { tones, totalDuration: offset / 1000 }
}

/** Handle for a playback in progress. */
export interface Playback {
  /** Resolves when playback finishes, or immediately if it is stopped. */
  finished: Promise<void>
  stop: () => void
}

export class AudioEngine {
  #context: AudioContext | null = null
  #master: GainNode | null = null
  #settings: AudioSettings
  #liveOscillator: OscillatorNode | null = null
  #liveGain: GainNode | null = null
  #activeNodes = new Set<OscillatorNode>()
  /** Tones `keyFor` scheduled, with when each is due to end. */
  #keyed = new Map<OscillatorNode, { gain: GainNode; off: number }>()

  constructor(settings: Partial<AudioSettings> = {}) {
    this.#settings = { ...DEFAULT_AUDIO_SETTINGS, ...settings }
  }

  get settings(): Readonly<AudioSettings> {
    return this.#settings
  }

  /** Live setting changes apply to the next element, not the one sounding. */
  update(settings: Partial<AudioSettings>): void {
    this.#settings = { ...this.#settings, ...settings }
    if (this.#master && this.#context) {
      this.#master.gain.setTargetAtTime(this.#settings.volume, this.#context.currentTime, 0.01)
    }
  }

  /** True once the context exists and is running. */
  get isReady(): boolean {
    return this.#context?.state === 'running'
  }

  /**
   * The live AudioContext, or null before `resume()` has run.
   *
   * Exposed for the studio, which has to build an analyser and a recording
   * destination out of the same context the tones are scheduled on. Nothing
   * else should reach for this — the rest of the site is better served by
   * `play`, which cannot desynchronise the clock.
   */
  get context(): AudioContext | null {
    return this.#context
  }

  /**
   * Send the output somewhere in addition to the speakers.
   *
   * Additive: the master node keeps its existing connection, so tapping for a
   * recording never silences playback.
   */
  tap(node: AudioNode): void {
    this.#master?.connect(node)
  }

  /**
   * Create or resume the AudioContext.
   *
   * Browsers only allow this from a user gesture, so every entry point that can
   * make noise (pressing the key, starting a lesson, hitting play) must call
   * this from within the handler — not from an effect on mount.
   */
  async resume(): Promise<void> {
    this.#context ??= new AudioContext()
    if (this.#context.state === 'suspended') await this.#context.resume()

    if (!this.#master) {
      this.#master = this.#context.createGain()
      this.#master.gain.value = this.#settings.volume
      this.#master.connect(this.#context.destination)
    }
  }

  /** Play a Morse string. Resolves when the last element has sounded. */
  async play(morse: string, timing: TimingOptions): Promise<Playback> {
    return this.playTimeline(buildTimeline(morse, timing))
  }

  async playTimeline(timeline: readonly TimedElement[]): Promise<Playback> {
    await this.resume()
    const context = this.#context!
    const master = this.#master!

    const { tones, totalDuration } = scheduleTimeline(timeline)
    const startTime = context.currentTime + 0.06 // small lead so nothing is clipped
    const scheduled: OscillatorNode[] = []

    for (const tone of tones) {
      const oscillator = context.createOscillator()
      const gain = context.createGain()
      oscillator.type = 'sine'
      oscillator.frequency.value = this.#settings.frequency

      const on = startTime + tone.startAt
      const off = on + tone.duration
      const rise = Math.min(this.#settings.riseTime, tone.duration / 2)

      // Ramp both edges — see the key-click note at the top of the file.
      gain.gain.setValueAtTime(0, on)
      gain.gain.linearRampToValueAtTime(1, on + rise)
      gain.gain.setValueAtTime(1, off - rise)
      gain.gain.linearRampToValueAtTime(0, off)

      oscillator.connect(gain).connect(master)
      oscillator.start(on)
      oscillator.stop(off + 0.01)

      scheduled.push(oscillator)
      this.#activeNodes.add(oscillator)
      oscillator.addEventListener('ended', () => this.#activeNodes.delete(oscillator))
    }

    let stopped = false
    let resolveFinished!: () => void
    const finished = new Promise<void>((resolve) => {
      resolveFinished = resolve
    })

    const timer = setTimeout(
      () => {
        if (!stopped) resolveFinished()
      },
      (startTime - context.currentTime + totalDuration) * 1000 + 20,
    )

    return {
      finished,
      stop: () => {
        if (stopped) return
        stopped = true
        clearTimeout(timer)
        for (const oscillator of scheduled) {
          try {
            oscillator.stop()
          } catch {
            // Already stopped, or never started because we stopped first.
          }
          this.#activeNodes.delete(oscillator)
        }
        resolveFinished()
      },
    }
  }

  /**
   * Start the sidetone and hold it (PROJECT.md §9). Paired with `keyUp`, this is
   * what the straight key uses — the operator controls the length, so nothing
   * can be scheduled in advance.
   */
  async keyDown(): Promise<void> {
    await this.resume()
    if (this.#liveOscillator) return // already down; ignore key repeat

    const context = this.#context!
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = this.#settings.frequency

    const now = context.currentTime
    gain.gain.setValueAtTime(0, now)
    gain.gain.linearRampToValueAtTime(1, now + this.#settings.riseTime)

    oscillator.connect(gain).connect(this.#master!)
    oscillator.start(now)

    this.#liveOscillator = oscillator
    this.#liveGain = gain
  }

  keyUp(): void {
    if (!this.#liveOscillator || !this.#liveGain || !this.#context) return

    const now = this.#context.currentTime
    const fall = this.#settings.riseTime
    // Cancel any in-flight rise before ramping down, otherwise a very short tap
    // leaves a scheduled ramp that fights this one and the tone hangs.
    this.#liveGain.gain.cancelScheduledValues(now)
    this.#liveGain.gain.setValueAtTime(this.#liveGain.gain.value, now)
    this.#liveGain.gain.linearRampToValueAtTime(0, now + fall)
    this.#liveOscillator.stop(now + fall + 0.01)

    this.#liveOscillator = null
    this.#liveGain = null
  }

  /**
   * Sound the sidetone for exactly `ms`, on the sample clock.
   *
   * For the paddle keyer, which knows how long each element is the moment it
   * starts. Stopping the tone from a timer instead would land each edge a few
   * milliseconds off, a different few every time, and at 30 WPM that is heard
   * as a ragged fist. The keyer's own timers still drive the lamp and the
   * decoder; only the sound is scheduled here.
   */
  async keyFor(ms: number): Promise<void> {
    await this.resume()
    const context = this.#context!
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.type = 'sine'
    oscillator.frequency.value = this.#settings.frequency

    const on = context.currentTime
    const off = on + ms / 1000
    const rise = Math.min(this.#settings.riseTime, ms / 2000)
    // The same shaped edges as `playTimeline`: see the key-click note above.
    gain.gain.setValueAtTime(0, on)
    gain.gain.linearRampToValueAtTime(1, on + rise)
    gain.gain.setValueAtTime(1, off - rise)
    gain.gain.linearRampToValueAtTime(0, off)

    oscillator.connect(gain).connect(this.#master!)
    oscillator.start(on)
    oscillator.stop(off + 0.01)
    this.#keyed.set(oscillator, { gain, off })
    oscillator.addEventListener('ended', () => this.#keyed.delete(oscillator))
  }

  /** Cut short whatever `keyFor` is sounding, with the usual soft fall. */
  stopKeyed(): void {
    if (!this.#context) return
    const now = this.#context.currentTime
    const fall = this.#settings.riseTime
    for (const [oscillator, { gain, off }] of this.#keyed) {
      if (off <= now) continue
      gain.gain.cancelScheduledValues(now)
      gain.gain.setValueAtTime(gain.gain.value, now)
      gain.gain.linearRampToValueAtTime(0, now + fall)
      try {
        oscillator.stop(now + fall + 0.01)
      } catch {
        // Already stopped.
      }
    }
    this.#keyed.clear()
  }

  /** Stop everything immediately. */
  stopAll(): void {
    this.keyUp()
    this.stopKeyed()
    for (const oscillator of this.#activeNodes) {
      try {
        oscillator.stop()
      } catch {
        // Already finished.
      }
    }
    this.#activeNodes.clear()
  }

  async dispose(): Promise<void> {
    this.stopAll()
    await this.#context?.close()
    this.#context = null
    this.#master = null
  }
}
