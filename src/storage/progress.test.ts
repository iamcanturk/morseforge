import { describe, expect, it } from 'vitest'
import {
  type ProgressRecord,
  PROGRESS_KEY,
  PROGRESS_VERSION,
  answer,
  createProgressStore,
  dueCharacters,
  getCharacter,
  markSeen,
  masteredCharacters,
  overallMastery,
  summarize,
} from './progress'
import { createMemoryDriver } from './store'
import { SKILLS } from '../game/mastery'

const T0 = 1_700_000_000_000
const empty = (): ProgressRecord => ({ characters: {} })

/** Answer every skill `times` times, all correct. */
function drill(record: ProgressRecord, character: string, times: number, now = T0) {
  let next = record
  for (let i = 0; i < times; i++) {
    for (const skill of SKILLS) next = answer(next, character, skill, true, now)
  }
  return next
}

describe('getCharacter', () => {
  it('defaults an untouched character rather than returning undefined', () => {
    const progress = getCharacter(empty(), 'E', T0)
    expect(progress.seen).toBe(false)
    expect(progress.skills.sending).toEqual({ attempts: 0, correct: 0 })
    expect(progress.schedule.dueAt).toBe(T0)
  })

  it('is case-insensitive', () => {
    const record = markSeen(empty(), 'e', T0)
    expect(getCharacter(record, 'E', T0).seen).toBe(true)
  })
})

describe('markSeen', () => {
  it('marks without recording an attempt', () => {
    const record = markSeen(empty(), 'E', T0)
    expect(getCharacter(record, 'E', T0).seen).toBe(true)
    expect(getCharacter(record, 'E', T0).skills.recognition.attempts).toBe(0)
  })

  it('is a no-op the second time', () => {
    const once = markSeen(empty(), 'E', T0)
    expect(markSeen(once, 'E', T0)).toBe(once)
  })
})

describe('answer', () => {
  it('updates the skill and advances the schedule together', () => {
    const record = answer(empty(), 'E', 'listening', true, T0)
    const progress = getCharacter(record, 'E', T0)

    expect(progress.skills.listening).toEqual({ attempts: 1, correct: 1 })
    expect(progress.schedule.streak).toBe(1)
    // The two must never drift apart, so a correct answer must have pushed the
    // due date out as well as raised the accuracy.
    expect(progress.schedule.dueAt).toBeGreaterThan(T0)
    expect(progress.lastAnsweredAt).toBe(T0)
  })

  it('marks the character as seen implicitly', () => {
    expect(getCharacter(answer(empty(), 'E', 'sending', false, T0), 'E', T0).seen).toBe(true)
  })

  it('brings a wrong answer back soon', () => {
    const learned = drill(empty(), 'E', 3)
    const dueBefore = getCharacter(learned, 'E', T0).schedule.dueAt
    const missed = answer(learned, 'E', 'sending', false, T0)
    expect(getCharacter(missed, 'E', T0).schedule.dueAt).toBeLessThan(dueBefore)
  })

  it('does not mutate the record it was given', () => {
    const before = empty()
    answer(before, 'E', 'sending', true, T0)
    expect(before.characters).toEqual({})
  })
})

describe('summarize', () => {
  it('reports level and score together', () => {
    const record = drill(empty(), 'E', 10)
    const summary = summarize(record, 'E', T0)
    expect(summary.character).toBe('E')
    expect(summary.level).toBe(5)
    expect(summary.score).toBe(1)
  })
})

describe('masteredCharacters', () => {
  it('lists only characters that cleared every skill', () => {
    let record = drill(empty(), 'E', 10)
    // T practised through recognition alone — must not count (PROJECT.md §48).
    for (let i = 0; i < 40; i++) record = answer(record, 'T', 'recognition', true, T0)

    expect(masteredCharacters(record, ['E', 'T'], T0)).toEqual(['E'])
  })

  it('returns nothing for a fresh learner', () => {
    expect(masteredCharacters(empty(), ['E', 'T'], T0)).toEqual([])
  })
})

describe('overallMastery', () => {
  it('is 0 for a fresh learner and 1 when everything is perfect', () => {
    expect(overallMastery(empty(), ['E', 'T'], T0)).toBe(0)
    const both = drill(drill(empty(), 'E', 5), 'T', 5)
    expect(overallMastery(both, ['E', 'T'], T0)).toBe(1)
  })

  it('moves on partial progress rather than only at mastery boundaries', () => {
    // The §17 power meter has to climb during practice, not tick 26 times.
    const partial = drill(empty(), 'E', 2)
    const value = overallMastery(partial, ['E', 'T'], T0)
    expect(value).toBeGreaterThan(0)
    expect(value).toBeLessThan(1)
  })

  it('handles an empty character set without dividing by zero', () => {
    expect(overallMastery(empty(), [], T0)).toBe(0)
  })
})

describe('dueCharacters', () => {
  it('puts never-studied characters first, since they are due immediately', () => {
    const record = drill(empty(), 'E', 3)
    expect(dueCharacters(record, ['E', 'T'], T0, 2)[0]).toBe('T')
  })

  it('honours the limit', () => {
    expect(dueCharacters(empty(), ['E', 'T', 'I', 'A'], T0, 2)).toHaveLength(2)
  })

  it('returns something even when nothing is due yet', () => {
    const record = drill(drill(empty(), 'E', 3), 'T', 3)
    expect(dueCharacters(record, ['E', 'T'], T0, 2)).toHaveLength(2)
  })
})

describe('persistence', () => {
  it('round-trips through storage', () => {
    const driver = createMemoryDriver()
    createProgressStore(driver).write(drill(empty(), 'E', 4))

    const reloaded = createProgressStore(driver).read()
    expect(getCharacter(reloaded, 'E', T0).skills.sending.attempts).toBe(4)
  })

  it('survives a hand-edited export claiming more correct than attempts', () => {
    // §22 lets users export and re-import their progress, so the file is
    // editable. Trusting it would show 16,000% accuracy forever.
    const driver = createMemoryDriver()
    driver.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        version: PROGRESS_VERSION,
        data: {
          characters: {
            E: { seen: true, skills: { sending: { attempts: 3, correct: 500 } } },
          },
        },
      }),
    )

    const progress = getCharacter(createProgressStore(driver).read(), 'E', T0)
    expect(progress.skills.sending).toEqual({ attempts: 3, correct: 3 })
  })

  it('drops a malformed character instead of the whole record', () => {
    const driver = createMemoryDriver()
    driver.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        version: PROGRESS_VERSION,
        data: {
          characters: {
            E: { seen: true, skills: { sending: { attempts: 2, correct: 2 } } },
            T: 'not an object',
          },
        },
      }),
    )

    const record = createProgressStore(driver).read()
    expect(getCharacter(record, 'E', T0).skills.sending.attempts).toBe(2)
    expect(getCharacter(record, 'T', T0).seen).toBe(false)
  })

  it('clamps an out-of-range ease factor from an edited file', () => {
    const driver = createMemoryDriver()
    driver.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        version: PROGRESS_VERSION,
        data: { characters: { E: { seen: true, schedule: { ease: 9999 } } } },
      }),
    )

    expect(getCharacter(createProgressStore(driver).read(), 'E', T0).schedule.ease).toBe(2.8)
  })

  it('resets to empty on clear', () => {
    const driver = createMemoryDriver()
    const store = createProgressStore(driver)
    store.write(drill(empty(), 'E', 4))
    store.clear()
    expect(store.read().characters).toEqual({})
  })
})
