import { describe, expect, it } from 'vitest'
import {
  RAMP_MS,
  advance as advanceDefender,
  isOver as defenderOver,
  newDefenderGame,
  shoot,
} from './defender'
import { advance as advanceRunner, isOver as runnerOver, newRunnerGame, send } from './runner'
import { createRandom } from './random'
import { ALL_LETTERS } from '../data/morseAlphabet'

/**
 * Can these games actually be played?
 *
 * The unit tests check each rule in isolation. They would all still pass if
 * the difficulty curve made the game unwinnable, or unloseable, or if it ended
 * in four seconds — and none of that is visible in a rule.
 *
 * So these play whole games against a simulated player, and the assertions are
 * the two things that would make a game not worth shipping: a competent player
 * must last, and a passive one must lose.
 *
 * **The player is serial**, and that is the part that matters. A first version
 * of these tests let the simulation answer any number of prompts in the same
 * instant, which is not a player — it is a machine gun. Narrowing the runner's
 * gates from 34 metres to 8, which makes the game flatly impossible, did not
 * fail a single test. A real player works one character at a time, so this one
 * does too: it picks the most urgent prompt, spends its reaction time on that
 * one alone, and everything else keeps coming while it does.
 */

/** Someone who can only deal with one thing at a time. Which is everyone. */
class SerialPlayer {
  private busyUntil = 0
  private working: number | null = null

  constructor(private readonly reactionMs: number) {}

  /**
   * What to answer now, if anything.
   *
   * `queue` is the prompts on screen, most urgent first. Returns the answer to
   * send, or null while still working on one — or while nothing is up.
   */
  next<T extends { id: number; character: string }>(queue: readonly T[], clock: number): T | null {
    if (!Number.isFinite(this.reactionMs)) return null

    const current = queue.find((item) => item.id === this.working)
    if (current && clock >= this.busyUntil) {
      this.working = null
      return current
    }

    // Gave up on one that left the screen, or free to start the next.
    if (!current) this.working = null
    if (this.working === null && queue.length > 0) {
      this.working = queue[0]!.id
      this.busyUntil = clock + this.reactionMs
    }
    return null
  }
}

/** A frame, in milliseconds. Games are driven at 60fps. */
const FRAME = 16

/**
 * Human reaction time for a character you know cold, read from its code.
 * Deliberately unkind.
 */
const REACTION_MS = 700

describe('Signal Defender is playable', () => {
  /**
   * Plays for `seconds`, answering each signal `reactionMs` after it appears.
   * Returns the state and how far it got.
   */
  function play(seconds: number, reactionMs: number, from = 0) {
    const random = createRandom(3)
    const player = new SerialPlayer(reactionMs)
    // `from` starts the game at a point on the difficulty ramp, so two equal
    // windows can be compared without threading a timeline through.
    let state = { ...newDefenderGame(), elapsedMs: from }
    let clock = 0

    while (clock < seconds * 1000 && !defenderOver(state)) {
      state = advanceDefender(state, FRAME, ALL_LETTERS, random).state
      clock += FRAME

      // Lowest first: the one about to land is the one worth dealing with.
      const urgent = [...state.signals].sort((a, b) => b.y - a.y)
      const answer = player.next(urgent, clock)
      if (answer) state = shoot(state, answer.character).state
    }
    return { state, seconds: clock / 1000 }
  }

  it('lets a competent player last a long time', () => {
    // If a 700ms reaction cannot survive two minutes, the curve is wrong and
    // the game is a punishment rather than a measurement.
    const { state, seconds } = play(150, REACTION_MS)
    expect(seconds).toBeGreaterThan(120)
    expect(state.hits).toBeGreaterThan(40)
    expect(state.score).toBeGreaterThan(0)
  })

  it('ends promptly for someone who does nothing', () => {
    // And if doing nothing takes five minutes to lose, there is no pressure.
    const { state, seconds } = play(120, Infinity)
    expect(defenderOver(state)).toBe(true)
    expect(seconds).toBeLessThan(40)
  })

  it('gets harder: the same thirty seconds is busier later in the ramp', () => {
    // Compared as two equal windows rather than as a short run against a long
    // one. Rates over runs of different lengths are dominated by the opening
    // pause, so that version passed even with the difficulty ramp removed
    // entirely — it was measuring arithmetic, not the game.
    const opening = play(30, REACTION_MS, 0)
    const endgame = play(30, REACTION_MS, RAMP_MS)
    expect(endgame.state.hits).toBeGreaterThan(opening.state.hits)
  })

  it('is beatable by a fast player for a very long run', () => {
    const { state } = play(300, 400)
    expect(state.hits).toBeGreaterThan(150)
  })

  it('gives a learner who has to read each code, not a letter, a real run', () => {
    // A falling signal shows only its code (DEC-027), so a beginner spends
    // time decoding the dots and dashes before typing. At a second and a half
    // a code they must still get over a minute and dozens of hits, or the game
    // only works for people who no longer need it.
    const { state, seconds } = play(150, 1500)
    expect(seconds).toBeGreaterThan(60)
    expect(state.hits).toBeGreaterThan(30)
  })
})

