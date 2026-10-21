/**
 * Signal Defender (PROJECT.md §18).
 *
 * Signals fall from the top of the screen as Morse code, each one sounding as it
 * spawns. Type the character a code spells to knock down the lowest one
 * matching it. Let three reach the floor and the run is over.
 *
 * A falling signal shows its code and never its letter (DEC-027): the letter
 * is the answer. So a hit is a code read in time, which is the recognition
 * skill, and that is what every hit and every leak is recorded against.
 *
 * The point of a game here is time pressure that a practice screen cannot
 * create honestly. Practice waits for you; this does not, and that is the
 * whole difference — copying at speed fails not because you cannot decode a
 * character but because you cannot decode it *before the next one arrives*.
 *
 * All of it is pure and takes an explicit clock, so the rules can be tested
 * without a canvas, a browser or a wall clock.
 */

import type { Skill } from './mastery'
import { xpForAnswer } from './progression'
import { pick, type Random } from './random'

export interface Signal {
  /** Stable across frames, so a renderer can animate rather than redraw. */
  id: number
  character: string
  /** 0 at the top, 1 at the floor. */
  y: number
  /** Fraction of the width. Set at spawn and never changes. */
  x: number
  /**
   * Already counted as a wrong answer, by a shot that could only have been
   * aimed at it. Landing afterwards does not count it a second time: one
   * signal heard is one answer, however it ends.
   */
  wrong?: boolean
}

export interface DefenderState {
  signals: readonly Signal[]
  lives: number
  score: number
  /** Consecutive hits. Drives the multiplier. */
  streak: number
  bestStreak: number
  hits: number
  misses: number
  /** Characters that reached the floor, for "practise these next". */
  leaked: readonly string[]
  /** Characters knocked down, in order. What the run's XP is paid on. */
  caught: readonly string[]
  /**
   * Hit or miss for each resolved signal and each wrong shot, in order, the
   * most recent `OUTCOME_LOG` of them. The game-over strip draws one lamp each.
   */
  outcomes: readonly boolean[]
  /** Ended by the player rather than by the floor. */
  quit: boolean
  elapsedMs: number
  nextId: number
  /** Milliseconds until the next spawn. */
  spawnIn: number
}

export const STARTING_LIVES = 3

/**
 * The skill a run is evidence of. The code is on screen, so a hit proves the
 * player can read it; it does not prove they heard it, even with sound on.
 */
export const DEFENDER_SKILL: Skill = 'recognition'

/** How many outcomes the strip keeps. A long run shows its most recent stretch. */
export const OUTCOME_LOG = 120

const logged = (log: readonly boolean[], ...next: boolean[]): readonly boolean[] =>
  next.length === 0 ? log : [...log, ...next].slice(-OUTCOME_LOG)

/** How long a signal takes to fall, at the start and at the hardest. */
export const FALL_MS = { start: 7000, floor: 2600 } as const

/** Gap between spawns, likewise. */
export const SPAWN_MS = { start: 2200, floor: 700 } as const

/** How long the difficulty takes to walk from `start` to `floor`. */
export const RAMP_MS = 120_000

export function newDefenderGame(): DefenderState {
  return {
    signals: [],
    lives: STARTING_LIVES,
    score: 0,
    streak: 0,
    bestStreak: 0,
    hits: 0,
    misses: 0,
    leaked: [],
    caught: [],
    outcomes: [],
    quit: false,
    elapsedMs: 0,
    nextId: 1,
    // The first one arrives after a beat, so the player can read the screen
    // before anything is falling.
    spawnIn: 1200,
  }
}

/** 0..1 through the difficulty ramp. */
export function pressure(elapsedMs: number): number {
  return Math.min(1, Math.max(0, elapsedMs / RAMP_MS))
}

const lerp = (from: number, to: number, t: number) => from + (to - from) * t

export function fallDuration(elapsedMs: number): number {
  return lerp(FALL_MS.start, FALL_MS.floor, pressure(elapsedMs))
}

export function spawnDelay(elapsedMs: number): number {
  return lerp(SPAWN_MS.start, SPAWN_MS.floor, pressure(elapsedMs))
}

/** The score multiplier a streak earns: a tenth per hit in a row, capped at three. */
export function streakMultiplier(streak: number): number {
  return Math.min(1 + Math.max(0, streak) * 0.1, 3)
}

/**
 * Points for a hit.
 *
 * Higher the further the signal still had to fall, so answering early is worth
 * more than answering at the last moment — which is the habit worth building.
 * The streak multiplier is capped: without a ceiling the score stops being a
 * measure of anything except how long the run lasted.
 */
export function hitScore(signal: Signal, streak: number): number {
  const earliness = 1 - signal.y
  const multiplier = streakMultiplier(streak)
  return Math.round((10 + earliness * 20) * multiplier)
}

export interface Spawned {
  state: DefenderState
  /** The signal that appeared, so the caller can sound it. Null if none did. */
  spawned: Signal | null
  /** Signals that reached the floor this step, so the caller can record them. */
  landed: readonly Signal[]
}

/**
 * Advance by `dtMs`.
 *
 * Returns the newly spawned signal rather than sounding it here: this module
 * knows the rules and nothing about audio, which is what lets it be tested.
 */
