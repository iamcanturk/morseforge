/**
 * Anonymous usage counters (PROJECT.md §22).
 *
 * There is no backend and no analytics service. An event is a request to a URL
 * that nginx answers with `204 No Content` and nothing else — no PHP, no
 * database, no third party. The web server's own access log is the store, and
 * a scheduled script tallies it. That is the entire mechanism.
 *
 * What is sent is a name and, sometimes, one short value: `practice_finish`,
 * `daily_finish=pass`. There is no identifier, no session token, no progress,
 * and nothing anyone typed. "Your progress never leaves your device" stays
 * literally true — this counts screens, not people.
 *
 * Three ways it stays off:
 * - the `counters` setting, off in one press
 * - `navigator.doNotTrack`, honoured without asking
 * - no JavaScript at all, since every content page is static HTML
 */

import { createSettingsStore } from '../storage/settings'

/** Where the beacon goes. nginx answers 204; nothing is stored at this path. */
export const ENDPOINT = '/e/'

/**
 * The events worth counting, named up front.
 *
 * A closed list rather than a free string: an open one always ends up with
 * three spellings of the same event and something that should never have been
 * sent. Adding one is a code change, which is the point.
 */
export type EventName =
  | 'practice_start'
  | 'practice_finish'
  | 'copy_start'
  | 'copy_finish'
  | 'daily_start'
  | 'daily_finish'
  | 'challenge_start'
  | 'game_start'
  | 'game_finish'
  | 'lesson_start'
  | 'lesson_finish'
  | 'telegraph_send'
  | 'translator_play'
  | 'alphabet_play'
  | 'method_change'
  | 'install'

/** Values are short, non-identifying labels: a mode, a method, pass or fail. */
const SAFE_VALUE = /^[a-z0-9_-]{1,24}$/

/** Build the URL for an event. Pure, so the shape of it can be tested. */
export function beaconUrl(name: EventName, value?: string): string {
  const params = new URLSearchParams({ n: name })
  if (value !== undefined && SAFE_VALUE.test(value)) params.set('v', value)
  return `${ENDPOINT}?${params.toString()}`
}

interface TrackingFlags {
  doNotTrack?: string | null
  msDoNotTrack?: string | null
}

/**
 * Whether the browser has asked not to be tracked, in any of its spellings.
 *
 * Three of them, because the signal moved between `navigator` and `window`
 * across browsers and never settled. Only `navigator.doNotTrack` is in the
 * type definitions, hence the casts — the other two are real, just obsolete.
 */
export function doNotTrack(
  nav: TrackingFlags = navigator as TrackingFlags,
  win: TrackingFlags = window as unknown as TrackingFlags,
): boolean {
  return nav.doNotTrack === '1' || win.doNotTrack === '1' || nav.msDoNotTrack === '1'
}

function isEnabled(): boolean {
  if (typeof window === 'undefined') return false

  // Honoured whether or not it is fashionable: someone who set it has said what
  // they want, and there is nothing here worth overriding it for.
  if (doNotTrack()) return false

  try {
    return createSettingsStore().read().counters
  } catch {
    // A storage failure means no consent could be read, so nothing is sent.
    return false
  }
}

/**
 * Count one event. Never throws, never blocks, never retries.
 *
 * A counter that could break a practice session, or delay one, would be worth
 * less than the number it produces.
 */
export function track(name: EventName, value?: string): void {
  if (!isEnabled()) return

  const url = beaconUrl(name, value)
  try {
    // `sendBeacon` survives the page being closed, which is exactly when a
    // "finished" event tends to fire.
    if (navigator.sendBeacon?.(url)) return
    void fetch(url, { method: 'GET', keepalive: true, cache: 'no-store' }).catch(() => {})
  } catch {
    // Blocked by an extension, offline, or the endpoint is not there. Fine.
  }
}
