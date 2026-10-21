import { describe, expect, it, vi } from 'vitest'
import {
  type Attempt,
  type SessionConfig,
  MAX_RUN,
  NEXT_PROMPT_DELAY_MS,
  SCORE,
  SMALL_POOL,
  charsPerMinute,
  clockElapsed,
  difficultyWeight,
  holdClock,
  isFinished,
  pickNext,
  promptSequence,
  releaseClock,
  remainingMs,
  seededPrompts,
  startClock,
  summarize,
} from './session'
import { LEARNING_ORDER } from '../data/morseAlphabet'
import { createRandom, seedFrom } from './random'
import { type ReviewState, newReviewState, review } from './spacedRepetition'

const T0 = 1_700_000_000_000

const attempt = (character: string, correct: boolean, elapsedMs = 1000): Attempt => ({
  character,
  answer: correct ? character : '?',
  correct,
  elapsedMs,
})

/** `n` attempts, `hits` of them correct. */
const run = (n: number, hits: number, character = 'E'): Attempt[] =>
  Array.from({ length: n }, (_, i) => attempt(character, i < hits))

describe('difficultyWeight', () => {
  it('pays more for longer characters', () => {
    expect(difficultyWeight('Q')).toBeGreaterThan(difficultyWeight('E'))
  })

  it('is 1 for a single-element character', () => {
    expect(difficultyWeight('E')).toBe(1)
    expect(difficultyWeight('T')).toBe(1)
  })

  it('never goes to zero or below for an unknown character', () => {
    // codeLength returns 0 for anything unmapped; a negative weight would
    // subtract points for answering.
    expect(difficultyWeight('🚀')).toBeGreaterThan(0)
  })
})

describe('summarize', () => {
  it('reads an empty session as 0 accuracy, not as perfect', () => {
    const summary = summarize([], 60_000)
    expect(summary).toMatchObject({ total: 0, correct: 0, accuracy: 0, score: 0, wpm: 0 })
  })

  it('counts correct answers and accuracy', () => {
    const summary = summarize(run(10, 7), 60_000)
    expect(summary.correct).toBe(7)
    expect(summary.total).toBe(10)
    expect(summary.accuracy).toBeCloseTo(0.7, 6)
  })

  it('punishes guessing: twice the speed at half the accuracy scores worse', () => {
    // This is the §34 requirement made concrete. A linear accuracy term would
    // make these two equal, and the fast guesser would then be the optimal
    // player — exactly what §34 says the score must not reward.
    const careful = summarize(run(20, 20), 60_000)
    const guesser = summarize(run(40, 20), 60_000)

    expect(guesser.correct).toBe(careful.correct)
    expect(guesser.score).toBeLessThan(careful.score)
  })

  it('still rewards speed at equal accuracy', () => {
    // 100 correct in 90s is ~13 WPM, in 60s is 20 — both inside the range where
    // the multiplier is not clamped.
    const slow = summarize(run(100, 100), 90_000)
    const fast = summarize(run(100, 100), 60_000)
    expect(fast.score).toBeGreaterThan(slow.score)
  })

  it('stops differentiating below the floor, so a slow learner is not punished twice', () => {
    // Under 10 WPM everyone gets the same multiplier. Accuracy is what a
    // learner at this speed should be optimising, and it already dominates.
    const verySlow = summarize(run(20, 20), 600_000)
    const slightlyFaster = summarize(run(20, 20), 300_000)
    expect(slightlyFaster.score).toBe(verySlow.score)
  })

  it('caps what speed alone can buy', () => {
    // Both of these are past the ceiling, so they must score identically.
    const fast = summarize(run(100, 100), 20_000)
    const absurd = summarize(run(100, 100), 200)
    expect(absurd.score).toBe(fast.score)
  })

  it('does not let a careful beginner score zero for being slow', () => {
    const summary = summarize(run(10, 10), 600_000)
    expect(summary.score).toBeGreaterThan(0)
  })

  it('scores a perfect run at the reference speed near the plain point total', () => {
    // 100 characters in 60s is exactly 20 WPM, the neutral multiplier.
    const summary = summarize(run(100, 100), 60_000)
    expect(summary.wpm).toBeCloseTo(SCORE.referenceWpm, 6)
    expect(summary.score).toBe(100 * SCORE.perCorrect)
  })

  it('ranks missed characters by how often they were missed', () => {
    const summary = summarize(
      [attempt('Q', false), attempt('Q', false), attempt('Z', false), attempt('E', true)],
      30_000,
    )
    expect(summary.weakest).toEqual([
      { character: 'Q', misses: 2 },
      { character: 'Z', misses: 1 },
    ])
  })

  it('lists nothing as weak after a clean run', () => {
    expect(summarize(run(5, 5), 10_000).weakest).toEqual([])
  })
})

