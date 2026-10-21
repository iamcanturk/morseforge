import { describe, expect, it } from 'vitest'
import {
  GAME_PATHS,
  bankRun,
  clearedPercent,
  gameShare,
  shareLine,
  shareText,
  type RunSummary,
} from './results'
import { getPage, pageUrl } from '../../config/pages'
import { achievementSnapshot } from '../../storage/snapshot'
import { createProgressStore } from '../../storage/progress'
import { GAME_IDS, createStatsStore, defaultStats } from '../../storage/stats'
import { createMemoryDriver } from '../../storage/store'
import { XP } from '../../game/progression'
import { translatorFor } from '../../i18n/server'

const t = translatorFor('en')

const NOW = new Date(2026, 9, 21, 12).getTime()

function stores() {
  const driver = createMemoryDriver()
  return { stats: createStatsStore(driver), progress: createProgressStore(driver) }
}

const run = (overrides: Partial<RunSummary> = {}): RunSummary => ({
  game: 'defender',
  score: 240,
  answers: 10,
  correct: 8,
  inputs: 9,
  xp: 80,
  now: NOW,
  ...overrides,
})

describe('bankRun', () => {
  it('banks XP, totals and the streak day, and sets the first best', () => {
    const held = stores()
    const report = bankRun(run(), held)
    const stats = held.stats.read()

    expect(report.banked).toBe(true)
    expect(report.xp).toBe(80)
    expect(stats.xp).toBe(80)
    expect(stats.totalAnswers).toBe(10)
    expect(stats.totalCorrect).toBe(8)
    expect(stats.streak.current).toBe(1)
    expect(report.streak).toBe(1)
    expect(stats.gameBests?.defender).toBe(240)
    expect(report.previousBest).toBeNull()
    expect(report.isNewBest).toBe(true)
  })

  it('banks nothing for a run the player never touched', () => {
    const held = stores()
    const before = held.stats.read()
    const report = bankRun(run({ inputs: 0, correct: 0, score: 0, xp: 0 }), held)

    expect(report.banked).toBe(false)
    expect(report.isNewBest).toBe(false)
    expect(held.stats.read()).toBe(before)
  })

  it('reports a new best only when the previous one is beaten', () => {
    const held = stores()
    bankRun(run({ score: 300 }), held)

    const lower = bankRun(run({ score: 120 }), held)
    expect(lower.isNewBest).toBe(false)
    expect(lower.previousBest).toBe(300)
    expect(held.stats.read().gameBests?.defender).toBe(300)

    const equal = bankRun(run({ score: 300 }), held)
    expect(equal.isNewBest).toBe(false)

    const higher = bankRun(run({ score: 301 }), held)
    expect(higher.isNewBest).toBe(true)
    expect(higher.previousBest).toBe(300)
    expect(held.stats.read().gameBests?.defender).toBe(301)
  })

  it('keeps each game’s best apart', () => {
    const held = stores()
    bankRun(run({ game: 'defender', score: 500 }), held)
    const report = bankRun(run({ game: 'runner', score: 90 }), held)
    expect(report.isNewBest).toBe(true)
    expect(held.stats.read().gameBests).toEqual({ defender: 500, runner: 90 })
  })

  it('pays the one-time first-signal bonus to a first run on the key', () => {
    const held = stores()
    const since = achievementSnapshot(held.progress.read(), held.stats.read(), NOW)
    const report = bankRun(run({ game: 'runner', elements: 7, xp: 30, inputs: 3, since }), held)
    expect(report.xp).toBe(30 + XP.firstSignal)
    expect(report.earned.map((achievement) => achievement.id)).toContain('first-signal')
    expect(held.stats.read().elementsSent).toBe(7)
  })

  it('banks keying alone, even if no character landed on a gate', () => {
    const held = stores()
    const report = bankRun(
      run({ game: 'runner', inputs: 0, answers: 2, correct: 0, xp: 0, score: 0, elements: 4 }),
      held,
    )
    expect(report.banked).toBe(true)
    expect(held.stats.read().elementsSent).toBe(4)
    expect(held.stats.read().gameBests?.runner).toBeUndefined()
  })

  it('never lowers lifetime accuracy by counting answers without their hits', () => {
    const held = stores()
    bankRun(run({ answers: 4, correct: 4 }), held)
    expect(held.stats.read().totalCorrect / held.stats.read().totalAnswers).toBe(1)
  })

  it('starts from a clean default, not a shared one', () => {
    expect(stores().stats.read()).toEqual(defaultStats())
  })
})

describe('sharing', () => {
  it('reads "<name>: <score>, <x>% cleared"', () => {
    expect(shareLine(t, 'Signal Defender', 1240, 0.912)).toBe('Signal Defender: 1,240, 91% cleared')
  })

  it('never shares a nonsense number', () => {
    expect(shareLine(t, 'Morse Runner', Number.NaN, Number.POSITIVE_INFINITY)).toBe(
      'Morse Runner: 0, 0% cleared',
    )
    expect(shareLine(t, 'Morse Runner', -5, 2)).toBe('Morse Runner: 0, 100% cleared')
  })

  it('rounds down, so a run with a miss never shares as 100% cleared', () => {
    expect(shareLine(t, 'Signal Defender', 3000, 199 / 200)).toBe(
      'Signal Defender: 3,000, 99% cleared',
    )
    expect(clearedPercent(199 / 200)).toBe(99)
    expect(clearedPercent(1)).toBe(100)
    expect(clearedPercent(0.29)).toBe(29)
  })

  it('puts the game URL on its own line', () => {
    const identity = { game: 'runner' as const, name: 'Morse Runner', url: 'https://x.test/g/' }
    expect(shareText(t, identity, 90, 0.5)).toBe('Morse Runner: 90, 50% cleared\nhttps://x.test/g/')
  })

  it('gives a share sheet the link only as url, and the clipboard the link (DEC-035)', () => {
    const identity = { game: 'runner' as const, name: 'Morse Runner', url: 'https://x.test/g/' }
    const share = gameShare(t, identity, 90, 0.5)
    expect(share).toEqual({
      title: 'Morse Runner',
      text: 'Morse Runner: 90, 50% cleared',
      url: 'https://x.test/g/',
    })
    expect(share.text).not.toContain(share.url)
    expect(shareText(t, identity, 90, 0.5).endsWith(share.url)).toBe(true)
  })

  it('has a registered page for every game, whose name is the one shared', () => {
    for (const game of GAME_IDS) {
      const page = getPage(GAME_PATHS[game])
      expect(page.navLabel.length).toBeGreaterThan(0)
      expect(pageUrl(page.path)).toMatch(/^https:\/\/.+\/games\/[a-z-]+\/$/)
    }
  })
})
