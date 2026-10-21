import { describe, expect, it } from 'vitest'
import {
  LOW_ACCURACY,
  PASS_ACCURACY,
  SCORE_RULE,
  accuracyTone,
  lessonPath,
  nextStep,
  offersLessonPath,
  resultAnnouncement,
} from './SessionResult'
import { LESSON_STAGES, LESSON_ORDER, currentStageIndex } from '../Lesson/lesson'
import { LEARNING_STAGES } from '../../data/morseAlphabet'
import { answer, emptyProgress, type ProgressRecord } from '../../storage/progress'
import { SCORE, type SessionSummary } from '../../game/session'
import { LEVEL_REQUIREMENTS } from '../../game/mastery'

const NOW = Date.UTC(2026, 9, 21, 12)

function through(characters: readonly string[]): ProgressRecord {
  let progress = emptyProgress()
  for (const character of characters) {
    progress = answer(progress, character, 'listening', true, NOW)
  }
  return progress
}

describe('the result screen’s "next" link', () => {
  it('starts a new learner on lesson 1', () => {
    expect(nextStep(currentStageIndex(emptyProgress(), NOW))).toEqual({
      href: '/learn/',
      label: 'Start lesson 1',
    })
  })

  it('names the lesson stage /learn/ will open, in the word /learn/ uses (J-15)', () => {
    for (const done of [2, 4, 6]) {
      const stage = currentStageIndex(through(LESSON_STAGES.slice(0, done).flat()), NOW)
      expect(nextStep(stage)).toEqual({ href: '/learn/', label: `Stage ${done + 1}` })
    }
  })

  it('never says "Lesson N" for a stage', () => {
    for (let stage = 1; stage < LESSON_STAGES.length; stage++) {
      expect(nextStep(stage).label).not.toMatch(/Lesson/)
    }
  })

  it('keeps someone with every letter but no digits on the lesson', () => {
    const stage = currentStageIndex(through(LEARNING_STAGES.flat()), NOW)
    expect(nextStep(stage)).toEqual({ href: '/learn/', label: `Stage ${LESSON_STAGES.length}` })
  })

  it('moves on to the daily wire only once the whole course is done', () => {
    const stage = currentStageIndex(through(LESSON_ORDER), NOW)
    expect(nextStep(stage).href).toBe('/daily/')
  })
})

describe('resultAnnouncement', () => {
  const summary: SessionSummary = {
    attempts: [],
    correct: 8,
    total: 10,
    accuracy: 0.8,
    elapsedMs: 30_000,
    wpm: 3.2,
    score: 140,
    weakest: [],
  }

  it('reads accuracy, the count and the score in one sentence', () => {
    expect(resultAnnouncement(summary, false)).toBe(
      'Session over. Accuracy 80%, 8 of 10 right. Score 140.',
    )
    expect(resultAnnouncement(summary, true)).toBe(
      'Session over. Accuracy 80%, 8 of 10 decoded. Score 140.',
    )
  })
})

describe('a low challenge result (J-10)', () => {
  it('offers the lesson below 40% accuracy, and the share from there up', () => {
    expect(LOW_ACCURACY).toBe(0.4)
    expect(offersLessonPath({ accuracy: 2 / 17 })).toBe(true)
    expect(offersLessonPath({ accuracy: 0.39 })).toBe(true)
    expect(offersLessonPath({ accuracy: 0.4 })).toBe(false)
  })

  it('starts a newcomer on lesson 1, and says what it teaches from the stage itself', () => {
    const path = lessonPath(0)!
    expect(path.href).toBe('/learn/')
    expect(path.label).toBe('Start lesson 1')
    const first = LESSON_STAGES[0]!
    expect(path.line).toBe(
      `Stage 1 of the lesson teaches ${first[0]} and ${first[1]}, one at a time: see it, hear it, send it.`,
    )
  })

  it('points a learner further on at their own stage', () => {
    expect(lessonPath(2)?.label).toBe('Stage 3')
    for (const character of LESSON_STAGES[2]!) expect(lessonPath(2)?.line).toContain(character)
  })

  it('has no lesson to offer once the course is done', () => {
    expect(lessonPath(LESSON_STAGES.length)).toBeNull()
  })

  it('explains the score with the numbers summarize uses', () => {
    expect(SCORE_RULE).toContain(`${SCORE.perCorrect} points`)
    expect(SCORE_RULE).toContain(`between ${SCORE.speedFloor} and ${SCORE.speedCeiling}`)
    expect(SCORE_RULE).toContain('accuracy squared')
  })
})

describe('accuracyTone', () => {
  it('is green only at the Mastered bar, amber below it', () => {
    expect(PASS_ACCURACY).toBe(LEVEL_REQUIREMENTS[5].minScore)
    expect(accuracyTone(PASS_ACCURACY)).toBe('signal')
    expect(accuracyTone(1)).toBe('signal')
    expect(accuracyTone(PASS_ACCURACY - 0.01)).toBe('amber')
    expect(accuracyTone(2 / 17)).toBe('amber')
  })
})
