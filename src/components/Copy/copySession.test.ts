import { describe, expect, it } from 'vitest'
import { attemptsForLine, copyLineTone, isComplete, lineNumber, sessionXp } from './copySession'
import { gradeCopy } from '../../game/copy'
import { xpForAnswer } from '../../game/progression'
import { summarize } from '../../game/session'

describe('attemptsForLine', () => {
  it('turns every sent character into one attempt, hit or miss', () => {
    const attempts = attemptsForLine(gradeCopy('HELLO', 'HELO'), 1000)
    expect(attempts.map((a) => a.character)).toEqual(['H', 'E', 'L', 'L', 'O'])
    expect(attempts.filter((a) => a.correct)).toHaveLength(4)
  })

  it('adds nothing for characters typed but never sent', () => {
    const attempts = attemptsForLine(gradeCopy('AB', 'AXB'), 600)
    expect(attempts).toHaveLength(2)
    expect(attempts.every((a) => a.correct)).toBe(true)
  })

  it('splits the time evenly across the line', () => {
    const attempts = attemptsForLine(gradeCopy('ABCD', 'ABCD'), 1000)
    expect(attempts.map((a) => a.elapsedMs)).toEqual([250, 250, 250, 250])
  })

  it('records what was typed for a wrong character and nothing for a dropped one', () => {
    const [wrong] = attemptsForLine(gradeCopy('A', 'B'), 100)
    expect(wrong).toMatchObject({ character: 'A', answer: 'B', correct: false })
    const [missed] = attemptsForLine(gradeCopy('A', ''), 100)
    expect(missed).toMatchObject({ character: 'A', answer: '', correct: false })
  })
})

describe('sessionXp', () => {
  it('pays the single-character rate for hits only', () => {
    const attempts = attemptsForLine(gradeCopy('ET', 'EX'), 100)
    expect(sessionXp(attempts)).toBe(xpForAnswer('E'))
  })

  it('is zero for an empty session, which then banks nothing', () => {
    expect(sessionXp([])).toBe(0)
    expect(summarize([], 0).total).toBe(0)
  })
})

describe('lineNumber', () => {
  it('shows the next line while sending and the graded one while reviewing', () => {
    expect(lineNumber(0, false, 10)).toBe(1)
    expect(lineNumber(1, true, 10)).toBe(1)
    expect(lineNumber(1, false, 10)).toBe(2)
  })

  it('never runs past the last line or below the first', () => {
    expect(lineNumber(10, false, 10)).toBe(10)
    expect(lineNumber(0, true, 10)).toBe(1)
  })
})

describe('isComplete', () => {
  it('is true only when every line was answered', () => {
    expect(isComplete(8, 8)).toBe(true)
    expect(isComplete(7, 8)).toBe(false)
    expect(isComplete(0, 0)).toBe(false)
  })
})

describe('copyLineTone', () => {
  it('is perfect only for a clean copy', () => {
    expect(copyLineTone(gradeCopy('HELLO', 'HELLO'))).toBe('perfect')
    // Every character, plus one never sent: over the bar, but not clean.
    expect(copyLineTone(gradeCopy('HELLO', 'HELLLO'))).toBe('pass')
  })

  it('judges the rest against the line pass mark', () => {
    expect(copyLineTone(gradeCopy('ABCDEFGHIJ', 'ABCDEFGHIX'))).toBe('pass')
    expect(copyLineTone(gradeCopy('ABCDE', 'ABCDX'))).toBe('under')
    expect(copyLineTone(gradeCopy('ABCDE', ''))).toBe('under')
  })
})
