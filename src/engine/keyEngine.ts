/**
 * Straight-key input (PROJECT.md §9, §10, §14), and the interface every key
 * shares. The iambic paddle keyer is the other implementation, in `keyer.ts`.
 *
 * The operator holds a key down; how long they hold it decides dot or dash, and
 * how long they *release* for decides whether the character or the word ended.
 * That is the whole protocol, and it is what makes sending feel physical rather
 * than like typing.
 *
 * The engine is DOM-agnostic: it takes `press()` / `release()` and a clock. That
 * keeps it unit-testable, and lets the same instance be driven by a keyboard, a
 * pointer, or a gamepad without branching.
 */

import { dotDuration } from './timingEngine'

export interface KeyEngineOptions {
  /**
   * Hold shorter than this is a dot, longer is a dash (PROJECT.md §9).
   * Defaults to twice the dot length at the target speed, which sits at the
   * midpoint of a 1-unit dot and a 3-unit dash.
   */
  dotDashThresholdMs?: number
  /** Silence this long ends the character. Defaults to 3 units. */
  characterGapMs?: number
  /** Silence this long ends the word. Defaults to 7 units. */
  wordGapMs?: number
  /** Target speed used to derive any threshold not given explicitly. */
  wpm?: number
  /**
   * When false, releasing the key never ends a character or a word on its own —
   * the caller decides when, via its own commit control.
   *
   * This exists because how fast someone *sends* and how long they need to
   * *think* are unrelated. At 15 WPM a character ends after 240ms of silence,
   * which is correct for a competent operator and hopeless for a beginner:
   * they mean to send S and, three seconds of hesitation later, have sent
   * E E E. Manual commit removes the clock from the learning entirely.
   */
  autoCommit?: boolean
}

export interface KeyEngineCallbacks {
  onElement?: (element: '.' | '-', heldMs: number) => void
  onCharacterGap?: () => void
  onWordGap?: () => void
  /**
   * The contact closed: the tone starts. `toneMs` is how long it will sound
   * when the key already knows, which a paddle keyer does (it times its own
   * elements) and a straight key never does. Knowing it lets the sidetone be
   * scheduled on the audio clock instead of stopped by a timer.
   */
  onKeyDown?: (toneMs?: number) => void
  onKeyUp?: (heldMs: number) => void
  /**
   * The key has gone quiet with nothing more to send, `silentMs` after the
   * tone stopped: from here the silence counts toward the character gap. A
   * straight key is idle the moment it is released; a paddle keyer only after
   * the one-unit space that follows its last element, if no paddle asks for
   * another. This is what a countdown display should start from.
   */
  onIdle?: (silentMs: number) => void
  /** A paddle went down or up (paddle keyers only), for drawing the paddles. */
  onPaddle?: (paddle: Paddle, down: boolean) => void
  /**
   * A hold was dropped without a release: `reset()` while the key was down,
   * e.g. the window lost focus mid-hold. No element is emitted, but whatever
   * `onKeyDown` started (the sidetone, the pressed look) has to stop.
   */
  onCancel?: () => void
}

export interface ResolvedThresholds {
  dotDashThresholdMs: number
  characterGapMs: number
  wordGapMs: number
  autoCommit: boolean
}

/**
 * Work out the thresholds for a speed.
 *
 * The dot/dash boundary is 2 units rather than the geometric midpoint, because
 * beginners undershoot dashes far more often than they overshoot dots — a
 * forgiving boundary keeps early practice from feeling broken.
 */
export function resolveThresholds(options: KeyEngineOptions = {}): ResolvedThresholds {
  const unit = dotDuration(options.wpm ?? 15)
  return {
    dotDashThresholdMs: options.dotDashThresholdMs ?? unit * 2,
    characterGapMs: options.characterGapMs ?? unit * 3,
    wordGapMs: options.wordGapMs ?? unit * 7,
    autoCommit: options.autoCommit ?? true,
  }
}

/**
 * Which contact an input closes. A straight key has one, `key`; a paddle has
 * two, `dit` and `dah`. A paddle keyer also passes `key` straight through,
 * as a real keyer's straight-key jack does, so Space and the on-screen
 * straight key keep working whichever kind is selected.
 */
export type KeyContact = 'key' | Paddle
export type Paddle = 'dit' | 'dah'

