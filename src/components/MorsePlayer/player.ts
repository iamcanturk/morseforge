/**
 * The Morse player, without a framework.
 *
 * The word pages exist to receive search traffic. They are the pages most
 * likely to be opened once, on a phone, on a poor connection — and the entire
 * interaction is a play button, three toggles and a speed slider. Shipping the
 * React runtime for that was 179 KB of framework behind about sixty lines of
 * logic.
 *
 * This is the same player driven by hand. The audio engine was already
 * framework-agnostic, so nothing about the sound changed; only the rendering
 * did. The markup is server-rendered by `MorsePlayer.astro`, which means the
 * code and its translation are readable with no JavaScript at all — better
 * than the React version, which rendered nothing until it hydrated.
 */

import { AudioEngine } from '../../engine/audioEngine'
import { buildTimeline, timelineDuration, type TimedElement } from '../../engine/timingEngine'
import { canVibrate, stopVibration, vibrateTimeline } from '../../engine/vibrationEngine'
import {
  type SettingsRecord,
  WPM_RANGE,
  audioOptions,
  createSettingsStore,
  hasLamp,
  hasSound,
} from '../../storage/settings'

/** The slider's range: the one the settings and every page quote. */
export const WPM_MIN = WPM_RANGE.min
export const WPM_MAX = WPM_RANGE.max

export interface Playhead {
  on: boolean
  index: number
}

/**
 * Which element is sounding at `elapsedMs`.
 *
 * Shared with the React player rather than reimplemented, so the lamp cannot
 * disagree with itself between two pages of the same site.
 */
export function playheadAt(timeline: readonly TimedElement[], elapsedMs: number): Playhead {
  let offset = 0
  for (const [index, element] of timeline.entries()) {
    offset += element.duration
    if (elapsedMs < offset) return { on: element.on, index }
  }
  return { on: false, index: -1 }
}

/**
 * How a player starts, from the Signal setting (A-18, DEC-045).
 *
 * The player's own Sound and Lamp toggles stay, but they start where the
 * learner set the site: with Signal = Lamp, Play is silent and the lamp is
 * on, so a muted classroom or a deaf learner is never surprised by a tone.
 * A page that asks for the lamp keeps it whatever the setting.
 */
export function initialChannels(
  settings: Pick<SettingsRecord, 'signal'>,
  flash: boolean,
): { sound: boolean; lamp: boolean } {
  return { sound: hasSound(settings), lamp: flash || hasLamp(settings) }
}

/** The stored settings, or null where there is no storage to read. */
export function storedSettings(): SettingsRecord | null {
  try {
    return createSettingsStore().read()
  } catch {
    return null
  }
}

/** One press of Play, and whether it is still the one that counts. */
export interface PlayTicket {
  isCurrent: () => boolean
}

/**
 * Which press of Play is the live one.
 *
 * The first press resumes a suspended AudioContext, which can take a
 * noticeable moment (iOS). Without this, Stop pressed during that wait set the
 * player back to idle, and then the resolved playback, its end timer and the
 * lamp started anyway; two quick presses could also sound over each other.
 * Every press takes a ticket and every stop cancels them all.
 */
export function playGate() {
  let current = 0
  return {
    begin(): PlayTicket {
      current += 1
      const id = current
      return { isCurrent: () => id === current }
    },
    cancel(): void {
      current += 1
    },
  }
}

/**
 * Start a playback for a ticket. Resolves to the playback while the ticket is
 * still current; to null if the start failed, or if a stop came in while it
 * was starting, in which case the late playback is silenced at once.
 */
export async function startGated<T extends { stop: () => void }>(
  ticket: PlayTicket,
  start: () => Promise<T>,
): Promise<T | null> {
  let playback: T
  try {
    playback = await start()
  } catch {
    return null
  }
  if (!ticket.isCurrent()) {
    playback.stop()
    return null
  }
  return playback
}

interface Parts {
  root: HTMLElement
  play: HTMLButtonElement
  playLamp: HTMLElement | null
  playLabel: HTMLElement | null
  sound: HTMLButtonElement
  buzz: HTMLButtonElement
  lamp: HTMLButtonElement
  lampBox: HTMLElement
  slider: HTMLInputElement
  wpmLabel: HTMLElement
  duration: HTMLElement | null
}

/** A toggle's state is aria-pressed plus its own small lamp; the stylesheet does the rest. */
function press(button: HTMLButtonElement, on: boolean) {
  button.setAttribute('aria-pressed', String(on))
  const lamp = button.querySelector<HTMLElement>('.mf-lamp')
  if (lamp) lamp.dataset['on'] = String(on)
}

