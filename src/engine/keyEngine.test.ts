import { type Mock, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  KeyEngine,
  TIMESTAMP_TOLERANCE_MS,
  bindKeyboard,
  isOnClock,
  type KeyEngineClock,
  resolveThresholds,
} from './keyEngine'
import { LiveDecoder } from './morseDecoder'

/** A clock the test drives by hand, so no test ever waits on a real timer. */
function createTestClock() {
  let time = 0
  let nextHandle = 1
  const pending = new Map<number, { fireAt: number; fn: () => void }>()

  const clock: KeyEngineClock = {
    now: () => time,
    setTimeout: (fn, ms) => {
      const handle = nextHandle++
      pending.set(handle, { fireAt: time + ms, fn })
      return handle
    },
    clearTimeout: (handle) => {
      pending.delete(handle)
    },
  }

  return {
    clock,
    /** Advance time, firing any timers due, in order. */
    advance(ms: number) {
      const target = time + ms
      let due = [...pending.entries()]
        .filter(([, t]) => t.fireAt <= target)
        .sort((a, b) => a[1].fireAt - b[1].fireAt)

      while (due.length > 0) {
        const [handle, timer] = due[0]!
        pending.delete(handle)
        time = timer.fireAt
        timer.fn()
        due = [...pending.entries()]
          .filter(([, t]) => t.fireAt <= target)
          .sort((a, b) => a[1].fireAt - b[1].fireAt)
      }
      time = target
    },
  }
}

describe('resolveThresholds', () => {
  it('derives every threshold from the target speed', () => {
    const t = resolveThresholds({ wpm: 20 }) // 60ms unit
    expect(t.dotDashThresholdMs).toBe(120)
    expect(t.characterGapMs).toBe(180)
    expect(t.wordGapMs).toBe(420)
  })

  it('lets an explicit threshold override the derived one', () => {
    expect(resolveThresholds({ wpm: 20, dotDashThresholdMs: 250 }).dotDashThresholdMs).toBe(250)
  })

  it('defaults to 15 WPM when no speed is given', () => {
    expect(resolveThresholds()).toEqual(resolveThresholds({ wpm: 15 }))
  })
})

