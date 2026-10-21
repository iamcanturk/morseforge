/**
 * The iambic paddle keyer, and the one place a key is chosen (issue #43).
 *
 * A paddle has two levers: one closes the dit contact, the other the dah
 * contact. Unlike a straight key, the operator does not time anything. Holding
 * a paddle makes the keyer send that element over and over at exactly the
 * speed set, and squeezing both alternates them. The operator's job is to let
 * go at the right moment, which is why a keyer has to be exact: the timing is
 * the machine's, so any error in it is ours.
 *
 * Timing, from `timingEngine`, at the set character speed (one unit = 1200/WPM
 * ms, so 60 ms at 20 WPM):
 *
 *   dit   1 unit of tone, then 1 unit of silence
 *   dah   3 units of tone, then 1 unit of silence
 *
 * The silence after each element (the element space) belongs to the element:
 * the keyer is busy until it ends, and only then decides what comes next.
 *
 * The rules, exactly as implemented (they are what the tests assert):
 *
 * 1. **Idle.** A paddle pressed while idle starts its element at once.
 * 2. **Memory.** While an element or its space is sending, pressing the
 *    *opposite* paddle sets that paddle's memory, even if it is released again
 *    before the element ends. This is the dot (and dah) memory every iambic
 *    keyer has: a quick tap is never lost. Pressing the *same* paddle again
 *    sets nothing; if it is still held at the decision, rule 3b repeats it.
 * 3. **The decision**, made when the element space ends:
 *    a. If the opposite paddle's memory is set, or the opposite paddle is held,
 *       send the opposite element. Squeezing both therefore alternates, and
 *       a remembered tap is inserted between repeats.
 *    b. Otherwise, if the same paddle is still held, send the same again.
 *    c. Otherwise go idle. The character gap starts counting from the moment
 *       the last tone stopped, so it is one unit old already.
 * 4. **Starting an element** clears its own memory.
 * 5. **Mode A and mode B** differ in one place. In mode B an element that
 *    starts while the opposite paddle is already held sets the opposite memory
 *    straight away; in mode A it does not (only a press during the element
 *    does, rule 2). So when both paddles are released during an element of a
 *    squeeze, mode B sends one more element, the opposite one, and stops;
 *    mode A finishes the element it is sending and stops. During that extra
 *    element no paddle is held, so nothing follows it.
 * 6. **Releasing mid-element** never shortens the element: a dit is always one
 *    unit and a dah three. The keyer finishes what it started.
 * 7. **A late decision** (the page was busy, e.g. creating the AudioContext on
 *    the first press, and the timer fired long after the space ended) first
 *    yields once, so input that arrived meanwhile is handled, and then judges
 *    "held" as of when the space was *due* to end, using the release event's
 *    own timestamp. A paddle let go of at 400 ms has sent the dits due before
 *    400 ms and no more, however late the page got round to it.
 * 8. **The straight-key contact** (`key`) passes straight through, timed by
 *    the hold as on a straight key, like the straight-key jack on a real
 *    keyer. It is taken only while the paddles are idle, and paddles pressed
 *    while it is down are ignored until pressed again.
 *
 * Character and word gaps are detected by the same `GapTimer` the straight key
 * uses; the elements this keyer emits decode exactly like hand-keyed ones.
 */

import {
  GapTimer,
  KeyEngine,
  type KeyContact,
  type KeyEngineCallbacks,
  type KeyEngineClock,
  type KeyEngineOptions,
  type Keyer,
  type KeyerKind,
  type Paddle,
  type ResolvedThresholds,
  isOnClock,
  resolveThresholds,
  systemClock,
} from './keyEngine'
import { UNITS, dotDuration } from './timingEngine'

export type IambicMode = 'A' | 'B'

const OPPOSITE: Readonly<Record<Paddle, Paddle>> = { dit: 'dah', dah: 'dit' }
const ELEMENT: Readonly<Record<Paddle, '.' | '-'>> = { dit: '.', dah: '-' }
const TONE_UNITS: Readonly<Record<Paddle, number>> = { dit: UNITS.DOT, dah: UNITS.DASH }

/**
 * How late a decision may run before the keyer suspects the page was busy and
 * yields to queued input first (rule 7). Timers are a few ms late routinely.
 */
const LATE_MS = 25

/** The speed a keyer falls back to without one, as `resolveThresholds` does. */
const DEFAULT_WPM = 15

