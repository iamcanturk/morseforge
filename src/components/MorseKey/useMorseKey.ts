import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AudioEngine } from '../../engine/audioEngine'
import {
  DEFAULT_KEY_BINDINGS,
  bindKeyboard,
  contactFor,
  swapPaddles as swapPaddleKeys,
  type KeyBindings,
  type KeyEngineCallbacks,
  type Keyer,
  type KeyContact,
  type KeyerKind,
  type Paddle,
} from '../../engine/keyEngine'
import { createKeyer } from '../../engine/keyer'
import { LiveDecoder } from '../../engine/morseDecoder'

/**
 * Wires the key engine, the audio engine and the live decoder into one hook.
 *
 * Every screen that lets the user *send* uses this: the telegraph screen, the
 * sending drills, the onboarding first-signal moment. Keeping it in one place
 * means the feel of the key — how long a dash is, when a character commits,
 * when the tone starts — is identical everywhere.
 *
 * Which key is attached is a setting (`keyer`), and the hook only uses it to
 * pick one from `createKeyer`: the straight key and the iambic paddle keyer
 * are driven through the same `Keyer` interface, and the decoder, the gap
 * countdown and the sidetone do not care which one sent the element.
 */

export interface KeyedElement {
  element: '.' | '-'
  heldMs: number
  /** Monotonic id, so the visualiser can key a list without index churn. */
  id: number
}

export interface UseMorseKeyOptions {
  wpm?: number
  dotDashThresholdMs?: number
  /** Pause that ends a character. Independent of `wpm` — see the settings note. */
  characterGapMs?: number
  wordGapMs?: number
  /** When false, nothing commits on its own; call `commitCharacter` instead. */
  autoCommit?: boolean
  bindings?: KeyBindings
  /** Which key is attached: Settings → Key type. Default straight. */
  keyer?: KeyerKind
  /** Exchange the dit and dah paddles (keys and on-screen), for left-handed operators. */
  swapPaddles?: boolean
  /** Sidetone frequency in Hz. */
  frequency?: number
  /** 0..1. Zero means silent, and no AudioContext is ever created. */
  volume?: number
  /** Stop listening to the keyboard, e.g. while a dialog is open. */
  disabled?: boolean
  /**
   * Whether the keying key works from anywhere on the page (a `window`
   * listener). False leaves the page's own Space alone, e.g. while the
   * instrument is scrolled out of view; the on-screen key still answers
   * pointers, and Space while it has focus. Default true.
   */
  windowKeys?: boolean
  onElement?: (element: '.' | '-', heldMs: number) => void
  /**
   * Commit the character the moment this returns true for the elements keyed
   * so far, instead of waiting for the character gap.
   *
   * For screens that know the target, e.g. the lesson's send step: once the
   * pending code spells it, the pause is only latency. Optional and off by
   * default, so every other caller keeps the gap as its only commit rule.
   */
  commitWhen?: (pending: string) => boolean
  /** A character resolved. Never fires with an empty buffer. */
  onCharacter?: (character: string) => void
  onWord?: () => void
}

export interface MorseKeyState {
  /**
   * The key is in use: a straight key held, or a paddle keyer sending an
   * element or the space after it. Nothing counts down while it is true.
   */
  isDown: boolean
  /** The tone is sounding right now: what the TX lamp shows. */
  toneOn: boolean
  /** Which paddles are held (always both false on a straight key). */
  paddles: Readonly<Record<Paddle, boolean>>
  /** Elements keyed so far for the character in progress, e.g. "..-". */
  pending: string
  /** What `pending` would decode to right now, or null. */
  preview: string | null
  /** Everything decoded so far. */
  text: string
  /** Recent elements, newest last, for the signal visualiser. */
  recent: KeyedElement[]
  /**
   * How close the pending character is to committing, 0..1.
   *
   * Drives the countdown ring. Without it, auto-commit is invisible: the
   * character simply vanishes and the user has no way to learn how long a
   * pause they are allowed. Always 0 when auto-commit is off.
   */
  commitProgress: number
}

