import { describe, expect, it } from 'vitest'
import {
  type ProgressRecord,
  PROGRESS_KEY,
  PROGRESS_VERSION,
  answer,
  createProgressStore,
  emptyProgress,
  dueCharacters,
  getCharacter,
  markSeen,
  masteredCharacters,
  overallMastery,
  setMethod,
  stagesTaught,
  summarize,
  isCompleteProgress,
  newlyUnlocked,
  unlockForSession,
  unlockNext,
  unlockTaught,
  unlockThrough,
  unlockedCharacters,
  accuracyBySkill,
  weakestSkill,
} from './progress'
import { createMemoryDriver } from './store'
import { SKILLS } from '../game/mastery'
import { MAX_INTERVAL_MS } from '../game/spacedRepetition'
import { ALL_LETTERS } from '../data/morseAlphabet'
import { LESSON_STAGES } from '../data/lessonStages'
import { LESSON_STAGES as NEXT_ACTION_STAGES, lessonStagesDone } from '../game/nextAction'
import {
  LESSON_STAGES as LESSON_SCREEN_STAGES,
  currentStageIndex,
} from '../components/Lesson/lesson'

const T0 = 1_700_000_000_000
const empty = emptyProgress

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

describe('learning method', () => {
  it('starts on the Signal order with nothing extra unlocked', () => {
    const record = empty()
    expect(record.method).toBe('signal')
    expect(record.unlocked).toBe(0)
    expect(unlockedCharacters(record)).toEqual(['E', 'T'])
  })

  it('survives an answer', () => {
    // Returning a bare { characters } here would silently reset the method on
    // every single answer, and nothing in the UI would show it.
    const record = answer(setMethod(empty(), 'koch'), 'K', 'listening', true, T0)
    expect(record.method).toBe('koch')
  })

  it('survives being marked seen', () => {
    expect(markSeen(setMethod(empty(), 'koch'), 'K', T0).method).toBe('koch')
  })

  it('opens Koch with K and M', () => {
    expect(unlockedCharacters(setMethod(empty(), 'koch'))).toEqual(['K', 'M'])
  })

  it('resets unlocks when the method changes', () => {
    // The count means "characters into this order". Carrying it across would
    // hand the learner a random slice of a sequence they never started.
    let record = unlockNext(unlockNext(setMethod(empty(), 'koch')))
    expect(record.unlocked).toBe(2)
    record = setMethod(record, 'alphabetical')
    expect(record.unlocked).toBe(0)
    expect(unlockedCharacters(record)).toEqual(['A', 'B'])
  })

  it('is a no-op when set to the method already in use', () => {
    const record = unlockNext(setMethod(empty(), 'koch'))
    expect(setMethod(record, 'koch')).toBe(record)
  })

  it('unlocks one character at a time', () => {
    const record = unlockNext(setMethod(empty(), 'koch'))
    expect(unlockedCharacters(record)).toEqual(['K', 'M', 'R'])
  })

  it('stops at the end of the order', () => {
    let record = setMethod(empty(), 'koch')
    for (let i = 0; i < 100; i++) record = unlockNext(record)
    expect(unlockedCharacters(record)).toHaveLength(36)
  })

  it('round-trips through storage', () => {
    const driver = createMemoryDriver()
    createProgressStore(driver).write(unlockNext(setMethod(empty(), 'koch')))

    const reloaded = createProgressStore(driver).read()
    expect(reloaded.method).toBe('koch')
    expect(reloaded.unlocked).toBe(1)
  })

  it('falls back to the default for a method name it does not know', () => {
    const driver = createMemoryDriver()
    driver.setItem(
      PROGRESS_KEY,
      JSON.stringify({ version: PROGRESS_VERSION, data: { method: 'telepathy', unlocked: 5 } }),
    )
    expect(createProgressStore(driver).read().method).toBe('signal')
  })

  it('clamps an unlock count past the end of the order', () => {
    const driver = createMemoryDriver()
    driver.setItem(
      PROGRESS_KEY,
      JSON.stringify({ version: PROGRESS_VERSION, data: { method: 'koch', unlocked: 9999 } }),
    )
    expect(unlockedCharacters(createProgressStore(driver).read())).toHaveLength(36)
  })
})

