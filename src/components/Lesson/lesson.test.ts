import { describe, expect, it } from 'vitest'
import { CURRICULUM } from '../../data/curriculum'
import { LEARNING_STAGES, MORSE_ALPHABET } from '../../data/morseAlphabet'
import { METHODS } from '../../data/methods'
import { emptyProgress, answer, unlockTaught, unlockedCharacters } from '../../storage/progress'
import {
  DRILL_MIN_PROMPTS,
  LESSON_ORDER,
  LESSON_STAGES,
  TEACH_STEPS,
  HEAR_FIRST_HASH,
  commitOnTarget,
  courseProgress,
  currentStageIndex,
  drillLength,
  drillPreset,
  entryPosition,
  isCourseComplete,
  isStageComplete,
  isStageHeard,
  nextPosition,
  poolThroughStage,
  resumePosition,
  shouldHearFirst,
  stageStart,
  stageStatuses,
  targetCode,
  type LessonPosition,
} from './lesson'

const NOW = Date.UTC(2026, 9, 21)

/** A record in which every listed character has been answered correctly once. */
function taught(characters: readonly string[]) {
  return characters.reduce(
    (record, character) => answer(record, character, 'sending', true, NOW),
    emptyProgress(),
  )
}

describe('LESSON_STAGES', () => {
  it('is the 7-day plan, one stage per day', () => {
    expect(LESSON_STAGES).toHaveLength(CURRICULUM.length)
    CURRICULUM.forEach((day, index) => expect(LESSON_STAGES[index]).toEqual(day.characters))
  })

  it('teaches the digits, which the letter-only LEARNING_STAGES does not', () => {
    expect(LEARNING_STAGES.flat().some((c) => /\d/.test(c))).toBe(false)
    expect(LESSON_ORDER.filter((c) => /\d/.test(c))).toHaveLength(10)
  })

  it('teaches in exactly the Signal method order, so each stage unlocks a clean prefix', () => {
    expect(LESSON_ORDER).toEqual(METHODS.signal.order)
  })

  it('never splits a tree layer out of order: the letters are LEARNING_STAGES flattened', () => {
    expect(LESSON_ORDER.filter((c) => /[A-Z]/.test(c))).toEqual(LEARNING_STAGES.flat())
  })
})

describe('nextPosition', () => {
  it('walks see, hear, send for each character, then ends the stage', () => {
    const seen: string[] = []
    let position: LessonPosition | null = stageStart(1)
    while (position) {
      seen.push(`${LESSON_STAGES[1]![position.characterIndex]}:${position.step}`)
      const next = nextPosition(position)
      position = next.kind === 'position' ? next.position : null
      if (next.kind === 'stage-done') expect(next.stage).toBe(1)
    }
    expect(seen).toEqual(
      LESSON_STAGES[1]!.flatMap((character) => TEACH_STEPS.map((step) => `${character}:${step}`)),
    )
  })

  it('advances exactly one step from a given position, however often it is asked', () => {
    // The old timer re-ran an increment from a stale closure; this is pure.
    const from: LessonPosition = { stage: 0, characterIndex: 0, step: 'send' }
    expect(nextPosition(from)).toEqual(nextPosition(from))
    expect(nextPosition(from)).toEqual({
      kind: 'position',
      position: { stage: 0, characterIndex: 1, step: 'see' },
    })
  })
})

describe('commitOnTarget', () => {
  it('commits the target code the moment it is complete, read from the alphabet', () => {
    const rule = commitOnTarget(targetCode('A'))
    expect(rule(MORSE_ALPHABET.A!)).toBe(true)
  })

  it('waits while the keyed code is still on the way to the target', () => {
    // A dot, sending A: the dash may follow, so nothing is decided yet.
    expect(commitOnTarget(targetCode('A'))(MORSE_ALPHABET.E!)).toBe(false)
    expect(commitOnTarget(targetCode('S'))(MORSE_ALPHABET.I!)).toBe(false)
  })

  it('commits a code that can no longer become the target, so a miss is judged at once', () => {
    // A dash for E: no further element can make it E.
    expect(commitOnTarget(targetCode('E'))(MORSE_ALPHABET.T!)).toBe(true)
    // Past A and still going: R can never be A.
    expect(commitOnTarget(targetCode('A'))(MORSE_ALPHABET.R!)).toBe(true)
    // A dot then a dash for E is already over at the dot; a quick dash after it
    // starts a new character instead of reading as A or N.
    expect(commitOnTarget(targetCode('E'))(MORSE_ALPHABET.E!)).toBe(true)
  })

  it('never commits with nothing keyed', () => {
    expect(commitOnTarget(targetCode('E'))('')).toBe(false)
  })

  it('never accepts anything for an unknown character', () => {
    expect(commitOnTarget(targetCode('~'))('')).toBe(false)
  })
})

describe('the drill', () => {
  it('draws from everything taught so far, and only that', () => {
    expect(poolThroughStage(0)).toEqual(['E', 'T'])
    expect(poolThroughStage(1)).toEqual(['E', 'T', 'I', 'A', 'N', 'M'])
    expect(poolThroughStage(LESSON_STAGES.length - 1)).toEqual([...LESSON_ORDER])
  })

  it('asks two prompts per new character, never fewer than the minimum', () => {
    expect(drillLength(0)).toBe(DRILL_MIN_PROMPTS)
    expect(drillLength(6)).toBe(Math.max(LESSON_STAGES[6]!.length * 2, DRILL_MIN_PROMPTS))
    expect(drillLength(99)).toBe(0)
  })

  it('is a listening session that skips the setup form', () => {
    expect(drillPreset(2)).toEqual({
      mode: 'listening',
      characters: poolThroughStage(2),
      length: drillLength(2),
      autoStart: true,
    })
  })
})

