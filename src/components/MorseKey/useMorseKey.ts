import { useCallback, useEffect, useRef, useState } from 'react'
import { AudioEngine } from '../../engine/audioEngine'
import { KeyEngine, bindKeyboard, type KeyBindings } from '../../engine/keyEngine'
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
  bindings?: KeyBindings
  /** Sidetone frequency in Hz. */
  frequency?: number
  /** 0..1. Zero means silent, and no AudioContext is ever created. */
  volume?: number
  /** Stop listening to the keyboard, e.g. while a dialog is open. */
  disabled?: boolean
  onElement?: (element: '.' | '-', heldMs: number) => void
  /** A character resolved. `null` never reaches here — see `commitCharacter`. */
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
}

/** How many elements the visualiser keeps. Older ones are off screen anyway. */
const RECENT_LIMIT = 40

export function useMorseKey(options: UseMorseKeyOptions = {}) {
  const {
    wpm = 15,
    dotDashThresholdMs,
    bindings,
    frequency = 600,
    volume = 0.15,
    disabled = false,
  } = options

  const [state, setState] = useState<MorseKeyState>({
    isDown: false,
    pending: '',
    preview: null,
    text: '',
    recent: [],
  })

  const decoder = useRef(new LiveDecoder())
  const audio = useRef<AudioEngine | null>(null)
  const engine = useRef<KeyEngine | null>(null)
  const elementId = useRef(0)

  // Callbacks go through a ref so the KeyEngine can be created once. Rebuilding
  // it on every render would drop the in-flight gap timers, and a character
  // would never commit while the parent re-rendered on each element.
  const callbacks = useRef(options)
  callbacks.current = options

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
      { wpm, dotDashThresholdMs },
      {
        onKeyDown: () => {
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
          sync({ isDown: true })
        },
        onKeyUp: () => {
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
        },
        onCharacterGap: () => {
          const character = decoder.current.commitCharacter()
          sync()
          if (character) callbacks.current.onCharacter?.(character)
        },
        onWordGap: () => {
          decoder.current.commitWord()
          sync()
          callbacks.current.onWord?.()
        },
      },
    )
  }

  // Thresholds are reconfigured in place rather than by rebuilding the engine,
  // so changing WPM mid-session does not swallow the character being keyed.
  useEffect(() => {
    engine.current?.configure({ wpm, dotDashThresholdMs })
  }, [wpm, dotDashThresholdMs])

  useEffect(() => {
    audio.current?.update({ frequency, volume })
  }, [frequency, volume])

  useEffect(() => {
    if (disabled || !engine.current) return
    return bindKeyboard(engine.current, bindings)
  }, [disabled, bindings])

  useEffect(() => {
    return () => {
      engine.current?.reset()
      void audio.current?.dispose()
      audio.current = null
    }
  }, [])

  const press = useCallback(() => {
    if (disabled) return
    engine.current?.press()
  }, [disabled])

  const release = useCallback(() => {
    engine.current?.release()
  }, [])

  /** Abandon the character in progress, keeping what is already decoded. */
  const cancelPending = useCallback(() => {
    engine.current?.reset()
    decoder.current.clearPending()
    audio.current?.keyUp()
    sync({ isDown: false })
  }, [sync])

  /** Wipe everything and start over. */
  const reset = useCallback(() => {
    engine.current?.reset()
    decoder.current.reset()
    audio.current?.keyUp()
    elementId.current = 0
    setState({ isDown: false, pending: '', preview: null, text: '', recent: [] })
  }, [])

  /**
   * Pointer handlers for the on-screen key (§10 mouse, and touch on mobile).
   *
   * `onPointerLeave` releases as well: dragging off the button never fires
   * pointerup on it, which would leave the tone sounding indefinitely.
   */
  const pointerHandlers = {
    onPointerDown: (event: React.PointerEvent) => {
      event.preventDefault()
      press()
    },
    onPointerUp: release,
    onPointerLeave: release,
    onPointerCancel: release,
  }

  return { state, press, release, cancelPending, reset, pointerHandlers }
}
