import { describe, expect, it } from 'vitest'
import {
  ADAPTER_PADDLES,
  DEFAULT_KEY_BINDINGS,
  bindingsOverlap,
  KEYER_KINDS,
  KeyEngine,
  bindKeyboard,
  contactFor,
  swapPaddles,
  type KeyEngineClock,
  type KeyEngineOptions,
  type Paddle,
} from './keyEngine'
import { PaddleKeyer, createKeyer, type IambicMode } from './keyer'
import { LiveDecoder } from './morseDecoder'
import { MORSE_ALPHABET } from '../data/morseAlphabet'
import { UNITS, dotDuration } from './timingEngine'

/** A clock the test drives by hand: no test here waits on a real timer. */
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

  const due = (target: number) =>
    [...pending.entries()]
      .filter(([, t]) => t.fireAt <= target)
      .sort((a, b) => a[1].fireAt - b[1].fireAt || a[0] - b[0])

  return {
    clock,
    get now() {
      return time
    },
    /** Advance to `time + ms`, firing every timer due on the way, in order. */
    advance(ms: number) {
      const target = time + ms
      for (let next = due(target); next.length > 0; next = due(target)) {
        const [handle, timer] = next[0]!
        pending.delete(handle)
        time = Math.max(time, timer.fireAt)
        timer.fn()
      }
      time = target
    },
    /** The page is busy: time passes and no timer runs. */
    stall(ms: number) {
      time += ms
    },
    /** Run the one timer most overdue, as a busy page finally would. */
    step() {
      const next = due(time)[0]
      if (!next) return
      pending.delete(next[0])
      next[1].fn()
    },
    /** Jump to an absolute time. */
    at(ms: number) {
      this.advance(ms - time)
    },
  }
}

/**
 * A keyer wired to a recorder: every tone as [start, end, element], the
 * character and word gaps as times, and a decoder fed the elements.
 */
function setup(mode: IambicMode, options: KeyEngineOptions = {}) {
  const harness = createTestClock()
  const tones: [number, number, '.' | '-'][] = []
  const characters: [number, string][] = []
  const words: number[] = []
  const idle: [number, number][] = []
  const toneLengths: (number | undefined)[] = []
  const paddles: [Paddle, boolean][] = []
  const decoder = new LiveDecoder()
  let toneOn: number | null = null
  let cancels = 0

  const keyer = new PaddleKeyer(
    mode,
    { wpm: 20, characterGapMs: 180, wordGapMs: 420, ...options },
    {
      onKeyDown: (toneMs) => {
        toneOn = harness.now
        toneLengths.push(toneMs)
      },
      onElement: (element, heldMs) => {
        tones.push([toneOn ?? Number.NaN, (toneOn ?? Number.NaN) + heldMs, element])
        decoder.pushElement(element)
      },
      onCharacterGap: () => characters.push([harness.now, decoder.commitCharacter() ?? '?']),
      onWordGap: () => words.push(harness.now),
      onIdle: (silentMs) => idle.push([harness.now, silentMs]),
      onPaddle: (paddle, down) => paddles.push([paddle, down]),
      onCancel: () => {
        cancels += 1
      },
    },
    harness.clock,
  )

  return {
    keyer,
    harness,
    tones,
    characters,
    words,
    idle,
    toneLengths,
    paddles,
    decoder,
    cancels: () => cancels,
    /** The elements sent so far, as a code string. */
    code: () => tones.map(([, , element]) => element).join(''),
  }
}

/** 20 WPM: one unit is 60 ms. Computed, never typed, so the tests follow the engine. */
const UNIT = dotDuration(20)
const DIT = UNIT * UNITS.DOT
const DAH = UNIT * UNITS.DASH
const SPACE = UNIT * UNITS.ELEMENT_GAP