/**
 * Whether the pending elements should commit now rather than at the gap.
 * Pure, so the rule is tested without a DOM. Nothing pending never commits.
 */
export function shouldCommitEarly(
  pending: string,
  commitWhen?: (pending: string) => boolean,
): boolean {
  return pending !== '' && commitWhen !== undefined && commitWhen(pending)
}

/** How many elements the visualiser keeps. Older ones are off screen anyway. */
const RECENT_LIMIT = 40

const EMPTY_STATE: MorseKeyState = {
  isDown: false,
  toneOn: false,
  paddles: { dit: false, dah: false },
  pending: '',
  preview: null,
  text: '',
  recent: [],
  commitProgress: 0,
}

/** Handlers for one on-screen paddle, spread onto its button. */
export interface PaddleHandlers {
  onPointerDown: (event: React.PointerEvent) => void
  onPointerUp: (event?: { timeStamp: number }) => void
  onPointerLeave: (event?: { timeStamp: number }) => void
  onPointerCancel: (event?: { timeStamp: number }) => void
  onKeyDown: (event: React.KeyboardEvent) => void
  onKeyUp: (event: React.KeyboardEvent) => void
  onBlur: () => void
}

/** Everything an on-screen paddle pair needs, or null on a straight key. */
export interface PaddleControls {
  kind: Exclude<KeyerKind, 'straight'>
  /** Left to right as drawn: dit first, or dah first when swapped. */
  order: readonly [Paddle, Paddle]
  held: Readonly<Record<Paddle, boolean>>
  /** The key bound to each paddle, swap applied. */
  keys: Readonly<Record<Paddle, string>>
  handlers: Readonly<Record<Paddle, PaddleHandlers>>
}

