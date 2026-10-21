import { describe, expect, it } from 'vitest'
import { FACTS, MASTERY_RULE, prosignFacts, prosignNote, spanOf, wordFacts } from './facts'
import { LANDING } from './landing'
import { PAGES } from './pages'
import { howToSteps } from '../components/Reference/reference'
import { LEVEL_REQUIREMENTS, masteryLevel } from '../game/mastery'
import { LIMITS } from '../storage/settings'
import { findWord } from '../data/words'

describe('FACTS', () => {
  it('matches what the pages used to say by hand', () => {
    // The values the first audit found typed into templates. If one of these
    // changes on purpose, the copy follows; this is the tripwire that tells a
    // person the change is visible on the site.
    expect(FACTS.letterCount).toBe(26)
    expect(FACTS.digitCount).toBe(10)
    expect(FACTS.ituPunctuationCount).toBe(13)
    expect(FACTS.nonItuPunctuationCount).toBe(5)
    expect(FACTS.planDays).toBe(7)
    expect(FACTS.planMinutes).toBe(135)
    expect(FACTS.planTime).toBe('2 hours 15 minutes')
    expect(FACTS.wpmMin).toBe(5)
    expect(FACTS.wpmMax).toBe(40)
    expect(FACTS.unitMs).toBe(60)
    expect(FACTS.dashMs).toBe(180)
    expect(FACTS.challengeSeconds).toBe(60)
    expect(FACTS.dailyLines).toBe(8)
    expect(FACTS.wordCount).toBe(22)
  })

  it('groups letters by element count', () => {
    const counts = Object.fromEntries(
      Object.entries(FACTS.lettersByLength).map(([length, letters]) => [length, letters.length]),
    )
    expect(counts).toEqual({ 1: 2, 2: 4, 3: 8, 4: 12 })
    expect(FACTS.lettersByLength[4]!.join('')).toBe('BCFHJLPQVXYZ')
  })

  it('has one element count for every digit, five', () => {
    expect(FACTS.digitElements).toBe(5)
  })

  it('keeps the ITU punctuation range apart from the whole set', () => {
    expect(FACTS.ituPunctuationMinElements).toBe(5)
    expect(FACTS.ituPunctuationMaxElements).toBe(6)
  })

  it('finds the longest days and the closing call', () => {
    expect(FACTS.planLongestDays).toEqual([5, 6])
    expect(FACTS.planMinMinutesPerDay).toBe(10)
    expect(FACTS.planMaxMinutesPerDay).toBe(25)
    expect(FACTS.planClosingCall).toBe('CQ')
    expect(FACTS.planFirstDayCharacters).toEqual(['E', 'T'])
  })

  it('offers a speed range inside what a stored setting may hold', () => {
    expect(FACTS.wpmMin).toBeGreaterThanOrEqual(LIMITS.wpm.min)
    expect(FACTS.wpmMax).toBeLessThanOrEqual(LIMITS.wpm.max)
  })
})

describe('spanOf', () => {
  it('joins the ends of a run with an en dash', () => {
    expect(spanOf(['A', 'B', 'Z'])).toBe('A–Z')
    expect(spanOf(['0', '9'])).toBe('0–9')
  })
})

describe('wordFacts', () => {
  it('matches the send times the audit computed at 20 WPM', () => {
    expect(wordFacts(findWord('sos')!).sendMs).toBe(1620)
    expect(wordFacts(findWord('sos')!).sendSeconds).toBe('1.6')
    expect(wordFacts(findWord('i-love-you')!).sendSeconds).toBe('5.6')
    expect(wordFacts(findWord('good-morning')!).sendSeconds).toBe('7.1')
    expect(wordFacts(findWord('73')!).sendMs).toBe(1740)
  })

  it('counts characters, dots, dashes and words from the Morse itself', () => {
    const sos = wordFacts(findWord('sos')!)
    expect(sos).toMatchObject({ characters: 3, dots: 6, dashes: 3, wordCount: 1 })
    expect(wordFacts(findWord('i-love-you')!).wordCount).toBe(3)
  })

  it('uses the sentence-case label', () => {
    expect(wordFacts(findWord('i-love-you')!).label).toBe('I love you')
    expect(wordFacts(findWord('sos')!).label).toBe('SOS')
  })
})

describe('the mastery rule the copy quotes', () => {
  const stats = (recognition: number, listening: number, sending: number, attempts: number) => ({
    recognition: { attempts, correct: Math.round(recognition * attempts) },
    listening: { attempts, correct: Math.round(listening * attempts) },
    sending: { attempts, correct: Math.round(sending * attempts) },
  })

  it('reads its numbers from LEVEL_REQUIREMENTS', () => {
    const { minAttemptsPerSkill, minScore } = LEVEL_REQUIREMENTS[5]
    expect(FACTS.masteryMinAttempts).toBe(minAttemptsPerSkill)
    expect(FACTS.masteryPercent).toBe(Math.round(minScore * 100))
    expect(MASTERY_RULE).toBe(
      `at least ${minAttemptsPerSkill} answers in each of the three skills and an average of ${Math.round(minScore * 100)}% or better across them`,
    )
  })

  it('describes what masteryLevel actually does: a per-skill count and an average', () => {
    const n = FACTS.masteryMinAttempts
    // The average clears the bar while one skill is well below it. The copy
    // says "average", because that is what the grader checks.
    expect(masteryLevel(stats(1, 1, 0.7, n), true)).toBe(5)
    // One answer short in one skill is not mastered, however accurate.
    const short = stats(1, 1, 1, n)
    short.sending = { attempts: n - 1, correct: n - 1 }
    expect(masteryLevel(short, true)).toBeLessThan(5)
  })

  it('is the only mastery claim in the registry and landing copy', () => {
    const copy = JSON.stringify([LANDING, PAGES, howToSteps()])
    expect(copy).not.toMatch(/all three (skills )?hold up/)
    expect(copy).toContain(MASTERY_RULE)
  })
})

describe('prosignFacts and prosignNote', () => {
  it('times SOS run together, apart from the spelled-out letters', () => {
    const sos = findWord('sos')!
    const prosign = prosignFacts(sos)!
    expect(prosign.morse).toBe(FACTS.sosProsign)
    expect(prosign.sendMs).toBe(1380)
    expect(prosign.sendMs).toBeLessThan(wordFacts(sos).sendMs)
  })

  it('quotes both durations, so the page cannot contradict its own player', () => {
    const sos = findWord('sos')!
    const note = prosignNote(sos)!
    expect(note).toContain(`about ${wordFacts(sos).sendSeconds} seconds`)
    expect(note).toContain(`about ${prosignFacts(sos)!.sendSeconds} seconds`)
    expect(note).toContain(FACTS.sosProsign)
  })

  it('is null for a word that is not a prosign', () => {
    expect(prosignFacts(findWord('hello')!)).toBeNull()
    expect(prosignNote(findWord('hello')!)).toBeNull()
  })
})
