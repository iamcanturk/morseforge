import { describe, expect, it } from 'vitest'
import { ALL_DIGITS, ALL_LETTERS } from '../../data/morseAlphabet'
import { dailyAlphabet, dailyChallenge } from '../../game/dailyChallenge'
import { answer, emptyProgress, markSeen } from '../../storage/progress'
import { dailyBrief, learnedCount } from './dailyBrief'

const NOW = Date.UTC(2026, 9, 21, 12)

/** A year of wires, so every kind and speed turns up. */
const YEAR = Array.from({ length: 365 }, (_, day) =>
  dailyChallenge(new Date(Date.UTC(2026, 0, 1) + day * 86_400_000).toISOString().slice(0, 10)),
)

describe('dailyBrief: the character set it states is the one the wire uses', () => {
  it('never sends a character outside the set it names', () => {
    for (const challenge of YEAR) {
      const allowed = new Set(dailyAlphabet(challenge.kind))
      for (const line of challenge.prompts) {
        for (const character of line.replaceAll(' ', '')) {
          expect(allowed.has(character), `${challenge.date} ${line}`).toBe(true)
        }
      }
    }
  })

  it('says "digits" exactly when the day can send one', () => {
    for (const challenge of YEAR) {
      const { set } = dailyBrief(challenge, 0)
      const digits = dailyAlphabet(challenge.kind).some((c) => ALL_DIGITS.includes(c as never))
      expect(set.includes(`${ALL_DIGITS.length} digits`), challenge.date).toBe(digits)
      if (!digits) expect(set).toContain('no digits')
    }
  })

  it('states the letters and digits by count, from the alphabet itself', () => {
    const groups = dailyBrief({ kind: 'groups', wpm: 15, farnsworthWpm: 7 }, 0)
    expect(groups.set).toBe(
      `Uses all ${ALL_LETTERS.length} letters and ${ALL_DIGITS.length} digits at 15 WPM, spaced out to 7 WPM.`,
    )
    const words = dailyBrief({ kind: 'words', wpm: 18, farnsworthWpm: 12 }, 0)
    expect(words.set).toBe(
      `Uses the ${ALL_LETTERS.length} letters, no digits, at 18 WPM, spaced out to 12 WPM.`,
    )
  })

  it('leaves out the spacing when there is none', () => {
    expect(dailyBrief({ kind: 'groups', wpm: 20, farnsworthWpm: 20 }, 0).set).not.toContain(
      'spaced',
    )
  })
})

describe('dailyBrief: readiness', () => {
  const groups = { kind: 'groups' as const, wpm: 15, farnsworthWpm: 7 }
  const total = dailyAlphabet('groups').length

  it('counts against the day’s set, and expects most to be missed early on', () => {
    expect(dailyBrief(groups, 6).readiness).toBe(
      `You have learned 6 of ${total} so far; expect to miss most of it.`,
    )
    expect(dailyBrief(groups, 0).readiness).toContain(`learned 0 of ${total}`)
  })

  it('expects only some to be missed once half the set is learned', () => {
    expect(dailyBrief(groups, Math.ceil(total / 2)).readiness).toContain('expect to miss some')
  })

  it('says all, and promises nothing, once every character is learned', () => {
    expect(dailyBrief(groups, total).readiness).toBe(`You have learned all ${total} of them.`)
    expect(dailyBrief(groups, total + 5).readiness).toBe(`You have learned all ${total} of them.`)
  })
})

describe('learnedCount', () => {
  it('counts a character once it has been answered right, not when merely seen', () => {
    let progress = emptyProgress()
    progress = markSeen(progress, 'Q', NOW)
    progress = answer(progress, 'E', 'listening', true, NOW)
    progress = answer(progress, 'T', 'recognition', true, NOW)
    progress = answer(progress, 'A', 'listening', false, NOW)
    expect(learnedCount(progress, dailyAlphabet('groups'), NOW)).toBe(2)
  })

  it('only counts characters the day can send', () => {
    let progress = emptyProgress()
    progress = answer(progress, '5', 'listening', true, NOW)
    progress = answer(progress, 'K', 'listening', true, NOW)
    expect(learnedCount(progress, dailyAlphabet('groups'), NOW)).toBe(2)
    expect(learnedCount(progress, dailyAlphabet('words'), NOW)).toBe(1)
  })
})