export function useMorseKey(options: UseMorseKeyOptions = {}) {
  const {
    wpm = 15,
    dotDashThresholdMs,
    characterGapMs,
    wordGapMs,
    autoCommit = true,
    bindings: boundKeys,
    keyer = 'straight',
    swapPaddles = false,
    frequency = 600,
    volume = 0.15,
    disabled = false,
    windowKeys = true,
  } = options

  const [state, setState] = useState<MorseKeyState>(EMPTY_STATE)
  /** The kind attached, as state: the window binding is re-made when it changes. */
  const [kind, setKind] = useState<KeyerKind>(keyer)

  // The paddles swap by swapping their keys, so the window binding, the
  // on-screen paddles and their labels all agree on which is which.
  const bindings = useMemo(
    () => (swapPaddles && boundKeys ? swapPaddleKeys(boundKeys) : boundKeys),
    [boundKeys, swapPaddles],
  )

  const decoder = useRef(new LiveDecoder())
  const audio = useRef<AudioEngine | null>(null)
  const engine = useRef<Keyer | null>(null)
  const elementId = useRef(0)
  const frame = useRef<number | null>(null)
  const releasedAt = useRef<number | null>(null)

  // Callbacks go through a ref so the KeyEngine can be created once. Rebuilding
  // it on every render would drop the in-flight gap timers, and a character
  // would never commit while the parent re-rendered on each element.
  const callbacks = useRef(options)
  callbacks.current = options

  /** Set to `commitCharacter` below; the engine's callbacks are built first. */
  const commitEarly = useRef<(() => void) | null>(null)

  const stopCountdown = useCallback(() => {
    if (frame.current !== null) cancelAnimationFrame(frame.current)
    frame.current = null
    releasedAt.current = null
  }, [])

  /**
   * Animate the countdown ring from the moment the tone stopped, `silentMs`
   * ago: a paddle keyer goes idle one element space after its last tone.
   */
  const startCountdown = useCallback(
    (silentMs = 0) => {
      stopCountdown()
      const gap = callbacks.current.characterGapMs
      if (!callbacks.current.autoCommit || !gap) return

      releasedAt.current = performance.now() - silentMs
      const tick = () => {
        if (releasedAt.current === null) return
        const progress = Math.min((performance.now() - releasedAt.current) / gap, 1)
        setState((previous) => ({ ...previous, commitProgress: progress }))
        if (progress < 1) frame.current = requestAnimationFrame(tick)
      }
      frame.current = requestAnimationFrame(tick)
    },
    [stopCountdown],
  )

  const sync = useCallback((patch: Partial<MorseKeyState> = {}) => {
    setState((previous) => ({
      ...previous,
      pending: decoder.current.pending,
      preview: decoder.current.preview,
      text: decoder.current.text,
      ...patch,
    }))
  }, [])

  // Built once, for every keyer this hook ever attaches: they all read the
  // latest options through `callbacks`, so swapping the key type in Settings
  // swaps the keyer and nothing else.
  const keyerCallbacks = useRef<KeyEngineCallbacks | null>(null)
  keyerCallbacks.current ??= {
    onKeyDown: (toneMs) => {
      stopCountdown()
      // The AudioContext is created here rather than on mount: browsers
      // only allow it to start from inside a user gesture, and keydown is
      // the first gesture on a keyboard-driven screen. A paddle keyer
      // says how long its element is, so that tone is scheduled to the
      // sample on the audio clock (Signal → Lamp sets volume 0, and then
      // nothing sounds and no context is made).
      if (callbacks.current.volume !== 0) {
        audio.current ??= new AudioEngine({
          frequency: callbacks.current.frequency ?? 600,
          volume: callbacks.current.volume ?? 0.15,
        })
        void (toneMs === undefined ? audio.current.keyDown() : audio.current.keyFor(toneMs))
      }
      sync({ isDown: true, toneOn: true, commitProgress: 0 })
    },
    onKeyUp: () => {
      // Ends a held tone only: one scheduled by `keyFor` stops itself, on the
      // sample, and cutting it from this timer would make it a little short.
      audio.current?.keyUp()
      sync({ toneOn: false })
    },
    onIdle: (silentMs) => {
      sync({ isDown: false })
      startCountdown(silentMs)
    },
    onPaddle: (paddle, down) => {
      setState((previous) => ({ ...previous, paddles: { ...previous.paddles, [paddle]: down } }))
    },
    // A hold the browser never ended: the window lost focus, or the
    // binding went away, mid-hold. Nothing was keyed, but the tone and
    // the pressed look must stop rather than wait for the next press.
    onCancel: () => {
      audio.current?.keyUp()
      audio.current?.stopKeyed()
      sync({ isDown: false, toneOn: false })
    },
    onElement: (element, heldMs) => {
      decoder.current.pushElement(element)
      elementId.current += 1
      const keyed: KeyedElement = { element, heldMs, id: elementId.current }
      setState((previous) => ({
        ...previous,
        pending: decoder.current.pending,
        preview: decoder.current.preview,
        recent: [...previous.recent, keyed].slice(-RECENT_LIMIT),
      }))
      callbacks.current.onElement?.(element, heldMs)

      if (shouldCommitEarly(decoder.current.pending, callbacks.current.commitWhen)) {
        // Deferred to a microtask: the engine emits the element *before*
        // it arms the gap timers, so committing synchronously here would
        // leave a word-gap timer armed behind an empty buffer. By the
        // microtask the release has finished and `commitEarly` can cancel
        // both timers. The pending check skips it if anything moved on.
        const expected = decoder.current.pending
        queueMicrotask(() => {
          if (decoder.current.pending === expected) commitEarly.current?.()
        })
      }
    },
    onCharacterGap: () => {
      stopCountdown()
      const character = decoder.current.commitCharacter()
      sync({ commitProgress: 0 })
      if (character) callbacks.current.onCharacter?.(character)
    },
    onWordGap: () => {
      decoder.current.commitWord()
      sync({ commitProgress: 0 })
      callbacks.current.onWord?.()
    },
  }

  const thresholds = useRef({ wpm, dotDashThresholdMs, characterGapMs, wordGapMs, autoCommit })
  thresholds.current = { wpm, dotDashThresholdMs, characterGapMs, wordGapMs, autoCommit }
  if (engine.current === null) {
    engine.current = createKeyer(keyer, thresholds.current, keyerCallbacks.current)
  }

  // Settings changed the key type: drop whatever the old key had in flight
  // (its `onCancel` stops the tone) and attach the new one. The character
  // being keyed stays pending, to finish with the new key or by hand.
  useEffect(() => {
    if (engine.current?.kind === keyer) return
    engine.current?.reset()
    engine.current = createKeyer(keyer, thresholds.current, keyerCallbacks.current ?? {})
    setKind(keyer)
  }, [keyer])

  // Thresholds are reconfigured in place rather than by rebuilding the engine,
  // so changing settings mid-session does not swallow the character being keyed.
  useEffect(() => {
    engine.current?.configure({
      wpm,
      dotDashThresholdMs,
      characterGapMs,
      wordGapMs,
      autoCommit,
    })
  }, [wpm, dotDashThresholdMs, characterGapMs, wordGapMs, autoCommit])

  useEffect(() => {
    audio.current?.update({ frequency, volume })
  }, [frequency, volume])

  /** End the character in progress now. Safe to call with nothing pending. */
  const commitCharacter = useCallback(() => {
    stopCountdown()
    const character = decoder.current.commitCharacter()
    engine.current?.reset()
    sync({ commitProgress: 0 })
    if (character) callbacks.current.onCharacter?.(character)
    return character
  }, [stopCountdown, sync])

  commitEarly.current = commitCharacter

  const commitWord = useCallback(() => {
    stopCountdown()
    decoder.current.commitWord()
    engine.current?.reset()
    sync({ commitProgress: 0 })
    callbacks.current.onWord?.()
  }, [stopCountdown, sync])

  /** Abandon the character in progress, keeping what is already decoded. */
  const cancelPending = useCallback(() => {
    stopCountdown()
    engine.current?.reset()
    decoder.current.clearPending()
    audio.current?.keyUp()
    sync({ isDown: false, commitProgress: 0 })
  }, [stopCountdown, sync])

  useEffect(() => {
    const keyEngine = engine.current
    if (disabled || !windowKeys || !keyEngine) return
    // Esc (the cancel binding) abandons the pending character, exactly as the
    // station's "Undo character" button does.
    const unbind = bindKeyboard(keyEngine, bindings, window, commitCharacter, cancelPending)
    return () => {
      unbind()
      // Unbound mid-hold, the keyup will never arrive here. Only a hold is
      // dropped: a settings change between characters keeps its gap timers.
      if (keyEngine.isPressed) keyEngine.reset()
    }
  }, [disabled, windowKeys, bindings, kind, commitCharacter, cancelPending])

  useEffect(() => {
    return () => {
      stopCountdown()
      engine.current?.reset()
      void audio.current?.dispose()
      audio.current = null
    }
  }, [stopCountdown])

  /** `timeStamp`: the input event's, so the hold is timed from the input (see KeyEngine). */
  const press = useCallback(
    (timeStamp?: number, contact?: KeyContact) => {
      if (disabled) return
      engine.current?.press(timeStamp, contact)
    },
    [disabled],
  )

  const release = useCallback((timeStamp?: number, contact?: KeyContact) => {
    engine.current?.release(timeStamp, contact)
  }, [])

  /** For handlers React calls with the event: release at the event's own time. */
  const releaseAtEvent = (event?: { timeStamp: number }) => release(event?.timeStamp)

  /** Wipe everything and start over. */
  const reset = useCallback(() => {
    stopCountdown()
    engine.current?.reset()
    decoder.current.reset()
    audio.current?.keyUp()
    elementId.current = 0
    setState(EMPTY_STATE)
  }, [stopCountdown])

  /**
   * Pointer handlers for the on-screen key (§10 mouse, and touch on mobile).
   *
   * `onPointerLeave` releases as well: dragging off the button never fires
   * pointerup on it, which would leave the tone sounding indefinitely.
   *
   * The keyboard handlers are here rather than left to the window binding
   * because the window binding deliberately ignores events aimed at a button —
   * otherwise it would break every other button on the page. So the key has to
   * answer for itself when it is the thing with focus, which is also the only
   * way it keeps working if the user rebinds the keying key in settings: the
   * button says "press and hold", and it has to mean it.
   */
  const pointerHandlers = {
    onPointerDown: (event: React.PointerEvent) => {
      event.preventDefault()
      press(event.timeStamp)
    },
    onPointerUp: releaseAtEvent,
    onPointerLeave: releaseAtEvent,
    onPointerCancel: releaseAtEvent,
    onKeyDown: (event: React.KeyboardEvent) => {
      // The window binding leaves events aimed at a button alone, so with the
      // key focused, Esc has to be answered here or it would cancel nothing.
      if (event.key === (bindings?.cancel ?? DEFAULT_KEY_BINDINGS.cancel)) {
        if (event.repeat) return
        event.preventDefault()
        cancelPending()
        return
      }
      if (event.key !== ' ' && event.key !== 'Enter') return
      // Auto-repeat would otherwise read as a burst of dots, exactly as it
      // would through the window binding.
      if (event.repeat) return
      event.preventDefault()
      press(event.timeStamp)
    },
    onKeyUp: (event: React.KeyboardEvent) => {
      if (event.key !== ' ' && event.key !== 'Enter') return
      event.preventDefault()
      release(event.timeStamp)
    },
    // Losing focus mid-hold never fires keyup, which would leave the tone
    // sounding and the timers unarmed.
    onBlur: () => release(),
  }

  const cancelKey = bindings?.cancel ?? DEFAULT_KEY_BINDINGS.cancel
  const paddleKeys = { ...DEFAULT_KEY_BINDINGS, ...bindings }

  /**
   * One on-screen paddle. Pointers press it; with the paddle focused, Space
   * and Enter press it too (the window binding leaves a focused button
   * alone), and so do the paddle keys, so `[` and `]` keep working after a
   * tap has focused a paddle.
   */
  const paddleHandlers = (paddle: Paddle): PaddleHandlers => {
    // No `code` is passed: a paddle on Left or Right Ctrl is answered by the
    // window binding even here, so a Ctrl shortcut is never taken by a button.
    const contactOf = (event: React.KeyboardEvent, down: boolean): Paddle | null => {
      if (event.key === ' ' || event.key === 'Enter') return paddle
      const modifiers = down
        ? { ctrlKey: event.ctrlKey, metaKey: event.metaKey, altKey: event.altKey }
        : {}
      const contact = contactFor(event.key, paddleKeys, kind, modifiers)
      return contact === 'dit' || contact === 'dah' ? contact : null
    }
    // At the event's own time: a late keyer judges the release by it.
    const up = (event?: { timeStamp: number }) => release(event?.timeStamp, paddle)
    return {
      onPointerDown: (event) => {
        event.preventDefault()
        press(event.timeStamp, paddle)
      },
      onPointerUp: up,
      onPointerLeave: up,
      onPointerCancel: up,
      onKeyDown: (event) => {
        if (event.key === cancelKey) {
          if (event.repeat) return
          event.preventDefault()
          event.stopPropagation()
          cancelPending()
          return
        }
        const contact = contactOf(event, true)
        if (!contact) return
        event.preventDefault()
        event.stopPropagation()
        if (!event.repeat) press(event.timeStamp, contact)
      },
      onKeyUp: (event) => {
        const contact = contactOf(event, false)
        if (!contact) return
        event.preventDefault()
        event.stopPropagation()
        release(event.timeStamp, contact)
      },
      // Focus leaving mid-hold never delivers the keyup here. Both, because
      // either key may have been pressed through this paddle.
      onBlur: () => {
        release(undefined, 'dit')
        release(undefined, 'dah')
      },
    }
  }

  const paddles: PaddleControls | null =
    kind === 'straight'
      ? null
      : {
          kind,
          order: swapPaddles ? ['dah', 'dit'] : ['dit', 'dah'],
          held: state.paddles,
          keys: { dit: paddleKeys.dit ?? '', dah: paddleKeys.dah ?? '' },
          handlers: { dit: paddleHandlers('dit'), dah: paddleHandlers('dah') },
        }

  return {
    state,
    kind,
    press,
    release,
    commitCharacter,
    commitWord,
    cancelPending,
    reset,
    pointerHandlers,
    paddles,
  }
}
