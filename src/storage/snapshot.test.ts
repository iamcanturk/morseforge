import { describe, expect, it } from 'vitest'
import { achievementSnapshot } from './snapshot'
import { answer, emptyProgress, markSeen } from './progress'
import { defaultStats } from './stats'
import { SKILLS } from '../game/mastery'
import { evaluate, newlyEarned } from '../game/achievements'

const T0 = 1_700_000_000_000

function drill(character: string, times: number) {
  let record = emptyProgress()
  for (let i = 0; i < times; i++) {
    for (const skill of SKILLS) record = answer(record, character, skill, true, T0)
  }
  return record
}

describe('achievementSnapshot', () => {
  it('reads zero from a fresh profile', () => {
    const snapshot = achievementSnapshot(emptyProgress(), defaultStats(), T0)
    expect(snapshot.mastered).toBe(0)
    expect(snapshot.seen).toBe(0)
    expect(snapshot.sessions).toBe(0)
  })

  it('counts a character that has only been met as seen but not mastered', () => {
    const snapshot = achievementSnapshot(markSeen(emptyProgress(), 'E', T0), defaultStats(), T0)
    expect(snapshot.seen).toBe(1)
    expect(snapshot.mastered).toBe(0)
  })

  it('counts a fully drilled character as both', () => {
    const snapshot = achievementSnapshot(drill('E', 10), defaultStats(), T0)
    expect(snapshot.seen).toBe(1)
    expect(snapshot.mastered).toBe(1)
  })

  it('carries the stats through unchanged', () => {
    const stats = { ...defaultStats(), bestWpm: 22, sessions: 4, totalCorrect: 130 }
    const snapshot = achievementSnapshot(emptyProgress(), stats, T0)
    expect(snapshot.bestWpm).toBe(22)
    expect(snapshot.sessions).toBe(4)
    expect(snapshot.totalCorrect).toBe(130)
  })

  it('feeds newlyEarned, which is the whole reason it is shared', () => {
    // The result screen builds one of these before a session and one after; if
    // the two were built by different code they could disagree about whether
    // something was earned, and the badge would fire on every session or never.
    const before = achievementSnapshot(emptyProgress(), defaultStats(), T0)
    const after = achievementSnapshot(drill('E', 10), { ...defaultStats(), sessions: 1 }, T0)

    const fresh = newlyEarned(before, after)
    expect(fresh.length).toBeGreaterThan(0)
    // And nothing is "newly" earned when nothing changed.
    expect(newlyEarned(after, after)).toEqual([])
  })

  it('agrees with evaluate() about what has been earned', () => {
    const snapshot = achievementSnapshot(drill('E', 10), { ...defaultStats(), sessions: 1 }, T0)
    const earnedIds = evaluate(snapshot)
      .filter((achievement) => achievement.isEarned)
      .map((achievement) => achievement.id)

    for (const achievement of newlyEarned(
      achievementSnapshot(emptyProgress(), defaultStats(), T0),
      snapshot,
    )) {
      expect(earnedIds).toContain(achievement.id)
    }
  })
})

describe('stagesTaught in the snapshot', () => {
  it('reads the lesson position from progress, so First Ring is earned from data', () => {
    let record = emptyProgress()
    for (const character of ['E', 'T']) record = answer(record, character, 'sending', true, T0)
    const snapshot = achievementSnapshot(record, defaultStats(), T0)
    expect(snapshot.stagesTaught).toBe(1)
    expect(
      newlyEarned(achievementSnapshot(emptyProgress(), defaultStats(), T0), snapshot).map(
        (a) => a.id,
      ),
    ).toContain('first-ring')
  })
})