describe('staged unlocking (the default method)', () => {
  it('starts a fresh record on stage 1', () => {
    expect(unlockedCharacters(empty())).toEqual(['E', 'T'])
  })

  it('unlocks the whole next stage at once, not one letter', () => {
    const record = unlockNext(empty())
    expect(unlockedCharacters(record)).toEqual(['E', 'T', 'I', 'A', 'N', 'M'])
    expect(unlockedCharacters(unlockNext(record))).toHaveLength(14)
  })

  it('stops at the end of the order, digits included', () => {
    let record = empty()
    for (let i = 0; i < 20; i++) record = unlockNext(record)
    expect(unlockedCharacters(record)).toHaveLength(36)
    expect(unlockNext(record)).toBe(record)
  })
})

describe('unlockThrough', () => {
  it('raises the pool to cover the first `count` characters', () => {
    expect(unlockedCharacters(unlockThrough(empty(), 6))).toEqual(['E', 'T', 'I', 'A', 'N', 'M'])
  })

  it('never lowers progress', () => {
    // The practice screen may already have unlocked further than the lesson
    // that is now catching up; the lesson must not take characters back.
    const ahead = unlockNext(unlockNext(empty()))
    expect(unlockThrough(ahead, 6)).toBe(ahead)
    expect(unlockThrough(ahead, 0)).toBe(ahead)
    expect(unlockThrough(ahead, -3)).toBe(ahead)
    expect(unlockThrough(ahead, Number.NaN)).toBe(ahead)
  })

  it('is idempotent', () => {
    const once = unlockThrough(empty(), 14)
    expect(unlockThrough(once, 14)).toBe(once)
  })

  it('clamps at the end of the order', () => {
    expect(unlockedCharacters(unlockThrough(empty(), 9999))).toHaveLength(36)
  })
})

describe('unlockTaught', () => {
  it('unlocks exactly the taught stages under Signal', () => {
    const record = unlockTaught(empty(), ['E', 'T', 'I', 'A', 'N', 'M'])
    expect(unlockedCharacters(record)).toEqual(['E', 'T', 'I', 'A', 'N', 'M'])
  })

  it('does not hand Koch learners characters nobody taught them', () => {
    // Koch's order is K M R S U A ..., so teaching E and T covers no new
    // prefix of it. Unlocking through to E would add a dozen unseen letters.
    const koch = setMethod(empty(), 'koch')
    expect(unlockTaught(koch, ['E', 'T'])).toBe(koch)
  })

  it('never lowers progress', () => {
    const ahead = unlockThrough(empty(), 26)
    expect(unlockTaught(ahead, ['E', 'T'])).toBe(ahead)
  })
})