describe('PaddleKeyer timing (issue #43)', () => {
  it('sends a dit of exactly 60 ms followed by a 60 ms space at 20 WPM', () => {
    expect(UNIT).toBe(60)
    const { keyer, harness, tones } = setup('A')
    keyer.press(undefined, 'dit')
    harness.advance(DIT + SPACE + DIT / 2)
    // Second dit starts exactly one unit after the first ends.
    expect(tones).toEqual([[0, 60, '.']])
    harness.advance(DIT)
    expect(tones).toEqual([
      [0, 60, '.'],
      [120, 180, '.'],
    ])
  })

  it('repeats dits at one unit each with one-unit gaps for as long as the paddle is held', () => {
    const { keyer, harness, tones } = setup('A')
    keyer.press(undefined, 'dit')
    harness.at(5 * (DIT + SPACE) - 1)
    keyer.release(undefined, 'dit')
    harness.advance(1000)
    expect(tones).toEqual([0, 1, 2, 3, 4].map((n) => [n * 120, n * 120 + 60, '.']))
  })

  it('sends a dah of three units, with the same one-unit space', () => {
    const { keyer, harness, tones } = setup('A')
    keyer.press(undefined, 'dah')
    harness.at(DAH + SPACE + 1)
    keyer.release(undefined, 'dah')
    harness.advance(1000)
    expect(tones).toEqual([
      [0, 180, '-'],
      [240, 420, '-'],
    ])
  })

  it('tells the sidetone how long each tone will sound', () => {
    const { keyer, harness, toneLengths } = setup('A')
    keyer.press(undefined, 'dit')
    harness.advance(1)
    keyer.release(undefined, 'dit')
    keyer.press(undefined, 'dah')
    harness.advance(DIT + SPACE)
    keyer.release(undefined, 'dah')
    harness.advance(1000)
    expect(toneLengths).toEqual([DIT, DAH])
  })

  it('follows the speed: 1200/WPM ms per unit, from the timing engine', () => {
    for (const wpm of [5, 13, 20, 35]) {
      const { keyer, harness, tones } = setup('A', { wpm })
      keyer.press(undefined, 'dah')
      harness.advance(1)
      keyer.release(undefined, 'dah')
      harness.advance(10_000)
      expect(tones).toEqual([[0, dotDuration(wpm) * UNITS.DASH, '-']])
    }
  })

  it('applies a speed change from the next element, never to the one sending', () => {
    const { keyer, harness, tones } = setup('A')
    keyer.press(undefined, 'dit')
    harness.advance(30)
    keyer.configure({ wpm: 10, characterGapMs: 360, wordGapMs: 840 })
    // The space is now 120 ms, so the decision falls at 180.
    harness.at(181)
    keyer.release(undefined, 'dit')
    harness.advance(10_000)
    // The first dit keeps its 60 ms; its space and the next dit are at 10 WPM.
    expect(tones).toEqual([
      [0, 60, '.'],
      [180, 300, '.'],
    ])
  })
})

describe('releasing mid-element', () => {
  it('finishes a dit tapped for a moment: one full unit, never shorter', () => {
    const { keyer, harness, tones } = setup('A')
    keyer.press(undefined, 'dit')
    harness.advance(10)
    keyer.release(undefined, 'dit')
    harness.advance(1000)
    expect(tones).toEqual([[0, 60, '.']])
  })

  it('finishes a dah released a third of the way through', () => {
    const { keyer, harness, tones } = setup('B')
    keyer.press(undefined, 'dah')
    harness.advance(60)
    keyer.release(undefined, 'dah')
    harness.advance(1000)
    expect(tones).toEqual([[0, 180, '-']])
  })

  it('does not repeat an element released during its own space', () => {
    const { keyer, harness, tones } = setup('A')
    keyer.press(undefined, 'dit')
    harness.at(DIT + SPACE / 2)
    keyer.release(undefined, 'dit')
    harness.advance(1000)
    expect(tones).toHaveLength(1)
  })
})

