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

export const WPM_MIN = 5
export const WPM_MAX = 40

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

interface Parts {
  root: HTMLElement
  play: HTMLButtonElement
  sound: HTMLButtonElement
  buzz: HTMLButtonElement
  lamp: HTMLButtonElement
  lampBox: HTMLElement
  slider: HTMLInputElement
  wpmLabel: HTMLElement
  duration: HTMLElement | null
}

function press(button: HTMLButtonElement, on: boolean, colour: string) {
  button.setAttribute('aria-pressed', String(on))
  button.style.borderColor = on ? colour : 'var(--color-line)'
  button.style.color = on ? colour : 'var(--color-muted)'
}

/** Wire one player. Returns a teardown, so a page can be swapped safely. */
export function mountPlayer(root: HTMLElement): () => void {
  const morse = root.dataset['morse'] ?? ''
  const query = <T extends HTMLElement>(name: string) =>
    root.querySelector<T>(`[data-part="${name}"]`)

  const parts: Parts = {
    root,
    play: query<HTMLButtonElement>('play')!,
    sound: query<HTMLButtonElement>('sound')!,
    buzz: query<HTMLButtonElement>('buzz')!,
    lamp: query<HTMLButtonElement>('lamp')!,
    lampBox: query('lamp-box')!,
    slider: query<HTMLInputElement>('speed')!,
    wpmLabel: query('wpm')!,
    duration: query('duration'),
  }

  let wpm = Number(parts.slider.value) || 15
  let sound = true
  let buzz = false
  let showLamp = parts.lampBox.hidden === false
  let playing = false

  let audio: AudioEngine | null = null
  let stopPlayback: (() => void) | null = null
  let frame: number | null = null
  let endTimer: ReturnType<typeof setTimeout> | null = null

  const timeline = () => buildTimeline(morse, { wpm })

  // The buzz control is hidden rather than disabled where vibration does not
  // exist: an offer the device cannot honour is worse than no offer.
  if (!canVibrate()) parts.buzz.hidden = true

  function setLit(on: boolean) {
    parts.lampBox.style.borderColor = on ? 'var(--color-signal)' : 'var(--color-line)'
    parts.lampBox.style.background = on ? 'var(--color-signal)' : 'var(--color-void)'
    parts.lampBox.style.boxShadow = on
      ? '0 0 60px color-mix(in srgb, var(--color-signal) 60%, transparent)'
      : 'none'
  }

  function stopVisuals() {
    if (frame !== null) cancelAnimationFrame(frame)
    frame = null
    setLit(false)
  }

  function stop() {
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
    parts.play.textContent = playing ? '■ STOP' : '▶ PLAY'
    parts.play.style.background = playing ? 'var(--color-line)' : 'var(--color-signal)'
    parts.play.style.color = playing ? 'var(--color-ink)' : 'var(--color-void)'

    press(parts.sound, sound, 'var(--color-signal)')
    press(parts.buzz, buzz, 'var(--color-amber)')
    press(parts.lamp, showLamp, 'var(--color-cyan)')

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
    playing = true
    render()

    if (buzz) vibrateTimeline(current)

    if (sound) {
      // Created inside the handler: a browser only allows an AudioContext to
      // start from a user gesture.
      audio ??= new AudioEngine()
      const playback = await audio.playTimeline(current)
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