describe('KeyEngine', () => {
  let onElement: Mock<(element: '.' | '-', heldMs: number) => void>
  let onCharacterGap: Mock<() => void>
  let onWordGap: Mock<() => void>
  let harness: ReturnType<typeof createTestClock>
  let engine: KeyEngine

  beforeEach(() => {
    onElement = vi.fn()
    onCharacterGap = vi.fn()
    onWordGap = vi.fn()
    harness = createTestClock()
    engine = new KeyEngine(
      { wpm: 20 }, // unit 60ms → dot/dash 120, char gap 180, word gap 420
      { onElement, onCharacterGap, onWordGap },
      harness.clock,
    )
  })

  /** Hold the key for `ms`, then release. */
  function tap(ms: number) {
    engine.press()
    harness.advance(ms)
    engine.release()
  }

  it('reads a short hold as a dot and a long hold as a dash', () => {
    tap(80)
    expect(onElement).toHaveBeenLastCalledWith('.', 80)
    tap(300)
    expect(onElement).toHaveBeenLastCalledWith('-', 300)
  })

  it('puts the boundary exactly at the threshold', () => {
    tap(119)
    expect(onElement).toHaveBeenLastCalledWith('.', 119)
    tap(120)
    expect(onElement).toHaveBeenLastCalledWith('-', 120)
  })

  it('matches PROJECT.md §9: 120ms is a dot and 350ms a dash at 15 WPM', () => {
    const slow = new KeyEngine({ wpm: 15 }, { onElement }, harness.clock)
    slow.press()
    harness.advance(120)
    slow.release()
    expect(onElement).toHaveBeenLastCalledWith('.', 120)

    slow.press()
    harness.advance(350)
    slow.release()
    expect(onElement).toHaveBeenLastCalledWith('-', 350)
  })

  it('ignores key repeat while already held', () => {
    engine.press()
    harness.advance(50)
    engine.press() // OS auto-repeat
    harness.advance(50)
    engine.release()
    expect(onElement).toHaveBeenCalledTimes(1)
    expect(onElement).toHaveBeenCalledWith('.', 100)
  })

  it('ignores a release with no press', () => {
    engine.release()
    expect(onElement).not.toHaveBeenCalled()
  })

  it('ends the character after a 3-unit silence', () => {
    tap(60)
    harness.advance(179)
    expect(onCharacterGap).not.toHaveBeenCalled()
    harness.advance(1)
    expect(onCharacterGap).toHaveBeenCalledTimes(1)
  })

  it('ends the word after a 7-unit silence, having ended the character first', () => {
    tap(60)
    harness.advance(420)
    expect(onCharacterGap).toHaveBeenCalledTimes(1)
    expect(onWordGap).toHaveBeenCalledTimes(1)
  })

  it('does not fire a gap when the next element arrives in time', () => {
    tap(60)
    harness.advance(100) // still inside the character gap
    tap(60)
    expect(onCharacterGap).not.toHaveBeenCalled()
    expect(onWordGap).not.toHaveBeenCalled()
  })

  it('drops pending gaps on reset', () => {
    tap(60)
    engine.reset()
    harness.advance(1000)
    expect(onCharacterGap).not.toHaveBeenCalled()
    expect(onWordGap).not.toHaveBeenCalled()
  })

  it('reset while held abandons the element instead of emitting it', () => {
    engine.press()
    harness.advance(200)
    engine.reset()
    expect(engine.isPressed).toBe(false)
    engine.release()
    expect(onElement).not.toHaveBeenCalled()
  })

  it('tracks whether the key is currently down', () => {
    expect(engine.isPressed).toBe(false)
    engine.press()
    expect(engine.isPressed).toBe(true)
    engine.release()
    expect(engine.isPressed).toBe(false)
  })
  describe('timed by the input events', () => {
    it('measures the hold between the event stamps, not when the handlers ran', () => {
      // The first press builds the AudioContext and blocks the page: the
      // keyup handler runs 400ms after the key came up 60ms into the hold.
      harness.advance(1000)
      engine.press(1000)
      harness.advance(460)
      engine.release(1060)
      expect(onElement).toHaveBeenLastCalledWith('.', 60)
    })

    it('falls back to the clock without a usable stamp', () => {
      for (const stamp of [undefined, 0, Number.NaN, -5]) {
        engine.press(stamp)
        harness.advance(300)
        engine.release(stamp)
        expect(onElement).toHaveBeenLastCalledWith('-', 300)
      }
    })

    it('ignores a stamp from another clock, such as React falling back to Date.now()', () => {
      harness.advance(1000)
      const epoch = Date.UTC(2026, 9, 21)
      engine.press(epoch)
      harness.advance(80)
      engine.release(epoch + 80)
      // Both stamps rejected, so the hold is the clock's own 80ms: a dot,
      // not the decades between the two timelines.
      expect(onElement).toHaveBeenLastCalledWith('.', 80)
    })

    it('trusts a stamp within the tolerance of the clock, and nothing beyond it', () => {
      expect(isOnClock(5000, 5000)).toBe(true)
      expect(isOnClock(5000 - TIMESTAMP_TOLERANCE_MS, 5000 + 0)).toBe(false)
      expect(isOnClock(5000 + TIMESTAMP_TOLERANCE_MS, 5000)).toBe(true)
      expect(isOnClock(5001 + TIMESTAMP_TOLERANCE_MS, 5000)).toBe(false)
      expect(isOnClock(Date.UTC(2026, 9, 21), 1234)).toBe(false)
      expect(isOnClock(undefined, 1234)).toBe(false)
    })

    it('never reports a negative hold when the two timelines mix', () => {
      harness.advance(1000)
      engine.press()
      engine.release(990)
      expect(onElement).toHaveBeenLastCalledWith('.', 0)
    })
  })
})

describe('KeyEngine + LiveDecoder', () => {
  it('sends SOS end to end, the way a user actually would', () => {
    const harness = createTestClock()
    const live = new LiveDecoder()
    const engine = new KeyEngine(
      { wpm: 20 },
      {
        onElement: (element) => live.pushElement(element),
        onCharacterGap: () => live.commitCharacter(),
        onWordGap: () => live.commitWord(),
      },
      harness.clock,
    )

    const send = (holdMs: number, gapMs: number) => {
      engine.press()
      harness.advance(holdMs)
      engine.release()
      harness.advance(gapMs)
    }

    // S = ... , O = --- , S = ...
    send(60, 60)
    send(60, 60)
    send(60, 200) // character gap
    send(200, 60)
    send(200, 60)
    send(200, 200) // character gap
    send(60, 60)
    send(60, 60)
    send(60, 200) // character gap

    expect(live.text).toBe('SOS')
  })

  it('separates words when the operator pauses long enough', () => {
    const harness = createTestClock()
    const live = new LiveDecoder()
    const engine = new KeyEngine(
      { wpm: 20 },
      {
        onElement: (element) => live.pushElement(element),
        onCharacterGap: () => live.commitCharacter(),
        onWordGap: () => live.commitWord(),
      },
      harness.clock,
    )

    engine.press()
    harness.advance(60)
    engine.release()
    harness.advance(500) // past the word gap

    engine.press()
    harness.advance(200)
    engine.release()
    harness.advance(500)

    expect(live.text).toBe('E T ')
  })
})

