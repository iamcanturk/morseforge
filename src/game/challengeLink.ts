/**
 * Shareable challenge parameters (PROJECT.md §36).
 *
 * A challenge you can hand someone as a link, with no backend: everything that
 * defines the run lives in the URL, so the recipient's browser reconstructs it
 * exactly. Nothing is stored, nothing is looked up, and a link works forever.
 *
 * Every value is validated on the way in. A URL is the most editable input a
 * web app has — anyone can type `?wpm=99999` — so parsing clamps rather than
 * trusts, and an unparseable link falls back to the standard challenge instead
 * of erroring at someone who was handed it.
 */

import { LIMITS } from '../storage/settings'

export interface ChallengeLink {
  /** Seconds. */
  time: number
  wpm: number
  /** How many prompts. Null means "as many as fit in the time". */
  count: number | null
  /** The sender's score, when they shared one to beat. */
  beat: number | null
}

export const DEFAULT_CHALLENGE: ChallengeLink = {
  time: 60,
  wpm: 15,
  count: null,
  beat: null,
}

/** Bounds that keep a shared link playable rather than a prank. */
export const BOUNDS = {
  time: { min: 15, max: 300 },
  wpm: { min: LIMITS.wpm.min, max: LIMITS.wpm.max },
  count: { min: 5, max: 200 },
  beat: { min: 0, max: 100_000 },
} as const

function clampInt(
  raw: string | null,
  bounds: { min: number; max: number },
  fallback: number | null,
): number | null {
  if (raw === null || raw.trim() === '') return fallback
  const value = Number(raw)
  if (!Number.isFinite(value)) return fallback
  return Math.min(bounds.max, Math.max(bounds.min, Math.round(value)))
}

/**
 * Read a challenge out of a query string.
 *
 * Total: any input produces a playable challenge. Someone forwarding a link
 * that picked up a tracking parameter, or truncated in a chat app, should get
 * the standard challenge rather than an error page.
 */
export function parseChallenge(search: string): ChallengeLink {
  const params = new URLSearchParams(search)

  return {
    time:
      clampInt(params.get('time'), BOUNDS.time, DEFAULT_CHALLENGE.time) ?? DEFAULT_CHALLENGE.time,
    wpm: clampInt(params.get('wpm'), BOUNDS.wpm, DEFAULT_CHALLENGE.wpm) ?? DEFAULT_CHALLENGE.wpm,
    count: clampInt(params.get('count'), BOUNDS.count, DEFAULT_CHALLENGE.count),
    beat: clampInt(params.get('beat'), BOUNDS.beat, DEFAULT_CHALLENGE.beat),
  }
}

/**
 * Build the query string for a challenge.
 *
 * Only what differs from the default is written, so an ordinary share is a
 * short link rather than a wall of parameters that all say "the usual".
 */
export function challengeQuery(challenge: ChallengeLink): string {
  const params = new URLSearchParams()
  if (challenge.time !== DEFAULT_CHALLENGE.time) params.set('time', String(challenge.time))
  if (challenge.wpm !== DEFAULT_CHALLENGE.wpm) params.set('wpm', String(challenge.wpm))
  if (challenge.count !== null) params.set('count', String(challenge.count))
  if (challenge.beat !== null) params.set('beat', String(challenge.beat))

  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

/** Whether a link asks for anything other than the standard challenge. */
export function isCustom(challenge: ChallengeLink): boolean {
  return challengeQuery({ ...challenge, beat: null }) !== ''
}

/** A short human description, for the screen that is about to run it. */
export function describeChallenge(challenge: ChallengeLink): string {
  const parts = [`${challenge.time} seconds`, `${challenge.wpm} WPM`]
  if (challenge.count !== null) parts.push(`${challenge.count} characters`)
  return parts.join(' · ')
}