describe('squeeze', () => {
  it('alternates dit-dah while both paddles are held, dit first when it was pressed first', () => {
    const { keyer, harness, code, tones } = setup('A')
    keyer.press(undefined, 'dit')
    keyer.press(undefined, 'dah')
    // dit(0-60) dah(120-300) dit(360-420) dah(480-660): release both in the
    // fourth element's space.
    harness.at(670)
    keyer.release(undefined, 'dit')
    keyer.release(undefined, 'dah')
    harness.advance(1000)
    expect(code()).toBe('.-.-')
    expect(tones.map(([start]) => start)).toEqual([0, 120, 360, 480])
  })

  it('starts with dah when dah was squeezed first', () => {
    const { keyer, harness, code } = setup('A')
    keyer.press(undefined, 'dah')
    harness.advance(20)
    keyer.press(undefined, 'dit')
    // dah 0-180, dit 240-300; let go during the dit's space.
    harness.at(310)
    keyer.release(undefined, 'dah')
    keyer.release(undefined, 'dit')
    harness.advance(1000)
    expect(code()).toBe('-.')
  })

  it('keys C, squeezing dah first and letting go during the last dit (mode A)', () => {
    const { keyer, harness, characters } = setup('A')
    keyer.press(undefined, 'dah')
    keyer.press(undefined, 'dit')
    // dah 0-180, dit 240-300, dah 360-540, dit 600-660: release during it.
    harness.at(620)
    keyer.release(undefined, 'dah')
    keyer.release(undefined, 'dit')
    harness.advance(1000)
    expect(characters.map(([, c]) => c)).toEqual(['C'])
    expect(MORSE_ALPHABET.C).toBe('-.-.')
  })
})

describe('iambic mode A and mode B', () => {
  /** Squeeze from a dit and let go of both halfway through the second element (a dah). */
  const squeezeAndRelease = (mode: IambicMode) => {
    const run = setup(mode)
    run.keyer.press(undefined, 'dit')
    run.keyer.press(undefined, 'dah')
    // dit 0-60, dah 120-300: let go of both at 200, mid-dah.
    run.harness.at(200)
    run.keyer.release(undefined, 'dit')
    run.keyer.release(undefined, 'dah')
    run.harness.advance(1000)
    return run
  }

  it('mode A finishes the element sending and stops', () => {
    const { code, tones } = squeezeAndRelease('A')
    expect(code()).toBe('.-')
    expect(tones.at(-1)).toEqual([120, 300, '-'])
  })

  it('mode B sends one more element, the opposite one, and then stops', () => {
    const { code, tones } = squeezeAndRelease('B')
    expect(code()).toBe('.-.')
    // The extra dit follows the dah after exactly one unit of space.
    expect(tones.at(-1)).toEqual([360, 420, '.'])
  })

  it('mode B adds exactly one element, not a stream', () => {
    const { tones, idle } = squeezeAndRelease('B')
    expect(tones).toHaveLength(3)
    // Idle one space after the extra dit ends.
    expect(idle).toEqual([[420 + SPACE, SPACE]])
  })

  it('both modes stop at once when only one paddle was ever held', () => {
    for (const mode of ['A', 'B'] as const) {
      const { keyer, harness, code } = setup(mode)
      keyer.press(undefined, 'dah')
      harness.at(100)
      keyer.release(undefined, 'dah')
      harness.advance(1000)
      expect(code(), mode).toBe('-')
    }
  })

  it('mode B completes a squeeze let go of during a dit, mode A does not', () => {
    const run = (mode: IambicMode) => {
      const r = setup(mode)
      r.keyer.press(undefined, 'dah')
      r.keyer.press(undefined, 'dit')
      // dah 0-180, then dit starts at 240 with dah held: release both in the
      // dit's own mark, at 250.
      r.harness.at(250)
      r.keyer.release(undefined, 'dah')
      r.keyer.release(undefined, 'dit')
      r.harness.advance(1000)
      return r.code()
    }
    expect(run('A')).toBe('-.')
    expect(run('B')).toBe('-.-')
  })
})

