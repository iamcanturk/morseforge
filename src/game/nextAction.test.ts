import { describe, expect, it } from 'vitest'
import { getPage } from '../config/pages'
import { LESSON_STAGES as SCREEN_STAGES, currentStageIndex } from '../components/Lesson/lesson'
import { MORSE_ALPHABET } from '../data/morseAlphabet'
import { type DailyRecord, emptyDaily, recordDaily } from '../storage/daily'
import { type ProgressRecord, answer, emptyProgress, markSeen } from '../storage/progress'
import { type StatsRecord, defaultStats } from '../storage/stats'
import { LINES, dailyKey } from './dailyChallenge'
import { LEVEL_REQUIREMENTS, SKILLS, type Skill, masteryLevel } from './mastery'
import {
  LESSON_STAGES,
  MASTERY_RULE,
  WEAK_SKILL_ACCURACY,
  hasSentFirstSignal,
  lessonStagesDone,
  nextBestAction,
} from './nextAction'
import { SIXTY_SECOND_CHALLENGE } from './session'

const NOW = Date.UTC(2026, 9, 21, 12, 0, 0)
const DAY = 86_400_000

const signalled = (): StatsRecord => ({ ...defaultStats(), elementsSent: 3, firstSignalAt: NOW })

/** Answer every character of the first `stages` stages correctly once. */
function teach(stages: number, record: ProgressRecord = emptyProgress()): ProgressRecord {
  return LESSON_STAGES.slice(0, stages)
    .flat()
    .reduce((next, character) => answer(next, character, 'recognition', true, NOW), record)
}

function drill(
  record: ProgressRecord,
  skill: Skill,
  attempts: number,
  correct: number,
): ProgressRecord {
  let next = record
  for (let index = 0; index < attempts; index++) {
    next = answer(next, 'E', skill, index < correct, NOW)
  }
  return next
}

const dailyOn = (date: string, record: DailyRecord = emptyDaily()): DailyRecord =>
  recordDaily(record, { date, accuracy: 1, score: 10, passed: true, completed: true })

const allTaught = () => teach(LESSON_STAGES.length)