describe('stagesTaught', () => {
  it('is zero for a fresh record', () => {
    expect(stagesTaught(empty(), T0)).toBe(0)
  })

  it('counts a stage once every character in it has been answered correctly', () => {
    let record = answer(empty(), 'E', 'sending', true, T0)
    expect(stagesTaught(record, T0)).toBe(0)
    record = answer(record, 'T', 'sending', true, T0)
    expect(stagesTaught(record, T0)).toBe(1)
  })

  it('counts from the first stage, not a total', () => {
    // Drilling stage 2 without stage 1 does not put anyone two stages in.
    let record = empty()
    for (const character of ['I', 'A', 'N', 'M']) {
      record = answer(record, character, 'sending', true, T0)
    }
    expect(stagesTaught(record, T0)).toBe(0)
  })

  it('counts the plan days the lesson teaches, not the four tree layers', () => {
    // Stages 1 to 4 of the lesson are E T / I A N M / S U R W / D K G O: the
    // first three tree layers. Counted over the layers this read as 3.
    let record = empty()
    for (const character of LESSON_STAGES.slice(0, 4).flat()) {
      record = answer(record, character, 'sending', true, T0)
    }
    expect(stagesTaught(record, T0)).toBe(4)
  })

  it('agrees with the lesson screen and the next-action rule at every stage', () => {
    expect(LESSON_STAGES).toEqual(LESSON_SCREEN_STAGES)
    expect(LESSON_STAGES).toEqual(NEXT_ACTION_STAGES)
    let record = empty()
    for (let stage = 0; stage <= LESSON_STAGES.length; stage++) {
      expect(stagesTaught(record, T0), `after ${stage}`).toBe(stage)
      expect(currentStageIndex(record, T0), `after ${stage}`).toBe(stage)
      expect(lessonStagesDone(record, T0), `after ${stage}`).toBe(stage)
      for (const character of LESSON_STAGES[stage] ?? []) {
        record = answer(record, character, 'sending', true, T0)
      }
    }
  })

  it('does not call the course done when the letters are done but the digits are not', () => {
    let record = empty()
    for (const character of ALL_LETTERS) record = answer(record, character, 'sending', true, T0)
    expect(stagesTaught(record, T0)).toBe(LESSON_STAGES.length - 1)
  })
})

describe('accuracyBySkill', () => {
  it('reports each skill separately rather than one average', () => {
    // The §20 point: a single lifetime figure hides that sending runs well
    // ahead of listening, which is the only actionable part.
    let record = empty()
    for (let i = 0; i < 10; i++) record = answer(record, 'E', 'sending', true, T0)
    for (let i = 0; i < 10; i++) record = answer(record, 'E', 'listening', i < 4, T0)

    const bySkill = accuracyBySkill(record, ['E'], T0)
    expect(bySkill.sending.accuracy).toBe(1)
    expect(bySkill.listening.accuracy).toBeCloseTo(0.4, 6)
  })

  it('returns null for a skill never attempted, not zero', () => {
    // Never having tried is not the same as always getting it wrong, and a 0%
    // on the dashboard would read as the second.
    const record = answer(empty(), 'E', 'sending', true, T0)
    const bySkill = accuracyBySkill(record, ['E'], T0)
    expect(bySkill.sending.accuracy).toBe(1)
    expect(bySkill.recognition.accuracy).toBeNull()
    expect(bySkill.recognition.attempts).toBe(0)
  })

  it('adds up across characters', () => {
    let record = answer(empty(), 'E', 'listening', true, T0)
    record = answer(record, 'T', 'listening', false, T0)
    const bySkill = accuracyBySkill(record, ['E', 'T'], T0)
    expect(bySkill.listening.attempts).toBe(2)
    expect(bySkill.listening.accuracy).toBe(0.5)
  })

  it('is all null for a fresh learner', () => {
    const bySkill = accuracyBySkill(empty(), ALL_LETTERS, T0)
    for (const skill of SKILLS) expect(bySkill[skill].accuracy).toBeNull()
  })
})

describe('weakestSkill', () => {
  it('names the skill furthest behind', () => {
    let record = empty()
    for (let i = 0; i < 20; i++) record = answer(record, 'E', 'sending', true, T0)
    for (let i = 0; i < 20; i++) record = answer(record, 'E', 'listening', i < 5, T0)
    for (let i = 0; i < 20; i++) record = answer(record, 'E', 'recognition', i < 15, T0)

    expect(weakestSkill(record, ['E'], T0)).toBe('listening')
  })

  it('says nothing until there is enough evidence', () => {
    // Two answers is not evidence, and naming a "weakest skill" off one
    // unlucky guess is worse than saying nothing.
    let record = empty()
    record = answer(record, 'E', 'sending', true, T0)
    record = answer(record, 'E', 'listening', false, T0)
    expect(weakestSkill(record, ['E'], T0)).toBeNull()
  })

  it('says nothing when only one skill has been practised', () => {
    let record = empty()
    for (let i = 0; i < 30; i++) record = answer(record, 'E', 'listening', i % 2 === 0, T0)
    expect(weakestSkill(record, ['E'], T0)).toBeNull()
  })

  it('says nothing for a fresh learner', () => {
    expect(weakestSkill(empty(), ALL_LETTERS, T0)).toBeNull()
  })
})

