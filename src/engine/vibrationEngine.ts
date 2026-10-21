/**
 * Morse as vibration (PROJECT.md §28).
 *
 * A third output channel alongside sound and light. It matters for three
 * different people: someone who cannot hear the sidetone, someone whose phone
 * is on silent, and someone practising somewhere they cannot make a noise —
 * which for a pocket-sized skill is most places.
 *
 * `navigator.vibrate` takes a flat array of alternating on/off durations in
 * milliseconds, starting with an "on". That maps onto a Morse timeline almost
 * exactly, and the conversion is the only real logic here, so it is pure and
 * tested.
 */

import type { TimedElement } from './timingEngine'

/** Whether this device can vibrate at all. */
export function canVibrate(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function'
}

/**
 * Whether the page may vibrate yet. Chrome refuses `vibrate` until the user
 * has interacted with the page, and logs every refused call as a console
 * error, so nothing calls it before then. A browser without the
 * User Activation API is trusted to decide for itself.
 */
function userHasInteracted(): boolean {
  if (!('userActivation' in navigator)) return true
  return navigator.userActivation.hasBeenActive
}

/**
 * Whether a pattern this module started may still be running. Stopping is
 * only worth a call when something was started: a page that stops on load
 * (every player resets its channels when it mounts) must not call
 * `vibrate(0)` before the user has touched anything.
 */
let started = false

/**
 * Convert a Morse timeline into a vibration pattern.
 *
 * The pattern must alternate on, off, on, off… beginning with on. A timeline
 * can start with silence or run two silences together, so gaps are merged and
 * a leading silence is dropped — feeding those through unmerged shifts every
 * subsequent element into the wrong phase, and the whole message buzzes as its
 * own inverse.
 */
export function toVibrationPattern(timeline: readonly TimedElement[]): number[] {
  const pattern: number[] = []
  let expectingOn = true

  for (const element of timeline) {
    const duration = Math.round(element.duration)
    if (duration <= 0) continue

    if (element.on === expectingOn) {
      pattern.push(duration)
      expectingOn = !expectingOn
      continue
    }

    // Same phase as the previous entry: extend it rather than pushing a new one.
    const last = pattern.length - 1
    const previous = pattern[last]
    if (previous !== undefined) {
      pattern[last] = previous + duration
      continue
    }

    // A timeline opening with silence. There is nothing to extend, and the
    // pattern must begin with an "on", so the leading silence is simply lost.
  }

  // A trailing silence buzzes nothing and only delays the promise resolving.
  if (pattern.length % 2 === 0) pattern.pop()

  return pattern
}

/**
 * Play a timeline as vibration. Returns false when unsupported or refused.
 *
 * Browsers ignore `vibrate` outside a user gesture and on desktop, and iOS
 * Safari does not implement it at all. All three are normal, not errors — the
 * caller has sound and light as well.
 */
export function vibrateTimeline(timeline: readonly TimedElement[]): boolean {
  if (!canVibrate() || !userHasInteracted()) return false
  const pattern = toVibrationPattern(timeline)
  if (pattern.length === 0) return false
  try {
    const accepted = navigator.vibrate(pattern)
    if (accepted) started = true
    return accepted
  } catch {
    return false
  }
}

/** Stop any vibration in progress. */
export function stopVibration(): void {
  if (!started || !canVibrate()) return
  started = false
  try {
    navigator.vibrate(0)
  } catch {
    // Nothing to stop, or the browser refused. Either way there is no
    // meaningful recovery and nothing to tell the user.
  }
}

/** Total duration of a pattern, for timing a UI state alongside it. */
export function patternDuration(pattern: readonly number[]): number {
  return pattern.reduce((sum, value) => sum + value, 0)
}
