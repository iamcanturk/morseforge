/**
 * Shareable challenge parameters (PROJECT.md §36).
 *
 * A challenge you can hand someone as a link, with no backend: everything that
 * defines the run lives in the URL, so the recipient's browser reconstructs it
 * exactly. Nothing is stored, nothing is looked up, and a link works forever.
 *
 * "The same challenge" means the same prompts in the same order, at the same
 * speed, from the same pool. The link therefore carries a `seed`, which drives
 * the prompt sequence through `createRandom(seedFrom(seed))`, and a `pool`,
 * which is a count of letters taken from the front of the teaching order. A
 * fixed pool also means fixed scoring weights, so two scores on one link are
 * comparable. Before the seed existed, each player drew from their own
 * unlocked letters with their own review schedule, and "beat 340" compared two
 * different games.
 *
 * Every value is validated on the way in. A URL is the most editable input a
 * web app has (anyone can type `?wpm=99999`), so parsing clamps rather than
 * trusts, and an unparseable link falls back to the standard challenge instead
 * of erroring at someone who was handed it. Links from before the seed existed
 * still parse: they simply have no seed, and the page says so.
 */

import { LEARNING_ORDER } from '../data/morseAlphabet'
import { WPM_RANGE } from '../storage/settings'
import { SIXTY_SECOND_CHALLENGE } from './session'
import { seedFrom, type Random } from './random'
import type { ShareMessage } from './share'

export type { ShareMessage } from './share'

export interface ChallengeLink {
  /**
   * The prompt sequence. Null for a link made before seeds existed, or for a
   * fresh visit: the run then gets its own seed when it starts.
   */
  seed: string | null
  /** How many letters, from the front of `LEARNING_ORDER`. */
  pool: number
  /** Seconds. */
  time: number
  wpm: number
  /** How many prompts. Null means "as many as fit in the time". */
  count: number | null
  /**
   * The sender's score, when they shared one to beat. A claim, not a record:
   * anyone can edit a URL, so the page labels it as coming from the link.
   */
  beat: number | null
}

/**
 * The first fourteen letters (DEC-006): E T, then I A N M, then the eight
 * three-element letters. Winnable for someone a week into learning, and wide
 * enough that a score means something.
 */
const DEFAULT_POOL = 14

export const DEFAULT_CHALLENGE: ChallengeLink = {
  seed: null,
  pool: DEFAULT_POOL,
  time: (SIXTY_SECOND_CHALLENGE.durationMs ?? 60_000) / 1000,
  wpm: 15,
  count: null,
  beat: null,
}

/** Bounds that keep a shared link playable rather than a prank. */
export const BOUNDS = {
  // Two letters is the smallest pool that is still a test: with one, every
  // prompt is the same character. The picker allows a run of at most two.
  pool: { min: 2, max: LEARNING_ORDER.length },
  time: { min: 15, max: 300 },
  // The range the speed slider offers and the copy quotes, the same one
  // message links accept, so a link cannot ask for a speed nobody can pick.
  wpm: { min: WPM_RANGE.min, max: WPM_RANGE.max },
  count: { min: 5, max: 200 },
  beat: { min: 0, max: 100_000 },
} as const

/** A seed is a short token people can read aloud: letters and digits only. */
const SEED_PATTERN = /^[a-z0-9]{1,16}$/
const SEED_LENGTH = 5
const SEED_ALPHABET = 'abcdefghijkmnpqrstuvwxyz23456789' // no l/1, o/0 to misread

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

/** A seed from a link, lower-cased, or null when it is missing or malformed. */
export function parseSeed(raw: string | null): string | null {
  if (raw === null) return null
  const seed = raw.trim().toLowerCase()
  return SEED_PATTERN.test(seed) ? seed : null
}

/** A fresh seed for a run that does not have one. */
export function newSeed(random: Random = Math.random): string {
  let seed = ''
  for (let i = 0; i < SEED_LENGTH; i++) {
    seed += SEED_ALPHABET[Math.floor(random() * SEED_ALPHABET.length)] ?? 'a'
  }
  return seed
}

/** The numeric seed the prompt picker runs on. */
export function seedNumber(seed: string): number {
  return seedFrom(seed)
}

/**
 * Read a challenge out of a query string.
 *
 * Total: any input produces a playable challenge. Someone forwarding a link
 * that picked up a tracking parameter, or got truncated in a chat app, should
 * get the standard challenge rather than an error page.
 */
export function parseChallenge(search: string): ChallengeLink {
  let params: URLSearchParams
  try {
    params = new URLSearchParams(search)
  } catch {
    return { ...DEFAULT_CHALLENGE }
  }

  const int = (key: keyof typeof BOUNDS, fallback: number) =>
    clampInt(params.get(key), BOUNDS[key], fallback) ?? fallback

  return {
    seed: parseSeed(params.get('seed')),
    pool: int('pool', DEFAULT_CHALLENGE.pool),
    time: int('time', DEFAULT_CHALLENGE.time),
    wpm: int('wpm', DEFAULT_CHALLENGE.wpm),
    count: clampInt(params.get('count'), BOUNDS.count, DEFAULT_CHALLENGE.count),
    beat: clampInt(params.get('beat'), BOUNDS.beat, DEFAULT_CHALLENGE.beat),
  }
}