/** What Settings → Key type offers. Stored as is, so never rename one. */
export type KeyerKind = 'straight' | 'iambicA' | 'iambicB'
export const KEYER_KINDS = [
  'straight',
  'iambicA',
  'iambicB',
] as const satisfies readonly KeyerKind[]

/**
 * The interface every key implements, so nothing above the engine needs to
 * know which one is attached: `useMorseKey`, `bindKeyboard` and the landing
 * station all drive a `Keyer`. Callers press and release contacts with the
 * input's own timestamp; the keyer decides what that means.
 */
export interface Keyer {
  readonly kind: KeyerKind
  readonly thresholds: Readonly<ResolvedThresholds>
  /** Whether any contact is held right now. */
  readonly isPressed: boolean
  configure(options: KeyEngineOptions): void
  /** Close a contact. Omitted, it is `key`. Repeats must be filtered by the caller. */
  press(timeStamp?: number, contact?: KeyContact): void
  release(timeStamp?: number, contact?: KeyContact): void
  /** Drop everything in flight (holds, elements, gap timers) without emitting it. */
  reset(): void
}

/** Injectable clock + timer, so tests can drive time by hand. */
export interface KeyEngineClock {
  now: () => number
  setTimeout: (fn: () => void, ms: number) => number
  clearTimeout: (handle: number) => void
}

/**
 * How far an event's `timeStamp` may sit from the clock and still be trusted.
 * Generous for a page that was busy; far below the gap between clock domains.
 */
export const TIMESTAMP_TOLERANCE_MS = 60_000

/**
 * Whether an event's `timeStamp` is on the clock's timeline.
 *
 * Native events are stamped on the `performance.now()` timeline, but React's
 * synthetic events fall back to `Date.now()` when the native stamp is 0, an
 * epoch value decades away. Mixing the two would read a hold as 0 ms or as
 * years, so a stamp is only used when it is within a minute of the clock.
 */
export function isOnClock(timeStamp: number | undefined, now: number): timeStamp is number {
  return (
    typeof timeStamp === 'number' &&
    Number.isFinite(timeStamp) &&
    timeStamp > 0 &&
    Math.abs(timeStamp - now) <= TIMESTAMP_TOLERANCE_MS
  )
}

export const systemClock: KeyEngineClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
}

/**
 * Character and word gap detection, shared by every key.
 *
 * Both keys end a character the same way: a stretch of silence measured from
 * the moment the last tone stopped. Only *when* the silence starts counting
 * differs, which is why `arm` takes the silence already elapsed: a paddle
 * keyer arms it one unit after the tone, at the end of its element space.
 */
export class GapTimer {
  #clock: KeyEngineClock
  #callbacks: () => Pick<KeyEngineCallbacks, 'onCharacterGap' | 'onWordGap'>
  #characterTimer: number | null = null
  #wordTimer: number | null = null

  constructor(
    clock: KeyEngineClock,
    callbacks: () => Pick<KeyEngineCallbacks, 'onCharacterGap' | 'onWordGap'>,
  ) {
    this.#clock = clock
    this.#callbacks = callbacks
  }

  /** Start counting; `silentMs` of the silence has already passed. */
  arm(thresholds: ResolvedThresholds, silentMs = 0): void {
    this.cancel()
    if (!thresholds.autoCommit) return

    this.#characterTimer = this.#clock.setTimeout(
      () => {
        this.#characterTimer = null
        this.#callbacks().onCharacterGap?.()
      },
      Math.max(thresholds.characterGapMs - silentMs, 0),
    )

    this.#wordTimer = this.#clock.setTimeout(
      () => {
        this.#wordTimer = null
        this.#callbacks().onWordGap?.()
      },
      Math.max(thresholds.wordGapMs - silentMs, 0),
    )
  }

  cancel(): void {
    if (this.#characterTimer !== null) {
      this.#clock.clearTimeout(this.#characterTimer)
      this.#characterTimer = null
    }
    if (this.#wordTimer !== null) {
      this.#clock.clearTimeout(this.#wordTimer)
      this.#wordTimer = null
    }
  }
}

export class KeyEngine implements Keyer {
  readonly kind = 'straight' as const
  #thresholds: ResolvedThresholds
  #callbacks: KeyEngineCallbacks
  #clock: KeyEngineClock
  #gaps: GapTimer

  #pressedAt: number | null = null