describe('dot and dah memory', () => {
  it('remembers a dit tapped and released during a dah, in both modes', () => {
    for (const mode of ['A', 'B'] as const) {
      const { keyer, harness, code, tones } = setup(mode)
      keyer.press(undefined, 'dah')
      harness.advance(10)
      keyer.release(undefined, 'dah')
      harness.at(50)
      keyer.press(undefined, 'dit')
      harness.at(70)
      keyer.release(undefined, 'dit')
      harness.advance(1000)
      expect(code(), mode).toBe('-.')
      expect(tones[1], mode).toEqual([240, 300, '.'])
    }
  })

  it('remembers a dah tapped during a dit, even one shorter than the dit', () => {
    const { keyer, harness, code } = setup('A')
    keyer.press(undefined, 'dit')
    harness.advance(5)
    keyer.release(undefined, 'dit')
    harness.at(20)
    keyer.press(undefined, 'dah')
    harness.at(25)
    keyer.release(undefined, 'dah')
    harness.advance(1000)
    expect(code()).toBe('.-')
  })

  it('remembers a tap during the element space too', () => {
    const { keyer, harness, code } = setup('A')
    keyer.press(undefined, 'dah')
    harness.at(100)
    keyer.release(undefined, 'dah')
    harness.at(DAH + 10)
    keyer.press(undefined, 'dit')
    harness.at(DAH + 20)
    keyer.release(undefined, 'dit')
    harness.advance(1000)
    expect(code()).toBe('-.')
  })

  it('inserts a remembered dah between held dits, then goes back to dits', () => {
    const { keyer, harness, code } = setup('A')
    keyer.press(undefined, 'dit')
    // During the first dit, tap dah.
    harness.at(20)
    keyer.press(undefined, 'dah')
    harness.at(30)
    keyer.release(undefined, 'dah')
    // dit 0-60, dah 120-300, dit 360-420, dit 480-540: let go mid-fourth.
    harness.at(500)
    keyer.release(undefined, 'dit')
    harness.advance(1000)
    expect(code()).toBe('.-..')
  })

  it('does not remember the same paddle pressed again: memory is for the opposite one', () => {
    const { keyer, harness, code } = setup('A')
    keyer.press(undefined, 'dit')
    harness.at(10)
    keyer.release(undefined, 'dit')
    harness.at(20)
    keyer.press(undefined, 'dit')
    harness.at(30)
    keyer.release(undefined, 'dit')
    harness.advance(1000)
    expect(code()).toBe('.')
  })

  it('a paddle that is down again at the decision repeats', () => {
    const { keyer, harness, code } = setup('A')
    keyer.press(undefined, 'dit')
    harness.at(10)
    keyer.release(undefined, 'dit')
    harness.at(100)
    keyer.press(undefined, 'dit')
    harness.at(130)
    keyer.release(undefined, 'dit')
    harness.advance(1000)
    expect(code()).toBe('..')
  })
})

