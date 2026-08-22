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

const ACTIVE = 'color-mix(in srgb, var(--color-signal) 12%, var(--color-panel))'

export function mountChart(root: HTMLElement): () => void {
  const slider = root.querySelector<HTMLInputElement>('[data-part="speed"]')
  const readout = root.querySelector<HTMLElement>('[data-part="wpm"]')

  let wpm = Number(slider?.value) || 12
  let audio: AudioEngine | null = null
  let active: HTMLButtonElement | null = null
  let stop: (() => void) | null = null

  function mark(button: HTMLButtonElement | null) {
    if (active) {
      active.style.borderColor = 'var(--color-line)'
      active.style.background = 'var(--color-panel)'
    }
    active = button
    if (button) {
      button.style.borderColor = 'var(--color-signal)'
      button.style.background = ACTIVE
    }
  }

  async function play(button: HTMLButtonElement) {
    const code = button.dataset['code']
    if (!code) return

    // A second press interrupts rather than overlapping: two characters
    // sounding a beat apart is unreadable, which is the whole problem the
    // chart exists to solve.
    stop?.()
    audio ??= new AudioEngine()
    mark(button)

    const playback = await audio.play(code, { wpm })
    stop = playback.stop
    await playback.finished
    if (active === button) mark(null)
  }

  const onClick = (event: Event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('[data-code]')
    if (button) void play(button)
  }
  const onSpeed = () => {
    wpm = Number(slider?.value ?? wpm)
    if (readout) readout.textContent = `${wpm} WPM`
  }

  // One listener on the container rather than thirty-six on the rows.
  root.addEventListener('click', onClick)
  slider?.addEventListener('input', onSpeed)
  onSpeed()

  return () => {
    stop?.()
    root.removeEventListener('click', onClick)
    slider?.removeEventListener('input', onSpeed)
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
