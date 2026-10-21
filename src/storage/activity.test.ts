import { describe, expect, it } from 'vitest'
import { applyActivity, bankActivity } from './activity'
import { answer, createProgressStore, emptyProgress } from './progress'
import { achievementSnapshot } from './snapshot'
import { STATS_KEY, createStatsStore, defaultStats } from './stats'
import { createMemoryDriver } from './store'
import { XP } from '../game/progression'

const at = (year: number, month: number, day: number, hour = 12) =>
  new Date(year, month - 1, day, hour).getTime()

/** Both stores over one in-memory driver, as a screen would hold them. */
function stores() {
  const driver = createMemoryDriver()
  return {
    driver,
    stats: createStatsStore(driver),
    progress: createProgressStore(driver),
  }
}

describe('applyActivity', () => {
  it('ignores a call that carries nothing', () => {
    const start = defaultStats()
    for (const input of [{}, { xp: 0 }, { elements: 0 }, { answers: 0 }, { message: false }]) {
      const result = applyActivity(start, input, at(2026, 8, 22))
      expect(result.stats, JSON.stringify(input)).toBe(start)
      expect(result.banked).toBe(false)
    }
  })

  it('ignores nonsense numbers rather than banking them', () => {
    const start = defaultStats()
    const input = { xp: -50, elements: Number.NaN, answers: -1 }
    expect(applyActivity(start, input, at(2026, 8, 22)).stats).toBe(start)
  })

  it('adds XP and marks the day active', () => {
    const { stats } = applyActivity(defaultStats(), { xp: 30 }, at(2026, 8, 22))
    expect(stats.xp).toBe(30)
    expect(stats.streak.current).toBe(1)
  })

  it('pays the first-signal XP with the first element, once', () => {
    const first = applyActivity(defaultStats(), { elements: 1 }, at(2026, 8, 22))
    expect(first.firstSignal).toBe(true)
    expect(first.xp).toBe(XP.firstSignal)
    expect(first.stats.elementsSent).toBe(1)

    const second = applyActivity(first.stats, { elements: 5 }, at(2026, 8, 23))
    expect(second.firstSignal).toBe(false)
    expect(second.xp).toBe(0)
    expect(second.stats.elementsSent).toBe(6)
  })

  it('counts a message', () => {
    expect(
      applyActivity(defaultStats(), { message: true }, at(2026, 8, 22)).stats.messagesSent,
    ).toBe(1)
  })

  it('does not let a message on its own extend the streak', () => {
    // Typing a message link once a day is not Morse practice.
    let stats = applyActivity(defaultStats(), { xp: 5 }, at(2026, 8, 22)).stats
    const alone = applyActivity(stats, { message: true }, at(2026, 8, 23))
    expect(alone.banked).toBe(true)
    expect(alone.stats.messagesSent).toBe(1)
    expect(alone.stats.streak).toEqual(stats.streak)

    // A message keyed on the telegraph comes with its elements, which do count.
    stats = applyActivity(stats, { message: true, elements: 9 }, at(2026, 8, 23)).stats
    expect(stats.streak.current).toBe(2)
  })

  it('adds answers to the totals only together with their hits', () => {
    // Answers without hits would quietly lower lifetime accuracy.
    const bare = applyActivity(defaultStats(), { answers: 8 }, at(2026, 8, 22))
    expect(bare.banked).toBe(true)
    expect(bare.stats.totalAnswers).toBe(0)

    const full = applyActivity(defaultStats(), { answers: 8, correct: 99 }, at(2026, 8, 22))
    expect(full.stats.totalAnswers).toBe(8)
    expect(full.stats.totalCorrect).toBe(8)
  })

  it('counts the streak at most once per local day', () => {
    let stats = defaultStats()
    stats = applyActivity(stats, { xp: 5 }, at(2026, 8, 22, 9)).stats
    stats = applyActivity(stats, { elements: 3 }, at(2026, 8, 22, 18)).stats
    stats = applyActivity(stats, { message: true }, at(2026, 8, 22, 23)).stats
    expect(stats.streak.current).toBe(1)

    stats = applyActivity(stats, { xp: 5 }, at(2026, 8, 23, 9)).stats
    expect(stats.streak.current).toBe(2)
  })
})

