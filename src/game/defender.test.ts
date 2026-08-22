import { describe, expect, it } from 'vitest'
import {
  FALL_MS,
  RAMP_MS,
  SPAWN_MS,
  STARTING_LIVES,
  accuracy,
  advance,
  fallDuration,
  hitScore,
  isOver,
  newDefenderGame,
  pressure,
  shoot,
  spawnDelay,
  weakest,
  type DefenderState,
  type Signal,
} from './defender'
import { createRandom } from './random'

const ALPHABET = ['E', 'T', 'A', 'N']
const random = () => createRandom(7)

/** Run the clock forward in small steps, as a frame loop would. */
function run(state: DefenderState, ms: number, step = 100, alphabet = ALPHABET) {
  const rng = random()
  const spawned: Signal[] = []
  let current = state
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    const result = advance(current, step, alphabet, rng)
    current = result.state
    if (result.spawned) spawned.push(result.spawned)
  }
  return { state: current, spawned }
}

describe('a new game', () => {
  it('starts with lives and nothing falling', () => {
    const game = newDefenderGame()
    expect(game.lives).toBe(STARTING_LIVES)
    expect(game.signals).toEqual([])
    expect(isOver(game)).toBe(false)
  })

  it('waits a beat before the first signal, so the screen can be read', () => {
    expect(newDefenderGame().spawnIn).toBeGreaterThan(500)
  })
})

describe('difficulty', () => {
  it('starts easy and hardens', () => {
    expect(fallDuration(0)).toBe(FALL_MS.start)
    expect(spawnDelay(0)).toBe(SPAWN_MS.start)
    expect(fallDuration(RAMP_MS)).toBe(FALL_MS.floor)
    expect(spawnDelay(RAMP_MS)).toBe(SPAWN_MS.floor)
  })

  it('never goes past the floor, however long the run', () => {
    // Otherwise a good player eventually meets a fall time of zero.
    expect(fallDuration(RAMP_MS * 100)).toBe(FALL_MS.floor)
    expect(spawnDelay(RAMP_MS * 100)).toBe(SPAWN_MS.floor)
    expect(pressure(RAMP_MS * 100)).toBe(1)
  })

  it('moves monotonically', () => {
    let previous = fallDuration(0)
    for (let t = 1000; t <= RAMP_MS; t += 1000) {
      const next = fallDuration(t)
      expect(next).toBeLessThanOrEqual(previous)
      previous = next
    }
  })
})

describe('signals falling', () => {
  it('spawns over time', () => {
    const { spawned } = run(newDefenderGame(), 10_000)
    expect(spawned.length).toBeGreaterThan(2)
  })

  it('only ever spawns characters from the alphabet it was given', () => {
    // Dropping a character the player has not been taught is the one thing a
    // game like this must never do.
    const { spawned } = run(newDefenderGame(), 30_000, 100, ['E', 'T'])
    for (const signal of spawned) expect(['E', 'T']).toContain(signal.character)
  })

  it('keeps every signal on screen horizontally', () => {
    const { spawned } = run(newDefenderGame(), 30_000)
    for (const signal of spawned) {
      expect(signal.x).toBeGreaterThan(0)
      expect(signal.x).toBeLessThan(1)
    }
  })

  it('costs a life when one reaches the floor', () => {
    const { state } = run(newDefenderGame(), 12_000)
    expect(state.lives).toBeLessThan(STARTING_LIVES)
    expect(state.leaked.length).toBeGreaterThan(0)
  })

  it('ends after three leaks and then stops changing', () => {
    const { state } = run(newDefenderGame(), 60_000)
    expect(isOver(state)).toBe(true)
    expect(state.lives).toBeLessThanOrEqual(0)

    const after = advance(state, 1000, ALPHABET, random())
    expect(after.state).toBe(state)
    expect(after.spawned).toBeNull()
  })

  it('ignores a zero or negative step rather than moving backwards', () => {
    const game = newDefenderGame()
    expect(advance(game, 0, ALPHABET, random()).state).toBe(game)
    expect(advance(game, -100, ALPHABET, random()).state).toBe(game)
  })

  it('does nothing with an empty alphabet instead of throwing', () => {
    const { state, spawned } = run(newDefenderGame(), 10_000, 100, [])
    expect(spawned).toEqual([])
    expect(state.lives).toBe(STARTING_LIVES)
  })
})

