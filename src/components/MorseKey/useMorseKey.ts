import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from '../../engine/audioEngine'
import {
  DEFAULT_KEY_BINDINGS,
  KeyEngine,
  bindKeyboard,
  type KeyBindings,
} from '../../engine/keyEngine'
import { LiveDecoder } from '../../engine/morseDecoder'

/**
 * Wires the key engine, the audio engine and the live decoder into one hook.
 *
 * Every screen that lets the user *send* uses this: the telegraph screen, the
 * sending drills, the onboarding first-signal moment. Keeping it in one place
 * means the feel of the key — how long a dash is, when a character commits,
 * when the tone starts — is identical everywhere.
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
  isDown: boolean
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
  pending: '',
  preview: null,
  text: '',
  recent: [],
  commitProgress: 0,
}

export function useMorseKey(options: UseMorseKeyOptions = {}) {
  const {
    wpm = 15,
    dotDashThresholdMs,
    characterGapMs,
    wordGapMs,
    autoCommit = true,
    bindings,
    frequency = 600,
    volume = 0.15,
    disabled = false,
    windowKeys = true,
  } = options

  const [state, setState] = useState<MorseKeyState>(EMPTY_STATE)

  const decoder = useRef(new LiveDecoder())
  const audio = useRef<AudioEngine | null>(null)
  const engine = useRef<KeyEngine | null>(null)
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

  /** Animate the countdown ring from the release timestamp. */
  const startCountdown = useCallback(() => {
    stopCountdown()
    const gap = callbacks.current.characterGapMs
    if (!callbacks.current.autoCommit || !gap) return

    releasedAt.current = performance.now()
    const tick = () => {
      if (releasedAt.current === null) return
      const progress = Math.min((performance.now() - releasedAt.current) / gap, 1)
      setState((previous) => ({ ...previous, commitProgress: progress }))
      if (progress < 1) frame.current = requestAnimationFrame(tick)
    }
    frame.current = requestAnimationFrame(tick)
  }, [stopCountdown])

  const sync = useCallback((patch: Partial<MorseKeyState> = {}) => {
    setState((previous) => ({
      ...previous,
      pending: decoder.current.pending,
      preview: decoder.current.preview,
      text: decoder.current.text,
      ...patch,
    }))
  }, [])

  if (engine.current === null) {
    engine.current = new KeyEngine(
      { wpm, dotDashThresholdMs, characterGapMs, wordGapMs, autoCommit },
      {
        onKeyDown: () => {
          stopCountdown()
          // The AudioContext is created here rather than on mount: browsers
          // only allow it to start from inside a user gesture, and keydown is
          // the first gesture on a keyboard-driven screen.
          if (callbacks.current.volume !== 0) {
            audio.current ??= new AudioEngine({
              frequency: callbacks.current.frequency ?? 600,
              volume: callbacks.current.volume ?? 0.15,
            })
            void audio.current.keyDown()
          }
          sync({ isDown: true, commitProgress: 0 })
        },
        onKeyUp: () => {
          audio.current?.keyUp()
          sync({ isDown: false })
          startCountdown()
        },
        // A hold the browser never ended: the window lost focus, or the
        // binding went away, mid-hold. Nothing was keyed, but the tone and
        // the pressed look must stop rather than wait for the next press.
        onCancel: () => {
          audio.current?.keyUp()
          sync({ isDown: false })
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
      },
    )
  }

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
  }, [disabled, windowKeys, bindings, commitCharacter, cancelPending])

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
    (timeStamp?: number) => {
      if (disabled) return
      engine.current?.press(timeStamp)
    },
    [disabled],
  )

  const release = useCallback((timeStamp?: number) => {
    engine.current?.release(timeStamp)
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

  return {
    state,
    press,
    release,
    commitCharacter,
    commitWord,
    cancelPending,
    reset,
    pointerHandlers,
  }
}
