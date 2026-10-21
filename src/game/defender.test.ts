import { describe, expect, it } from 'vitest'
import {
  DEFENDER_SKILL,
  FALL_MS,
  RAMP_MS,
  SPAWN_MS,
  OUTCOME_LOG,
  STARTING_LIVES,
  accuracy,
  advance,
  endRun,
  fallDuration,
  hitScore,
  isOver,
  newDefenderGame,
  pressure,
  runXp,
  shoot,
  shots,
  spawnDelay,
  weakest,
  type DefenderState,
  type Signal,
} from './defender'
import { createRandom } from './random'
import { xpForAnswer } from './progression'
import { answer, emptyProgress, getCharacter } from '../storage/progress'

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

describe('what a run records', () => {
  const at = (signals: Signal[]): DefenderState => ({ ...newDefenderGame(), signals })

  it('blames a wrong shot on the signal only when nothing else could have been meant', () => {
    const lone = at([{ id: 1, character: 'E', y: 0.4, x: 0.5 }])
    const shot = shoot(lone, 'T')
    expect(shot.blamed?.id).toBe(1)
    expect(shot.state.signals[0]?.wrong).toBe(true)

    const twins = at([
      { id: 1, character: 'E', y: 0.4, x: 0.3 },
      { id: 2, character: 'E', y: 0.2, x: 0.7 },
    ])
    expect(shoot(twins, 'T').blamed?.id).toBe(1)

    const mixed = at([
      { id: 1, character: 'E', y: 0.4, x: 0.3 },
      { id: 2, character: 'A', y: 0.2, x: 0.7 },
    ])
    const guess = shoot(mixed, 'T')
    expect(guess.blamed).toBeNull()
    expect(guess.state.signals.some((signal) => signal.wrong)).toBe(false)

    expect(shoot(newDefenderGame(), 'T').blamed).toBeNull()
  })

  it('blames a signal once, however many wrong keys it draws', () => {
    const once = shoot(at([{ id: 1, character: 'E', y: 0.4, x: 0.5 }]), 'T').state
    expect(shoot(once, 'A').blamed).toBeNull()
  })

  it('hands back what landed, so the screen can record it as missed', () => {
    const state = at([{ id: 4, character: 'Q', y: 0.99, x: 0.5, wrong: true }])
    const { landed, state: next } = advance(state, 200, ['E'], createRandom(1))
    expect(landed.map((signal) => signal.id)).toEqual([4])
    expect(landed[0]?.wrong).toBe(true)
    expect(next.outcomes).toEqual([false])
  })

  it('logs every outcome in order, and keeps only the latest stretch', () => {
    let state = at([{ id: 1, character: 'E', y: 0.4, x: 0.5 }])
    state = shoot(state, 'E').state
    state = shoot(state, 'T').state
    expect(state.outcomes).toEqual([true, false])

    const long = { ...newDefenderGame(), outcomes: Array<boolean>(OUTCOME_LOG).fill(true) }
    const next = shoot(long, 'T').state
    expect(next.outcomes).toHaveLength(OUTCOME_LOG)
    expect(next.outcomes.at(-1)).toBe(false)
  })

  it('pays XP per character knocked down, at the practice rate', () => {
    let state = at([
      { id: 1, character: 'E', y: 0.4, x: 0.3 },
      { id: 2, character: 'Q', y: 0.2, x: 0.7 },
    ])
    state = shoot(state, 'E').state
    state = shoot(state, 'Q').state
    expect(state.caught).toEqual(['E', 'Q'])
    expect(runXp(state)).toBe(xpForAnswer('E') + xpForAnswer('Q'))
    expect(runXp(newDefenderGame())).toBe(0)
  })

  it('counts only what was typed as shots, not what leaked', () => {
    const state = { ...newDefenderGame(), hits: 4, misses: 3, leaked: ['E', 'T'] }
    expect(shots(state)).toBe(5)
    expect(shots(newDefenderGame())).toBe(0)
  })

  it('can be ended early and keeps its score', () => {
    const state = { ...newDefenderGame(), score: 90, lives: 2 }
    const ended = endRun(state)
    expect(isOver(ended)).toBe(true)
    expect(ended.score).toBe(90)
    expect(ended.lives).toBe(2)
    expect(advance(ended, 500, ['E'], createRandom(1)).state).toBe(ended)
    expect(endRun(ended)).toBe(ended)
  })
})

describe('what a hit is evidence of (DEC-027)', () => {
  it('records recognition, never listening: the code is on screen', () => {
    expect(DEFENDER_SKILL).toBe('recognition')
    const signal: Signal = { id: 1, character: 'E', y: 0.5, x: 0.5 }
    const hit = shoot({ ...newDefenderGame(), signals: [signal] }, 'E').hit
    expect(hit?.character).toBe('E')
    const progress = answer(emptyProgress(), hit!.character, DEFENDER_SKILL, true, 0)
    const { skills } = getCharacter(progress, 'E', 0)
    expect(skills.recognition).toEqual({ attempts: 1, correct: 1 })
    expect(skills.listening).toEqual({ attempts: 0, correct: 0 })
  })
})