  constructor(
    options: KeyEngineOptions = {},
    callbacks: KeyEngineCallbacks = {},
    clock: KeyEngineClock = systemClock,
  ) {
    this.#thresholds = resolveThresholds(options)
    this.#callbacks = callbacks
    this.#clock = clock
    this.#gaps = new GapTimer(clock, () => this.#callbacks)
  }

  get thresholds(): Readonly<ResolvedThresholds> {
    return this.#thresholds
  }

  get isPressed(): boolean {
    return this.#pressedAt !== null
  }

  configure(options: KeyEngineOptions): void {
    this.#thresholds = resolveThresholds(options)
  }

  /**
   * The moment an input happened: the event's own `timeStamp` when the caller
   * has one, else the clock.
   *
   * The first press creates the AudioContext inside `onKeyDown`, which can
   * block the main thread. Timed when the handlers run, the release of a quick
   * first tap is read late and the dot becomes a dash. An event's timeStamp is
   * on the same timeline as `performance.now()` and records when the input
   * arrived, so a dot stays a dot however busy the page was.
   */
  #at(timeStamp: number | undefined): number {
    const now = this.#clock.now()
    return isOnClock(timeStamp, now) ? timeStamp : now
  }

  /**
   * Key down. Repeat events must be filtered by the caller (see `bindKeyboard`).
   * Pass the input event's `timeStamp` when there is one (see `#at`). A
   * straight key has one contact, so `contact` changes nothing.
   */
  press(timeStamp?: number, _contact?: KeyContact): void {
    if (this.#pressedAt !== null) return
    this.#gaps.cancel()
    this.#pressedAt = this.#at(timeStamp)
    this.#callbacks.onKeyDown?.()
  }

  /**
   * Key up. Emits the element, then arms the character/word gap timers —
   * unless auto-commit is off, in which case the caller decides when a
   * character ends. Pass the input event's `timeStamp` when there is one.
   */
  release(timeStamp?: number, _contact?: KeyContact): void {
    if (this.#pressedAt === null) return

    // Never negative: a press timed by the clock and a release by an event
    // stamped a moment earlier would otherwise give a hold below zero.
    const heldMs = Math.max(this.#at(timeStamp) - this.#pressedAt, 0)
    this.#pressedAt = null
    this.#callbacks.onKeyUp?.(heldMs)

    const element = heldMs < this.#thresholds.dotDashThresholdMs ? '.' : '-'
    this.#callbacks.onElement?.(element, heldMs)

    this.#gaps.arm(this.#thresholds)
    this.#callbacks.onIdle?.(0)
  }

  /**
   * Drop any pending gap timers without emitting them (§10 Cancel). A hold in
   * progress is dropped too, and reported through `onCancel`.
   */
  reset(): void {
    this.#gaps.cancel()
    const wasPressed = this.#pressedAt !== null
    this.#pressedAt = null
    if (wasPressed) this.#callbacks.onCancel?.()
  }
}

/** User-remappable controls (PROJECT.md §10). */
export interface KeyBindings {
  /** Primary key. `' '` is Space. */
  key: string
  alternative?: string
  cancel?: string
  submit?: string
  /** The dit paddle, read only while a paddle keyer is selected. */
  dit?: string
  /** The dah paddle, likewise. */
  dah?: string
}

/**
 * The paddles default to `[` and `]`.
 *
 * - They clash with nothing already bound: Space and Enter key, Esc cancels,
 *   Ctrl finishes a character.
 * - They sit side by side under one hand, dit on the left as on a right-handed
 *   paddle, and they are the keys the VBand and other browser keyers use, so a
 *   ham who has keyed online already has them in their fingers.
 * - Left and right Ctrl were the other candidate, but `event.key` cannot tell
 *   them apart, Ctrl is already Finish, and Ctrl with a letter is a browser
 *   shortcut (Ctrl+W closes the tab).
 * - Z and X are letters, and on a German keyboard Z is nowhere near X.
 *
 * On layouts where the brackets need AltGr, Settings rebinds them.
 */
export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  key: ' ',
  alternative: 'Enter',
  cancel: 'Escape',
  submit: 'Control',
  dit: '[',
  dah: ']',
}

/**
 * The bindings with the paddles exchanged, for left-handed operators: the key
 * that sent dits sends dahs and the other way round. Nothing else moves.
 */
export function swapPaddles(bindings: KeyBindings): KeyBindings {
  return { ...bindings, dit: bindings.dah, dah: bindings.dit }
}

/**
 * Physical keys a paddle may be bound to by `event.code` (DEC-055).
 *
 * USB paddle adapters such as the VBand one type Left Ctrl for one paddle and
 * Right Ctrl for the other. `event.key` says "Control" for both, so these are
 * stored as their codes and matched against `event.code`. Only the paddle
 * bindings accept them: every other binding still refuses modifiers (A-14),
 * and a paddle binding is read only while a paddle keyer is selected, so on a
 * straight key Ctrl stays the browser's.
 */
export const CODE_BINDINGS = ['ControlLeft', 'ControlRight'] as const
export type CodeBinding = (typeof CODE_BINDINGS)[number]

export const isCodeBinding = (binding: string | undefined): binding is CodeBinding =>
  (CODE_BINDINGS as readonly string[]).includes(binding ?? '')

/** The paddle keys of the USB adapter preset in Settings. */
export const ADAPTER_PADDLES = { dit: 'ControlLeft', dah: 'ControlRight' } as const

/**
 * Whether two bindings can be set off by the same key press: the same key, or
 * Ctrl and one of its sides. Left and right Ctrl never overlap each other.
 */
export function bindingsOverlap(a: string | undefined, b: string | undefined): boolean {
  if (!a || !b) return false
  if (a === b) return true
  return (isCodeBinding(a) && b === 'Control') || (isCodeBinding(b) && a === 'Control')
}

/** What `contactFor` reads from a key event beyond its `key`. */
export interface KeyEventFacts {
  code?: string
  ctrlKey?: boolean
  metaKey?: boolean
  altKey?: boolean
}

/**
 * Which contact a key closes on this keyer, or null if it closes none.
 *
 * The paddle keys count only on a paddle keyer, so a straight key never sends
 * from `[`. They are checked before the straight-key binding, so someone who
 * binds a paddle to Space on purpose gets the paddle.
 *
 * A paddle bound to a character does not answer while Ctrl, Cmd or Alt is
 * held, so Cmd+[ (Back, on a Mac) and friends stay the browser's. Pass the
 * modifiers on keydown only: a keyup must always find its paddle, or it would
 * stay down. A paddle bound to Left or Right Ctrl is matched by `code`.
 */
export function contactFor(
  key: string,
  bindings: KeyBindings,
  kind: KeyerKind,
  event: KeyEventFacts = {},
): KeyContact | null {
  if (kind !== 'straight') {
    const modified = Boolean(event.ctrlKey || event.metaKey || event.altKey)
    const paddle = (binding: string | undefined) =>
      Boolean(binding) &&
      (isCodeBinding(binding) ? event.code === binding : key === binding && !modified)
    if (paddle(bindings.dit)) return 'dit'
    if (paddle(bindings.dah)) return 'dah'
  }
  if (key === bindings.key || key === bindings.alternative) return 'key'
  return null
}

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'AltGraph', 'Meta', 'OS'])