describe('pickNext', () => {
  const always = (value: number) => () => value

  it('returns null for an empty pool', () => {
    expect(pickNext([])).toBeNull()
  })

  it('returns the only character available', () => {
    expect(pickNext(['E'])).toBe('E')
  })

  it('avoids repeating what was just shown in a pool of four or more', () => {
    const picked = pickNext(['E', 'T', 'A', 'N'], { recent: ['E'], random: always(0) })
    expect(picked).not.toBe('E')
  })

  it('keeps avoiding the last two prompts in a larger pool', () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickNext(['E', 'T', 'A', 'N'], { recent: ['A', 'E'] })
      expect(['T', 'N']).toContain(picked)
    }
  })

  it('repeats rather than deadlocking when the pool is too small to avoid it', () => {
    // With two characters and an avoid-last of two, refusing to repeat would
    // leave nothing to pick and the session would stall.
    const picked = pickNext(['E', 'T'], { recent: ['T', 'E'], avoidLast: 2 })
    expect(['E', 'T']).toContain(picked)
  })

  it('prefers what is due when schedules are supplied', () => {
    // T has been answered correctly and is scheduled well into the future; E
    // has never been seen and is due now.
    const schedules = {
      E: newReviewState(T0),
      T: review(review(newReviewState(T0), true, T0), true, T0),
    }
    const picks = new Set(
      Array.from({ length: 20 }, () => pickNext(['E', 'T'], { schedules, now: T0 })),
    )
    expect(picks).toEqual(new Set(['E']))
  })

  it('only ever returns a character from the pool', () => {
    const pool = ['E', 'T', 'A', 'N']
    for (let i = 0; i < 50; i++) {
      expect(pool).toContain(pickNext(pool))
    }
  })
})

/** The longest run of one prompt in a sequence. */
function longestRun(sequence: readonly string[]): number {
  let longest = 0
  let run = 0
  for (let i = 0; i < sequence.length; i++) {
    run = i > 0 && sequence[i] === sequence[i - 1] ? run + 1 : 1
    longest = Math.max(longest, run)
  }
  return longest
}

/** Picks drawn the way the screen draws them: each one remembered as recent. */
function draw(
  pool: readonly string[],
  count: number,
  random: () => number,
  schedulesFor?: (now: number) => Record<string, ReviewState>,
  after?: (character: string, now: number) => void,
): string[] {
  const out: string[] = []
  let recent: string[] = []
  for (let i = 0; i < count; i++) {
    const now = T0 + i * 3000
    const picked = pickNext(pool, { recent, random, now, schedules: schedulesFor?.(now) })!
    out.push(picked)
    recent = [...recent, picked].slice(-4)
    after?.(picked, now)
  }
  return out
}

describe('pickNext in a small pool (J-02)', () => {
  it('treats three letters or fewer as a small pool, with runs of at most two', () => {
    expect(SMALL_POOL).toBe(3)
    expect(MAX_RUN).toBe(2)
  })

  it('does not alternate E and T: repeats and switches both occur, never three in a row', () => {
    const sequence = draw(['E', 'T'], 200, createRandom(seedFrom('et-200')))
    const repeats = sequence.filter((c, i) => i > 0 && c === sequence[i - 1]).length
    const switches = sequence.filter((c, i) => i > 0 && c !== sequence[i - 1]).length
    expect(repeats).toBeGreaterThan(20)
    expect(switches).toBeGreaterThan(20)
    expect(longestRun(sequence)).toBe(MAX_RUN)
  })

  it('cannot be predicted from the previous prompt', () => {
    // If the next prompt were always "the other one", knowing the last answer
    // would answer this one. Over many draws, after an E both E and T follow.
    const sequence = draw(['E', 'T'], 400, createRandom(seedFrom('predict')))
    const afterE = new Set(sequence.filter((_, i) => i > 0 && sequence[i - 1] === 'E'))
    expect(afterE).toEqual(new Set(['E', 'T']))
  })

  it('refuses a third identical prompt in a row', () => {
    expect(pickNext(['E', 'T'], { recent: ['E', 'E'], random: () => 0 })).toBe('T')
    expect(pickNext(['E', 'T', 'A'], { recent: ['T', 'A', 'A'], random: () => 0.99 })).not.toBe('A')
  })

  it('allows a second identical prompt', () => {
    expect(pickNext(['E', 'T'], { recent: ['T', 'E'], random: () => 0 })).toBe('E')
  })

  it('does not turn three letters into a fixed rotation', () => {
    const sequence = draw(['E', 'T', 'A'], 300, createRandom(seedFrom('rotation')))
    const rotation = sequence.every((c, i) => i < 3 || c === sequence[i - 3])
    expect(rotation).toBe(false)
    expect(longestRun(sequence)).toBeLessThanOrEqual(MAX_RUN)
    expect(new Set(sequence)).toEqual(new Set(['E', 'T', 'A']))
  })

  it('does not alternate either when review schedules decide the order', () => {
    // The drill and "My method" pass schedules. With nothing due, "soonest
    // due" in a pool of two is simply the other letter, every time.
    const schedules: Record<string, ReviewState> = {
      E: review(newReviewState(T0 - 60_000), true, T0 - 60_000),
      T: review(newReviewState(T0 - 30_000), true, T0 - 30_000),
    }
    const sequence = draw(
      ['E', 'T'],
      60,
      createRandom(seedFrom('scheduled')),
      () => ({ ...schedules }),
      (character, now) => {
        schedules[character] = review(schedules[character]!, true, now)
      },
    )
    const alternating = sequence.every((c, i) => i === 0 || c !== sequence[i - 1])
    expect(alternating).toBe(false)
    expect(longestRun(sequence)).toBeLessThanOrEqual(MAX_RUN)
  })

  it('still puts a due character first in a small pool', () => {
    const schedules = {
      E: newReviewState(T0),
      T: review(review(newReviewState(T0), true, T0), true, T0),
    }
    for (let i = 0; i < 20; i++) {
      expect(pickNext(['E', 'T'], { schedules, now: T0, recent: ['T'] })).toBe('E')
    }
  })

  it('keeps a seeded two-letter run reproducible, and capped at two in a row', () => {
    const a = promptSequence(['E', 'T'], seedFrom('pair'), 120)
    const b = promptSequence(['E', 'T'], seedFrom('pair'), 120)
    expect(a).toEqual(b)
    expect(longestRun(a)).toBeLessThanOrEqual(MAX_RUN)
    expect(a.join('')).not.toBe('ET'.repeat(60))
    expect(a.join('')).not.toBe('TE'.repeat(60))
  })
})

