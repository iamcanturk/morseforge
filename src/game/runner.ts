/**
 * Morse Runner (PROJECT.md §18).
 *
 * Gates come towards you along a track, each one asking for a character. Key
 * it correctly before you reach the gate and you pass through; miss it and you
 * stumble. Three stumbles ends the run.
 *
 * Deliberately the mirror of Signal Defender: that one is receiving under time
 * pressure, this one is *sending* under it. Sending is the skill with no
 * natural pressure anywhere else on the site — the telegraph waits for you
 * forever, and a keyer that waits forever never teaches you to commit to a
 * character. Here the gate arrives whether you are ready or not.
 *
 * Pure, with an explicit clock. The rules can be tested without a canvas.
 */

import { pick, type Random } from './random'

export interface Gate {
  id: number
  character: string
  /** Distance ahead, in metres. Zero is the runner. */
  distance: number
}

export interface RunnerState {
  gates: readonly Gate[]
  /** Metres covered. The headline number. */
  distance: number
  /** Metres per second. */
  speed: number
  lives: number
  score: number
  streak: number
  bestStreak: number
  cleared: number
  stumbles: number
  /** Gates that hit the runner, for "practise these next". */
  missed: readonly string[]
  elapsedMs: number
  nextId: number
  /** Metres until the next gate is placed. */
  gapLeft: number
}

export const STARTING_LIVES = 3

/** Metres per second, at the start and at the hardest. */
export const SPEED = { start: 9, floor: 22 } as const

/** Metres between gates, likewise. */
export const GAP = { start: 70, floor: 34 } as const

/** How long the difficulty takes to walk from `start` to `floor`. */
export const RAMP_MS = 150_000

/** How far ahead a gate appears. Everything nearer than this is on screen. */
export const HORIZON = 90

export function newRunnerGame(): RunnerState {
  return {
    gates: [],
    distance: 0,
    speed: SPEED.start,
    lives: STARTING_LIVES,
    score: 0,
    streak: 0,
    bestStreak: 0,
    cleared: 0,
    stumbles: 0,
    missed: [],
    elapsedMs: 0,
    nextId: 1,
    // A clear run-up, so the first gate is not already arriving.
    gapLeft: 45,
  }
}

export function pressure(elapsedMs: number): number {
  return Math.min(1, Math.max(0, elapsedMs / RAMP_MS))
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t

export function speedAt(elapsedMs: number): number {
  return lerp(SPEED.start, SPEED.floor, pressure(elapsedMs))
}

export function gapAt(elapsedMs: number): number {
  return lerp(GAP.start, GAP.floor, pressure(elapsedMs))
}

/**
 * Points for clearing a gate.
 *
 * More the further out it still was, so keying early beats keying at the post.
 * Same capped multiplier as Defender, for the same reason: an uncapped streak
 * turns the score into a measure of endurance alone.
 */
export function clearScore(gate: Gate, streak: number): number {
  const earliness = Math.min(1, Math.max(0, gate.distance / HORIZON))
  const multiplier = Math.min(1 + streak * 0.1, 3)
  return Math.round((10 + earliness * 15) * multiplier)
}

export interface Stepped {
  state: RunnerState
  /** A gate that appeared, so the caller can announce it. Null if none did. */
  appeared: Gate | null
  /** Gates that hit the runner this step. */
  hit: readonly Gate[]
}

/** Advance by `dtMs`. */
export function advance(
  state: RunnerState,
  dtMs: number,
  alphabet: readonly string[],
  random: Random,
): Stepped {
  if (isOver(state) || dtMs <= 0) return { state, appeared: null, hit: [] }

  const elapsedMs = state.elapsedMs + dtMs
  const speed = speedAt(elapsedMs)
  const travelled = (speed * dtMs) / 1000

  const moved = state.gates.map((gate) => ({ ...gate, distance: gate.distance - travelled }))
  // A gate is missed once it is behind the runner.
  const hit = moved.filter((gate) => gate.distance <= 0)
  const ahead = moved.filter((gate) => gate.distance > 0)

  let appeared: Gate | null = null
  let gapLeft = state.gapLeft - travelled
  let nextId = state.nextId

  if (gapLeft <= 0 && alphabet.length > 0) {
    const character = pick(alphabet, random)
    if (character !== undefined) {
      appeared = { id: nextId++, character, distance: HORIZON }
    }
    gapLeft = gapAt(elapsedMs)
  }

  return {
    state: {
      ...state,
      elapsedMs,
      distance: state.distance + travelled,
      speed,
      gates: appeared ? [...ahead, appeared] : ahead,
      lives: state.lives - hit.length,
      stumbles: state.stumbles + hit.length,
      streak: hit.length > 0 ? 0 : state.streak,
      missed: [...state.missed, ...hit.map((gate) => gate.character)],
      nextId,
      gapLeft,
    },
    appeared,
    hit,
  }
}

export interface Sent {
  state: RunnerState
  /** The gate cleared, or null if the character matched nothing ahead. */
  cleared: Gate | null
}

/**
 * Key a character.
 *
 * Clears the *nearest* gate matching it — the one about to arrive — so a
 * player facing two of the same character deals with the urgent one rather
 * than being asked to choose.
 *
 * Sending the wrong character breaks the streak but does not stumble you. The
 * gate is still coming, and being hit by it is punishment enough; charging
 * twice for one mistake would make the run about not experimenting.
 */
export function send(state: RunnerState, character: string): Sent {
  if (isOver(state)) return { state, cleared: null }

  const wanted = character.trim().toUpperCase()
  const target = state.gates
    .filter((gate) => gate.character === wanted)
    .reduce<Gate | null>(
      (nearest, gate) => (!nearest || gate.distance < nearest.distance ? gate : nearest),
      null,
    )

  if (!target) {
    return { state: { ...state, streak: 0 }, cleared: null }
  }

  const streak = state.streak + 1
  return {
    state: {
      ...state,
      gates: state.gates.filter((gate) => gate.id !== target.id),
      score: state.score + clearScore(target, state.streak),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      cleared: state.cleared + 1,
    },
    cleared: target,
  }
}

export function isOver(state: RunnerState): boolean {
  return state.lives <= 0
}

/** 0..1 across every gate that has been resolved one way or the other. */
export function accuracy(state: RunnerState): number {
  const total = state.cleared + state.stumbles
  return total === 0 ? 0 : state.cleared / total
}

/** What kept knocking you over, worst first. */
export function weakest(state: RunnerState): { character: string; misses: number }[] {
  const counts = new Map<string, number>()
  for (const character of state.missed) counts.set(character, (counts.get(character) ?? 0) + 1)

  return [...counts.entries()]
    .map(([character, misses]) => ({ character, misses }))
    .sort((a, b) => b.misses - a.misses || a.character.localeCompare(b.character))
}