describe('where the learner is', () => {
  it('starts a fresh profile at stage 1', () => {
    expect(currentStageIndex(emptyProgress(), NOW)).toBe(0)
  })

  it('resumes at the first stage not yet answered', () => {
    const record = taught(poolThroughStage(2))
    expect(isStageComplete(record, 2, NOW)).toBe(true)
    expect(currentStageIndex(record, NOW)).toBe(3)
  })

  it('reports a finished course instead of clamping to the last stage', () => {
    const record = taught(LESSON_ORDER)
    const index = currentStageIndex(record, NOW)
    expect(index).toBe(LESSON_STAGES.length)
    expect(isCourseComplete(index)).toBe(true)
    expect(courseProgress(record, NOW)).toBe(1)
  })

  it('marks the stage on screen as current even when it is done', () => {
    const record = taught(poolThroughStage(1))
    expect(stageStatuses(record, 1, NOW)).toEqual([
      'done',
      'current',
      ...Array(LESSON_STAGES.length - 2).fill('todo'),
    ])
  })
})

describe('resumePosition', () => {
  it('picks a stage up at its first character not yet introduced', () => {
    // Day three: stages 1 and 2 done, and the first three of stage 3 sent once.
    const stage = LESSON_STAGES[2]!
    const record = taught([...poolThroughStage(1), ...stage.slice(0, 3)])
    expect(currentStageIndex(record, NOW)).toBe(2)
    expect(resumePosition(2, record, NOW)).toEqual({ stage: 2, characterIndex: 3, step: 'see' })
  })

  it('starts a stage nobody has touched at its first character', () => {
    expect(resumePosition(3, emptyProgress(), NOW)).toEqual(stageStart(3))
  })

  it('starts a stage again from the top when every character is already introduced', () => {
    expect(resumePosition(1, taught(poolThroughStage(1)), NOW)).toEqual(stageStart(1))
  })
})

describe('arriving from the landing hero (DEC-044)', () => {
  /** What the hero leaves behind: E, T and A each sent once, nothing heard. */
  const afterHero = () => taught(['E', 'T', 'A'])
  /** A record in which every listed character has been heard once, too. */
  const heard = (record: ReturnType<typeof taught>, characters: readonly string[]) =>
    characters.reduce((next, character) => answer(next, character, 'listening', true, NOW), record)

  it('opens stage 1 at "Hear it" for its first character after the hero', () => {
    const record = afterHero()
    // The sends alone already count stage 1 as complete, which is the problem.
    expect(currentStageIndex(record, NOW)).toBe(1)
    expect(isStageHeard(record, 0, NOW)).toBe(false)
    expect(shouldHearFirst(record, NOW)).toBe(true)
    expect(entryPosition(record, NOW, HEAR_FIRST_HASH)).toEqual({
      stage: 0,
      characterIndex: 0,
      step: 'hear',
    })
    expect(LESSON_STAGES[0]![0]).toBe('E')
  })

  it('ignores the hash without the hero, and resumes as usual', () => {
    const record = afterHero()
    // Stage 2 picks up at its first character not sent yet (A was, on the landing).
    expect(entryPosition(record, NOW)).toEqual(resumePosition(1, record, NOW))
    expect(entryPosition(record, NOW, '#other')).toEqual(resumePosition(1, record, NOW))
  })

  it('ignores the hash once stage 1 has been heard', () => {
    const record = heard(afterHero(), LESSON_STAGES[0]!)
    expect(isStageHeard(record, 0, NOW)).toBe(true)
    expect(entryPosition(record, NOW, HEAR_FIRST_HASH)).toEqual(resumePosition(1, record, NOW))
  })

  it('never sends a learner past stage 2 back to stage 1', () => {
    // Taught through stage 2 by sending only, so stage 1 is still "unheard".
    const record = taught(poolThroughStage(1))
    expect(currentStageIndex(record, NOW)).toBe(2)
    expect(shouldHearFirst(record, NOW)).toBe(false)
    expect(entryPosition(record, NOW, HEAR_FIRST_HASH)).toEqual(resumePosition(2, record, NOW))
  })

  it('returns no position for a finished course, hash or not', () => {
    const record = taught(LESSON_ORDER)
    expect(entryPosition(record, NOW)).toBeNull()
    expect(entryPosition(record, NOW, HEAR_FIRST_HASH)).toBeNull()
  })
})

describe('banking a finished stage', () => {
  it('grows the Signal practice pool to exactly the stages taught', () => {
    for (let stage = 0; stage < LESSON_STAGES.length; stage++) {
      const record = unlockTaught(emptyProgress(), poolThroughStage(stage))
      expect(unlockedCharacters(record)).toEqual(poolThroughStage(stage))
    }
  })
})

describe('the plan copy the lesson follows', () => {
  it('names only day-six letters as the rarest ones it teaches on day six', () => {
    const day = CURRICULUM[5]!
    const named = /(\w), (\w) and (\w), are the rarest letters/.exec(day.summary)
    expect(named, 'day six summary names its rarest letters').not.toBeNull()
    for (const letter of named!.slice(1)) expect(day.characters).toContain(letter)
  })
})
