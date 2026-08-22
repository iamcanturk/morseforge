import { describe, expect, it } from 'vitest'
import { createRandom, pick, seedFrom, shuffle } from './random'

describe('createRandom', () => {
  it('repeats exactly for the same seed', () => {
    const a = createRandom(12345)
    const b = createRandom(12345)
    expect(Array.from({ length: 20 }, a)).toEqual(Array.from({ length: 20 }, b))
  })

  it('differs for different seeds', () => {
    const a = Array.from({ length: 20 }, createRandom(1))
    const b = Array.from({ length: 20 }, createRandom(2))
    expect(a).not.toEqual(b)
  })

  it('stays inside 0..1', () => {
    const random = createRandom(99)
    for (let i = 0; i < 500; i++) {
      const value = random()
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThan(1)
    }
  })

  it('does not cycle when taken modulo a small number', () => {
    // The reason this is not a textbook LCG: picking from a 26-letter alphabet
    // is exactly "take it modulo 26", and a generator with poor low bits gives
    // a visibly repeating pattern there.
    const random = createRandom(7)
    const counts = new Array<number>(26).fill(0)
    for (let i = 0; i < 2600; i++) counts[Math.floor(random() * 26)]!++
    // Uniform would be 100 each. Generous bounds — this is checking for a
    // collapsed distribution, not for statistical quality.
    for (const count of counts) {
      expect(count).toBeGreaterThan(50)
      expect(count).toBeLessThan(170)
    }
  })
})

describe('seedFrom', () => {
  it('is stable for the same string', () => {
    expect(seedFrom('2026-08-22')).toBe(seedFrom('2026-08-22'))
  })

  it('sends neighbouring dates far apart', () => {
    // Two days in a row must not produce nearly the same challenge, which is
    // what a hash that merely added the character codes would do.
    const a = seedFrom('2026-08-22')
    const b = seedFrom('2026-08-23')
    expect(Math.abs(a - b)).toBeGreaterThan(1000)
  })

  it('produces a non-negative 32-bit value', () => {
    for (const text of ['', 'a', '2026-01-01', '2026-12-31']) {
      const seed = seedFrom(text)
      expect(seed).toBeGreaterThanOrEqual(0)
      expect(seed).toBeLessThan(2 ** 32)
      expect(Number.isInteger(seed)).toBe(true)
    }
  })
})

describe('pick', () => {
  it('returns an item from the list', () => {
    expect(['a', 'b', 'c']).toContain(pick(['a', 'b', 'c'], createRandom(4)))
  })

  it('returns undefined for an empty list rather than throwing', () => {
    expect(pick([], createRandom(1))).toBeUndefined()
  })
})

describe('shuffle', () => {
  it('keeps every item exactly once', () => {
    const items = [1, 2, 3, 4, 5, 6, 7, 8]
    expect([...shuffle(items, createRandom(3))].sort((a, b) => a - b)).toEqual(items)
  })

  it('does not touch the array it was given', () => {
    // The arrays passed here are things like the alphabet, which the whole
    // site reads.
    const items = [1, 2, 3, 4, 5]
    shuffle(items, createRandom(3))
    expect(items).toEqual([1, 2, 3, 4, 5])
  })

  it('actually reorders', () => {
    const items = Array.from({ length: 30 }, (_, i) => i)
    expect(shuffle(items, createRandom(3))).not.toEqual(items)
  })

  it('is reproducible for the same seed', () => {
    const items = [1, 2, 3, 4, 5, 6]
    expect(shuffle(items, createRandom(8))).toEqual(shuffle(items, createRandom(8)))
  })
})
