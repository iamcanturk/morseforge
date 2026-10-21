import { describe, expect, it } from 'vitest'
import {
  DEFAULT_METHOD,
  METHODS,
  METHOD_IDS,
  MIN_UNLOCK_ATTEMPTS,
  activeCharacters,
  nextUnlockCount,
  shouldUnlock,
  stageIndex,
} from './methods'
import {
  ALL_DIGITS,
  ALL_LETTERS,
  LEARNING_STAGES,
  MORSE_ALPHABET,
  codeLength,
} from './morseAlphabet'

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

  it('unlocks one character at a time, unlike the staged methods', () => {
    expect(METHODS.koch.unlockAccuracy).toBe(0.9)
    expect(METHODS.koch.stages).toBeUndefined()
    expect(nextUnlockCount(METHODS.koch, 0)).toBe(1)
    expect(nextUnlockCount(METHODS.koch, 7)).toBe(8)
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
    expect(MIN_UNLOCK_ATTEMPTS).toBe(25)
    expect(shouldUnlock(METHODS.koch, 0.9, MIN_UNLOCK_ATTEMPTS)).toBe(true)
    expect(shouldUnlock(METHODS.koch, 0.89, MIN_UNLOCK_ATTEMPTS)).toBe(false)
  })

  it('refuses to unlock on a lucky handful', () => {
    // 100% over three answers is luck, and unlocking on it would hand someone
    // the whole alphabet inside a minute.
    expect(shouldUnlock(METHODS.koch, 1, 3)).toBe(false)
  })

  it('applies the same bar to every built-in method', () => {
    // The default method once had no rule at all, so its pool stayed E and T
    // forever while every test passed. Each method must be able to grow.
    for (const id of METHOD_IDS) {
      expect(shouldUnlock(METHODS[id], 0.9, MIN_UNLOCK_ATTEMPTS), id).toBe(true)
      expect(shouldUnlock(METHODS[id], 0.89, MIN_UNLOCK_ATTEMPTS), id).toBe(false)
      expect(shouldUnlock(METHODS[id], 1, MIN_UNLOCK_ATTEMPTS - 1), id).toBe(false)
    }
  })

  it('never unlocks for a method without an accuracy rule', () => {
    const manual = { ...METHODS.signal, unlockAccuracy: null }
    expect(shouldUnlock(manual, 1, 1000)).toBe(false)
  })
})

describe('stages', () => {
  it('are cumulative, start at the starting set and end at the whole order', () => {
    for (const id of METHOD_IDS) {
      const { stages, startingCount, order } = METHODS[id]
      if (!stages) continue
      expect(stages[0], id).toBe(startingCount)
      expect(stages[stages.length - 1], id).toBe(order.length)
      for (let i = 1; i < stages.length; i++) {
        expect(stages[i]!, `${id} stage ${i}`).toBeGreaterThan(stages[i - 1]!)
      }
    }
  })

  it('follow the lesson stages for Signal, then the digits as one layer', () => {
    const lessonBoundaries = LEARNING_STAGES.map((_, i) =>
      LEARNING_STAGES.slice(0, i + 1).reduce((sum, stage) => sum + stage.length, 0),
    )
    expect(METHODS.signal.stages).toEqual([...lessonBoundaries, METHODS.signal.order.length])
  })

  it('are whole tree layers for Signal: one code length per stage', () => {
    const { stages, order } = METHODS.signal
    let from = 0
    for (const to of stages ?? []) {
      const lengths = new Set(order.slice(from, to).map(codeLength))
      expect(lengths.size, `stage ending at ${to}`).toBe(1)
      from = to
    }
  })
})

describe('nextUnlockCount', () => {
  it('moves a fresh Signal learner from stage 1 to the whole of stage 2', () => {
    expect(activeCharacters(METHODS.signal, 0)).toEqual(['E', 'T'])
    const next = nextUnlockCount(METHODS.signal, 0)
    expect(activeCharacters(METHODS.signal, next)).toEqual(['E', 'T', 'I', 'A', 'N', 'M'])
  })

  it('adds a stage at a time for Signal, ending on the digits', () => {
    let unlocked = 0
    const sizes: number[] = []
    for (let i = 0; i < 10; i++) {
      unlocked = nextUnlockCount(METHODS.signal, unlocked)
      sizes.push(activeCharacters(METHODS.signal, unlocked).length)
    }
    expect(sizes).toEqual([6, 14, 26, 36, 36, 36, 36, 36, 36, 36])
  })

  it('adds four letters at a time for Alphabetical', () => {
    const next = nextUnlockCount(METHODS.alphabetical, 0)
    expect(activeCharacters(METHODS.alphabetical, next)).toEqual(['A', 'B', 'C', 'D', 'E', 'F'])
  })

  it('finishes a part-unlocked stage rather than skipping past it', () => {
    // Three extra means E T I A N: the rest of stage 2 is M, so the next
    // unlock completes stage 2 and does not jump to the end of stage 3.
    expect(nextUnlockCount(METHODS.signal, 3)).toBe(4)
  })

  it('never goes past the end or below zero', () => {
    expect(nextUnlockCount(METHODS.signal, 999)).toBe(34)
    expect(nextUnlockCount(METHODS.koch, 999)).toBe(34)
    expect(nextUnlockCount(METHODS.signal, -5)).toBe(4)
  })
})

describe('stageIndex', () => {
  it('reads the stage a pool is in', () => {
    expect(stageIndex(METHODS.signal, 0)).toBe(0)
    expect(stageIndex(METHODS.signal, 4)).toBe(1)
    expect(stageIndex(METHODS.signal, 3)).toBe(1)
    expect(stageIndex(METHODS.signal, 34)).toBe(4)
    expect(stageIndex(METHODS.koch, 3)).toBe(3)
  })
})

describe('nextUnlockCount on untrusted input', () => {
  it('treats NaN as nothing earned rather than everything', () => {
    // Every comparison with NaN is false, so a staged method once found no
    // boundary and unlocked the whole order.
    for (const id of METHOD_IDS) {
      expect(nextUnlockCount(METHODS[id], Number.NaN), id).toBe(nextUnlockCount(METHODS[id], 0))
    }
  })
})