describe('bankActivity', () => {
  it('writes the stats store and returns what it wrote', () => {
    const { driver, stats, progress } = stores()
    const result = bankActivity({ xp: 20, now: at(2026, 8, 22) }, { stats, progress })

    expect(result.banked).toBe(true)
    expect(result.stats.xp).toBe(20)
    // A fresh store instance over the same driver sees it: it reached storage.
    expect(createStatsStore(driver).read().xp).toBe(20)
    // And the instance passed in is current, so a screen holding it is too.
    expect(stats.read().xp).toBe(20)
  })

  it('does not touch storage for an empty call', () => {
    const { driver, stats, progress } = stores()
    const result = bankActivity({ now: at(2026, 8, 22) }, { stats, progress })
    expect(result).toMatchObject({ banked: false, earned: [], xp: 0 })
    expect(driver.getItem(STATS_KEY)).toBeNull()
  })

  it('reports First Signal the moment the first element is sent', () => {
    const { stats, progress } = stores()
    const result = bankActivity({ elements: 1, now: at(2026, 8, 22) }, { stats, progress })

    expect(result.earned.map((a) => a.id)).toContain('first-signal')
    expect(result.firstSignal).toBe(true)
    expect(result.xp).toBe(XP.firstSignal)
  })

  it('reports each achievement once, not on every later call', () => {
    const { stats, progress } = stores()
    bankActivity({ elements: 1, now: at(2026, 8, 22) }, { stats, progress })
    const again = bankActivity({ elements: 4, now: at(2026, 8, 22) }, { stats, progress })
    expect(again.earned).toEqual([])
  })

  it('reports CQ CQ CQ for a real message', () => {
    const { stats, progress } = stores()
    const result = bankActivity({ message: true, now: at(2026, 8, 22) }, { stats, progress })
    expect(result.earned.map((a) => a.id)).toEqual(['cq-cq-cq'])
  })

  it('never turns 600 XP into 100 when another tab banked in between', () => {
    // Tab A has /practice/ open; tab B banks a lesson and a streak day.
    const backing = new Map<string, string>()
    const tabA = { stats: createStatsStore(createMemoryDriver(backing)) }
    const tabB = { stats: createStatsStore(createMemoryDriver(backing)) }
    expect(tabA.stats.read().xp).toBe(0) // cached before tab B's work

    bankActivity({ xp: 500, answers: 4, correct: 4, now: at(2026, 8, 22) }, tabB)
    bankActivity({ xp: 100, answers: 2, correct: 2, now: at(2026, 8, 23) }, tabA)

    const stored = createStatsStore(createMemoryDriver(backing)).read()
    expect(stored.xp).toBe(600)
    expect(stored.totalAnswers).toBe(6)
    expect(stored.streak.current).toBe(2)
  })

  it('reports badges earned by progress when given a starting snapshot', () => {
    // The lesson writes answers to progress as it goes, then banks once. Only
    // a snapshot from before the lesson can tell that stage 1 was just taught.
    const { stats, progress } = stores()
    const now = at(2026, 8, 22)
    const since = achievementSnapshot(progress.read(), stats.read(), now)

    let record = emptyProgress()
    for (const character of ['E', 'T']) record = answer(record, character, 'sending', true, now)
    progress.write(record)

    const result = bankActivity({ answers: 2, correct: 2, now, since }, { stats, progress })
    expect(result.earned.map((a) => a.id)).toContain('first-ring')
  })

  it('is safe to call with no stores at all', () => {
    // Falls back to the default driver, which in Node is in-memory.
    expect(bankActivity({ xp: 1, now: at(2026, 8, 22) }).banked).toBe(true)
  })
})

describe('two callers on one page', () => {
  it('pay the first-signal XP exactly once, through the default shared stores', () => {
    // A screen that holds the stats store and a banking call that does not
    // pass it once wrote through separate caches: the screen's stale copy
    // erased the payment, and the next element paid it again.
    const now = at(2026, 8, 22)
    const held = createStatsStore()
    // The default driver is shared by every test in this file; start clean.
    held.clear()
    createProgressStore().clear()
    held.read()

    const first = bankActivity({ elements: 1, now })
    held.update((stats) => ({ ...stats, xp: stats.xp + 50 }))
    const second = bankActivity({ elements: 1, now })

    expect(first.firstSignal).toBe(true)
    expect(second.firstSignal).toBe(false)
    expect(held.read().xp).toBe(50 + XP.firstSignal)
    expect(held.read().elementsSent).toBe(2)
  })
})

describe('two callers over one explicit driver', () => {
  it('share one store, so the first-signal XP is paid once', () => {
    // The same guarantee without the file-wide default driver, so it cannot
    // depend on what another test banked first.
    const driver = createMemoryDriver()
    const now = at(2026, 8, 22)
    const screen = createStatsStore(driver)
    screen.read()
    const fromElsewhere = () => ({
      stats: createStatsStore(driver),
      progress: createProgressStore(driver),
    })

    const first = bankActivity({ elements: 1, now }, fromElsewhere())
    screen.update((stats) => ({ ...stats, xp: stats.xp + 50 }))
    const second = bankActivity({ elements: 1, now }, fromElsewhere())

    expect([first.firstSignal, second.firstSignal]).toEqual([true, false])
    expect(screen.read().xp).toBe(50 + XP.firstSignal)
    expect(screen.read().elementsSent).toBe(2)
  })
})