describe('nextBestAction', () => {
  it('sends a brand-new learner to lesson 1', () => {
    const action = nextBestAction(emptyProgress(), defaultStats(), emptyDaily(), NOW)
    expect(action.id).toBe('first-signal')
    expect(action.label).toBe('Start lesson 1')
    expect(action.href).toBe('/learn/')
    for (const character of LESSON_STAGES[0]!) expect(action.reason).toContain(character)
  })

  it('says the first stage is the shortest characters, which the alphabet confirms', () => {
    const lengths = Object.values(MORSE_ALPHABET).map((code) => code.length)
    const shortest = Math.min(...lengths)
    const ofThatLength = Object.entries(MORSE_ALPHABET)
      .filter(([, code]) => code.length === shortest)
      .map(([character]) => character)
    expect([...LESSON_STAGES[0]!].sort()).toEqual(ofThatLength.sort())
  })

  it('sends someone taught by ear but never keyed to the telegraph', () => {
    const action = nextBestAction(teach(2), defaultStats(), emptyDaily(), NOW)
    expect(action.id).toBe('first-signal')
    expect(action.href).toBe('/telegraph/')
  })

  it('treats a paid first-signal award as a sent signal', () => {
    const stats = { ...defaultStats(), firstSignalAt: NOW - DAY }
    expect(hasSentFirstSignal(stats)).toBe(true)
    expect(nextBestAction(emptyProgress(), stats, emptyDaily(), NOW).id).toBe('lesson')
  })

  it('then continues the course, one stage at a time', () => {
    const first = nextBestAction(emptyProgress(), signalled(), emptyDaily(), NOW)
    expect(first).toMatchObject({ id: 'lesson', label: 'Finish stage 1', href: '/learn/' })

    for (let stage = 1; stage < LESSON_STAGES.length; stage++) {
      const action = nextBestAction(teach(stage), signalled(), emptyDaily(), NOW)
      expect(action.id).toBe('lesson')
      expect(action.label).toBe(`Continue to stage ${stage + 1}`)
      expect(action.reason).toContain(`of ${LESSON_STAGES.length}`)
      for (const character of LESSON_STAGES[stage]!) expect(action.reason).toContain(character)
    }
  })

  it('puts the lesson ahead of the daily', () => {
    expect(nextBestAction(teach(1), signalled(), emptyDaily(), NOW).id).toBe('lesson')
  })

  it('offers the daily once the course is done and today is not', () => {
    const action = nextBestAction(allTaught(), signalled(), emptyDaily(), NOW)
    expect(action).toMatchObject({ id: 'daily', href: '/daily/' })
    expect(action.reason).toContain(`${LINES} lines`)
    expect(action.reason).not.toMatch(/streak going/)
  })

  it('names the running daily streak, counted through yesterday', () => {
    const daily = dailyOn(dailyKey(NOW - DAY), dailyOn(dailyKey(NOW - 2 * DAY)))
    const action = nextBestAction(allTaught(), signalled(), daily, NOW)
    expect(action.id).toBe('daily')
    expect(action.reason).toContain('2-day daily streak')
  })

  it('moves past the daily once today is recorded', () => {
    const daily = dailyOn(dailyKey(NOW))
    expect(nextBestAction(allTaught(), signalled(), daily, NOW).id).not.toBe('daily')
  })

  it('points at the weakest skill when it is genuinely behind', () => {
    const progress = drill(allTaught(), 'listening', 10, 5)
    const action = nextBestAction(progress, signalled(), dailyOn(dailyKey(NOW)), NOW)
    expect(action).toMatchObject({
      id: 'weakest-skill',
      label: 'Practise listening',
      href: '/practice/',
    })
    expect(action.reason).toContain('50%')
    expect(action.reason).toContain(`${Math.round(WEAK_SKILL_ACCURACY * 100)}%`)
  })

  it('does not call a skill weak when everything clears the mastery bar', () => {
    const progress = drill(allTaught(), 'listening', 10, 10)
    const action = nextBestAction(progress, signalled(), dailyOn(dailyKey(NOW)), NOW)
    expect(action.id).toBe('challenge')
  })

  it('falls back to the challenge with too little evidence for a weakest skill', () => {
    const action = nextBestAction(allTaught(), signalled(), dailyOn(dailyKey(NOW)), NOW)
    const seconds = (SIXTY_SECOND_CHALLENGE.durationMs ?? 0) / 1000
    expect(action).toMatchObject({
      id: 'challenge',
      href: '/challenge/',
      label: `Take the ${seconds}-second challenge`,
    })
  })

  it('only ever links to real, indexable pages, with no unfilled copy', () => {
    const cases: [ProgressRecord, StatsRecord, DailyRecord][] = [
      [emptyProgress(), defaultStats(), emptyDaily()],
      [teach(2), defaultStats(), emptyDaily()],
      [teach(1), signalled(), emptyDaily()],
      [allTaught(), signalled(), emptyDaily()],
      [drill(allTaught(), 'sending', 10, 2), signalled(), dailyOn(dailyKey(NOW))],
      [allTaught(), signalled(), dailyOn(dailyKey(NOW))],
    ]
    const ids = new Set<string>()
    for (const [progress, stats, daily] of cases) {
      const action = nextBestAction(progress, stats, daily, NOW)
      ids.add(action.id)
      expect(getPage(action.href).indexable).toBe(true)
      expect(`${action.label} ${action.reason}`).not.toMatch(/undefined|null|NaN/)
      expect(action.label.length).toBeLessThanOrEqual(32)
    }
    expect(ids.size).toBe(5)
  })

  it('is pure: the same inputs give the same answer and nothing is mutated', () => {
    const progress = teach(3)
    const stats = signalled()
    const daily = emptyDaily()
    const frozen = JSON.stringify([progress, stats, daily])
    expect(nextBestAction(progress, stats, daily, NOW)).toEqual(
      nextBestAction(progress, stats, daily, NOW),
    )
    expect(JSON.stringify([progress, stats, daily])).toBe(frozen)
  })

  it('reads the same stages, and the same position, as the lesson screen', () => {
    expect(LESSON_STAGES).toEqual(SCREEN_STAGES)
    for (let stage = 0; stage <= LESSON_STAGES.length; stage++) {
      expect(lessonStagesDone(teach(stage), NOW)).toBe(currentStageIndex(teach(stage), NOW))
    }
    // Counted as a run from stage 1: the second stage alone is not one stage done.
    const skipped = LESSON_STAGES[1]!.reduce(
      (record, character) => answer(record, character, 'recognition', true, NOW),
      emptyProgress(),
    )
    expect(lessonStagesDone(skipped, NOW)).toBe(0)
    expect(currentStageIndex(skipped, NOW)).toBe(0)
  })
})