/** Wire one player. Returns a teardown, so a page can be swapped safely. */
export function mountPlayer(root: HTMLElement): () => void {
  const morse = root.dataset['morse'] ?? ''
  const query = <T extends HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-part="${name}"]`)

  const parts: Parts = {
    root,
    play: query<HTMLButtonElement>('play')!,
    playLamp: query('play-lamp'),
    playLabel: query('play-label'),
    sound: query<HTMLButtonElement>('sound')!,
    buzz: query<HTMLButtonElement>('buzz')!,
    lamp: query<HTMLButtonElement>('lamp')!,
    lampBox: query('lamp-box')!,
    slider: query<HTMLInputElement>('speed')!,
    wpmLabel: query('wpm')!,
    duration: query('duration'),
  }

  const settings = storedSettings()
  const start = initialChannels(settings ?? { signal: 'sound' }, parts.lampBox.hidden === false)
  let wpm = Number(parts.slider.value) || 15
  let sound = start.sound
  let buzz = false
  let showLamp = start.lamp
  let playing = false

  let audio: AudioEngine | null = null
  let stopPlayback: (() => void) | null = null
  let frame: number | null = null
  let endTimer: ReturnType<typeof setTimeout> | null = null
  const gate = playGate()

  const timeline = () => buildTimeline(morse, { wpm })

  // The buzz control is hidden rather than disabled where vibration does not
  // exist: an offer the device cannot honour is worse than no offer.
  if (!canVibrate()) parts.buzz.hidden = true

  // Instant on and off: the lit layer's opacity flips with no transition, so
  // a dot and a dash read as exactly the lengths they are.
  function setLit(on: boolean) {
    parts.lampBox.dataset['on'] = String(on)
  }

  function stopVisuals() {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    setLit(false)
  }

  function stop() {
    // Any press still waiting on the audio to start is now stale.
    gate.cancel()
    if (endTimer !== null) clearTimeout(endTimer)
    endTimer = null
    stopPlayback?.()
    stopPlayback = null
    stopVibration()
    stopVisuals()
    playing = false
    render()
  }

  function render() {
    if (parts.playLamp) parts.playLamp.dataset['on'] = String(playing)
    if (parts.playLabel) parts.playLabel.textContent = playing ? 'Stop' : 'Play'

    press(parts.sound, sound)
    press(parts.buzz, buzz)
    press(parts.lamp, showLamp)

    parts.lampBox.hidden = !showLamp
    parts.wpmLabel.textContent = `${wpm} WPM`
    if (parts.duration) {
      parts.duration.textContent = `~${(timelineDuration(timeline()) / 1000).toFixed(1)}s`
    }
  }

  async function play() {
    if (playing) {
      stop()
      return
    }

    const current = timeline()
    const durationMs = timelineDuration(current)
    const ticket = gate.begin()
    playing = true
    render()

    if (buzz) vibrateTimeline(current)

    if (sound) {
      // Created inside the handler: a browser only allows an AudioContext to
      // start from a user gesture.
      // At the learner's own tone and volume, like every other tone on the site.
      const engine = (audio ??= new AudioEngine(settings ? audioOptions(settings) : {}))
      const playback = await startGated(ticket, () => engine.playTimeline(current))
      // Stopped while the audio was starting: `stop()` already reset the
      // player. Failed to start: reset it here, or it would read "Stop" forever.
      if (!ticket.isCurrent()) return
      if (!playback) {
        stop()
        return
      }
      stopPlayback = playback.stop
    }

    // Completion is a timer, not the end of the frame loop: rAF does not run
    // in a hidden tab, and a player that never returned to "play" because the
    // listener switched tabs would look broken on the way back.
    endTimer = setTimeout(() => {
      playing = false
      stopPlayback = null
      stopVisuals()
      render()
    }, durationMs + 60)

    // The lamp is the one thing it is right to pause while hidden — nobody is
    // looking — and each frame recomputes from the start time rather than
    // accumulating, so it re-syncs exactly on return.
    const startedAt = performance.now()
    const tick = () => {
      const elapsed = performance.now() - startedAt
      if (elapsed >= durationMs) {
        stopVisuals()
        return
      }
      setLit(playheadAt(current, elapsed).on)
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
  }

  const onPlay = () => void play()
  const onSound = () => {
    sound = !sound
    render()
  }
  const onBuzz = () => {
    buzz = !buzz
    render()
  }
  const onLamp = () => {
    showLamp = !showLamp
    render()
  }
  const onSpeed = () => {
    wpm = Number(parts.slider.value)
    // Changing speed mid-playback would leave the lamp reading one timeline
    // and the tone another.
    if (playing) stop()
    render()
  }

  parts.play.addEventListener('click', onPlay)
  parts.sound.addEventListener('click', onSound)
  parts.buzz.addEventListener('click', onBuzz)
  parts.lamp.addEventListener('click', onLamp)
  parts.slider.addEventListener('input', onSpeed)

  render()

  return () => {
    stop()
    parts.play.removeEventListener('click', onPlay)
    parts.sound.removeEventListener('click', onSound)
    parts.buzz.removeEventListener('click', onBuzz)
    parts.lamp.removeEventListener('click', onLamp)
    parts.slider.removeEventListener('input', onSpeed)
    void audio?.dispose()
    audio = null
  }
}

/** Wire every player on the page. */
export function mountAllPlayers(scope: ParentNode = document): void {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-morse-player]')) {
    if (root.dataset['mounted'] === 'yes') continue
    root.dataset['mounted'] = 'yes'
    mountPlayer(root)
  }
}
