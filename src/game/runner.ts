/**
 * Morse Runner (PROJECT.md §18).
 *
 * Gates come towards you along a track, each one asking for a character. Key
 * it correctly before you reach the gate and you pass through; miss it and you
 * stumble. Three stumbles ends the run.
 *
 * A gate shows its letter and never its code (DEC-032): the code is the
 * answer, and keying a pattern printed on the gate is copying, not sending.
 * After a wrong send the nearest gate shows its code as a hint, so a beginner
 * is never stuck; a gate cleared after its hint lets the runner through but
 * is not a correct `sending` answer, earns no points or XP, and does not
 * extend the streak. The wrong send already counted against it.
 *
 * Deliberately the mirror of Signal Defender: that one is receiving under time
 * pressure, this one is *sending* under it. Sending is the skill with no
 * natural pressure anywhere else on the site — the telegraph waits for you
 * forever, and a keyer that waits forever never teaches you to commit to a
 * character. Here the gate arrives whether you are ready or not.
 *
 * Pure, with an explicit clock. The rules can be tested without a canvas.
 */

import { MORSE_ALPHABET } from '../data/morseAlphabet'
import { xpForAnswer } from './progression'
import { pick, type Random } from './random'

export interface Gate {
  id: number
  character: string
  /** Distance ahead, in metres. Zero is the runner. */
  distance: number
  /** Already counted as a wrong send (see `send`); a later collision is not a second one. */
  wrong?: boolean
  /** Its code is showing, after a wrong send. Clearing it now is assisted, not from memory. */
  hinted?: boolean
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
  /**
   * Characters of the gates cleared from memory, in order. What the run's XP
   * is paid on. A gate cleared after its hint is not here.
   */
  passed: readonly string[]
  /** Gates cleared after their code was shown as a hint. Included in `cleared`. */
  assisted: number
  /** Characters keyed that matched no gate ahead. They break the streak and nothing else. */
  wrong: number
  /** Cleared or stumbled for each gate resolved, in order, the latest `OUTCOME_LOG`. */
  outcomes: readonly boolean[]
  /** Ended by the player rather than by the third stumble. */
  quit: boolean
  elapsedMs: number
  nextId: number
  /** Metres until the next gate is placed. */
  gapLeft: number
}

export const STARTING_LIVES = 3

/** How many outcomes the strip keeps. A long run shows its most recent stretch. */
export const OUTCOME_LOG = 120

const logged = (log: readonly boolean[], ...next: boolean[]): readonly boolean[] =>
  next.length === 0 ? log : [...log, ...next].slice(-OUTCOME_LOG)

/**
 * Metres per second, at the start and at the hardest.
 *
 * The floor is set by how long it actually takes to send a character, not by
 * what felt exciting. Keying a four-element character at 15 WPM is about a
 * second, and the default keyer waits another 1.6 seconds of silence before it
 * commits — so a gate arriving every 1.55 seconds, which is what a 22 m/s top
 * speed gave, was not hard. It was impossible, and it only looked survivable
 * because the first version of the playability test let its simulated player
 * key several characters at once.
 */
export const SPEED = { start: 9, floor: 18 } as const

/** Metres between gates, likewise. 60 at 18 m/s is a gate every 3.3 seconds. */
export const GAP = { start: 70, floor: 60 } as const

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
    passed: [],
    assisted: 0,
    wrong: 0,
    outcomes: [],
    quit: false,
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

/** The score multiplier a streak earns: a tenth per hit in a row, capped at three. */
export function streakMultiplier(streak: number): number {
  return Math.min(1 + Math.max(0, streak) * 0.1, 3)
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
  const multiplier = streakMultiplier(streak)
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
      outcomes: logged(state.outcomes, ...hit.map(() => false)),
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
  /**
   * For a wrong send: the gate it was unambiguously a wrong attempt at, or
   * null. Only when every gate ahead asks for the same character is it clear
   * what the player was trying to key; otherwise nothing is charged to any
   * character's schedule. Each gate is blamed once.
   */
  blamed: Gate | null
  /** For a wrong send: the gate whose code is now shown, or null with nothing ahead. */
  hinted: Gate | null
}