/**
 * Whether the thing being typed into has its own use for the key.
 *
 * The listener sits on `window`, so it sees every key event on the page, and a
 * `preventDefault` in the bubble phase still cancels the default action. Without
 * this check, binding the key to Space meant **no button or link on the page
 * could be activated from the keyboard at all** — on the telegraph, where the
 * key is bound for the whole life of the page, that included the skip link and
 * every nav item. Space and Enter are how a keyboard user presses a button;
 * taking them away site-wide is a keyboard trap, not a keyer.
 *
 * Focus on the page background still keys, which is the normal case: nothing
 * on these screens takes focus unless you tab to it.
 *
 * A focusable scroll region (`role="region"` with a `tabindex`, such as the
 * tree board when it is wider than its frame) counts as interactive too: Space
 * on it has to pan it, as it pans any focused scroller, not key a dot.
 */
function isInteractive(target: EventTarget | null): boolean {
  // Duck-typed rather than `instanceof HTMLElement`, so this is testable
  // without a DOM and safe in any realm.
  const element = target as { tagName?: unknown; isContentEditable?: unknown } | null
  if (!element || typeof element.tagName !== 'string') return false
  if (element.isContentEditable === true) return true

  if (['INPUT', 'TEXTAREA', 'SELECT', 'BUTTON', 'A', 'SUMMARY', 'OPTION'].includes(element.tagName))
    return true

  const withRole = target as { getAttribute?: (name: string) => string | null }
  const role = withRole.getAttribute?.('role') ?? null
  if (role === 'region' && withRole.getAttribute?.('tabindex') != null) return true
  return ['button', 'link', 'checkbox', 'radio', 'switch', 'textbox', 'menuitem'].includes(
    role ?? '',
  )
}

