import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * The chart's play/stop race: `audio.play` resolves only after a suspended
 * AudioContext resumes, so a second press can land while the first is still
 * pending. These tests hold each `play` open until the test releases it.
 */

interface Pending {
  code: string
  resolve: () => void
  reject: (error: Error) => void
  stop: ReturnType<typeof vi.fn>
  finish: () => void
}

const pending: Pending[] = []

vi.mock('../../engine/audioEngine', () => ({
  AudioEngine: class {
    play(code: string) {
      return new Promise((resolve, reject) => {
        let finish = () => {}
        const finished = new Promise<void>((done) => {
          finish = done
        })
        const stop = vi.fn(() => finish())
        pending.push({
          code,
          resolve: () => resolve({ finished, stop }),
          reject,
          stop,
          finish: () => finish(),
        })
      })
    }
    dispose() {
      return Promise.resolve()
    }
  },
}))

vi.mock('../../analytics/track', () => ({ track: () => undefined }))

const { mountChart } = await import('./chart')

function fakeButton(code: string) {
  const button = {
    dataset: { code } as Record<string, string | undefined>,
    closest: () => button,
  }
  return button
}

function fakeChart() {
  const handlers: Record<string, (event: Event) => void> = {}
  const root = {
    querySelector: () => null,
    addEventListener: (type: string, handler: (event: Event) => void) => {
      handlers[type] = handler
    },
    removeEventListener: () => undefined,
  }
  const unmount = mountChart(root as unknown as HTMLElement)
  const press = (button: ReturnType<typeof fakeButton>) =>
    handlers['click']!({ target: button } as unknown as Event)
  return { press, unmount }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('mountChart playback', () => {
  beforeEach(() => {
    pending.length = 0
  })

  it('stops a playback that resolves after a newer press', async () => {
    const { press } = fakeChart()
    const a = fakeButton('.-')
    const b = fakeButton('-...')

    press(a)
    press(b)
    expect(pending.map((call) => call.code)).toEqual(['.-', '-...'])

    // The first resume completes late, after B was pressed: A must not sound.
    pending[0]!.resolve()
    await flush()
    expect(pending[0]!.stop).toHaveBeenCalledTimes(1)

    pending[1]!.resolve()
    await flush()
    expect(pending[1]!.stop).not.toHaveBeenCalled()
    expect(b.dataset['state']).toBe('live')
    expect(a.dataset['state']).toBeUndefined()
  })

  it('stops the current playback when another key is pressed', async () => {
    const { press } = fakeChart()
    const a = fakeButton('.-')
    press(a)
    pending[0]!.resolve()
    await flush()

    press(fakeButton('-...'))
    expect(pending[0]!.stop).toHaveBeenCalledTimes(1)
  })

  it('clears the lit row when audio cannot start', async () => {
    const { press } = fakeChart()
    const a = fakeButton('.-')
    press(a)
    expect(a.dataset['state']).toBe('live')

    pending[0]!.reject(new Error('blocked'))
    await flush()
    expect(a.dataset['state']).toBeUndefined()
  })

  it('clears the lit row when playback finishes', async () => {
    const { press } = fakeChart()
    const a = fakeButton('.-')
    press(a)
    pending[0]!.resolve()
    await flush()
    pending[0]!.finish()
    await flush()
    expect(a.dataset['state']).toBeUndefined()
  })

  it('silences a playback that resolves after the chart is unmounted', async () => {
    const { press, unmount } = fakeChart()
    press(fakeButton('.-'))
    unmount()
    pending[0]!.resolve()
    await flush()
    expect(pending[0]!.stop).toHaveBeenCalledTimes(1)
  })
})