describe('shooting', () => {
  const withSignals = (signals: Signal[]): DefenderState => ({
    ...newDefenderGame(),
    signals,
  })

  it('knocks down a match and scores it', () => {
    const state = withSignals([{ id: 1, character: 'E', y: 0.2, x: 0.5 }])
    const { state: next, hit } = shoot(state, 'E')
    expect(hit?.id).toBe(1)
    expect(next.signals).toEqual([])
    expect(next.score).toBeGreaterThan(0)
    expect(next.hits).toBe(1)
  })

  it('takes the lowest match, which is the urgent one', () => {
    const state = withSignals([
      { id: 1, character: 'E', y: 0.1, x: 0.3 },
      { id: 2, character: 'E', y: 0.8, x: 0.6 },
    ])
    expect(shoot(state, 'E').hit?.id).toBe(2)
  })

  it('is case-insensitive and ignores stray whitespace', () => {
    const state = withSignals([{ id: 1, character: 'E', y: 0.2, x: 0.5 }])
    expect(shoot(state, ' e ').hit?.id).toBe(1)
  })

  it('costs the streak but never a life on a wrong answer', () => {
    // Losing a life to a typo would make this a game about the keyboard.
    const state = { ...withSignals([{ id: 1, character: 'E', y: 0.2, x: 0.5 }]), streak: 5 }
    const { state: next, hit } = shoot(state, 'Z')
    expect(hit).toBeNull()
    expect(next.lives).toBe(state.lives)
    expect(next.streak).toBe(0)
    expect(next.misses).toBe(1)
  })

  it('pays more for answering early than at the last moment', () => {
    const early: Signal = { id: 1, character: 'E', y: 0.1, x: 0.5 }
    const late: Signal = { id: 2, character: 'E', y: 0.9, x: 0.5 }
    expect(hitScore(early, 0)).toBeGreaterThan(hitScore(late, 0))
  })

  it('caps the streak multiplier', () => {
    // Without a ceiling the score measures how long the run lasted and nothing
    // else.
    const signal: Signal = { id: 1, character: 'E', y: 0.5, x: 0.5 }
    expect(hitScore(signal, 500)).toBe(hitScore(signal, 20))
  })

  it('tracks the best streak even after it breaks', () => {
    let state = withSignals([
      { id: 1, character: 'E', y: 0.2, x: 0.5 },
      { id: 2, character: 'T', y: 0.3, x: 0.5 },
    ])
    state = shoot(state, 'E').state
    state = shoot(state, 'T').state
    expect(state.bestStreak).toBe(2)
    state = shoot(state, 'Z').state
    expect(state.streak).toBe(0)
    expect(state.bestStreak).toBe(2)
  })

  it('does nothing once the run is over', () => {
    const over = { ...withSignals([{ id: 1, character: 'E', y: 0.2, x: 0.5 }]), lives: 0 }
    expect(shoot(over, 'E').state).toBe(over)
  })
})

describe('the result', () => {
  it('reads 0% accuracy before anything is attempted, not 100%', () => {
    expect(accuracy(newDefenderGame())).toBe(0)
  })

  it('counts hits against every attempt', () => {
    const state = { ...newDefenderGame(), hits: 3, misses: 1 }
    expect(accuracy(state)).toBe(0.75)
  })

  it('lists what kept getting through, worst first', () => {
    const state = { ...newDefenderGame(), leaked: ['Q', 'E', 'Q', 'Q', 'E'] }
    expect(weakest(state)).toEqual([
      { character: 'Q', misses: 3 },
      { character: 'E', misses: 2 },
    ])
  })

  it('has nothing to report when nothing leaked', () => {
    expect(weakest(newDefenderGame())).toEqual([])
  })
})