describe('the session clock (A-06)', () => {
  it('waits seven tenths of a second before the next listening prompt', () => {
    expect(NEXT_PROMPT_DELAY_MS).toBe(700)
  })

  it('runs with the wall clock until it is held', () => {
    const clock = startClock(1000)
    expect(clockElapsed(clock, 1000)).toBe(0)
    expect(clockElapsed(clock, 5000)).toBe(4000)
  })

  it('reads the same while held, and credits the hold back on release', () => {
    const held = holdClock(startClock(0), 10_000)
    expect(clockElapsed(held, 10_000)).toBe(10_000)
    expect(clockElapsed(held, 10_700)).toBe(10_000)
    const released = releaseClock(held, 10_700)
    expect(released.creditedMs).toBe(700)
    expect(clockElapsed(released, 11_700)).toBe(11_000)
  })

  it('cannot count a hold twice', () => {
    const once = holdClock(startClock(0), 1000)
    expect(holdClock(once, 1500)).toBe(once)
    const released = releaseClock(once, 1700)
    expect(releaseClock(released, 2000)).toBe(released)
    expect(released.creditedMs).toBe(700)
  })

  it('gives a 60-second run exactly 60 seconds of answering, however many pauses it had', () => {
    // A run that answers every 1.2 s of its own time, each answer followed by
    // the pause. It must end at wall time 60 s + N × 700 ms, with an elapsed
    // time of 60 s, and the N pauses must not have cost it any answers.
    const config: SessionConfig = {
      mode: 'listening',
      characters: ['E'],
      durationMs: 60_000,
      target: null,
    }
    let clock = startClock(0)
    let wall = 0
    let answers = 0
    while (!isFinished(config, [], clockElapsed(clock, wall + 1200))) {
      wall += 1200
      answers += 1
      clock = holdClock(clock, wall)
      wall += NEXT_PROMPT_DELAY_MS
      clock = releaseClock(clock, wall)
    }
    const end = wall + (60_000 - clockElapsed(clock, wall))
    expect(clockElapsed(clock, end)).toBe(60_000)
    expect(end - answers * NEXT_PROMPT_DELAY_MS).toBe(60_000)
    expect(remainingMs(config, clockElapsed(clock, end))).toBe(0)
    expect(answers).toBe(Math.floor(59_999 / 1200))
  })

  it('never reads negative', () => {
    expect(clockElapsed(startClock(5000), 1000)).toBe(0)
  })
})