/**
 * Wire a KeyEngine to the keyboard. Returns an unbind function.
 *
 * Three details that matter more than they look:
 * - `event.repeat` is ignored. Holding a key fires keydown repeatedly at the OS
 *   repeat rate, which would otherwise read as a burst of dots.
 * - Space is `preventDefault`ed while bound, or every hold also scrolls the page.
 * - Events aimed at a button, a link or a field are left entirely alone. See
 *   `isInteractive`.
 * - The `cancel` binding (Esc by default) drops the hold and the gap timers,
 *   then calls `onCancel`, which is where the caller throws away the elements
 *   already keyed. Resetting the engine alone stopped the auto-commit and left
 *   the half-keyed character in place, so the next element was glued onto it.
 */
export function bindKeyboard(
  engine: Keyer,
  bindings: KeyBindings = DEFAULT_KEY_BINDINGS,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  /** Fired by the `submit` binding — the manual "this character is finished". */
  onSubmit?: () => void,
  /** Fired by the `cancel` binding, after the engine is reset: abandon the pending character. */
  onCancel?: () => void,
): () => void {
  /** Paddles closed by Left or Right Ctrl and still held (DEC-055). */
  const ctrlPaddles = new Set<KeyContact>()

  const onKeyDown = (event: Event) => {
    const e = event as KeyboardEvent
    // Read on every event rather than once, so a keyer swapped in under the
    // same binding is answered by its own rules.
    const closes = contactFor(e.key, bindings, engine.kind, e)

    // Ctrl held as a paddle, then another key: that was a shortcut (Ctrl+C),
    // not keying. Drop what the Ctrl press started, exactly as Esc would, and
    // leave the shortcut alone: no preventDefault.
    if (!closes && ctrlPaddles.size > 0 && e.ctrlKey && !MODIFIER_KEYS.has(e.key)) {
      ctrlPaddles.clear()
      engine.reset()
      onCancel?.()
      return
    }

    if (e.repeat) return

    // A paddle on Left or Right Ctrl answers even with a button focused, a
    // tapped on-screen paddle say: Ctrl means nothing to a button on its own.
    // Ctrl itself is never prevented, which is what keeps every Ctrl shortcut
    // working while it doubles as a paddle.
    if (closes && closes !== 'key' && e.key === 'Control') {
      ctrlPaddles.add(closes)
      engine.press(e.timeStamp, closes)
      return
    }

    if (isInteractive(e.target)) return

    if (closes) {
      e.preventDefault()
      engine.press(e.timeStamp, closes)
      return
    }
    if (bindings.cancel && e.key === bindings.cancel) {
      e.preventDefault()
      engine.reset()
      onCancel?.()
      return
    }
    if (onSubmit && bindings.submit && e.key === bindings.submit) {
      e.preventDefault()
      onSubmit()
    }
  }

  const onKeyUp = (event: Event) => {
    const e = event as KeyboardEvent
    const opens = contactFor(e.key, bindings, engine.kind, { code: e.code })
    if (!opens) return
    ctrlPaddles.delete(opens)
    // Released over a button rather than the page: the press was never taken,
    // so there is nothing to release — but the engine is reset rather than
    // ignored, in case focus moved onto the button mid-hold. A paddle is let
    // go of instead: the other paddle may still be held, and an element
    // already sending finishes either way.
    if (isInteractive(e.target)) {
      if (opens === 'key') engine.reset()
      else engine.release(e.timeStamp, opens)
      return
    }
    if (e.key !== 'Control') e.preventDefault()
    engine.release(e.timeStamp, opens)
  }

  // Releasing the key after the tab loses focus never fires keyup, which would
  // leave the tone hanging and the timers unarmed. The reset reports a hold it
  // drops through `onCancel`, which is what stops the tone.
  const onBlur = () => {
    ctrlPaddles.clear()
    engine.reset()
  }

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  return () => {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('keyup', onKeyUp)
    target.removeEventListener('blur', onBlur)
  }
}