describe('character and word gaps, shared with the straight key', () => {
  it('ends the character a full character gap after the last tone stopped', () => {
    const { keyer, harness, characters, idle } = setup('A')
    keyer.press(undefined, 'dit')
    harness.at(DIT + SPACE + DIT + SPACE + 1)
    keyer.release(undefined, 'dit')
    harness.advance(5000)
    // Three dits: 0-60, 120-180, 240-300. Idle at 360, one unit into the silence.
    expect(idle).toEqual([[360, SPACE]])
    expect(characters).toEqual([[300 + 180, 'S']])
    expect(MORSE_ALPHABET.S).toBe('...')
  })

  it('ends the word a full word gap after the last tone stopped', () => {
    const { keyer, harness, words } = setup('A')
    keyer.press(undefined, 'dah')
    harness.advance(1)
    keyer.release(undefined, 'dah')
    harness.advance(5000)
    expect(words).toEqual([180 + 420])
  })

  it('never ends a character while a paddle is held, however long the gap setting is short', () => {
    // 5 WPM makes the one-unit space (240 ms) longer than this character gap.
    const { keyer, harness, characters } = setup('A', {
      wpm: 5,
      characterGapMs: 120,
      wordGapMs: 300,
    })
    keyer.press(undefined, 'dit')
    harness.at(3 * 480 - 1)
    keyer.release(undefined, 'dit')
    harness.advance(5000)
    expect(characters.map(([, c]) => c)).toEqual(['S'])
  })

  it('commits nothing on its own when auto-commit is off', () => {
    const { keyer, harness, characters, words } = setup('A', { autoCommit: false })
    keyer.press(undefined, 'dit')
    harness.advance(1)
    keyer.release(undefined, 'dit')
    harness.advance(10_000)
    expect(characters).toEqual([])
    expect(words).toEqual([])
  })

  it('cancels a gap in progress when the next element starts', () => {
    const { keyer, harness, characters } = setup('A', { characterGapMs: 400, wordGapMs: 900 })
    keyer.press(undefined, 'dit')
    harness.advance(1)
    keyer.release(undefined, 'dit')
    harness.at(300)
    keyer.press(undefined, 'dah')
    harness.advance(1)
    keyer.release(undefined, 'dah')
    harness.advance(5000)
    expect(characters.map(([, c]) => c)).toEqual(['A'])
  })
})

describe('a busy page (the first press creates the AudioContext)', () => {
  it('sends the dits due before the release, judged by its timestamp, not by when it ran', () => {
    const { keyer, harness, code } = setup('A')
    keyer.press(undefined, 'dit')
    // The page blocks for 600 ms. The paddle was let go of at 250 ms, while
    // the second dit (120-180) had gone and the third was not yet due.
    harness.stall(600)
    harness.step() // the first dit's end, long overdue
    harness.step() // the decision at 120: late, so it yields to queued input
    keyer.release(250, 'dit')
    harness.advance(2000)
    // Dits due at 0 and 120 and 240 (the paddle was still down at 240); not at 360.
    expect(code()).toBe('...')
  })

  it('a timely decision never waits', () => {
    const { keyer, harness, tones } = setup('A')
    keyer.press(undefined, 'dit')
    harness.at(DIT + SPACE + 1)
    keyer.release(undefined, 'dit')
    harness.advance(1000)
    expect(tones.map(([start]) => start)).toEqual([0, 120])
  })
})

describe('reset and the paddle state', () => {
  it('drops the element sending and reports it, so the tone stops', () => {
    const run = setup('A')
    run.keyer.press(undefined, 'dit')
    run.harness.advance(30)
    run.keyer.reset()
    run.harness.advance(1000)
    expect(run.tones).toEqual([])
    expect(run.cancels()).toBe(1)
    expect(run.keyer.isPressed).toBe(false)
    expect(run.keyer.isSending).toBe(false)
  })

  it('needs a fresh press after a reset, even if the paddle is still physically down', () => {
    const run = setup('A')
    run.keyer.press(undefined, 'dit')
    run.harness.advance(DIT)
    run.keyer.reset()
    run.harness.advance(1000)
    expect(run.code()).toBe('.')
    run.keyer.press(undefined, 'dit')
    run.harness.advance(1)
    run.keyer.release(undefined, 'dit')
    run.harness.advance(1000)
    expect(run.code()).toBe('..')
  })

  it('reports each paddle down and up once', () => {
    const { keyer, paddles } = setup('A')
    keyer.press(undefined, 'dit')
    keyer.press(undefined, 'dit')
    keyer.press(undefined, 'dah')
    keyer.release(undefined, 'dit')
    keyer.reset()
    expect(paddles).toEqual([
      ['dit', true],
      ['dah', true],
      ['dit', false],
      ['dah', false],
    ])
  })

  it('a reset from inside onElement leaves nothing scheduled behind it', () => {
    const harness = createTestClock()
    const sent: string[] = []
    const keyer: PaddleKeyer = new PaddleKeyer(
      'B',
      { wpm: 20 },
      {
        onElement: (element) => {
          sent.push(element)
          keyer.reset()
        },
      },
      harness.clock,
    )
    keyer.press(undefined, 'dit')
    keyer.press(undefined, 'dah')
    harness.advance(5000)
    expect(sent).toEqual(['.'])
  })
})