export function advance(
  state: DefenderState,
  dtMs: number,
  alphabet: readonly string[],
  random: Random,
): Spawned {
  if (isOver(state) || dtMs <= 0) return { state, spawned: null, landed: [] }

  const elapsedMs = state.elapsedMs + dtMs
  const fall = fallDuration(elapsedMs)

  const moved = state.signals.map((signal) => ({ ...signal, y: signal.y + dtMs / fall }))
  const landed = moved.filter((signal) => signal.y >= 1)
  const flying = moved.filter((signal) => signal.y < 1)

  let spawned: Signal | null = null
  let spawnIn = state.spawnIn - dtMs
  let nextId = state.nextId

  if (spawnIn <= 0 && alphabet.length > 0) {
    const character = pick(alphabet, random)
    if (character !== undefined) {
      spawned = {
        id: nextId++,
        character,
        y: 0,
        // Kept off the edges so a long character still fits on screen.
        x: 0.1 + random() * 0.8,
      }
    }
    spawnIn = spawnDelay(elapsedMs)
  }

  return {
    state: {
      ...state,
      elapsedMs,
      signals: spawned ? [...flying, spawned] : flying,
      // A leak breaks the streak: it is a miss, whether or not anything was
      // typed at it.
      lives: state.lives - landed.length,
      streak: landed.length > 0 ? 0 : state.streak,
      misses: state.misses + landed.length,
      leaked: [...state.leaked, ...landed.map((signal) => signal.character)],
      outcomes: logged(state.outcomes, ...landed.map(() => false)),
      nextId,
      spawnIn,
    },
    spawned,
    landed,
  }
}

export interface Shot {
  state: DefenderState
  /** What was knocked down, or null for a miss. */
  hit: Signal | null
  /**
   * For a miss: the signal it was unambiguously a wrong answer to, or null.
   *
   * Only when everything on screen is the same character is a wrong key
   * evidence about a particular signal — with two different ones falling there
   * is no telling which the player was answering, and charging a guess to a
   * character would corrupt its review schedule. Each signal is blamed once.
   */
  blamed: Signal | null
}

/**
 * Answer with a character.
 *
 * Knocks down the *lowest* match — the most urgent one — so a player who sees
 * two of the same letter is rewarded for dealing with the one about to land
 * rather than being told to pick.
 *
 * A wrong answer costs the streak but not a life. Losing a life for a typo
 * would make the game about the keyboard rather than about the code.
 */
export function shoot(state: DefenderState, answer: string): Shot {
  if (isOver(state)) return { state, hit: null, blamed: null }

  const character = answer.trim().toUpperCase()
  const target = state.signals
    .filter((signal) => signal.character === character)
    .reduce<Signal | null>(
      (lowest, signal) => (!lowest || signal.y > lowest.y ? signal : lowest),
      null,
    )

  if (!target) {
    const only = state.signals[0]
    const blamed =
      only && !only.wrong && state.signals.every((signal) => signal.character === only.character)
        ? only
        : null
    return {
      state: {
        ...state,
        signals: blamed
          ? state.signals.map((signal) =>
              signal.id === blamed.id ? { ...signal, wrong: true } : signal,
            )
          : state.signals,
        streak: 0,
        misses: state.misses + 1,
        outcomes: logged(state.outcomes, false),
      },
      hit: null,
      blamed,
    }
  }

  const streak = state.streak + 1
  return {
    state: {
      ...state,
      signals: state.signals.filter((signal) => signal.id !== target.id),
      score: state.score + hitScore(target, state.streak),
      streak,
      bestStreak: Math.max(state.bestStreak, streak),
      hits: state.hits + 1,
      caught: [...state.caught, target.character],
      outcomes: logged(state.outcomes, true),
    },
    hit: target,
    blamed: null,
  }
}

/**
 * End the run now, keeping everything it scored.
 *
 * Giving up is still a run that happened: the hits were heard and recorded,
 * and dropping them because the player stopped first would make walking away
 * cost more than losing.
 */
export function endRun(state: DefenderState): DefenderState {
  return isOver(state) ? state : { ...state, quit: true }
}

export function isOver(state: DefenderState): boolean {
  return state.lives <= 0 || state.quit
}

/** Characters the player actually typed: hits and wrong shots, not leaks. */
export function shots(state: DefenderState): number {
  return state.hits + state.misses - state.leaked.length
}

/** XP for the run: the same per-character award as a correct practice answer. */
export function runXp(state: DefenderState): number {
  return state.caught.reduce((sum, character) => sum + xpForAnswer(character), 0)
}

/** 0..1. Zero attempts reads as 0 rather than as perfect. */
export function accuracy(state: DefenderState): number {
  const attempts = state.hits + state.misses
  return attempts === 0 ? 0 : state.hits / attempts
}

/** What kept getting through, most-leaked first. */
export function weakest(state: DefenderState): { character: string; misses: number }[] {
  const counts = new Map<string, number>()
  for (const character of state.leaked) counts.set(character, (counts.get(character) ?? 0) + 1)

  return [...counts.entries()]
    .map(([character, misses]) => ({ character, misses }))
    .sort((a, b) => b.misses - a.misses || a.character.localeCompare(b.character))
}
