import { describe, expect, it, vi } from 'vitest'
import { playGate, startGated } from './player'

/** A playback whose start the test resolves by hand, like a resuming AudioContext. */
function slowStart() {
  const playback = { stop: vi.fn() }
  let resolve: (value: typeof playback) => void = () => {}
  let reject: (error: unknown) => void = () => {}
  const promise = new Promise<typeof playback>((ok, fail) => {
    resolve = ok
    reject = fail
  })
  return { playback, start: () => promise, resolve: () => resolve(playback), reject }
}

describe('playGate', () => {
  it('keeps the latest press current, and a stop cancels it', () => {
    const gate = playGate()
    const first = gate.begin()
    expect(first.isCurrent()).toBe(true)
    const second = gate.begin()
    expect(first.isCurrent()).toBe(false)
    expect(second.isCurrent()).toBe(true)
    gate.cancel()
    expect(second.isCurrent()).toBe(false)
  })
})

describe('startGated', () => {
  it('hands back the playback when nothing interrupted the start', async () => {
    const gate = playGate()
    const slow = slowStart()
    const pending = startGated(gate.begin(), slow.start)
    slow.resolve()
    expect(await pending).toBe(slow.playback)
    expect(slow.playback.stop).not.toHaveBeenCalled()
  })

  it('silences a playback that finished starting after Stop was pressed', async () => {
    const gate = playGate()
    const slow = slowStart()
    const pending = startGated(gate.begin(), slow.start)
    gate.cancel()
    slow.resolve()
    expect(await pending).toBeNull()
    expect(slow.playback.stop).toHaveBeenCalledTimes(1)
  })

  it('silences the first of two quick presses, so they never overlap', async () => {
    const gate = playGate()
    const one = slowStart()
    const two = slowStart()
    const first = startGated(gate.begin(), one.start)
    const second = startGated(gate.begin(), two.start)
    one.resolve()
    two.resolve()
    expect(await first).toBeNull()
    expect(one.playback.stop).toHaveBeenCalled()
    expect(await second).toBe(two.playback)
  })

  it('resolves to null when the audio cannot start, so the player can reset', async () => {
    const gate = playGate()
    const slow = slowStart()
    const ticket = gate.begin()
    const pending = startGated(ticket, slow.start)
    slow.reject(new Error('NotAllowedError'))
    expect(await pending).toBeNull()
    // Still the current press: the caller resets the player itself.
    expect(ticket.isCurrent()).toBe(true)
  })
})