describe('the straight-key contact on a paddle keyer', () => {
  it('passes a hold straight through, read by the dot/dash threshold', () => {
    const { keyer, harness, tones, characters } = setup('A', { dotDashThresholdMs: 120 })
    keyer.press(0)
    harness.at(300)
    keyer.release(300)
    harness.advance(5000)
    expect(tones).toEqual([[0, 300, '-']])
    expect(characters.map(([, c]) => c)).toEqual(['T'])
  })

  it('is ignored while the paddles are sending', () => {
    const { keyer, harness, code } = setup('A')
    keyer.press(undefined, 'dah')
    harness.at(50)
    keyer.press(50)
    harness.at(80)
    keyer.release(80)
    keyer.release(undefined, 'dah')
    harness.advance(1000)
    expect(code()).toBe('-')
  })
})

describe('createKeyer', () => {
  it('builds the key each setting names', () => {
    expect(KEYER_KINDS).toEqual(['straight', 'iambicA', 'iambicB'])
    expect(createKeyer('straight')).toBeInstanceOf(KeyEngine)
    const a = createKeyer('iambicA')
    const b = createKeyer('iambicB')
    expect(a).toBeInstanceOf(PaddleKeyer)
    expect((a as PaddleKeyer).mode).toBe('A')
    expect((b as PaddleKeyer).mode).toBe('B')
    for (const kind of KEYER_KINDS) expect(createKeyer(kind).kind).toBe(kind)
  })
})

describe('keyboard paddles', () => {
  /** A stand-in for `window` that lets a test dispatch by hand. */
  function fakeTarget() {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    return {
      addEventListener(type: string, handler: (event: unknown) => void) {
        const set = listeners.get(type) ?? new Set()
        set.add(handler)
        listeners.set(type, set)
      },
      removeEventListener(type: string, handler: (event: unknown) => void) {
        listeners.get(type)?.delete(handler)
      },
      dispatch(type: string, event: Record<string, unknown>) {
        const full = { preventDefault: () => {}, target: null, repeat: false, ...event }
        for (const handler of listeners.get(type) ?? []) handler(full)
      },
    }
  }

  it('defaults to [ and ], which clash with no other binding', () => {
    expect(DEFAULT_KEY_BINDINGS.dit).toBe('[')
    expect(DEFAULT_KEY_BINDINGS.dah).toBe(']')
    const values = Object.values(DEFAULT_KEY_BINDINGS)
    expect(new Set(values).size).toBe(values.length)
  })

  it('maps paddle keys only on a paddle keyer', () => {
    expect(contactFor('[', DEFAULT_KEY_BINDINGS, 'straight')).toBeNull()
    expect(contactFor('[', DEFAULT_KEY_BINDINGS, 'iambicA')).toBe('dit')
    expect(contactFor(']', DEFAULT_KEY_BINDINGS, 'iambicB')).toBe('dah')
    expect(contactFor(' ', DEFAULT_KEY_BINDINGS, 'iambicA')).toBe('key')
    expect(contactFor(' ', DEFAULT_KEY_BINDINGS, 'straight')).toBe('key')
  })

  it('swaps the paddles for a left-handed operator and moves nothing else', () => {
    const swapped = swapPaddles(DEFAULT_KEY_BINDINGS)
    expect(swapped).toEqual({ ...DEFAULT_KEY_BINDINGS, dit: ']', dah: '[' })
    expect(contactFor('[', swapped, 'iambicA')).toBe('dah')
  })

  it('keys the paddle keyer from the keyboard, ignoring auto-repeat', () => {
    const run = setup('A')
    const target = fakeTarget()
    bindKeyboard(run.keyer, DEFAULT_KEY_BINDINGS, target as never)
    target.dispatch('keydown', { key: '[' })
    target.dispatch('keydown', { key: ']' })
    run.harness.advance(100)
    target.dispatch('keydown', { key: '[', repeat: true })
    target.dispatch('keyup', { key: '[' })
    target.dispatch('keyup', { key: ']' })
    run.harness.advance(1000)
    expect(run.code()).toBe('.-')
  })

  it('lets go of a paddle released over a button, rather than dropping the other one', () => {
    const run = setup('A')
    const target = fakeTarget()
    bindKeyboard(run.keyer, DEFAULT_KEY_BINDINGS, target as never)
    const button = { tagName: 'BUTTON', isContentEditable: false, getAttribute: () => null }
    target.dispatch('keydown', { key: ']' })
    target.dispatch('keydown', { key: '[' })
    target.dispatch('keyup', { key: '[', target: button })
    expect(run.keyer.isPressed).toBe(true)
    // dah 0-180, the remembered dit 240-300, then dah again while ] is held.
    run.harness.at(DAH + SPACE + DIT + SPACE + 1)
    target.dispatch('keyup', { key: ']' })
    run.harness.advance(1000)
    expect(run.code()).toBe('-.-')
  })

  it('releases both paddles when the window loses focus', () => {
    const run = setup('B')
    const target = fakeTarget()
    bindKeyboard(run.keyer, DEFAULT_KEY_BINDINGS, target as never)
    target.dispatch('keydown', { key: '[' })
    target.dispatch('keydown', { key: ']' })
    target.dispatch('blur', {})
    run.harness.advance(1000)
    expect(run.keyer.isPressed).toBe(false)
    expect(run.tones).toEqual([])
  })
})