describe('unlockForSession', () => {
  const good = { accuracy: 0.95, total: 30 }

  it('unlocks exactly one stage for a good session', () => {
    expect(unlockedCharacters(unlockForSession(empty(), good))).toHaveLength(6)
  })

  it('leaves the record alone below the bar or on too few answers', () => {
    const record = empty()
    expect(unlockForSession(record, { accuracy: 0.89, total: 30 })).toBe(record)
    expect(unlockForSession(record, { accuracy: 1, total: 24 })).toBe(record)
  })

  it('reports which characters arrived', () => {
    const before = empty()
    expect(newlyUnlocked(before, unlockForSession(before, good))).toEqual(['I', 'A', 'N', 'M'])
    expect(newlyUnlocked(before, before)).toEqual([])
  })
})

describe('one store per key per page', () => {
  it('returns the same instance for the same driver', () => {
    const driver = createMemoryDriver()
    expect(createProgressStore(driver)).toBe(createProgressStore(driver))
    expect(createProgressStore(driver)).not.toBe(createProgressStore(createMemoryDriver()))
  })

  it('keeps the session’s answers through an unlock made by another screen', () => {
    // The practice screen and its session hook each called the factory. With
    // separate caches, the screen's unlock wrote its mount-time copy over the
    // answers the session had just saved, and the next answer undid the unlock.
    const driver = createMemoryDriver()
    const screen = createProgressStore(driver)
    const session = createProgressStore(driver)
    screen.read()
    session.read()

    for (let i = 0; i < 30; i++) {
      session.update((record) => answer(record, 'E', 'listening', true, T0 + i))
    }
    screen.update((record) => unlockForSession(record, { accuracy: 1, total: 30 }))
    session.update((record) => answer(record, 'T', 'listening', true, T0 + 31))

    const stored = createProgressStore(driver)
    stored.invalidate()
    const reloaded = stored.read()
    expect(reloaded.characters['E']?.skills.listening.attempts).toBe(30)
    expect(unlockedCharacters(reloaded)).toHaveLength(6)
  })
})

describe('isCompleteProgress', () => {
  it('needs a character map, and accepts old exports without a method', () => {
    expect(isCompleteProgress({ characters: {} })).toBe(true)
    expect(isCompleteProgress({ method: 'signal' })).toBe(false)
    expect(isCompleteProgress({ characters: {}, unlocked: 'many' })).toBe(false)
    expect(isCompleteProgress({ characters: { E: 'garbage' } })).toBe(false)
    expect(isCompleteProgress({ characters: { E: {} } })).toBe(true)
  })
})

describe('schedule ceilings', () => {
  it('pulls a review due in the far future back within the longest interval', () => {
    // A due date in 2099 would hide the character from practice for good.
    const driver = createMemoryDriver()
    const far = Date.UTC(2099, 0, 1)
    driver.setItem(
      PROGRESS_KEY,
      JSON.stringify({
        version: PROGRESS_VERSION,
        data: { characters: { E: { schedule: { dueAt: far, intervalMs: 1e30 } } } },
      }),
    )
    const schedule = getCharacter(createProgressStore(driver).read(), 'E', T0).schedule
    expect(schedule.dueAt).toBeLessThan(far)
    expect(schedule.intervalMs).toBe(MAX_INTERVAL_MS)
  })
})