describe('the header chip rule (Header.astro)', () => {
  // The chip re-states lessonStagesDone in a few inline lines, from the raw
  // record: "a character passes once some skill has a correct answer". These
  // pin that this is exactly the bar lessonStagesDone uses, so changing one
  // without the other fails here.
  it('passes a stage character exactly when some skill has a correct answer', () => {
    for (const skill of SKILLS) {
      for (const correct of [false, true]) {
        const record = answer(emptyProgress(), 'E', skill, correct, NOW)
        const stage = LESSON_STAGES[0]!.reduce(
          (next, character) =>
            character === 'E' ? next : answer(next, character, 'listening', true, NOW),
          record,
        )
        expect(lessonStagesDone(stage, NOW) >= 1, `${skill} ${correct}`).toBe(correct)
      }
    }
  })

  it('does not count a seen but unanswered character', () => {
    const seenOnly = LESSON_STAGES[0]!.reduce(
      (record, character) => markSeen(record, character, NOW),
      emptyProgress(),
    )
    expect(lessonStagesDone(seenOnly, NOW)).toBe(0)
  })

  it('keeps the digits in the stages, so the chip does not skip them', () => {
    const flat = LESSON_STAGES.flat()
    for (const digit of '0123456789') expect(flat).toContain(digit)
  })
})

describe('the mastery sentence', () => {
  const { minAttemptsPerSkill, minScore } = LEVEL_REQUIREMENTS[5]
  const bar = Math.round(minScore * 100)

  it('quotes the thresholds the code applies', () => {
    expect(MASTERY_RULE).toBe(
      `at least ${minAttemptsPerSkill} tries in each of the three skills and an average of ${bar}% across them`,
    )
  })

  it('describes masteryLevel: an average, not every skill at the bar', () => {
    const n = minAttemptsPerSkill
    // One skill under the bar, the average over it: Mastered, as the sentence says.
    const low = Math.ceil(n * (minScore - 0.15))
    const mixed = {
      recognition: { attempts: n, correct: n },
      listening: { attempts: n, correct: n },
      sending: { attempts: n, correct: low },
    }
    const average = (1 + 1 + low / n) / 3
    expect(low / n).toBeLessThan(minScore)
    expect(average).toBeGreaterThanOrEqual(minScore)
    expect(masteryLevel(mixed, true)).toBe(5)

    // Every skill perfect but one a try short: not Mastered.
    const short = { ...mixed, sending: { attempts: n - 1, correct: n - 1 } }
    expect(masteryLevel(short, true)).toBeLessThan(5)
  })

  it('is the sentence the weakest-skill nudge gives', () => {
    const progress = drill(allTaught(), 'listening', 10, 5)
    const action = nextBestAction(progress, signalled(), dailyOn(dailyKey(NOW)), NOW)
    expect(action.reason).toContain(MASTERY_RULE)
    expect(action.reason).not.toContain('all three reach')
  })
})