/**
 * Build the query string for a challenge.
 *
 * A seeded link writes every setting explicitly, in a fixed order. Leaving
 * out the ones that equal today's default would make an old link change
 * meaning the day a default changes, which is exactly what a link that is
 * meant to work forever must not do. An unseeded challenge with nothing to say
 * stays a bare `/challenge/`.
 */
export function challengeQuery(challenge: ChallengeLink): string {
  const params = new URLSearchParams()
  const explicit = challenge.seed !== null

  if (challenge.seed !== null) params.set('seed', challenge.seed)
  if (explicit || challenge.pool !== DEFAULT_CHALLENGE.pool)
    params.set('pool', String(challenge.pool))
  if (explicit || challenge.time !== DEFAULT_CHALLENGE.time)
    params.set('time', String(challenge.time))
  if (explicit || challenge.wpm !== DEFAULT_CHALLENGE.wpm) params.set('wpm', String(challenge.wpm))
  if (challenge.count !== null) params.set('count', String(challenge.count))
  if (challenge.beat !== null) params.set('beat', String(challenge.beat))

  const query = params.toString()
  return query === '' ? '' : `?${query}`
}

/** The full URL of a challenge on a site. */
export function challengeUrl(challenge: ChallengeLink, siteUrl: string): string {
  return `${siteUrl.replace(/\/$/, '')}/challenge/${challengeQuery(challenge)}`
}

/** Whether a link asks for anything other than the standard challenge. */
export function isCustom(challenge: ChallengeLink): boolean {
  return challengeQuery({ ...challenge, seed: null, beat: null }) !== ''
}

/** Whether someone sent this: it fixes a sequence or carries a score. */
export function isIncoming(challenge: ChallengeLink): boolean {
  return challenge.seed !== null || challenge.beat !== null
}

/** The letters a challenge draws from, in teaching order. */
export function challengePool(challenge: ChallengeLink): readonly string[] {
  const size = Math.min(BOUNDS.pool.max, Math.max(BOUNDS.pool.min, Math.round(challenge.pool)))
  return LEARNING_ORDER.slice(0, Number.isFinite(size) ? size : DEFAULT_CHALLENGE.pool)
}

/** A short human description, for the screen that is about to run it. */
export function describeChallenge(challenge: ChallengeLink): string {
  const parts = [
    `${challenge.time} seconds`,
    `${challenge.wpm} WPM`,
    `${challengePool(challenge).length} letters`,
  ]
  if (challenge.count !== null) parts.push(`${challenge.count} characters`)
  return parts.join(' · ')
}

/** What the recipient's score is compared against, and how far to trust it. */
export interface Versus {
  you: number
  them: number
  /**
   * False for a link without a seed: the sender's prompts were not the
   * recipient's, so the two numbers are from different runs.
   */
  sameSequence: boolean
}

export function versus(challenge: ChallengeLink, score: number): Versus | null {
  if (challenge.beat === null) return null
  return { you: score, them: challenge.beat, sameSequence: challenge.seed !== null }
}

export interface ShareInput {
  /** The challenge as it was played, seed included. */
  challenge: ChallengeLink
  score: number
  correct: number
  total: number
  accuracy: number
  siteUrl: string
  siteName: string
}

/**
 * What "Challenge a friend" sends.
 *
 * The link is the `url`, not part of the text: a share sheet gets it once,
 * and the clipboard appends it (`clipboardText`, DEC-035).
 */
export function challengeShare(input: ShareInput): ShareMessage {
  const url = challengeUrl({ ...input.challenge, beat: input.score }, input.siteUrl)
  const percent = Math.round(input.accuracy * 100)
  const text =
    `I scored ${input.score} on the ${input.siteName} ${input.challenge.time}-second Morse code test ` +
    `(${input.correct} of ${input.total} right, ${percent}%). ` +
    `Same characters, same order, same speed. Can you beat it?`
  return { title: `${input.siteName}: beat ${input.score}`, text, url }
}

/**
 * The invitation from a practice result, which has no comparable score: a
 * fresh seeded challenge, with no number to beat.
 */
export function practiceInvite(input: {
  seed: string
  accuracy: number
  total: number
  siteUrl: string
  siteName: string
}): ShareMessage {
  const url = challengeUrl({ ...DEFAULT_CHALLENGE, seed: input.seed }, input.siteUrl)
  const percent = Math.round(input.accuracy * 100)
  const text =
    `I just practised Morse code on ${input.siteName}: ${percent}% over ${input.total} ` +
    `characters. Try the ${DEFAULT_CHALLENGE.time}-second test and send me your score.`
  return { title: `${input.siteName}: ${DEFAULT_CHALLENGE.time}-second Morse code test`, text, url }
}