describe('USB paddle adapters on Left and Right Ctrl (DEC-055)', () => {
  /** A window stand-in that reports whether each dispatch was prevented. */
  function target() {
    const listeners = new Map<string, Set<(event: unknown) => void>>()
    return {
      addEventListener(type: string, handler: (event: unknown) => void) {
        const set = listeners.get(type) ?? new Set()
        set.add(handler)
        listeners.set(type, set)
      },
      removeEventListener(type: string, handler: (event: unknown) => void) {
        listeners.get(type)?.delete(handler)
      },
      dispatch(type: string, event: Record<string, unknown>) {
        let prevented = false
        const full = {
          preventDefault: () => {
            prevented = true
          },
          target: null,
          repeat: false,
          ...event,
        }
        for (const handler of listeners.get(type) ?? []) handler(full)
        return prevented
      },
    }
  }

  const adapter = { ...DEFAULT_KEY_BINDINGS, ...ADAPTER_PADDLES }
  const ctrl = (side: 'Left' | 'Right', extra: Record<string, unknown> = {}) => ({
    key: 'Control',
    code: `Control${side}`,
    ctrlKey: true,
    ...extra,
  })

  it('matches the two sides by event.code, only on a paddle keyer', () => {
    expect(contactFor('Control', adapter, 'iambicA', { code: 'ControlLeft', ctrlKey: true })).toBe(
      'dit',
    )
    expect(contactFor('Control', adapter, 'iambicB', { code: 'ControlRight' })).toBe('dah')
    // Without a code there is no side, so nothing is keyed.
    expect(contactFor('Control', adapter, 'iambicA')).toBeNull()
    expect(contactFor('Control', adapter, 'straight', { code: 'ControlLeft' })).toBeNull()
  })

  it('keys dit and dah from Left and Right Ctrl, and never prevents Ctrl itself', () => {
    const run = setup('A')
    const window = target()
    bindKeyboard(run.keyer, adapter, window as never)
    expect(window.dispatch('keydown', ctrl('Left'))).toBe(false)
    expect(window.dispatch('keydown', ctrl('Right'))).toBe(false)
    run.harness.advance(100)
    expect(window.dispatch('keyup', { key: 'Control', code: 'ControlLeft' })).toBe(false)
    window.dispatch('keyup', { key: 'Control', code: 'ControlRight' })
    run.harness.advance(1000)
    expect(run.code()).toBe('.-')
  })

  it('keys from Ctrl even with an on-screen paddle focused', () => {
    const run = setup('A')
    const window = target()
    bindKeyboard(run.keyer, adapter, window as never)
    const button = { tagName: 'BUTTON', isContentEditable: false, getAttribute: () => null }
    window.dispatch('keydown', ctrl('Right', { target: button }))
    window.dispatch('keyup', { key: 'Control', code: 'ControlRight', target: button })
    run.harness.advance(1000)
    expect(run.code()).toBe('-')
  })

  it('treats Ctrl+C as a shortcut: drops what Ctrl started and leaves C to the browser', () => {
    const run = setup('A')
    const window = target()
    let cancelled = 0
    bindKeyboard(run.keyer, adapter, window as never, undefined, () => {
      cancelled += 1
    })
    window.dispatch('keydown', ctrl('Left'))
    run.harness.advance(20)
    expect(window.dispatch('keydown', { key: 'c', code: 'KeyC', ctrlKey: true })).toBe(false)
    window.dispatch('keyup', { key: 'c', code: 'KeyC', ctrlKey: true })
    window.dispatch('keyup', { key: 'Control', code: 'ControlLeft' })
    run.harness.advance(1000)
    expect(run.tones).toEqual([])
    expect(run.cancels()).toBe(1)
    expect(cancelled).toBe(1)
    expect(run.keyer.isPressed).toBe(false)
  })

  it('leaves Ctrl+Shift for the next key to decide', () => {
    const run = setup('A')
    const window = target()
    bindKeyboard(run.keyer, adapter, window as never)
    window.dispatch('keydown', ctrl('Left'))
    window.dispatch('keydown', { key: 'Shift', code: 'ShiftLeft', ctrlKey: true, shiftKey: true })
    expect(run.keyer.isPressed).toBe(true)
  })

  it('takes nothing from Ctrl shortcuts on a straight key', () => {
    const run = setup('A')
    const straight = new KeyEngine({ wpm: 20 }, {}, run.harness.clock)
    const window = target()
    bindKeyboard(straight, adapter, window as never)
    window.dispatch('keydown', ctrl('Left'))
    expect(straight.isPressed).toBe(false)
    expect(window.dispatch('keydown', { key: 'c', code: 'KeyC', ctrlKey: true })).toBe(false)
  })

  it('leaves Cmd+[ and Ctrl+] to the browser on the default bracket paddles', () => {
    const run = setup('A')
    const window = target()
    bindKeyboard(run.keyer, DEFAULT_KEY_BINDINGS, window as never)
    expect(window.dispatch('keydown', { key: '[', metaKey: true })).toBe(false)
    expect(window.dispatch('keydown', { key: ']', ctrlKey: true })).toBe(false)
    expect(run.keyer.isPressed).toBe(false)
  })

  it('still lets go of a bracket paddle released while a modifier is down', () => {
    const run = setup('A')
    const window = target()
    bindKeyboard(run.keyer, DEFAULT_KEY_BINDINGS, window as never)
    window.dispatch('keydown', { key: '[' })
    window.dispatch('keyup', { key: '[', metaKey: true })
    expect(run.keyer.isPressed).toBe(false)
  })

  it('sees Ctrl and either side as one key, and the two sides as two', () => {
    expect(bindingsOverlap('Control', 'ControlLeft')).toBe(true)
    expect(bindingsOverlap('ControlRight', 'Control')).toBe(true)
    expect(bindingsOverlap('ControlLeft', 'ControlRight')).toBe(false)
    expect(bindingsOverlap('[', '[')).toBe(true)
    expect(bindingsOverlap('[', ']')).toBe(false)
    expect(bindingsOverlap(undefined, '[')).toBe(false)
  })

  it('swaps the adapter paddles like any others', () => {
    const swapped = swapPaddles(adapter)
    expect(contactFor('Control', swapped, 'iambicA', { code: 'ControlLeft' })).toBe('dah')
  })
})
