import { describe, expect, it } from 'vitest'
import { DEFAULT_METHOD, METHODS, METHOD_IDS, activeCharacters, shouldUnlock } from './methods'
import { ALL_DIGITS, ALL_LETTERS, MORSE_ALPHABET, codeLength } from './morseAlphabet'

describe('METHODS', () => {
  it('teaches all 26 letters and 10 digits, whichever order is chosen', () => {
    for (const id of METHOD_IDS) {
      const order = METHODS[id].order
      expect(order.length, id).toBe(36)
      expect(new Set(order).size, `${id} repeats a character`).toBe(36)
      expect([...order].sort().join(''), id).toBe([...ALL_LETTERS, ...ALL_DIGITS].sort().join(''))
    }
  })

  it('only names characters the engine can send', () => {
    for (const id of METHOD_IDS) {
      for (const character of METHODS[id].order) {
        expect(MORSE_ALPHABET[character], `${id}: ${character}`).toBeDefined()
      }
    }
  })

  it('defaults to the order the rest of the product is built around', () => {
    expect(DEFAULT_METHOD).toBe('signal')
  })
})

describe('the Koch order', () => {
  it('opens with K and M', () => {
    expect(METHODS.koch.order.slice(0, 2)).toEqual(['K', 'M'])
  })

  it('is deliberately not easiest-first', () => {
    // The whole premise: Koch starts with hard, dissimilar characters. If this
    // ever became easiest-first it would be the Signal order wearing Koch's
    // name, and the rationale on the page would be a lie.
    const first = METHODS.koch.order.slice(0, 2).map(codeLength)
    expect(Math.max(...first)).toBeGreaterThan(1)
    expect(METHODS.koch.order.indexOf('E')).toBeGreaterThan(5)
    expect(METHODS.koch.order.indexOf('T')).toBeGreaterThan(2)
  })

  it('unlocks on accuracy, unlike the others', () => {
    expect(METHODS.koch.unlockAccuracy).toBe(0.9)
    expect(METHODS.signal.unlockAccuracy).toBeNull()
    expect(METHODS.alphabetical.unlockAccuracy).toBeNull()
  })
})

describe('the Signal order', () => {
  it('opens with the two single-element characters', () => {
    expect(METHODS.signal.order.slice(0, 2)).toEqual(['E', 'T'])
  })

  it('never gets shallower across its letters', () => {
    const letters = METHODS.signal.order.filter((c) => /[A-Z]/.test(c))
    const depths = letters.map(codeLength)
    for (let i = 1; i < depths.length; i++) {
      expect(depths[i]!, `position ${i}`).toBeGreaterThanOrEqual(depths[i - 1]!)
    }
  })
})

describe('activeCharacters', () => {
  it('starts with the method’s starting set', () => {
    expect(activeCharacters(METHODS.koch, 0)).toEqual(['K', 'M'])
    expect(activeCharacters(METHODS.signal, 0)).toEqual(['E', 'T'])
  })

  it('adds one character per unlock', () => {
    expect(activeCharacters(METHODS.koch, 3)).toEqual(['K', 'M', 'R', 'S', 'U'])
  })

  it('never returns fewer than the starting set, however negative the input', () => {
    expect(activeCharacters(METHODS.koch, -10)).toEqual(['K', 'M'])
  })

  it('stops at the end of the order rather than running off it', () => {
    expect(activeCharacters(METHODS.koch, 999)).toHaveLength(36)
  })
})

describe('shouldUnlock', () => {
  it('unlocks at 90% once there is enough evidence', () => {
    expect(shouldUnlock(METHODS.koch, 0.9, 25)).toBe(true)
    expect(shouldUnlock(METHODS.koch, 0.89, 25)).toBe(false)
  })

  it('refuses to unlock on a lucky handful', () => {
    // 100% over three answers is luck, and unlocking on it would hand someone
    // the whole alphabet inside a minute.
    expect(shouldUnlock(METHODS.koch, 1, 3)).toBe(false)
  })

  it('never unlocks for a method without an accuracy rule', () => {
    expect(shouldUnlock(METHODS.signal, 1, 1000)).toBe(false)
    expect(shouldUnlock(METHODS.alphabetical, 1, 1000)).toBe(false)
  })
})