describe('autoCommit', () => {
  it('is on by default', () => {
    expect(resolveThresholds().autoCommit).toBe(true)
  })

  it('when off, a pause never ends a character or a word', () => {
    // The point of manual mode: a beginner may hesitate for as long as they
    // like mid-character without the app deciding they finished.
    const onCharacterGap = vi.fn()
    const onWordGap = vi.fn()
    const harness = createTestClock()
    const engine = new KeyEngine(
      { wpm: 20, autoCommit: false },
      { onCharacterGap, onWordGap },
      harness.clock,
    )

    engine.press()
    harness.advance(60)
    engine.release()
    harness.advance(60_000)

    expect(onCharacterGap).not.toHaveBeenCalled()
    expect(onWordGap).not.toHaveBeenCalled()
  })

  it('still emits elements when off — only the commit is suppressed', () => {
    const onElement = vi.fn()
    const harness = createTestClock()
    const engine = new KeyEngine({ wpm: 20, autoCommit: false }, { onElement }, harness.clock)

    engine.press()
    harness.advance(60)
    engine.release()

    expect(onElement).toHaveBeenCalledWith('.', 60)
  })

  it('can be turned back on mid-session via configure', () => {
    const onCharacterGap = vi.fn()
    const harness = createTestClock()
    const engine = new KeyEngine({ wpm: 20, autoCommit: false }, { onCharacterGap }, harness.clock)

    engine.configure({ wpm: 20, autoCommit: true })
    engine.press()
    harness.advance(60)
    engine.release()
    harness.advance(200)

    expect(onCharacterGap).toHaveBeenCalledTimes(1)
  })
})

describe('explicit gap overrides', () => {
  it('lets the character gap be set independently of WPM', () => {
    // Sending speed and thinking time are unrelated — see the autoCommit note.
    const onCharacterGap = vi.fn()
    const harness = createTestClock()
    const engine = new KeyEngine(
      { wpm: 20, characterGapMs: 1600 },
      { onCharacterGap },
      harness.clock,
    )

    engine.press()
    harness.advance(60)
    engine.release()

    harness.advance(1599)
    expect(onCharacterGap).not.toHaveBeenCalled()
    harness.advance(1)
    expect(onCharacterGap).toHaveBeenCalledTimes(1)
  })
})

describe('a hold dropped without a release', () => {
  /** A stand-in for `window`, enough to fire a blur. */
  function fakeWindow() {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    return {
      addEventListener(type: string, handler: (event: unknown) => void) {
        listeners.set(type, (listeners.get(type) ?? new Set()).add(handler))
      },
      removeEventListener(type: string, handler: (event: unknown) => void) {
        listeners.get(type)?.delete(handler)
      },
      fire(type: string) {
        for (const handler of listeners.get(type) ?? []) handler({})
      },
    }
  }

  it('reports the cancelled hold, so the tone can stop', () => {
    const harness = createTestClock()
    const onCancel = vi.fn()
    const onKeyUp = vi.fn()
    const onElement = vi.fn()
    const engine = new KeyEngine({ wpm: 20 }, { onCancel, onKeyUp, onElement }, harness.clock)
    engine.press()
    engine.reset()
    expect(onCancel).toHaveBeenCalledTimes(1)
    expect(onKeyUp).not.toHaveBeenCalled()
    expect(onElement).not.toHaveBeenCalled()
    expect(engine.isPressed).toBe(false)
  })

  it('says nothing when there was no hold to drop', () => {
    const harness = createTestClock()
    const onCancel = vi.fn()
    const engine = new KeyEngine({ wpm: 20 }, { onCancel }, harness.clock)
    engine.reset()
    engine.press()
    engine.release()
    engine.reset()
    expect(onCancel).not.toHaveBeenCalled()
  })

  it('cancels through bindKeyboard when the window loses focus mid-hold', () => {
    const harness = createTestClock()
    const onCancel = vi.fn()
    const engine = new KeyEngine({ wpm: 20 }, { onCancel }, harness.clock)
    const target = fakeWindow()
    const unbind = bindKeyboard(engine, undefined, target)
    engine.press()
    target.fire('blur')
    expect(onCancel).toHaveBeenCalledTimes(1)
    unbind()
  })
})
