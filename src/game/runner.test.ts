import { describe, expect, it } from 'vitest'
import {
  GAP,
  HORIZON,
  OUTCOME_LOG,
  RAMP_MS,
  SPEED,
  STARTING_LIVES,
  accuracy,
  advance,
  clearScore,
  commitOnGate,
  endRun,
  fromMemory,
  gapAt,
  isOver,
  newRunnerGame,
  runXp,
  send,
  sends,
  speedAt,
  weakest,
  type Gate,
  type RunnerState,
} from './runner'
import { createRandom } from './random'
import { xpForAnswer } from './progression'
import { MORSE_ALPHABET } from '../data/morseAlphabet'

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

describe('what a run records', () => {
  const at = (gates: Gate[]): RunnerState => ({ ...newRunnerGame(), gates })

  it('blames a wrong send on a gate only when nothing else could have been meant', () => {
    const lone = send(at([{ id: 1, character: 'K', distance: 40 }]), 'R')
    expect(lone.blamed?.id).toBe(1)
    expect(lone.state.gates[0]?.wrong).toBe(true)
    expect(lone.state.wrong).toBe(1)
    expect(send(lone.state, 'R').blamed).toBeNull()

    const mixed = at([
      { id: 1, character: 'K', distance: 40 },
      { id: 2, character: 'A', distance: 80 },
    ])
    expect(send(mixed, 'R').blamed).toBeNull()
    expect(send(newRunnerGame(), 'R').blamed).toBeNull()
  })

  it('logs cleared and stumbled gates in order, and keeps only the latest stretch', () => {
    let state = at([
      { id: 1, character: 'E', distance: 40 },
      { id: 2, character: 'T', distance: 0.5 },
    ])
    state = send(state, 'E').state
    const step = advance(state, 200, ['E'], createRandom(1))
    expect(step.hit.map((gate) => gate.id)).toEqual([2])
    expect(step.state.outcomes).toEqual([true, false])

    const long = {
      ...at([{ id: 1, character: 'E', distance: 40 }]),
      outcomes: Array<boolean>(OUTCOME_LOG).fill(false),
    }
    const next = send(long, 'E').state
    expect(next.outcomes).toHaveLength(OUTCOME_LOG)
    expect(next.outcomes.at(-1)).toBe(true)
  })

  it('pays XP per gate cleared, at the practice rate', () => {
    let state = at([
      { id: 1, character: 'E', distance: 40 },
      { id: 2, character: 'Y', distance: 70 },
    ])
    state = send(state, 'Y').state
    state = send(state, 'E').state
    expect(state.passed).toEqual(['Y', 'E'])
    expect(runXp(state)).toBe(xpForAnswer('Y') + xpForAnswer('E'))
  })

  it('counts every character keyed as a send', () => {
    let state = at([{ id: 1, character: 'E', distance: 40 }])
    state = send(state, 'T').state
    state = send(state, 'E').state
    expect(sends(state)).toBe(2)
  })

  it('can be ended early and keeps its distance', () => {
    const state = { ...newRunnerGame(), distance: 120, score: 40 }
    const ended = endRun(state)
    expect(isOver(ended)).toBe(true)
    expect(ended.distance).toBe(120)
    expect(advance(ended, 500, ['E'], createRandom(1)).state).toBe(ended)
  })
})

