/**
 * The playable alphabet chart, without a framework.
 *
 * The same reasoning as the word-page player: this is a reference page that
 * exists to be found, and the entire interaction is "press a row to hear it"
 * plus a speed slider. The rows are already rendered by the Astro page for
 * crawlers and for anyone with JavaScript off, so React was adding 190 KB to
 * attach a click handler to markup that was already complete.
 */

import { AudioEngine } from '../../engine/audioEngine'
import { playGate, startGated } from '../MorsePlayer/player'
import { track } from '../../analytics/track'

export function mountChart(root: HTMLElement): () => void {
  const slider = root.querySelector<HTMLInputElement>('[data-part="speed"]')
  const readout = root.querySelector<HTMLElement>('[data-part="wpm"]')
  const lamp = root.querySelector<HTMLElement>('[data-part="lamp"]')
  const print = root.querySelector<HTMLButtonElement>('[data-part="print"]')

  let wpm = Number(slider?.value) || 12
  let audio: AudioEngine | null = null
  let active: HTMLButtonElement | null = null
  let stop: (() => void) | null = null

  // State is an attribute the stylesheet reads, not an inline colour, so the
  // tile looks right in either theme and in print.
  function mark(button: HTMLButtonElement | null) {
    if (active) delete active.dataset['state']
    active = button
    if (button) button.dataset['state'] = 'live'
    if (lamp) lamp.dataset['on'] = String(button !== null)
  }

  // Which press owns the speaker. `audio.play` awaits a suspended context
  // resuming, which can take a noticeable moment on iOS; a second press in
  // that window has no `stop` to call yet. The MorsePlayer's gate gives each
  // press a ticket, and a playback that resolves for a stale ticket is stopped
  // on arrival instead of sounding on top of the newer one.
  const gate = playGate()

  async function play(button: HTMLButtonElement) {
    const code = button.dataset['code']
    if (!code) return

    // A second press interrupts rather than overlapping: two characters
    // sounding a beat apart is unreadable, which is the whole problem the
    // chart exists to solve.
    const ticket = gate.begin()
    stop?.()
    stop = null
    const engine = (audio ??= new AudioEngine())
    track('alphabet_play')
    mark(button)

    const playback = await startGated(ticket, () => engine.play(code, { wpm }))
    if (!ticket.isCurrent()) return
    if (!playback) {
      // No audio (blocked, or the context failed to start): drop the lamp
      // rather than leaving a row lit for a sound that never comes.
      mark(null)
      return
    }
    stop = playback.stop
    await playback.finished.catch(() => undefined)
    if (ticket.isCurrent()) {
      stop = null
      mark(null)
    }
  }

  const onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-code]')
    if (button) void play(button)
  }
  const onPrint = () => window.print()
  const onSpeed = () => {
    wpm = Number(slider?.value ?? wpm)
    if (readout) readout.textContent = `${wpm} WPM`
  }

  // One listener on the container rather than thirty-six on the rows.
  root.addEventListener('click', onClick)
  slider?.addEventListener('input', onSpeed)
  onSpeed()
  // Offered only once there is a script to run it; the chart prints from the
  // browser menu either way.
  if (print) {
    print.hidden = false
    print.addEventListener('click', onPrint)
  }

  return () => {
    gate.cancel()
    stop?.()
    stop = null
    root.removeEventListener('click', onClick)
    slider?.removeEventListener('input', onSpeed)
    print?.removeEventListener('click', onPrint)
    mark(null)
    void audio?.dispose()
    audio = null
  }
}

export function mountAllCharts(scope: ParentNode = document): void {
  for (const root of scope.querySelectorAll<HTMLElement>('[data-alphabet-chart]')) {
    if (root.dataset['mounted'] === 'yes') continue
    root.dataset['mounted'] = 'yes'
    mountChart(root)
  }
}
