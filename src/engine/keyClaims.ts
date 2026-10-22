/**
 * Which held keys belong to an instrument, so the browser never acts on them.
 *
 * A held key is many events: one keydown, a keydown repeat at the OS rate for
 * as long as it is down, and a keyup. Every handler that keys ignores the
 * repeats, rightly, since they would read as a burst of dots. But ignoring them
 * also meant not cancelling them, and the default action of a Space repeat is
 * to scroll the page: a dash held on /telegraph/ with focus on the page ran the
 * whole page to its foot, while the first keydown, which was cancelled, never
 * moved it at all (TASK-040).
 *
 * So a press is *claimed* when an instrument uses its first keydown, and from
 * then until the key is released, every repeat and the keyup are cancelled
 * too. A press nobody claimed is left alone from start to finish: Space with
 * the instrument out of view still scrolls, and Space on a focused button,
 * link or field still does what it does there (DEC-045).
 *
 * The rule is enforced in one place, a capture listener on `window`, rather
 * than by each handler: the instruments' own handlers sit on a button, on the
 * landing station's face, on `window`, and some stop propagation, but a
 * window capture listener sees every key event before any of them.
 */

/** The parts of a key event the claim rule reads. */
export interface ClaimableKeyEvent {
  key: string
  /** The physical key. Preferred over `key`, which Shift or a layout can change mid-hold. */
  code?: string
  repeat?: boolean
}

/** What `claimPress` needs: the event it is claiming, cancellable. */
export interface ClaimingKeyEvent extends ClaimableKeyEvent {
  preventDefault: () => void
}

/** One name per physical key: the code when the event has one, else the key. */
const pressOf = (event: ClaimableKeyEvent): string =>
  event.code ? `code:${event.code}` : `key:${event.key}`

/**
 * The held keys an instrument has claimed. Pure: it never touches an event,
 * it only says whether one should be cancelled.
 */
export class KeyClaims {
  #held = new Set<string>()

  /** An instrument keyed from this keydown: the press is its own until released. */
  claim(event: ClaimableKeyEvent): void {
    this.#held.add(pressOf(event))
  }

  /** Whether this key is held under a claim right now. */
  isClaimed(event: ClaimableKeyEvent): boolean {
    return this.#held.has(pressOf(event))
  }

  /**
   * A keydown arrived: true when it is a repeat of a claimed press and must
   * be cancelled.
   *
   * A first keydown (not a repeat) of a key still marked as claimed means its
   * keyup was lost, e.g. it was released over another window. That claim is
   * stale, so it is dropped and this press starts unclaimed: it is up to the
   * instrument to claim it again, or to leave it to the page.
   */
  keyDown(event: ClaimableKeyEvent): boolean {
    if (!event.repeat) {
      this.#held.delete(pressOf(event))
      return false
    }
    return this.isClaimed(event)
  }

  /** A keyup arrived: true when it ends a claimed press. The claim ends with it. */
  keyUp(event: ClaimableKeyEvent): boolean {
    return this.#held.delete(pressOf(event))
  }

  /** Forget every claim: the window lost focus, and no keyup will follow. */
  clear(): void {
    this.#held.clear()
  }
}

type ListenerTarget = Pick<Window, 'addEventListener' | 'removeEventListener'>

/**
 * Cancel the repeats and the keyup of every claimed press that reaches
 * `target`, in the capture phase so a handler that stops propagation cannot
 * hide one. Returns a function that removes the listeners.
 */
export function guardClaimedKeys(target: ListenerTarget, claims: KeyClaims): () => void {
  const onKeyDown = (event: Event) => {
    if (claims.keyDown(event as KeyboardEvent)) event.preventDefault()
  }
  const onKeyUp = (event: Event) => {
    if (claims.keyUp(event as KeyboardEvent)) event.preventDefault()
  }
  const onBlur = () => claims.clear()
  target.addEventListener('keydown', onKeyDown, { capture: true })
  target.addEventListener('keyup', onKeyUp, { capture: true })
  target.addEventListener('blur', onBlur)
  return () => {
    target.removeEventListener('keydown', onKeyDown, { capture: true })
    target.removeEventListener('keyup', onKeyUp, { capture: true })
    target.removeEventListener('blur', onBlur)
  }
}

/** The page's claims. One per page, because every instrument shares one keyboard. */
export const keyClaims = new KeyClaims()

let guarded = false

/**
 * An instrument is keying from this keydown: cancel it, and claim the press so
 * its repeats and its keyup are cancelled as well.
 *
 * The window guard is installed on the first claim rather than on import, so
 * a page that never keys never listens, and the module stays safe to import
 * where there is no `window` (prerender, tests).
 */
export function claimPress(event: ClaimingKeyEvent, claims: KeyClaims = keyClaims): void {
  event.preventDefault()
  claims.claim(event)
  if (claims === keyClaims && !guarded && typeof window !== 'undefined') {
    guarded = true
    guardClaimedKeys(window, keyClaims)
  }
}