export class PaddleKeyer implements Keyer {
  readonly kind: 'iambicA' | 'iambicB'
  #mode: IambicMode
  #thresholds: ResolvedThresholds
  #unit: number
  #callbacks: KeyEngineCallbacks
  #clock: KeyEngineClock
  #gaps: GapTimer
  /** The straight-key jack (rule 8). It never commits; this keyer's gaps do. */
  #jack: KeyEngine

  #held: Record<Paddle, boolean> = { dit: false, dah: false }
  /** When each paddle was last let go of, on the clock (rule 7). */
  #releasedAt: Record<Paddle, number> = { dit: -Infinity, dah: -Infinity }
  /** The late decision has already yielded once. */
  #yielded = false
  #memory: Record<Paddle, boolean> = { dit: false, dah: false }
  /** `mark`: the tone is on. `space`: the silence that belongs to it. */
  #phase: 'idle' | 'mark' | 'space' = 'idle'
  /** The element sending, or just sent while in its space. */
  #current: Paddle | null = null
  /**
   * When the current phase is due to end, on the clock. Each phase is timed
   * from when the last one was *due* to end, not from when its timer happened
   * to fire, so timer lateness never accumulates over a long run of dits.
   */
  #endsAt = 0
  #timer: number | null = null

  constructor(
    mode: IambicMode,
    options: KeyEngineOptions = {},
    callbacks: KeyEngineCallbacks = {},
    clock: KeyEngineClock = systemClock,
  ) {
    this.#mode = mode
    this.kind = mode === 'A' ? 'iambicA' : 'iambicB'
    this.#thresholds = resolveThresholds(options)
    this.#unit = dotDuration(options.wpm ?? DEFAULT_WPM)
    this.#callbacks = callbacks
    this.#clock = clock
    this.#gaps = new GapTimer(clock, () => this.#callbacks)
    this.#jack = new KeyEngine(
      { ...options, autoCommit: false },
      {
        onKeyDown: () => {
          this.#gaps.cancel()
          this.#callbacks.onKeyDown?.()
        },
        onKeyUp: (heldMs) => this.#callbacks.onKeyUp?.(heldMs),
        onElement: (element, heldMs) => this.#callbacks.onElement?.(element, heldMs),
        onIdle: () => {
          this.#gaps.arm(this.#thresholds)
          this.#callbacks.onIdle?.(0)
        },
        onCancel: () => this.#callbacks.onCancel?.(),
      },
      clock,
    )
  }

  get mode(): IambicMode {
    return this.#mode
  }

  get thresholds(): Readonly<ResolvedThresholds> {
    return this.#thresholds
  }

  /** One unit at the current speed, in ms. */
  get unitMs(): number {
    return this.#unit
  }

  /** Either paddle, or the straight-key contact, is held. */
  get isPressed(): boolean {
    return this.#held.dit || this.#held.dah || this.#jack.isPressed
  }

  /** Sending an element or the space after it. */
  get isSending(): boolean {
    return this.#phase !== 'idle'
  }

  /** A new speed takes effect from the next element; the one sending keeps its length. */
  configure(options: KeyEngineOptions): void {
    this.#thresholds = resolveThresholds(options)
    this.#unit = dotDuration(options.wpm ?? DEFAULT_WPM)
    this.#jack.configure({ ...options, autoCommit: false })
  }

  /**
   * Close a contact. Paddle presses are timed by the keyer, not by the event,
   * so `timeStamp` only matters to the straight-key contact.
   */
  press(timeStamp?: number, contact: KeyContact = 'key'): void {
    if (contact === 'key') {
      // Rule 8: the jack only keys over an idle, untouched paddle.
      if (this.#phase !== 'idle' || this.#held.dit || this.#held.dah) return
      this.#jack.press(timeStamp)
      return
    }

    if (this.#held[contact]) return
    this.#held[contact] = true
    this.#callbacks.onPaddle?.(contact, true)
    if (this.#jack.isPressed) return

    if (this.#phase === 'idle') {
      this.#gaps.cancel()
      this.#start(contact, this.#clock.now())
      return
    }
    // Rule 2: the opposite paddle, pressed while busy, is remembered.
    if (contact !== this.#current) this.#memory[contact] = true
  }

  /** Open a contact. An element already sending finishes (rule 6). */
  release(timeStamp?: number, contact: KeyContact = 'key'): void {
    if (contact === 'key') {
      this.#jack.release(timeStamp)
      return
    }
    if (!this.#held[contact]) return
    this.#held[contact] = false
    const now = this.#clock.now()
    this.#releasedAt[contact] = isOnClock(timeStamp, now) ? Math.min(timeStamp, now) : now
    this.#callbacks.onPaddle?.(contact, false)
  }

  /**
   * Drop everything: the element sending, its space, both memories, the gap
   * timers, and the paddles' held state (a keyup that follows finds nothing to
   * release, which is harmless; a paddle left marked as held would refuse its
   * next press). Reported through `onCancel` if anything was keying.
   */
  reset(): void {
    this.#clearTimer()
    this.#gaps.cancel()
    const wasKeying = this.#phase !== 'idle'
    this.#phase = 'idle'
    this.#current = null
    this.#memory = { dit: false, dah: false }
    this.#releasedAt = { dit: -Infinity, dah: -Infinity }
    this.#yielded = false
    for (const paddle of ['dit', 'dah'] as const) {
      if (!this.#held[paddle]) continue
      this.#held[paddle] = false
      this.#callbacks.onPaddle?.(paddle, false)
    }
    // The jack reports its own dropped hold.
    this.#jack.reset()
    if (wasKeying) this.#callbacks.onCancel?.()
  }

  /** Rules 4 and 5, then the tone for exactly one element. */
  #start(paddle: Paddle, at: number): void {
    const opposite = OPPOSITE[paddle]
    this.#memory[paddle] = false
    const oppositeHeld = this.#held[opposite] || this.#releasedAt[opposite] > at
    if (this.#mode === 'B' && oppositeHeld) this.#memory[opposite] = true

    const toneMs = this.#unit * TONE_UNITS[paddle]
    this.#phase = 'mark'
    this.#current = paddle
    this.#endsAt = at + toneMs
    // State and timer first, callbacks last: a callback may reset the keyer,
    // and a reset has to find nothing left to undo it.
    this.#schedule(() => this.#endMark(paddle, toneMs))
    this.#callbacks.onKeyDown?.(toneMs)
  }

  #endMark(paddle: Paddle, toneMs: number): void {
    this.#phase = 'space'
    this.#endsAt += this.#unit * UNITS.ELEMENT_GAP
    this.#schedule(() => this.#decide())
    this.#callbacks.onKeyUp?.(toneMs)
    this.#callbacks.onElement?.(ELEMENT[paddle], toneMs)
  }

  /** Rule 3, at the end of the element space. */
  #decide(): void {
    const at = this.#endsAt
    if (!this.#yielded && this.#clock.now() - at > LATE_MS) {
      this.#yielded = true
      this.#timer = this.#clock.setTimeout(() => {
        this.#timer = null
        this.#decide()
      }, 0)
      return
    }
    this.#yielded = false

    // Held when the space was due to end: down now, or let go of after then.
    const heldAt = (paddle: Paddle) => this.#held[paddle] || this.#releasedAt[paddle] > at
    const last = this.#current
    if (last !== null) {
      const opposite = OPPOSITE[last]
      if (this.#memory[opposite] || heldAt(opposite)) return this.#start(opposite, at)
      if (heldAt(last)) return this.#start(last, at)
    }

    this.#phase = 'idle'
    this.#current = null
    const silentMs = this.#unit * UNITS.ELEMENT_GAP
    this.#gaps.arm(this.#thresholds, silentMs)
    this.#callbacks.onIdle?.(silentMs)
  }

  #schedule(fn: () => void): void {
    this.#clearTimer()
    this.#timer = this.#clock.setTimeout(
      () => {
        this.#timer = null
        fn()
      },
      Math.max(this.#endsAt - this.#clock.now(), 0),
    )
  }

  #clearTimer(): void {
    if (this.#timer === null) return
    this.#clock.clearTimeout(this.#timer)
    this.#timer = null
  }
}

/**
 * The key Settings asks for. The only place the kind is turned into a class,
 * so every screen that keys gets the same one for the same setting.
 */
export function createKeyer(
  kind: KeyerKind,
  options: KeyEngineOptions = {},
  callbacks: KeyEngineCallbacks = {},
  clock: KeyEngineClock = systemClock,
): Keyer {
  if (kind === 'iambicA') return new PaddleKeyer('A', options, callbacks, clock)
  if (kind === 'iambicB') return new PaddleKeyer('B', options, callbacks, clock)
  return new KeyEngine(options, callbacks, clock)
}