describe('Morse Runner is playable', () => {
  /** Keys each gate `reactionMs` after it appears. */
  function play(seconds: number, reactionMs: number) {
    const random = createRandom(5)
    const player = new SerialPlayer(reactionMs)
    let state = newRunnerGame()
    let clock = 0

    while (clock < seconds * 1000 && !runnerOver(state)) {
      state = advanceRunner(state, FRAME, ALL_LETTERS, random).state
      clock += FRAME

      // Nearest first.
      const urgent = [...state.gates].sort((a, b) => a.distance - b.distance)
      const answer = player.next(urgent, clock)
      if (answer) state = send(state, answer.character).state
    }
    return { state, seconds: clock / 1000 }
  }

  it('lets a player who can key a character in two seconds keep running', () => {
    // Two seconds is a realistic time to key a character on a straight key,
    // including deciding what it is. If that cannot clear a gate, the game is
    // asking for something nobody can do.
    const { state, seconds } = play(150, 2000)
    expect(seconds).toBeGreaterThan(120)
    expect(state.cleared).toBeGreaterThan(20)
    expect(state.distance).toBeGreaterThan(1000)
  })

  it('ends promptly for someone who never keys anything', () => {
    const { state, seconds } = play(120, Infinity)
    expect(runnerOver(state)).toBe(true)
    expect(seconds).toBeLessThan(60)
  })

  it('carries a beginner who needs the hint for every gate', () => {
    // A gate shows only its letter (DEC-032). Someone who does not know the
    // codes yet keys a wrong guess, sees the code, then keys it from the
    // hint: two characters per gate. The hint has to arrive soon enough for
    // that to get through, or the game shuts out exactly the people it is for.
    const random = createRandom(5)
    let state = newRunnerGame()
    let clock = 0
    let busyUntil = 0
    while (clock < 150_000 && !runnerOver(state)) {
      state = advanceRunner(state, FRAME, ALL_LETTERS, random).state
      clock += FRAME
      if (clock < busyUntil) continue
      const nearest = [...state.gates].sort((a, b) => a.distance - b.distance)[0]
      if (!nearest) continue
      // A guess, then the code read off the hint, each taking a beat to key.
      state = send(state, nearest.hinted ? nearest.character : '?').state
      busyUntil = clock + 1500
    }
    expect(clock / 1000).toBeGreaterThan(120)
    expect(state.assisted).toBeGreaterThan(20)
    expect(state.passed).toEqual([])
    expect(state.score).toBe(0)
  })

  it('still leaves time at full speed', () => {
    // The hardest the game ever gets, played by someone taking two seconds per
    // character and able to key only one at a time. Starts already at the end
    // of the difficulty ramp.
    const random = createRandom(9)
    const player = new SerialPlayer(2000)
    let state = { ...newRunnerGame(), elapsedMs: 600_000 }
    let clock = 0

    while (clock < 60_000 && !runnerOver(state)) {
      state = advanceRunner(state, FRAME, ALL_LETTERS, random).state
      clock += FRAME
      const urgent = [...state.gates].sort((a, b) => a.distance - b.distance)
      const answer = player.next(urgent, clock)
      if (answer) state = send(state, answer.character).state
    }
    expect(runnerOver(state)).toBe(false)
  })
})
