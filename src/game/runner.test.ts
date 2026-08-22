import { describe, expect, it } from 'vitest'
import {
  GAP,
  HORIZON,
  RAMP_MS,
  SPEED,
  STARTING_LIVES,
  accuracy,
  advance,
  clearScore,
  gapAt,
  isOver,
  newRunnerGame,
  send,
  speedAt,
  weakest,
  type Gate,
  type RunnerState,
} from './runner'
import { createRandom } from './random'

const ALPHABET = ['E', 'T', 'A', 'N']
const random = () => createRandom(11)

function run(state: RunnerState, ms: number, step = 100, alphabet = ALPHABET) {
  const rng = random()
  const appeared: Gate[] = []
  let current = state
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    const result = advance(current, step, alphabet, rng)
    current = result.state
    if (result.appeared) appeared.push(result.appeared)
  }
  return { state: current, appeared }
}

describe('a new run', () => {
  it('starts with lives, no gates and a clear run-up', () => {
    const game = newRunnerGame()
    expect(game.lives).toBe(STARTING_LIVES)
    expect(game.gates).toEqual([])
    expect(game.distance).toBe(0)
    expect(game.gapLeft).toBeGreaterThan(0)
    expect(isOver(game)).toBe(false)
  })
})

describe('difficulty', () => {
  it('speeds up and closes the gaps', () => {
    expect(speedAt(0)).toBe(SPEED.start)
    expect(gapAt(0)).toBe(GAP.start)
    expect(speedAt(RAMP_MS)).toBe(SPEED.floor)
    expect(gapAt(RAMP_MS)).toBe(GAP.floor)
  })

  it('stops at the floor however long the run lasts', () => {
    expect(speedAt(RAMP_MS * 50)).toBe(SPEED.floor)
    expect(gapAt(RAMP_MS * 50)).toBe(GAP.floor)
  })

  it('always leaves time to actually send a character', () => {
    // The gap divided by the speed is the seconds available per gate. The bar
    // is not "can a dot fit" — it is the real cost of sending: about a second
    // to key a four-element character at 15 WPM, plus the 1.6 seconds of
    // silence the default keyer waits before it commits one.
    //
    // This was 1.5 and passed at 1.55 seconds per gate, which is unplayable.
    expect(GAP.floor / SPEED.floor).toBeGreaterThan(3)
  })
})

describe('running', () => {
  it('covers ground', () => {
    const { state } = run(newRunnerGame(), 5000)
    expect(state.distance).toBeGreaterThan(0)
  })

  it('places gates over time, from the alphabet it was given', () => {
    const { appeared } = run(newRunnerGame(), 30_000, 100, ['E', 'T'])
    expect(appeared.length).toBeGreaterThan(2)
    for (const gate of appeared) expect(['E', 'T']).toContain(gate.character)
  })

  it('brings each gate in from the horizon', () => {
    const { appeared } = run(newRunnerGame(), 20_000)
    for (const gate of appeared) expect(gate.distance).toBe(HORIZON)
  })

  it('stumbles when a gate is not cleared', () => {
    const { state } = run(newRunnerGame(), 30_000)
    expect(state.stumbles).toBeGreaterThan(0)
    expect(state.lives).toBeLessThan(STARTING_LIVES)
  })

  it('ends after three stumbles and then freezes', () => {
    const { state } = run(newRunnerGame(), 120_000)
    expect(isOver(state)).toBe(true)
    const after = advance(state, 1000, ALPHABET, random())
    expect(after.state).toBe(state)
    expect(after.appeared).toBeNull()
  })

  it('ignores a zero or negative step', () => {
    const game = newRunnerGame()
    expect(advance(game, 0, ALPHABET, random()).state).toBe(game)
    expect(advance(game, -50, ALPHABET, random()).state).toBe(game)
  })

  it('runs an empty track rather than throwing on an empty alphabet', () => {
    const { state, appeared } = run(newRunnerGame(), 20_000, 100, [])
    expect(appeared).toEqual([])
    expect(state.lives).toBe(STARTING_LIVES)
    expect(state.distance).toBeGreaterThan(0)
  })
})

describe('sending', () => {
  const withGates = (gates: Gate[]): RunnerState => ({ ...newRunnerGame(), gates })

  it('clears a matching gate', () => {
    const state = withGates([{ id: 1, character: 'E', distance: 50 }])
    const { state: next, cleared } = send(state, 'E')
    expect(cleared?.id).toBe(1)
    expect(next.gates).toEqual([])
    expect(next.cleared).toBe(1)
    expect(next.score).toBeGreaterThan(0)
  })

  it('takes the nearest match, which is the one about to arrive', () => {
    const state = withGates([
      { id: 1, character: 'E', distance: 80 },
      { id: 2, character: 'E', distance: 20 },
    ])
    expect(send(state, 'E').cleared?.id).toBe(2)
  })

  it('does not stumble you for sending the wrong character', () => {
    // The gate is still coming; being hit by it is punishment enough, and
    // charging twice makes the run about not experimenting.
    const state = { ...withGates([{ id: 1, character: 'E', distance: 40 }]), streak: 4 }
    const { state: next, cleared } = send(state, 'T')
    expect(cleared).toBeNull()
    expect(next.lives).toBe(state.lives)
    expect(next.stumbles).toBe(0)
    expect(next.streak).toBe(0)
    expect(next.gates).toHaveLength(1)
  })

  it('pays more for keying early', () => {
    const far: Gate = { id: 1, character: 'E', distance: 80 }
    const near: Gate = { id: 2, character: 'E', distance: 5 }
    expect(clearScore(far, 0)).toBeGreaterThan(clearScore(near, 0))
  })

  it('caps the streak multiplier', () => {
    const gate: Gate = { id: 1, character: 'E', distance: 40 }
    expect(clearScore(gate, 900)).toBe(clearScore(gate, 20))
  })

  it('is case-insensitive', () => {
    const state = withGates([{ id: 1, character: 'E', distance: 40 }])
    expect(send(state, 'e').cleared?.id).toBe(1)
  })

  it('does nothing once the run is over', () => {
    const over = { ...withGates([{ id: 1, character: 'E', distance: 40 }]), lives: 0 }
    expect(send(over, 'E').state).toBe(over)
  })
})

describe('the result', () => {
  it('reads 0% before anything is resolved', () => {
    expect(accuracy(newRunnerGame())).toBe(0)
  })

  it('counts cleared against everything resolved', () => {
    expect(accuracy({ ...newRunnerGame(), cleared: 9, stumbles: 1 })).toBe(0.9)
  })

  it('lists what kept knocking you over', () => {
    const state = { ...newRunnerGame(), missed: ['Z', 'Q', 'Z'] }
    expect(weakest(state)).toEqual([
      { character: 'Z', misses: 2 },
      { character: 'Q', misses: 1 },
    ])
  })
})