describe('isFinished / remainingMs', () => {
  const timed: SessionConfig = {
    mode: 'listening',
    characters: ['E'],
    durationMs: 60_000,
    target: null,
  }
  const counted: SessionConfig = {
    mode: 'listening',
    characters: ['E'],
    durationMs: null,
    target: 5,
  }
  const open: SessionConfig = {
    mode: 'listening',
    characters: ['E'],
    durationMs: null,
    target: null,
  }

  it('ends a timed session exactly at the limit', () => {
    expect(isFinished(timed, [], 59_999)).toBe(false)
    expect(isFinished(timed, [], 60_000)).toBe(true)
  })

  it('ends a counted session on the last answer', () => {
    expect(isFinished(counted, run(4, 4), 0)).toBe(false)
    expect(isFinished(counted, run(5, 5), 0)).toBe(true)
  })

  it('never ends an open session on its own', () => {
    expect(isFinished(open, run(500, 500), 10_000_000)).toBe(false)
  })

  it('reports time left, never negative', () => {
    expect(remainingMs(timed, 0)).toBe(60_000)
    expect(remainingMs(timed, 59_000)).toBe(1000)
    expect(remainingMs(timed, 90_000)).toBe(0)
    expect(remainingMs(open, 1000)).toBeNull()
  })
})

describe('difficultyWeight on multi-character prompts', () => {
  it('sums across the prompt rather than reading one character', () => {
    // Reading a single codeLength returned 0 for anything longer than one
    // character, which made a five-letter group worth less than an E.
    expect(difficultyWeight('EEEEE')).toBeCloseTo(5, 6)
    expect(difficultyWeight('EEEEE')).toBeGreaterThan(difficultyWeight('E'))
  })

  it('pays more for a group of hard characters than easy ones', () => {
    expect(difficultyWeight('QQQQQ')).toBeGreaterThan(difficultyWeight('EEEEE'))
  })

  it('ignores spaces', () => {
    expect(difficultyWeight('CQ CQ')).toBeCloseTo(difficultyWeight('CQCQ'), 6)
  })

  it('never returns zero, whatever it is given', () => {
    expect(difficultyWeight('')).toBeGreaterThan(0)
    expect(difficultyWeight('   ')).toBeGreaterThan(0)
    expect(difficultyWeight('🚀🚀')).toBeGreaterThan(0)
  })
})

describe('seededPrompts', () => {
  const pool = LEARNING_ORDER.slice(0, 14)

  it('gives two people the same prompts in the same order', () => {
    // The whole point of a shared challenge (flow audit B5): two browsers on
    // one link must be asked the same thing.
    const a = promptSequence(pool, seedFrom('k7f3'), 120)
    const b = promptSequence(pool, seedFrom('k7f3'), 120)
    expect(a).toEqual(b)
    expect(a).toHaveLength(120)
  })

  it('gives a different sequence for a different seed', () => {
    expect(promptSequence(pool, seedFrom('k7f3'), 40)).not.toEqual(
      promptSequence(pool, seedFrom('k7f4'), 40),
    )
  })

  it('only ever asks for characters in the pool', () => {
    for (const prompt of promptSequence(pool, seedFrom('pool'), 300)) {
      expect(pool).toContain(prompt)
    }
  })

  it('reaches every character in the pool over a minute of prompts', () => {
    expect(new Set(promptSequence(pool, seedFrom('spread'), 200)).size).toBe(pool.length)
  })

  it('never repeats the previous prompt when the pool allows it', () => {
    const sequence = promptSequence(pool, seedFrom('repeat'), 200)
    for (let i = 1; i < sequence.length; i++) expect(sequence[i]).not.toBe(sequence[i - 1])
  })

  it('does not touch Math.random, so nothing personal leaks into the order', () => {
    const spy = vi.spyOn(Math, 'random')
    promptSequence(pool, seedFrom('pure'), 50)
    expect(spy).not.toHaveBeenCalled()
    spy.mockRestore()
  })

  it('is the same whether read in one go or one at a time', () => {
    const source = seededPrompts(pool, seedFrom('steps'))
    const stepped = Array.from({ length: 30 }, () => source.next())
    expect(stepped).toEqual(promptSequence(pool, seedFrom('steps'), 30))
  })

  it('returns null for an empty pool rather than throwing', () => {
    expect(seededPrompts([], 1).next()).toBeNull()
    expect(promptSequence([], 1, 5)).toEqual([])
  })

  it('works on a two-letter pool without deadlocking', () => {
    const sequence = promptSequence(['E', 'T'], seedFrom('et'), 20)
    expect(sequence).toHaveLength(20)
    expect(new Set(sequence)).toEqual(new Set(['E', 'T']))
  })
})

describe('charsPerMinute', () => {
  it('is correct answers per minute, the honest unit for a typed answer', () => {
    // 30 correct in 60 seconds is 30 a minute, which the summary stores as
    // 6 "WPM" by the five-characters-a-word convention.
    const summary = summarize(run(30, 30), 60_000)
    expect(summary.wpm).toBeCloseTo(6, 6)
    expect(charsPerMinute(summary)).toBe(30)
  })

  it('is zero for an empty run', () => {
    expect(charsPerMinute(summarize([], 0))).toBe(0)
  })
})