/**
 * Whether the elements keyed so far should be committed now, without waiting
 * for the character gap (journeys audit J-09).
 *
 * The gap is there so a character can grow, and nothing else. Once the code
 * keyed cannot grow into any gate on the track, waiting only costs the run:
 * a correct E sat for the whole 1.6 s gap, and a second quick E glued onto it
 * and arrived as I. So commit at once when no visible gate's code extends what
 * was keyed. That covers both cases:
 * - the code spells a gate and no longer gate starts with it (E with only T
 *   ahead, or I with E ahead): it is that gate;
 * - the code is no longer the start of any gate's code: it is wrong, and
 *   saying so now is fairer than saying so in two seconds.
 *
 * With E and I both ahead a single dot still waits, because it may be the
 * start of I. On an empty track nothing commits early either: there is
 * nothing to judge it against, and the gap rule stands.
 */
export function commitOnGate(
  pending: string,
  gates: readonly Pick<Gate, 'character'>[],
  codeOf: (character: string) => string | undefined = (character) => MORSE_ALPHABET[character],
): boolean {
  if (pending === '' || gates.length === 0) return false
  return !gates.some((gate) => {
    const code = codeOf(gate.character) ?? ''
    return code.length > pending.length && code.startsWith(pending)
  })
}

/** The gate about to arrive: the one a send is most likely aimed at. */
export function nearestGate(gates: readonly Gate[]): Gate | null {
  return gates.reduce<Gate | null>(
    (nearest, gate) => (!nearest || gate.distance < nearest.distance ? gate : nearest),
    null,
  )
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
 *
 * A wrong send also reveals the nearest gate's code (`hinted`), the one the
 * player was most likely trying. That gate can still be cleared, but only as
 * an assisted clear: through the gate, with nothing scored for it.
 */
export function send(state: RunnerState, character: string): Sent {
  if (isOver(state)) return { state, cleared: null, blamed: null, hinted: null }

  const wanted = character.trim().toUpperCase()
  const target = nearestGate(state.gates.filter((gate) => gate.character === wanted))

  if (!target) {
    const only = state.gates[0]
    const blamed =
      only && !only.wrong && state.gates.every((gate) => gate.character === only.character)
        ? only
        : null
    const nearest = nearestGate(state.gates)
    const gates = state.gates.map((gate) => {
      const blame = gate.id === blamed?.id
      const hint = gate.id === nearest?.id && !gate.hinted
      if (!blame && !hint) return gate
      return { ...gate, ...(blame && { wrong: true }), ...(hint && { hinted: true }) }
    })
    return {
      state: { ...state, gates, streak: 0, wrong: state.wrong + 1 },
      cleared: null,
      blamed,
      hinted: nearest === null ? null : (gates.find((gate) => gate.id === nearest.id) ?? null),
    }
  }

  if (target.hinted) {
    // Through the gate, but the code was on it: no points, no XP, no streak,
    // and no correct answer for the schedule.
    return {
      state: {
        ...state,
        gates: state.gates.filter((gate) => gate.id !== target.id),
        cleared: state.cleared + 1,
        assisted: state.assisted + 1,
        outcomes: logged(state.outcomes, true),
      },
      cleared: target,
      blamed: null,
      hinted: null,
    }
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
      passed: [...state.passed, target.character],
      outcomes: logged(state.outcomes, true),
    },
    cleared: target,
    blamed: null,
    hinted: null,
  }
}

/** Gates cleared from memory, without a hint: the correct answers a run is evidence of. */
export function fromMemory(state: RunnerState): number {
  return state.cleared - state.assisted
}

/** End the run now, keeping everything it scored. */
export function endRun(state: RunnerState): RunnerState {
  return isOver(state) ? state : { ...state, quit: true }
}

export function isOver(state: RunnerState): boolean {
  return state.lives <= 0 || state.quit
}

/** Characters the player actually keyed: gates cleared and wrong sends. */
export function sends(state: RunnerState): number {
  return state.cleared + state.wrong
}

/** XP for the run: the same per-character award as a correct practice answer. */
export function runXp(state: RunnerState): number {
  return state.passed.reduce((sum, character) => sum + xpForAnswer(character), 0)
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