describe('hints (DEC-032)', () => {
  const at = (gates: Gate[]): RunnerState => ({ ...newRunnerGame(), gates })

  it('starts every gate without its code', () => {
    const { appeared } = (() => {
      let state = newRunnerGame()
      const seen: Gate[] = []
      for (let elapsed = 0; elapsed < 20_000; elapsed += 50) {
        const step = advance(state, 50, ['K'], createRandom(2))
        state = step.state
        if (step.appeared) seen.push(step.appeared)
      }
      return { appeared: seen }
    })()
    expect(appeared.length).toBeGreaterThan(0)
    for (const gate of appeared) expect(gate.hinted).toBeFalsy()
  })

  it('reveals the nearest gate after a wrong send, and only that one', () => {
    const state = at([
      { id: 1, character: 'K', distance: 30 },
      { id: 2, character: 'A', distance: 80 },
    ])
    const { state: next, hinted, blamed } = send(state, 'R')
    expect(hinted?.id).toBe(1)
    expect(blamed).toBeNull()
    expect(next.gates.find((gate) => gate.id === 1)?.hinted).toBe(true)
    expect(next.gates.find((gate) => gate.id === 2)?.hinted).toBeFalsy()
    expect(send(newRunnerGame(), 'R').hinted).toBeNull()
  })

  it('lets a hinted gate through, but scores nothing for it', () => {
    let state = { ...at([{ id: 1, character: 'K', distance: 40 }]), streak: 3, score: 50 }
    state = send(state, 'R').state
    const { state: next, cleared } = send(state, 'K')
    expect(cleared?.hinted).toBe(true)
    expect(next.gates).toEqual([])
    expect(next.lives).toBe(STARTING_LIVES)
    expect(next.cleared).toBe(1)
    expect(next.assisted).toBe(1)
    expect(fromMemory(next)).toBe(0)
    expect(next.score).toBe(50)
    expect(next.streak).toBe(0)
    expect(next.passed).toEqual([])
    expect(runXp(next)).toBe(0)
  })

  it('pays a gate cleared from memory as before', () => {
    const { state } = send(at([{ id: 1, character: 'K', distance: 40 }]), 'K')
    expect(fromMemory(state)).toBe(1)
    expect(state.passed).toEqual(['K'])
    expect(runXp(state)).toBe(xpForAnswer('K'))
  })
})

describe('committing a send early (J-09)', () => {
  const code = (character: string) => MORSE_ALPHABET[character] ?? ''
  const gates = (...characters: string[]) => characters.map((character) => ({ character }))
  /** Every proper prefix of a code, shortest first. */
  const prefixes = (full: string) =>
    Array.from({ length: full.length - 1 }, (_, n) => full.slice(0, n + 1))

  it('commits a gate the moment its code is complete, with nothing longer that starts the same', () => {
    expect(commitOnGate(code('E'), gates('E'))).toBe(true)
    expect(commitOnGate(code('T'), gates('E', 'T'))).toBe(true)
    // I extends E, but E is not on the track: I is done.
    expect(commitOnGate(code('I'), gates('I', 'T'))).toBe(true)
  })

  it('waits while the code is still the start of a gate on the track', () => {
    for (const prefix of prefixes(code('K'))) expect(commitOnGate(prefix, gates('K'))).toBe(false)
    // A dot is all of E and the start of I: with both ahead, it waits for the gap.
    expect(commitOnGate(code('E'), gates('E', 'I'))).toBe(false)
    expect(commitOnGate(code('I'), gates('E', 'I'))).toBe(true)
  })

  it('commits at once a code that can no longer become any gate, so a wrong send is judged now', () => {
    // T is a dash; nothing that starts with a dash is E.
    expect(commitOnGate(code('T'), gates('E'))).toBe(true)
    // A is dot dash: the second element already rules out I and S.
    expect(commitOnGate(code('A'), gates('I', 'S'))).toBe(true)
  })

  it('scores two quick sends for two gates as two characters, not one', () => {
    // The merge the audit measured: E, E keyed within the gap became I.
    const track = gates('E', 'E')
    expect(commitOnGate(code('E'), track)).toBe(true)
    let state: RunnerState = {
      ...newRunnerGame(),
      gates: [
        { id: 1, character: 'E', distance: 30 },
        { id: 2, character: 'E', distance: 70 },
      ],
    }
    state = send(state, 'E').state
    expect(commitOnGate(code('E'), state.gates)).toBe(true)
    state = send(state, 'E').state
    expect(state.cleared).toBe(2)
    expect(state.wrong).toBe(0)
  })

  it('never commits nothing, and leaves an empty track to the gap', () => {
    expect(commitOnGate('', gates('E'))).toBe(false)
    expect(commitOnGate(code('E'), [])).toBe(false)
  })

  it('treats a gate with no code as one nothing can grow into', () => {
    expect(commitOnGate(code('E'), gates('?not-a-character'))).toBe(true)
  })
})
