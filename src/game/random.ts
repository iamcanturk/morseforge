/**
 * Seeded randomness.
 *
 * Two things here need the same sequence twice: the daily challenge, which has
 * to be identical for everyone with no backend to hand it out, and any test
 * that wants a reproducible failure. `Math.random` can do neither.
 *
 * mulberry32 is used rather than the usual textbook LCG because a plain
 * `(a * seed + c) % m` has visibly poor low bits — take it modulo a small
 * number, as picking from a 26-letter alphabet does, and the results cycle.
 * A daily challenge that quietly alternated between two shapes would be worse
 * than an obviously random one.
 */

export type Random = () => number

/** A 0..1 generator from a 32-bit seed. */
export function createRandom(seed: number): Random {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * A 32-bit seed from a string (FNV-1a).
 *
 * Used to turn a date into a seed. Neighbouring dates must not produce
 * neighbouring seeds — a hash that mapped 2026-08-22 and 2026-08-23 to adjacent
 * numbers would give two days in a row nearly the same challenge.
 */
export function seedFrom(text: string): number {
  let hash = 0x811c9dc5
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i)
    hash = Math.imul(hash, 0x01000193)
  }
  return hash >>> 0
}

/** Pick one item. Returns undefined only for an empty list. */
export function pick<T>(items: readonly T[], random: Random): T | undefined {
  if (items.length === 0) return undefined
  return items[Math.floor(random() * items.length)]
}

/**
 * A shuffled copy (Fisher-Yates).
 *
 * Copies rather than shuffling in place: the arrays passed in here are things
 * like the alphabet, which everything else on the site reads.
 */
export function shuffle<T>(items: readonly T[], random: Random): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j]!, copy[i]!]
  }
  return copy
}
