import { describe, expect, it } from 'vitest'
import { COPY_PASS_MARK, gradeCopy, isPass } from './copy'

/** Compact view of an alignment, so a failure is readable. */
const marks = (expected: string, given: string) =>
  gradeCopy(expected, given)
    .slots.map((slot) => `${slot.expected ?? '_'}${slot.mark[0]}${slot.given ?? '_'}`)
    .join(' ')

describe('a perfect copy', () => {
  it('scores 1 and is marked perfect', () => {
    const grade = gradeCopy('HELLO', 'HELLO')
    expect(grade.accuracy).toBe(1)
    expect(grade.hits).toBe(5)
    expect(grade.perfect).toBe(true)
    expect(grade.missed).toEqual([])
  })

  it('ignores case', () => {
    expect(gradeCopy('HELLO', 'hello').perfect).toBe(true)
  })

  it('ignores spacing, which is a different skill', () => {
    // Someone who copied every character of CQ CQ but typed it closed up has
    // not made a copying mistake.
    expect(gradeCopy('CQ CQ', 'CQCQ').perfect).toBe(true)
    expect(gradeCopy('CQCQ', 'CQ CQ').perfect).toBe(true)
  })
})

describe('a dropped character', () => {
  it('costs exactly one, not everything after it', () => {
    // Index-by-index comparison would call HELO three wrong out of five. The
    // learner missed one character.
    const grade = gradeCopy('HELLO', 'HELO')
    expect(grade.hits).toBe(4)
    expect(grade.missed).toEqual(['L'])
  })

  it('leaves every other character aligned around it', () => {
    // Which of the two identical Ls is called missing is an arbitrary
    // tie-break, so the assertion is on what is not arbitrary: one miss, and
    // everything either side still lined up.
    expect(marks('HELLO', 'HELO')).toMatch(/^HhH EhE (LhL Lm_|Lm_ LhL) OhO$/)
  })

  it('handles a drop at the very start', () => {
    expect(gradeCopy('HELLO', 'ELLO').missed).toEqual(['H'])
  })
})

describe('a mistyped character', () => {
  it('is one wrong answer, not a miss plus an extra', () => {
    // Substitution is cheaper than delete-plus-insert on purpose: it is both
    // truer and shorter to read.
    const grade = gradeCopy('HELLO', 'HELLA')
    expect(grade.hits).toBe(4)
    expect(grade.slots).toHaveLength(5)
    expect(grade.slots.at(-1)).toEqual({ expected: 'O', given: 'A', mark: 'wrong' })
  })
})

describe('an extra character', () => {
  it('is recorded without inventing a sent character', () => {
    const grade = gradeCopy('HELLO', 'HELLOX')
    expect(grade.hits).toBe(5)
    expect(grade.slots.at(-1)).toEqual({ expected: null, given: 'X', mark: 'extra' })
  })

  it('is not a perfect copy, however many real characters it contains', () => {
    // Otherwise spraying the whole alphabet would score 100%.
    const grade = gradeCopy('HELLO', 'HELLOX')
    expect(grade.accuracy).toBe(1)
    expect(grade.perfect).toBe(false)
  })
})

describe('an empty answer', () => {
  it('scores 0 rather than reading as perfect', () => {
    const grade = gradeCopy('HELLO', '')
    expect(grade.accuracy).toBe(0)
    expect(grade.perfect).toBe(false)
    expect(grade.missed).toEqual(['H', 'E', 'L', 'L', 'O'])
  })

  it('scores 0 when nothing was sent either, since there is no evidence', () => {
    expect(gradeCopy('', '').accuracy).toBe(0)
    expect(gradeCopy('', '').perfect).toBe(false)
  })
})

describe('unsendable input', () => {
  it('is dropped rather than counted against the learner', () => {
    // A stray emoji or accent is a keyboard accident, not a copying error.
    expect(gradeCopy('HELLO', 'HELLO\u20AC').perfect).toBe(true)
    expect(gradeCopy('HELLO', 'H E L L O').perfect).toBe(true)
  })

  it('still counts punctuation, which is sendable', () => {
    // "!" is -.-.-- and really can be sent, so typing one that was not sent is
    // an extra character like any other.
    expect(gradeCopy('HELLO', 'HELLO!').perfect).toBe(false)
  })
})

describe('alignment stays in sending order', () => {
  it('reads back as the line that was sent', () => {
    const grade = gradeCopy('CQ TEST', 'CQ TSET')
    expect(
      grade.slots
        .filter((slot) => slot.expected !== null)
        .map((slot) => slot.expected)
        .join(''),
    ).toBe('CQTEST')
  })
})

describe('isPass', () => {
  it('passes a nine-in-ten copy and fails eight', () => {
    expect(isPass(gradeCopy('ABCDEFGHIJ', 'ABCDEFGHIX'))).toBe(true)
    expect(isPass(gradeCopy('ABCDEFGHIJ', 'ABCDEFGHXX'))).toBe(false)
  })

  it('fails a five-character group with one wrong, since 90% of a callsign is wrong', () => {
    expect(gradeCopy('ABCDE', 'ABCDX').accuracy).toBeLessThan(COPY_PASS_MARK)
    expect(isPass(gradeCopy('ABCDE', 'ABCDX'))).toBe(false)
  })

  it('never passes an empty prompt', () => {
    expect(isPass(gradeCopy('', ''))).toBe(false)
  })
})
