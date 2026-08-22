/**
 * Straight-key input (PROJECT.md §9, §10, §14).
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
  onKeyDown?: () => void
  onKeyUp?: (heldMs: number) => void
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

/** Injectable clock + timer, so tests can drive time by hand. */
export interface KeyEngineClock {
  now: () => number
  setTimeout: (fn: () => void, ms: number) => number
  clearTimeout: (handle: number) => void
}

const systemClock: KeyEngineClock = {
  now: () => performance.now(),
  setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
  clearTimeout: (handle) => globalThis.clearTimeout(handle),
}

export class KeyEngine {
  #thresholds: ResolvedThresholds
  #callbacks: KeyEngineCallbacks
  #clock: KeyEngineClock

  #pressedAt: number | null = null
  #characterTimer: number | null = null
  #wordTimer: number | null = null

  constructor(
    options: KeyEngineOptions = {},
    callbacks: KeyEngineCallbacks = {},
    clock: KeyEngineClock = systemClock,
  ) {
    this.#thresholds = resolveThresholds(options)
    this.#callbacks = callbacks
    this.#clock = clock
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

  /** Key down. Repeat events must be filtered by the caller (see `bindKeyboard`). */
  press(): void {
    if (this.#pressedAt !== null) return
    this.#cancelTimers()
    this.#pressedAt = this.#clock.now()
    this.#callbacks.onKeyDown?.()
  }

  /**
   * Key up. Emits the element, then arms the character/word gap timers —
   * unless auto-commit is off, in which case the caller decides when a
   * character ends.
   */
  release(): void {
    if (this.#pressedAt === null) return

    const heldMs = this.#clock.now() - this.#pressedAt
    this.#pressedAt = null
    this.#callbacks.onKeyUp?.(heldMs)

    const element = heldMs < this.#thresholds.dotDashThresholdMs ? '.' : '-'
    this.#callbacks.onElement?.(element, heldMs)

    if (!this.#thresholds.autoCommit) return

    this.#characterTimer = this.#clock.setTimeout(() => {
      this.#characterTimer = null
      this.#callbacks.onCharacterGap?.()
    }, this.#thresholds.characterGapMs)

    this.#wordTimer = this.#clock.setTimeout(() => {
      this.#wordTimer = null
      this.#callbacks.onWordGap?.()
    }, this.#thresholds.wordGapMs)
  }

  /** Drop any pending gap timers without emitting them (§10 Cancel). */
  reset(): void {
    this.#cancelTimers()
    this.#pressedAt = null
  }

  #cancelTimers(): void {
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

/** User-remappable controls (PROJECT.md §10). */
export interface KeyBindings {
  /** Primary key. `' '` is Space. */
  key: string
  alternative?: string
  cancel?: string
  submit?: string
}

export const DEFAULT_KEY_BINDINGS: KeyBindings = {
  key: ' ',
  alternative: 'Enter',
  cancel: 'Escape',
  submit: 'Control',
}

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
 */
export function bindKeyboard(
  engine: KeyEngine,
  bindings: KeyBindings = DEFAULT_KEY_BINDINGS,
  target: Pick<Window, 'addEventListener' | 'removeEventListener'> = window,
  /** Fired by the `submit` binding — the manual "this character is finished". */
  onSubmit?: () => void,
): () => void {
  const isKeyingKey = (key: string) => key === bindings.key || key === bindings.alternative

  const onKeyDown = (event: Event) => {
    const e = event as KeyboardEvent
    if (e.repeat) return
    if (isInteractive(e.target)) return

    if (isKeyingKey(e.key)) {
      e.preventDefault()
      engine.press()
      return
    }
    if (bindings.cancel && e.key === bindings.cancel) {
      e.preventDefault()
      engine.reset()
      return
    }
    if (onSubmit && bindings.submit && e.key === bindings.submit) {
      e.preventDefault()
      onSubmit()
    }
  }

  const onKeyUp = (event: Event) => {
    const e = event as KeyboardEvent
    if (!isKeyingKey(e.key)) return
    // Released over a button rather than the page: the press was never taken,
    // so there is nothing to release — but the engine is reset rather than
    // ignored, in case focus moved onto the button mid-hold.
    if (isInteractive(e.target)) {
      engine.reset()
      return
    }
    e.preventDefault()
    engine.release()
  }

  // Releasing the key after the tab loses focus never fires keyup, which would
  // leave the tone hanging and the timers unarmed.
  const onBlur = () => engine.reset()

  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)

  return () => {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('keyup', onKeyUp)
    target.removeEventListener('blur', onBlur)
  }
}
